from pydantic import BaseModel, Field
from datetime import datetime
from typing import Dict, Optional

class CheckpointSchema(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    doc_id: str
    version_number: int  # Phiên bản tự tăng cho từng doc (1, 2, 3...)
    checkpoint_v_clock: Dict[str, int]  # Vector clock tại mốc checkpoint
    epoch: int  # Epoch của tài liệu tại thời điểm chụp checkpoint
    content_snapshot: str  # Chuỗi văn bản đầy đủ tại mốc này
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
