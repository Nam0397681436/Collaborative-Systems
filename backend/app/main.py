import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.websocket import router as websocket_router
from app.api.auth import router as auth_router
from app.api.document import router as document_router
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
app.include_router(document_router, prefix="/api/doc", tags=["Document Management"])
app.include_router(websocket_router, tags=["WebSockets"])

@app.get("/")
async def root():
    return {"message": "Welcome to Collaborative Text Editor API Server"}
