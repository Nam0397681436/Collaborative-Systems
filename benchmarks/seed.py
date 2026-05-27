from pymongo import MongoClient
from bson import ObjectId

url = "mongodb+srv://giahoang481_db_user:BJGAmS4w04vO8rWr@collaborativesystem.2khu7ri.mongodb.net/?appName=CollaborativeSystem"
client = MongoClient(url)
db = client["collaborative_db"]

doc_id = ObjectId("64e1c2b5d0b4b21b0f0b4d45")

db.documents.update_one(
    {"_id": doc_id},
    {"$set": {
        "epoch": 0,
        "content_snapshot": "",
        "global_v_clock": {}
    }},
    upsert=True
)
print("Seeded successfully.")
