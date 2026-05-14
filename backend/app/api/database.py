from infra.mongodb.database import get_db

def close_db():
    """
    Việc đóng kết nối Database hiện tại đã được quản lý tập trung bởi
    FastAPI Lifespan trong file main.py (close_mongodb_connection).
    Hàm này giữ lại để tương thích với các import cũ nếu có.
    """
    pass
