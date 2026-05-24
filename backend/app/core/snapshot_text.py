import os
import asyncio
import json
import logging

from infra.mongodb.database import get_db
from infra.redis.redis_client import RedisClient
from bson import ObjectId


logger = logging.getLogger(__name__)


async def save_snapshot_text(doc_id: str, payload: dict) -> str:
    try:
        ops = payload.get("ops", [])
        if not ops:
            return ""

        redis_client = RedisClient.get_client()
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

        # 2. Tăng biến đếm số lượng thao tác
        current_count = await redis_client.incr(count_key)

        # 3. Đạt mốc 10 thao tác thì xả xuống MongoDB (Bạn có thể tăng lên 50, 100 tùy ý)
        if current_count >= 10:
            # save to db
            await save_snapshot_text_to_db(doc_id, new_snapshot)
            # Xả xong thì reset biến đếm về 0, TUYỆT ĐỐI KHÔNG XÓA CHUỖI TRÊN REDIS
            await redis_client.set(count_key, 0)

        return new_snapshot
    except Exception as e:
        logger.error(f"Failed to save snapshot for Doc: {doc_id}: {e}")
        return ""


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
