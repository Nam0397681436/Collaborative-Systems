from fastapi import WebSocket
from typing import Dict, List,Any
import logging

logger=logging.getLogger("app.connection_manager")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[WebSocket, str]] = {}
        self.active_users: Dict[str, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, doc_id: str, user_id: str):
        await websocket.accept()
        
        if doc_id not in self.active_connections:
            self.active_connections[doc_id] = {}

        self.active_connections[doc_id][websocket] = user_id


    async def disconnect(self, websocket: WebSocket, doc_id: str, user_id: str):
        if doc_id in self.active_connections and websocket in self.active_connections[doc_id]:
            del self.active_connections[doc_id][websocket]

        if doc_id in self.active_users and user_id in self.active_users[doc_id]:
            del self.active_users[doc_id][user_id]

        if doc_id in self.active_connections and not self.active_connections[doc_id]:
            del self.active_connections[doc_id]

        if doc_id in self.active_users and not self.active_users[doc_id]:
            del self.active_users[doc_id]

        try:
            await websocket.close()
        except Exception:
            pass

    def add_user(self, doc_id: str, user: dict):
        if doc_id not in self.active_users:
            self.active_users[doc_id] = {}

        user_id = user.get("id")

        if user_id:
            self.active_users[doc_id][user_id] = {
                "id": user.get("id"),
                "username": user.get("username"),
                "email": user.get("email"),
                "role": user.get("role"),
                "color": self.create_random_color(user_id)
            }

    def get_online_users(self, doc_id: str) -> List[dict]:
        if doc_id not in self.active_users:
            return []

        return list(self.active_users[doc_id].values())

    def change_user_role(self, doc_id: str, user_id: str, new_role: str):
        if doc_id in self.active_users and user_id in self.active_users[doc_id]:
            self.active_users[doc_id][user_id]["role"] = new_role
    
    def create_random_color(self, seed: str) -> str:
        """Tạo màu ổn định từ seed, tối vừa đủ để chữ trắng dễ đọc."""
        import colorsys
        import hashlib

        digest = hashlib.sha256(seed.encode("utf-8")).digest()

        hue = int.from_bytes(digest[:2], "big") / 65535.0
        saturation = 0.65 + (digest[2] / 255.0) * 0.2
        lightness = 0.35 + (digest[3] / 255.0) * 0.08

        red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)

        return "#{:02x}{:02x}{:02x}".format(
            int(red * 255),
            int(green * 255),
            int(blue * 255),
        )
    
    async def broadcast_to_room(self, doc_id: str, message: dict):
        """Gửi tin nhắn cho tất cả mọi người trong một phòng (room)"""
        if doc_id in self.active_connections:
            for websocket in list(self.active_connections[doc_id].keys()):
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Lỗi khi gửi tin nhắn cho user {websocket}: {e}") 
    async def send_to_user(self,doc_id: str, user_id: str, data: dict):
        if doc_id in self.active_connections:
            for websocket, uid in list(self.active_connections[doc_id].items()):
                if uid == user_id:
                    try:
                        await websocket.send_json(data)
                    except Exception as e:
                        logger.error(f"Lỗi khi gửi tin nhắn cho user {user_id}: {e}")
# Năm

# Module-level shared manager instance so other modules can broadcast/push updates
connection_manager = ConnectionManager()