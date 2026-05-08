from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from model.enum_user_role import UserRole

class DocumentSchema(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    title: str
    owner_id: str
    content: str = ""
    version: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True

class DocumentAccessSchema(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    doc_id: str
    user_id: str
    role: UserRole
    granted_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
