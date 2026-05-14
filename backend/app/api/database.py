from infra.mongodb.model.connectDB import ConnectMongoDB

mongo_conn = ConnectMongoDB()

def get_db():
    return mongo_conn.get_db()

def close_db():
    mongo_conn.close()
