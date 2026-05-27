import os
import asyncio
import json
import logging
import time

from infra.mongodb.database import get_db
from infra.redis.redis_client import RedisClient
from bson import ObjectId
from infra.mongodb.repository.operation_repo import OperationRepository


logger = logging.getLogger(__name__)


async def save_snapshot_text(doc_id: str, payload: dict) -> str:
    try:
        ops = payload.get("ops", [])
        user_id = payload.get("user_id")
        if not ops:
            return ""

        redis_client = RedisClient.get_client()
        if user_id:
            await redis_client.sadd(f"snapshot_contributors:{doc_id}", user_id)
        cache_key = f"snapshot:{doc_id}"
        count_key = f"snapshot_count:{doc_id}"

        current_snapshot = await redis_client.get(cache_key)
        if current_snapshot is None:
            db = get_db()
            if db is not None:
                doc = await db["documents"].find_one({"_id": ObjectId(doc_id)})
                if doc:
                    current_snapshot = doc.get("content_snapshot", "")

        new_snapshot = apply_snapshot_text(current_snapshot, ops)

        # 1. Luôn luôn cập nhật FULL chuỗi mới lên Redis
        await redis_client.set(cache_key, new_snapshot)

        # 2. Cập nhật thời gian sửa đổi gần nhất lên Redis (để Debounce Flush)
        current_time = str(time.time())
        last_modified_key = f"snapshot_last_modified:{doc_id}"
        await redis_client.set(last_modified_key, current_time)

        # 3. Tăng biến đếm số lượng thao tác
        current_count = await redis_client.incr(count_key)

        # 4. Đạt mốc 10 thao tác thì lưu Checkpoint và đồng bộ đè xuống MongoDB chính
        if current_count >= 10:
            await perform_checkpoint(doc_id, new_snapshot)
            # Reset biến đếm về 0, TUYỆT ĐỐI KHÔNG XÓA CHUỖI TRÊN REDIS
            await redis_client.set(count_key, 0)
        else:
            # Nếu chưa đạt mốc, kích hoạt Debounce Flush sau 10 giây
            asyncio.create_task(debounced_checkpoint_task(doc_id, current_time))

        return new_snapshot
    except Exception as e:
        logger.error(f"Failed to save snapshot for Doc: {doc_id}: {e}")
        return ""


async def perform_checkpoint(doc_id: str, snapshot_text: str):
    """
    Thực hiện lưu snapshot đè xuống MongoDB và đồng thời tạo một Checkpoint lịch sử.
    """
    try:
        db = get_db()
        if db is None:
            logger.error("Database connection failed during checkpoint")
            return

        # 1. Lưu snapshot đè xuống documents chính
        await db["documents"].update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {"content_snapshot": snapshot_text}}
        )

        # 2. Đọc global_v_clock và epoch hiện tại để lưu Checkpoint
        doc = await db["documents"].find_one({"_id": ObjectId(doc_id)})
        if doc:
            v_clock = doc.get("global_v_clock", {})
            epoch = doc.get("epoch", 0)
            # Lấy danh sách contributors từ Redis
            redis_client = RedisClient.get_client()
            contributors_raw = await redis_client.smembers(f"snapshot_contributors:{doc_id}")
            contributors = []
            if contributors_raw:
                for c in contributors_raw:
                    contributors.append(c.decode("utf-8") if isinstance(c, bytes) else str(c))
            
            await redis_client.delete(f"snapshot_contributors:{doc_id}")

            # Chuẩn hóa v_clock keys sang string
            formatted_v_clock = {str(k): int(v) for k, v in v_clock.items()}
            # Tạo checkpoint
            await OperationRepository.create_checkpoint(doc_id, formatted_v_clock, epoch, snapshot_text, contributors)
            logger.info(f"Checkpoint successfully performed for doc {doc_id}")
    except Exception as e:
        logger.error(f"Failed to perform checkpoint for doc {doc_id}: {e}")


async def debounced_checkpoint_task(doc_id: str, trigger_time: str):
    """
    Tác vụ trì hoãn 10 giây (Debounce). Nếu sau 10 giây không có ai gõ chữ mới,
    thực hiện đồng bộ đè và lưu checkpoint.
    """
    try:
        await asyncio.sleep(10)
        redis_client = RedisClient.get_client()
        last_modified_key = f"snapshot_last_modified:{doc_id}"
        count_key = f"snapshot_count:{doc_id}"
        
        current_time = await redis_client.get(last_modified_key)
        # Nếu thời gian sửa đổi cuối cùng trùng khớp, nghĩa là không có thao tác gõ chữ mới trong 5 giây qua
        if current_time == trigger_time:
            # Đọc snapshot hiện tại trên Redis
            snapshot_text = await redis_client.get(f"snapshot:{doc_id}")
            if snapshot_text is not None:
                # Đọc đếm thao tác hiện tại
                current_count = await redis_client.get(count_key)
                # Chỉ lưu nếu có thay đổi chưa được sync (bộ đếm > 0)
                if current_count and int(current_count) > 0:
                    logger.info(f"Debounce triggered: Doc {doc_id} has been idle for 10s. Performing checkpoint...")
                    await perform_checkpoint(doc_id, snapshot_text)
                    await redis_client.set(count_key, 0)
    except Exception as e:
        logger.error(f"Failed in debounced checkpoint task for doc {doc_id}: {e}")


def apply_snapshot_text(current_snapshot: str, ops: list) -> str:
    # 1. Xử lý trường hợp Redis trả về None hoặc kiểu bytes
    if current_snapshot is None:
        text = ""
    elif isinstance(current_snapshot, bytes):
        text = current_snapshot.decode("utf-8")
    else:
        text = str(current_snapshot)

    # 2. Áp dụng tuần tự các thao tác vào chuỗi (ops đã được sort reverse=True từ Worker)
    for op in ops:
        op_type = op.get("type", "retain")
        if op_type == "retain":
            continue

        index = op.get("index", 0)
        char = op.get("char", "")

        if op_type == "insert":
            text = text[:index] + char + text[index:]
        elif op_type == "delete":
            length = len(char)
            text = text[:index] + text[index + length :]

    return text


async def get_snapshot_text(doc_id: str) -> str:
    try:
        redis_client = RedisClient.get_client()
        text = await redis_client.get(f"snapshot:{doc_id}")
        return text
    except Exception as e:
        logger.error(f"Failed to get snapshot for Doc: {doc_id}: {e}")
        return None


async def save_snapshot_text_to_db(doc_id: str, snapshot_text: str):
    try:
        db = get_db()
        if db is None:
            logger.error("Database connection failed")
            return
        logger.info(
            f"save snapshot db docid:{doc_id} ---- snapshot_text:{snapshot_text}"
        )
        # Ghi đè thẳng nguyên chuỗi văn bản mới vào DB
        await db["documents"].update_one(
            {"_id": ObjectId(doc_id)}, {"$set": {"content_snapshot": snapshot_text}}
        )
    except Exception as e:
        logger.error(f"Failed to save snapshot to MongoDB: {e}")
