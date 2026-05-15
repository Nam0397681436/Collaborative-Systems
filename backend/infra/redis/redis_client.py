import os
import redis.asyncio as redis
import logging

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class RedisClient:
    _pool: redis.ConnectionPool = None
    _client: redis.Redis = None

    @classmethod
    async def connect(cls):
        logger.info(f"Connecting to Redis at {REDIS_URL}...")
        cls._pool = redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)
        cls._client = redis.Redis(connection_pool=cls._pool)
        # Test connection
        await cls._client.ping()
        logger.info("Connected to Redis successfully!")

    @classmethod
    async def disconnect(cls):
        if cls._client:
            await cls._client.aclose()
            logger.info("Redis connection closed.")

    @classmethod
    def get_client(cls) -> redis.Redis:
        if cls._client is None:
            raise Exception("Redis client is not initialized. Call connect() first.")
        return cls._client
