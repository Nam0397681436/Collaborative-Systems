from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict, Any

class OperationLogSchema(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    doc_id: str
    user_id: str
    v_clock: Dict[str, int] = Field(description="Đồng hồ Vector của Client ngay tại thời điểm phát sinh thao tác")
    op_data: Dict[str, Any] = Field(description="Dữ liệu mô tả thao tác OT")
    original_op_data: Optional[Dict[str, Any]] = Field(default=None, description="Lưu lại thao tác gốc từ Client trước khi bị hàm transform biến đổi")
    is_transformed: bool = False
    server_timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
