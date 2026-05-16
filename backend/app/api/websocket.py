import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from model.connection_socket import connection_manager
from infra.rabbitmq.rabbit_mq_gateway import RabbitMQProducer, get_routing_key
import logging
logger=logging.getLogger("app.websocket")

router = APIRouter()

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

            if msg_type == "JOIN":
                user = data.get("user",{})
                connection_manager.add_user(doc_id, user)
                await connection_manager.broadcast_to_room(
                    doc_id,
                    {
                        "type": "JOIN",
                        "doc_id": doc_id,
                        "user_id": user_id,
                        "online_users": connection_manager.get_online_users(doc_id),
                    },
                )
            
            elif msg_type == "CURSOR":
                # logger.info(f"User {user_id} sent cursor position: {data.get('index')}")
                user_info = connection_manager.active_users.get(doc_id, {}).get(user_id, {})
                cursor_msg = {
                    "type":"CURSOR",
                    "user_id": user_id,
                    "index": data.get("index"),
                    "username": user_info.get("username", "Unknown"),
                    "color": user_info.get("color", "#000000")
                }
                await connection_manager.broadcast_to_room(
                    doc_id, 
                    cursor_msg
                    )
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
                # logger.info(f"User {user_id} sent edit operation: {data.get('op')}")

            elif msg_type == "LEAVE":
                break

    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected")
    finally:
        await connection_manager.disconnect(websocket, doc_id, user_id)
        await connection_manager.broadcast_to_room(
            doc_id,
            {
                "type": "LEAVE",
                "doc_id": doc_id,
                "user_id": user_id,
                "online_users": connection_manager.get_online_users(doc_id),
            },
        )

# Năm
