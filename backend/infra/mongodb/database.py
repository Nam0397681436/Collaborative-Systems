import logging
import pymongo
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from infra.mongodb.config import mongodb_settings

logger = logging.getLogger(__name__)

class MongoDBConnection:
    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase = None

db_connection = MongoDBConnection()

async def connect_to_mongodb():
    logger.info("Connecting to MongoDB...")
    db_connection.client = AsyncIOMotorClient(mongodb_settings.MONGODB_URL)
    db_connection.db = db_connection.client[mongodb_settings.MONGODB_DB_NAME]
    logger.info("Connected to MongoDB successfully!")
    await init_indexes()

async def close_mongodb_connection():
    logger.info("Closing MongoDB connection...")
    if db_connection.client:
        db_connection.client.close()
    logger.info("MongoDB connection closed.")

async def init_indexes():
    """Tạo các Index quan trọng cho Collections theo chuẩn đã thiết kế"""
    try:
        # Index cho Users: Chống trùng lặp username và email
        await db_connection.db["users"].create_index("username", unique=True)
        await db_connection.db["users"].create_index("email", unique=True)
        
        # Index cho OperationLogs: Phục vụ truy vấn lấy log nhanh để giải quyết xung đột (OT)
        await db_connection.db["operation_logs"].create_index(
            [("doc_id", pymongo.ASCENDING), ("v_clock", pymongo.ASCENDING)]
        )
        await db_connection.db["operation_logs"].create_index(
            [("doc_id", pymongo.ASCENDING), ("server_timestamp", pymongo.ASCENDING)]
        )
        logger.info("MongoDB Indexes initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing indexes: {e}")

def get_db() -> AsyncIOMotorDatabase:
    """Hàm Helper để lấy instance Database dùng trong các Repository/Service"""
    if db_connection.db is None:
        raise Exception("Database is not initialized. Please call connect_to_mongodb() first.")
    return db_connection.db
