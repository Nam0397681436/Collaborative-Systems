import json
import logging
import os

from bson import ObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from model.connection_socket import connection_manager
from infra.rabbitmq.rabbit_mq_gateway import RabbitMQProducer, get_routing_key
from infra.redis.redis_client import RedisClient
from infra.mongodb.database import get_db

logger = logging.getLogger("app.websocket")

num_queues = int(os.getenv("RABBITMQ_NUM_QUEUES", "1"))

router = APIRouter()


@router.websocket("/ws/{doc_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, doc_id: str, user_id: str):
    """
    Endpoint xử lý kết nối WebSocket cho từng document
    """
    await connection_manager.connect(websocket, doc_id, user_id)

    try:
        redis_client = RedisClient.get_client()
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "JOIN":
                user = data.get("user", {})
                connection_manager.add_user(doc_id, user)

                v_clock = {}
                try:
                    db = get_db()
                    doc = await db["documents"].find_one({"_id": ObjectId(doc_id)})
                    if doc:
                        v_clock = {
                            str(k): int(v)
                            for k, v in doc.get("global_v_clock", {}).items()
                        }
                except Exception as e:
                    logger.error(f"Error getting v_clock: {e}")

                await connection_manager.broadcast_to_room(
                    doc_id,
                    {
                        "type": "JOIN",
                        "doc_id": doc_id,
                        "user_id": user_id,
                        "online_users": connection_manager.get_online_users(doc_id),
                        "v_clock": v_clock,
                    },
                )
                await RabbitMQProducer().publish(
                    message=json.dumps(
                        {
                            "type": "JOIN",
                            "doc_id": doc_id,
                            "user_id": user_id,
                            "v_clock": v_clock,
                        }
                    ),
                    exchange="ot_exchange",
                    routing_key=get_routing_key(doc_id, num_queue=num_queues),
                )

            elif msg_type == "CURSOR":
                user_info = connection_manager.active_users.get(doc_id, {}).get(
                    user_id, {}
                )
                index = data.get("index")

                if index is None:
                    logger.warning(f"Invalid CURSOR payload from {user_id}: {data}")
                    continue

                cursor_msg = {
                    "type": "CURSOR",
                    "user_id": user_id,
                    "username": user_info.get("username", "Unknown"),
                    "color": user_info.get("color", "#000000"),
                    "index": index,
                }
                await connection_manager.broadcast_to_room(doc_id, cursor_msg)
            elif msg_type == "EDIT":
                payload = {
                    "type": "EDIT",
                    "doc_id": doc_id,
                    "user_id": user_id,
                    "op": data.get(
                        "op"
                    ),  # Ví dụ: {type: 'insert', char: 'A', index: 10}
                    "version": data.get("version", None),
                    "v_clock": data.get("v_clock", None),
                    "epoch": data.get("epoch", 0),
                }

                # push len RabbitMq
                logger.info("payload: %s", payload)
                routing_key = get_routing_key(doc_id, num_queue=num_queues)
                await RabbitMQProducer().publish(
                    message=json.dumps(payload),
                    exchange="ot_exchange",
                    routing_key=routing_key,
                )
                # logger.info(f"User {user_id} sent edit operation: {data.get('op')}")
                # logger.info(f"payload: {payload}\n---000---\n")
            elif msg_type == "LEAVE":
                break

    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected")
    finally:
        await connection_manager.disconnect(websocket, doc_id, user_id)

        # kiểm tra xem còn ai trong phòng không
        remaining_users = connection_manager.get_online_users(doc_id)
        if not remaining_users:
            # nếu không còn ai trong phòng thì lưu nội dung vào mongodb
            logger.info(f"Room {doc_id} is empty. Triggering save to MongoDB...")
            from app.core.snapshot_text import save_snapshot_text, get_snapshot_text

            # lấy nội dung trên redis rồi lưu vào mongodb
            text = await get_snapshot_text(doc_id)
            await save_snapshot_text(doc_id, text)

        await connection_manager.broadcast_to_room(
            doc_id,
            {
                "type": "LEAVE",
                "doc_id": doc_id,
                "user_id": user_id,
                "online_users": remaining_users,
            },
        )


# Năm
