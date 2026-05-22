import os
import asyncio
import json
import logging
from pydantic import TypeAdapter

from infra.mongodb.database import connect_to_mongodb, close_mongodb_connection
from infra.rabbitmq.rabbit_mq_gateway import RabbitMQProducer, connect_to_rabbitmq, get_consumer_channel, close_rabbitmq_connection
from infra.mongodb.repository.operation_repo import OperationRepository
from app.models.ot_operation import OpPayload, RetainOperation
from app.core.operation_transform import process_concurrent_operations
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
            history_ops_data = await OperationRepository.get_recent_history(doc_id)
            history_ops_data.reverse()
            
            history_ops_ascending = []
            for item in history_ops_data:
                # Nếu là Transaction (có mảng ops) - String-wise OT
                if "ops" in item:
                    for hist_op in item["ops"]:
                        hist_op["op_type"] = hist_op.get("type", hist_op.get("op_type", "retain"))
                        try:
                            parsed = TypeAdapter(OpPayload).validate_python(hist_op)
                            history_ops_ascending.append(parsed)
                        except Exception as e:
                            logger.warning(f"Could not parse history op: {e}")
                # Tương thích ngược cho dữ liệu cũ (Character-wise OT)
                else:
                    item["op_type"] = item.get("type", item.get("op_type", "retain"))
                    try:
                        parsed = TypeAdapter(OpPayload).validate_python(item)
                        history_ops_ascending.append(parsed)
                    except Exception as e:
                        logger.warning(f"Could not parse history op: {e}")
                        
            # Gọi Pipeline xử lý OT String-wise
            ops_new = process_concurrent_operations(op, history_ops_ascending)
                        
            # 3. Save to DB (Atomic) and Cache
            await OperationRepository.save_transaction_and_update_clock(ops_new, doc_id, user_id, client_v_clock)
            
            # 4. Broadcast via RabbitMQ Fanout
            broadcast_payload = {**payload}
            
            # Format lại mảng `ops` trả về cho Frontend
            final_ops = []
            for saved_op in ops_new:
                final_op = saved_op.model_dump()
                final_op["type"] = final_op.pop("op_type", "retain")
                final_op.pop("doc_id", None)
                final_op.pop("user_id", None)
                final_op.pop("v_clock", None)
                final_ops.append(final_op)
                
            broadcast_payload["ops"] = final_ops
            broadcast_payload.pop("op", None) # Xóa format cũ
            
            await self.producer.publish(
                message=json.dumps(broadcast_payload),
                exchange="broadcast_to_room",
                routing_key="", # Fanout bỏ qua routing key
                exchange_type="fanout",
                durable=False
            )
            logger.info(f"Processed & Broadcasted OT for Doc: {doc_id} by User: {user_id} via RabbitMQ (Splitted into {len(ops_new)} ops)")
            

            # save snapshot text
            from app.core.snapshot_text import save_snapshot_text
            new_text = await save_snapshot_text(doc_id, broadcast_payload)

            logger.info(f"Saved snapshot for Doc: {doc_id} , text:{new_text}")



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