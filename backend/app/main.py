import logging
import json
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.websocket import router as websocket_router
from app.api.auth import router as auth_router
from app.api.document import router as document_router

from infra.mongodb.database import connect_to_mongodb, close_mongodb_connection
from infra.rabbitmq.rabbit_mq_gateway import (
    connect_to_rabbitmq,
    close_rabbitmq_connection,
    get_consumer_channel,
)

logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi chạy khi FastAPI start
    await connect_to_mongodb()
    await connect_to_rabbitmq()
    
    app.state.broadcast_task = asyncio.create_task(listen_for_broadcast())
    
    yield
    # Chạy khi FastAPI shutdown
    if hasattr(app.state, "broadcast_task"):
        app.state.broadcast_task.cancel()
    await close_rabbitmq_connection()
    await close_mongodb_connection()

app = FastAPI(title="Collaborative Text Editor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        "http://10.150.60.153:4000",
        "http://192.168.70.101:4000",
        "http://10.150.60.84:4000",
        "http://10.150.60.38:4000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(document_router, prefix="/api", tags=["Document Management"])
app.include_router(websocket_router, tags=["WebSockets"])

@app.get("/")
async def root():
    return {"message": "Welcome to Collaborative Text Editor API Server"}

async def listen_for_broadcast():
    try:
        channel = get_consumer_channel()
        exchange=await channel.declare_exchange(
            name="broadcast_to_room",
            type="fanout",
            durable=False
        )
        queue = await channel.declare_queue(exclusive=True)
        await queue.bind(exchange)

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process():
                    data = json.loads(message.body.decode('utf-8'))
                    doc_id = data.get("doc_id")
                    
                    # Gửi cho tất cả mọi người trong phòng (bao gồm cả người gõ)
                    from app.api.websocket import connection_manager
                    await connection_manager.broadcast_to_room(doc_id, data)
    except asyncio.CancelledError:
        logging.info("Broadcast listener task cancelled.")
    except Exception as e:
        logging.error(f"Broadcast listener encountered an error: {e}")
