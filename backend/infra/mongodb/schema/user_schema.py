from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class UserSchema(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    username: str
    password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "username": "nam_dev",
                "password": "password"
            }
        }
