from fastapi import APIRouter
from model.enum_user_role import UserRole

router = APIRouter()

@router.post("/get_list_doc/{user_id}")
async def get_list_doc(user_id: str):
    """Lấy danh sách tài liệu của người dùng"""
    pass

@router.post("/create_doc/{user_id}")
async def create_doc(user_id: str):
    """Tạo tài liệu mới"""
    pass

@router.post("/open_doc/{doc_id}/{user_id}")
async def open_doc(doc_id: str, user_id: str):
    """Trả về tài liệu về cho client truy vấn trong db(mongodb) or cache - redis """
    """ lúc này bên client sẽ thiết lập kết nối socket giữa client và server gọi đến api socket"""
    pass

@router.post("/share_doc/{doc_id}/{user_id}/{role}")
async def share_doc(doc_id: str, user_id: str, role: UserRole):
    """Chia sẻ quyền truy cập tài liệu"""
    pass

@router.post("/save_doc/{doc_id}/{user_id}")
async def save_doc(doc_id: str, user_id: str):
    """Lưu trữ tài liệu"""
    pass
