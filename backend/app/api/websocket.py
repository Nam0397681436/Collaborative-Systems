import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from model.connection_socket import ConnectionManager
from infra.rabbitmq import RabbitMQProducer, get_routing_key
import logging
logger=logging.getLogger("app.websocket")

router = APIRouter()
connection_manager = ConnectionManager()

@router.websocket("/ws/{doc_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, doc_id: str, user_id: str):
    """
    Endpoint xử lý kết nối WebSocket cho từng document
    """
    await connection_manager.connect(websocket, doc_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type= data.get("type")

            if msg_type == "CURSOR":
                await connection_manager.broadcast(
                    doc_id, 
                    json.dumps({
                        "type":"CURSOR",
                        "user_id": user_id,
                        "pos": data.get("pos"),
                        "color": data.get("color",None)
                    })
                    ) # dump data thanh json string
            elif msg_type == "EDIT":
                payload={
                    "type": "EDIT",
                    "id": doc_id,
                    "user_id":user_id,
                    "op": data.get("op"), # Ví dụ: {type: 'insert', char: 'A', index: 10}
                    "version":data.get("version",None),
                    "v_clock":data.get("v_clock",None)
                }

                # push len RabbitMq
                routing_key=get_routing_key(doc_id,num_queue=1)
                await RabbitMQProducer().publish(
                    message=json.dumps(payload),
                    exchange="ot_exchange",
                    routing_key=routing_key
                )

    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected")
        await connection_manager.disconnect(websocket, doc_id)

# Năm
