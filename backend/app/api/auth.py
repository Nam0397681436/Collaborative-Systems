from fastapi import APIRouter

router = APIRouter()

@router.post("/register/{username}/{password}")
async def register_account(username: str, password: str):
    """Đăng ký tài khoản mới"""
    pass

@router.post("/login/{username}/{password}")
async def login(username: str, password: str):
    """Đăng nhập hệ thống"""
    pass
