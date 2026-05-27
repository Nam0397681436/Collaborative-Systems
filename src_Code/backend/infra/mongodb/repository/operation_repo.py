from typing import Optional
from datetime import datetime
import json
import logging
from typing import List, Dict, Any
from bson import ObjectId
from infra.mongodb.database import get_db
from infra.redis.redis_client import RedisClient
from app.models.ot_operation import OpPayload

logger = logging.getLogger(__name__)

class OperationRepository:
    
    @staticmethod
    async def get_recent_history(doc_id: str, epoch: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Lấy lịch sử thao tác của 1 document.
        Ưu tiên lấy từ Redis Cache, nếu rỗng thì query MongoDB.
        """
        redis_client = RedisClient.get_client()
        cache_key = f"doc_history:{doc_id}"
        
        # Thử lấy từ Redis
        cached_ops = await redis_client.lrange(cache_key, 0, limit - 1)
        if cached_ops:
            return [json.loads(op) for op in cached_ops]
            
        # Nếu Cache Miss, gọi xuống MongoDB
        db = get_db()
        cursor = db["operation_logs"].find({"doc_id": doc_id, "epoch": epoch}).sort("server_timestamp", -1).limit(limit)
        ops = await cursor.to_list(length=limit)
        
        # Nạp lại vào Redis Cache
        if ops:
            pipeline = redis_client.pipeline()
            for op in ops:
                op_to_cache = {**op}
                if "_id" in op_to_cache:
                    op_to_cache["_id"] = str(op_to_cache["_id"])
                if "server_timestamp" in op_to_cache:
                    op_to_cache["server_timestamp"] = str(op_to_cache["server_timestamp"])
                pipeline.rpush(cache_key, json.dumps(op_to_cache))
            pipeline.expire(cache_key, 3600) # Cache 1 giờ
            await pipeline.execute()
            
        return ops

    @staticmethod
    async def save_transaction_and_update_clock(ops: List[OpPayload], doc_id: str, user_id: str, v_clock: dict, epoch: int = 0) -> dict:
        """
        Lưu một Transaction (mảng các thao tác đã bị cắt xén) vào bảng operation_logs.
        Tăng Vector Clock của Document sử dụng $inc (Atomic) 1 lần duy nhất.
        Đồng thời đẩy vào Redis Cache.
        """
        db = get_db()
        transaction_doc = {
            "doc_id": doc_id,
            "user_id": user_id,
            "v_clock": v_clock,
            "epoch": epoch,
            "ops": [op.model_dump() for op in ops],
            "server_timestamp": datetime.utcnow()
        }
        
        # Lưu vào MongoDB
        await db["operation_logs"].insert_one(transaction_doc)
        
        # Atomic update Vector Clock
        await db["documents"].update_one(
            {"_id": ObjectId(doc_id)},
            {"$inc": {f"global_v_clock.{user_id}": 1}}
        )
        
        # Push vào Redis Cache & Cắt mảng (LTRIM)
        redis_client = RedisClient.get_client()
        cache_key = f"doc_history:{doc_id}"
        
        # Đổi type trước khi JSON serialize
        transaction_doc["_id"] = str(transaction_doc["_id"])
        transaction_doc["server_timestamp"] = str(transaction_doc["server_timestamp"])
        
        await redis_client.lpush(cache_key, json.dumps(transaction_doc))
        await redis_client.ltrim(cache_key, 0, 99)
        
        return transaction_doc

    @staticmethod
    async def create_checkpoint(doc_id: str, checkpoint_v_clock: dict, epoch: int, content_snapshot: str, contributors: list = None) -> int:
        """
        Tạo checkpoint lịch sử cho tài liệu.
        Tìm checkpoint mới nhất để tính toán version_number tự tăng.
        """
        db = get_db()
        # Tìm checkpoint mới nhất của tài liệu để lấy version_number
        latest_checkpoint = await db["checkpoints"].find_one(
            {"doc_id": doc_id},
            sort=[("version_number", -1)]
        )
        version_number = 1
        if latest_checkpoint:
            version_number = latest_checkpoint.get("version_number", 0) + 1

        checkpoint_doc = {
            "doc_id": doc_id,
            "version_number": version_number,
            "checkpoint_v_clock": checkpoint_v_clock,
            "epoch": epoch,
            "content_snapshot": content_snapshot,
            "contributors": contributors or [],
            "created_at": datetime.utcnow()
        }
        await db["checkpoints"].insert_one(checkpoint_doc)
        logger.info(f"Created checkpoint version {version_number} for document {doc_id}")
        return version_number

    @staticmethod
    async def get_checkpoints(doc_id: str) -> List[Dict[str, Any]]:
        """
        Lấy toàn bộ danh sách checkpoint của document, sắp xếp giảm dần theo thời gian.
        """
        db = get_db()
        cursor = db["checkpoints"].find({"doc_id": doc_id}).sort("created_at", -1).limit(100)
        checkpoints = await cursor.to_list(length=100)
        # Convert ObjectId thành string
        for cp in checkpoints:
            if "_id" in cp:
                cp["_id"] = str(cp["_id"])
            if "created_at" in cp:
                cp["created_at"] = cp["created_at"].isoformat()
        return checkpoints

    @staticmethod
    async def get_checkpoint_by_version(doc_id: str, version_number: int) -> Optional[Dict[str, Any]]:
        """
        Truy vấn thông tin một checkpoint cụ thể theo version_number.
        """
        db = get_db()
        checkpoint = await db["checkpoints"].find_one({
            "doc_id": doc_id,
            "version_number": version_number
        })
        if checkpoint:
            if "_id" in checkpoint:
                checkpoint["_id"] = str(checkpoint["_id"])
            if "created_at" in checkpoint:
                checkpoint["created_at"] = checkpoint["created_at"].isoformat()
        return checkpoint

    @staticmethod
    async def get_operations_after_timestamp(doc_id: str, checkpoint_created_at: datetime) -> List[Dict[str, Any]]:
        """
        Truy vấn các operation xảy ra sau mốc thời gian checkpoint sử dụng index server_timestamp.
        """
        db = get_db()
        cursor = db["operation_logs"].find({
            "doc_id": doc_id,
            "server_timestamp": {"$gt": checkpoint_created_at}
        }).sort("server_timestamp", 1)
        ops = await cursor.to_list(length=1000)
        for op in ops:
            if "_id" in op:
                op["_id"] = str(op["_id"])
            if "server_timestamp" in op:
                op["server_timestamp"] = op["server_timestamp"].isoformat()
        return ops
