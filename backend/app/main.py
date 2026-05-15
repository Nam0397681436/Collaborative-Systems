from fastapi import FastAPI, BackgroundTasks
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.websocket import router as websocket_router
from app.api.auth import router as auth_router
from app.api.document import router as document_router

from aio_pika import connect_robust,IncomingMessage
import json
import asyncio

from infra.mongodb.database import connect_to_mongodb, close_mongodb_connection

logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi chạy khi FastAPI start
    await connect_to_mongodb()
    yield
    # Chạy khi FastAPI shutdown
    await close_mongodb_connection()

app = FastAPI(title="Collaborative Text Editor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    connection=await connect_robust("amqp://guest:guest@localhost/")
    async with connection:
        channel = await connection.channel()
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
                    data = json.loads(message.body)
                    doc_id = data.get("doc_id")
                    
                    # Gửi cho tất cả mọi người trong phòng (bao gồm cả người gõ)
                    from app.api.websocket import connection_manager
                    await connection_manager.broadcast_to_room(doc_id, data)
    
@app.on_event("startup")
async def startup_event(background_tasks: BackgroundTasks):
    # Chạy hàm lắng nghe như một task nền
    background_tasks.add_task(listen_for_broadcast)

    

