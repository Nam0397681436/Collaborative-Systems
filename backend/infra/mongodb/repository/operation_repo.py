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
    async def get_recent_history(doc_id: str, limit: int = 100) -> List[Dict[str, Any]]:
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
        cursor = db["operation_logs"].find({"doc_id": doc_id}).sort("server_timestamp", -1).limit(limit)
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
    async def save_operation_and_update_clock(op: OpPayload, doc_id: str, user_id: str) -> dict:
        """
        Lưu thao tác vào bảng operation_logs và tăng Vector Clock của Document sử dụng $inc (Atomic).
        Đồng thời đẩy vào Redis Cache.
        """
        db = get_db()
        op_dict = op.model_dump()
        op_dict["server_timestamp"] = datetime.utcnow()
        
        # Lưu vào MongoDB
        await db["operation_logs"].insert_one(op_dict)
        
        # Atomic update Vector Clock
        await db["documents"].update_one(
            {"_id": ObjectId(doc_id)},
            {"$inc": {f"global_v_clock.{user_id}": 1}}
        )
        
        # Push vào Redis Cache & Cắt mảng (LTRIM)
        redis_client = RedisClient.get_client()
        cache_key = f"doc_history:{doc_id}"
        
        # Đổi datetime thành string trước khi JSON serialize
        op_dict["_id"] = str(op_dict["_id"])
        op_dict["server_timestamp"] = str(op_dict["server_timestamp"])
        
        await redis_client.lpush(cache_key, json.dumps(op_dict))
        await redis_client.ltrim(cache_key, 0, 99)
        
        return op_dict
