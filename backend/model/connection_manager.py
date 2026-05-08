from fastapi import WebSocket, WebSocketDisconnect


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
    def connect(self, websocket: WebSocket):
        pass
    def disconnect(self, websocket: WebSocket):
        pass

# Năm