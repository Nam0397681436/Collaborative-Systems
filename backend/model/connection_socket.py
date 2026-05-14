from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List
import logging

logger=logging.getLogger("app.connection_manager")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str,List[WebSocket]] = {}
    async def connect(self, websocket: WebSocket, doc_id: str):
        await websocket.accept()
        
        if doc_id not in self.active_connections:
            self.active_connections[doc_id] = []

        self.active_connections[doc_id].append(websocket)
    async def disconnect(self, websocket: WebSocket, doc_id: str):
        await websocket.close()
        self.active_connections[doc_id].remove(websocket)
    
    async def broadcast_to_room(self, doc_id: str, message: dict):
        """Gửi tin nhắn cho tất cả mọi người trong một phòng (room)"""
        if doc_id in self.active_connections:
            for websocket in self.active_connections[doc_id]:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Lỗi khi gửi tin nhắn cho user {websocket}: {e}")       
    
# Năm