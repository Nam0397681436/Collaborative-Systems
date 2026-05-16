import os
import asyncio
import json
import logging
from pydantic import TypeAdapter

from infra.mongodb.database import connect_to_mongodb, close_mongodb_connection
from infra.rabbitmq.rabbit_mq_gateway import RabbitMQProducer, connect_to_rabbitmq, get_consumer_channel, close_rabbitmq_connection
from infra.mongodb.repository.operation_repo import OperationRepository
from app.models.ot_operation import OpPayload, RetainOperation
from app.core.operation_transform import transform
from infra.redis.redis_client import RedisClient

logger = logging.getLogger(__name__)

class OTWorker:
    def __init__(self, producer: RabbitMQProducer):
        # Inject Producer vào Worker để không phải khởi tạo lại nhiều lần
        self.producer = producer

    async def process_message(self, message):
        """
        Sử dụng context manager `message.process(requeue=True)` để tự động ACK nếu code chạy hết không lỗi,
        và tự động NACK (trả lại hàng đợi) nếu có Exception.
        """
        async with message.process(requeue=True):
            payload = json.loads(message.body.decode())
            # payload: {"type": "EDIT", "id": "...", "user_id": "...", "op": {...}, "v_clock": {...}}
            msg_type = payload.get("type")
            # Ở websocket.py hiện đang gửi field name là "id", không phải "doc_id"
            doc_id = payload.get("id") or payload.get("doc_id")
            user_id = payload.get("user_id")
            op_data = payload.get("op", {})
            client_v_clock = payload.get("v_clock", {})
            
            # 1. Parse Data Model (Pydantic Discriminator tự ép kiểu)
            op_data["op_type"] = op_data.get("type", "retain")
            op_data["user_id"] = user_id
            op_data["doc_id"] = doc_id
            op_data["v_clock"] = client_v_clock
            
            try:
                op = TypeAdapter(OpPayload).validate_python(op_data)
            except Exception as e:
                logger.error(f"Invalid operation format: {e} | op_data: {op_data}")
                return
                
            # 2. Causality Check & Transform
            history_ops = await OperationRepository.get_recent_history(doc_id)
            history_ops.reverse()
            
            for hist_op in history_ops:
                hist_user = hist_op.get("user_id")
                hist_version = hist_op.get("v_clock", {}).get(hist_user, 0)
                client_version_for_hist_user = client_v_clock.get(hist_user, 0)
                
                if hist_version > client_version_for_hist_user:
                    hist_op_type = hist_op.get("op_type", hist_op.get("type", "retain"))
                    hist_op_data = {**hist_op, "op_type": hist_op_type}
                    try:
                        parsed_hist_op = TypeAdapter(OpPayload).validate_python(hist_op_data)
                        op = transform(op, parsed_hist_op)
                    except Exception as e:
                        logger.warning(f"Could not parse history op for transform: {e}")
                        
            # 3. Save to DB (Atomic) and Cache
            saved_op = await OperationRepository.save_operation_and_update_clock(op, doc_id, user_id)
            
            # 4. Broadcast via RabbitMQ Fanout (Sử dụng producer đã được inject)
            # Giữ nguyên toàn bộ dữ liệu gốc của message (type, id, version, v_clock...)
            broadcast_payload = {**payload}
            
            # Format lại cục `op` trả về cho Frontend (Dùng "type" thay vì "op_type", loại bỏ data thừa)
            final_op = saved_op.copy()
            final_op["type"] = final_op.pop("op_type", "retain")
            final_op.pop("doc_id", None)
            final_op.pop("user_id", None)
            final_op.pop("v_clock", None)
            
            broadcast_payload["op"] = final_op
            await self.producer.publish(
                message=json.dumps(broadcast_payload),
                exchange="broadcast_to_room",
                routing_key="", # Fanout bỏ qua routing key
                exchange_type="fanout",
                durable=False
            )
            logger.info(f"Processed & Broadcasted OT for Doc: {doc_id} by User: {user_id} via RabbitMQ")


async def main():
    logger.info("Initializing OT Worker dependencies...")
    await connect_to_mongodb()
    await connect_to_rabbitmq()
    await RedisClient.connect()
    
    # Khởi tạo Producer một lần duy nhất và đưa vào OTWorker (Dependency Injection)
    producer = RabbitMQProducer()
    worker = OTWorker(producer)
    
    channel = get_consumer_channel()
    
    # Khai báo exchange (đảm bảo nó tồn tại)
    exchange = await channel.declare_exchange("ot_exchange", type="direct", durable=True)
    
    num_queues = int(os.getenv("RABBITMQ_NUM_QUEUES", "1"))
    worker_queues_str = os.getenv("WORKER_QUEUES", "")
    
    if worker_queues_str:
        queue_indexes = [int(q.strip()) for q in worker_queues_str.split(",") if q.strip().isdigit()]
    else:
        queue_indexes = list(range(num_queues))
        
    logger.info(f"OT Worker is configured to listen on queue indexes: {queue_indexes}")
    
    for q_idx in queue_indexes:
        queue_name = f"edit_queue_{q_idx}"
        queue = await channel.declare_queue(queue_name, durable=True)
        await queue.bind(exchange, routing_key=queue_name)
        logger.info(f"Binding and consuming from {queue_name}...")
        
        # Gắn hàm process_message của class worker vào queue
        await queue.consume(worker.process_message)
    
    try:
        await asyncio.Future() # Keep running
    except KeyboardInterrupt:
        logger.info("OT Worker shutting down...")
    finally:
        await RedisClient.disconnect()
        await close_rabbitmq_connection()
        await close_mongodb_connection()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())