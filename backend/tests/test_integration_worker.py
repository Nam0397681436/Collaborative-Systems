import asyncio
import json
import pytest
import os
from infra.mongodb.database import connect_to_mongodb, close_mongodb_connection, get_db
from infra.rabbitmq.rabbit_mq_gateway import RabbitMQProducer, connect_to_rabbitmq, close_rabbitmq_connection, get_producer_channel, get_consumer_channel, get_routing_key
from infra.redis.redis_client import RedisClient
from infra.mongodb.repository.operation_repo import OperationRepository
from app.worker.consumer import OTWorker

TEST_DOC_ID = "64e1c2b5d0b4b21b0f0b4aaa"

# User IDs for deterministic tie-breaking
U_A = "6a05988a9a93bafee2a2e5c7" # Smallest
U_C = "6a05dbb563991d023c21e08b" # Middle
U_B = "6a068720f83b0377c5bbdc54" # Largest

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

import pytest_asyncio

@pytest_asyncio.fixture(autouse=True)
async def setup_teardown():
    # Setup
    os.environ["RABBITMQ_NUM_QUEUES"] = "1"
    await connect_to_mongodb()
    await connect_to_rabbitmq()
    await RedisClient.connect()
    
    # Cleanup before test
    db = get_db()
    await db["operation_logs"].delete_many({"doc_id": TEST_DOC_ID})
    redis = RedisClient.get_client()
    await redis.delete(f"doc_history:{TEST_DOC_ID}")
    
    yield
    
    # Cleanup after test
    await db["operation_logs"].delete_many({"doc_id": TEST_DOC_ID})
    await redis.delete(f"doc_history:{TEST_DOC_ID}")
    
    # Teardown
    await RedisClient.disconnect()
    await close_rabbitmq_connection()
    await close_mongodb_connection()

@pytest.mark.asyncio
async def test_full_worker_flow():
    # Khởi tạo Worker
    producer = RabbitMQProducer()
    worker = OTWorker(producer)
    
    # Seed MongoDB with TEST_DOC_ID
    from infra.mongodb.database import get_db
    db = get_db()
    from bson import ObjectId
    await db["documents"].update_one(
        {"_id": ObjectId(TEST_DOC_ID)},
        {"$set": {"epoch": 0, "content_snapshot": "", "global_v_clock": {}}},
        upsert=True
    )
    
    # Lấy channel và bind queue (giống hệt cách main() làm)
    channel = get_consumer_channel()
    exchange = await channel.declare_exchange("ot_exchange", type="direct", durable=True)
    
    # Ép dùng queue test độc lập để tránh đụng độ với worker thật đang chạy ngầm
    import uuid
    routing_key = f"test_edit_queue_{uuid.uuid4().hex}"
    queue = await channel.declare_queue(routing_key, durable=True, auto_delete=True)
    await queue.bind(exchange, routing_key=routing_key)
    
    # Dọn dẹp hàng đợi đề phòng còn tin nhắn rác
    await queue.purge()
    
    # 3 Message được gửi ĐỒNG THỜI đến RabbitMQ
    msgs = [
        {
            "type": "EDIT",
            "id": TEST_DOC_ID,
            "user_id": U_B,
            "op": {"type": "insert", "char": "123", "index": 0},
            "v_clock": {U_A: 207, U_B: 208, U_C: 61}
        },
        {
            "type": "EDIT",
            "id": TEST_DOC_ID,
            "user_id": U_C,
            "op": {"type": "delete", "char": "cde", "index": 0}, # Test splitting
            "v_clock": {U_A: 203, U_B: 49, U_C: 204}
        },
        {
            "type": "EDIT",
            "id": TEST_DOC_ID,
            "user_id": U_A,
            "op": {"type": "insert", "char": "XY", "index": 0},
            "v_clock": {U_A: 208, U_B: 49, U_C: 61}
        }
    ]
    
    # Đẩy vào RabbitMQ
    for msg in msgs:
        await producer.publish(
            message=json.dumps(msg),
            exchange="ot_exchange",
            routing_key=routing_key,
            exchange_type="direct",
            durable=True
        )
    
    # Giả lập Worker kéo từng tin nhắn ra khỏi Queue để xử lý tuần tự
    for _ in range(3):
        # get() timeout 2s để tránh treo test nếu queue trống
        message = await queue.get(timeout=2)
        await worker.process_message(message)
    
    # ---------------- VERIFY KẾT QUẢ TỪ REDIS VÀ MONGODB ----------------
    
    # 1. Lấy lịch sử từ Repository (Hàm này tự động check Redis cache trước)
    history = await OperationRepository.get_recent_history(TEST_DOC_ID)
    
    assert len(history) == 3, "Phải có đúng 3 transaction được lưu trong DB/Redis"
    
    # Lịch sử được get_recent_history trả về theo thứ tự GIẢM DẦN của thời gian (Mới nhất nằm ở index 0)
    # Thứ tự Worker xử lý: B -> C -> A. Vậy mới nhất là A.
    op_A = history[0]
    op_C = history[1]
    op_B = history[2]
    
    # Kiểm tra User ID
    assert op_B["user_id"] == U_B
    assert op_C["user_id"] == U_C
    assert op_A["user_id"] == U_A
    
    # Kiểm tra transaction format mới
    assert "ops" in op_B
    assert "ops" in op_C
    assert "ops" in op_A
    
    # Kiểm tra Redis Cache đã được cập nhật chưa
    redis = RedisClient.get_client()
    redis_data = await redis.lrange(f"doc_history:{TEST_DOC_ID}", 0, -1)
    assert len(redis_data) == 3
    
    print("\n[SUCCESS] Integration Test passed! RabbitMQ -> OT Worker -> MongoDB -> Redis works perfectly!")
