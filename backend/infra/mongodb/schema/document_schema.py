from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict
from model.enum_user_role import UserRole

class Collaborator(BaseModel):
    user_id: str
    role: UserRole

class DocumentSchema(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    title: str
    owner_id: str
    collaborators: List[Collaborator] = []
    is_public: bool = False
    content_snapshot: str = ""
    global_v_clock: Dict[str, int] = Field(default_factory=dict)
    epoch: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
