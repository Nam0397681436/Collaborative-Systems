from motor import motor_asyncio
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME")

class ConnectMongoDB:
    def __init__(self):
        self.client = motor_asyncio.AsyncIOMotorClient(MONGO_URI)
        self.db = self.client[DB_NAME]
    def close(self):
        self.client.close()

    def get_db(self):
        return self.db