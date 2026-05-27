import json
import time
import uuid
import websocket
from locust import User, task, events, between

class WebSocketUser(User):
    wait_time = between(0.1, 0.3)

    def on_start(self):
        self.doc_id = "64e1c2b5d0b4b21b0f0b4d45"
        self.user_id = str(uuid.uuid4())
        
        ws_url = f"ws://localhost:8000/ws/{self.doc_id}/{self.user_id}"
        self.ws = websocket.WebSocket()
        start_time = time.time()
        try:
            self.ws.connect(ws_url)
            events.request.fire(
                request_type="WebSocket",
                name="connect",
                response_time=int((time.time() - start_time) * 1000),
                response_length=0,
                exception=None,
            )
        except Exception as e:
            events.request.fire(
                request_type="WebSocket",
                name="connect",
                response_time=int((time.time() - start_time) * 1000),
                response_length=0,
                exception=e,
            )
            return

        join_payload = {
            "type": "JOIN",
            "user": {"username": "Locust", "color": "#000"}
        }
        self.ws.send(json.dumps(join_payload))
        
        # Read the initial JOIN responses to clear the buffer
        self.ws.settimeout(1.0)
        try:
            while True:
                msg = self.ws.recv()
        except websocket.WebSocketTimeoutException:
            pass

    def on_stop(self):
        if hasattr(self, 'ws') and self.ws:
            self.ws.close()

    @task
    def send_edit(self):
        edit_payload = {
            "type": "EDIT",
            "op": {"type": "insert", "char": "A", "index": 0},
            "version": 0,
            "v_clock": {},
            "epoch": 0
        }
        
        start_time = time.time()
        try:
            self.ws.send(json.dumps(edit_payload))
            
            # Wait for response back from broadcast
            self.ws.settimeout(5.0)
            while True:
                msg = self.ws.recv()
                if msg:
                    data = json.loads(msg)
                    if data.get("type") == "EDIT":
                        break
            
            events.request.fire(
                request_type="WebSocket",
                name="send_edit",
                response_time=int((time.time() - start_time) * 1000),
                response_length=len(msg),
                exception=None,
            )
        except Exception as e:
            events.request.fire(
                request_type="WebSocket",
                name="send_edit",
                response_time=int((time.time() - start_time) * 1000),
                response_length=0,
                exception=e,
            )
