from fastapi import APIRouter, HTTPException
from datetime import datetime
from app.api.database import get_db, close_db

router = APIRouter()

@router.post("/register")
async def register_account(dataReq: dict):
    """Đăng ký tài khoản mới"""
    db = get_db()
    print("Received registration data:", dataReq)  # Debug log
    username = dataReq.get("username", None)
    password = dataReq.get("password", None)
    email = dataReq.get("email", None)

    if not username or not password or not email:
        return {"success": False, "message": "Missing username, password, or email"}

    existing_user = await db.users.find_one({"email": email})
    print("Existing user check result:", existing_user)  # Debug log
    if existing_user:
        return {"success": False, "message": "Email đã tồn tại"}

    # 2. Lưu trực tiếp vào MongoDB
    new_user = {
        "username": username,
        "email": email,
        "password": password,
        "created_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(new_user)
    user_id = str(result.inserted_id)

    # 3. Trả về đúng format yêu cầu
    return {
        "success": True,
        "data": {
            "user": {
                "id": user_id,
                "username": username,
                "email": email
            }
        }
    }


@router.post("/login")
async def login(dataReq: dict):
    """Đăng nhập hệ thống"""
    db = get_db()

    password = dataReq.get("password", None)
    email = dataReq.get("email", None)

    if not password or not email:
        return {"success": False, "message": "Missing password or email"}
    
    user= await db.users.find_one({"email": email})
    if not user:
        return {"success": False, "message": "Tài khoản hoặc mật khẩu không chính xác"}
    
    if user["password"] != password:
        return {"success": False, "message": "Tài khoản hoặc mật khẩu không chính xác"}
    
    return {
        "success": True,
        "data": {
            "user": {
                "id": str(user["_id"]),
                "username": user["username"],
                "email": user["email"]
            }
        }
    }
