from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class UserSchema(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    username: str
    email: str
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "username": "giahoang_ptit",
                "email": "hoang@example.com",
                "password_hash": "$2b$12$eImiTXuWVxfM37uY4JANjQYm9xN..."
            }
        }
