import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from model.connection_manager import ConnectionManager

router = APIRouter()
connection_manager = ConnectionManager()

@router.websocket("/ws/{doc_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, doc_id: str, user_id: str):
    """
    Endpoint xử lý kết nối WebSocket cho từng document
    """
    await connection_manager.connect(websocket)


# Năm - Hoàng