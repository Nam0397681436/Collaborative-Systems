from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.websocket import router as websocket_router
from app.api.auth import router as auth_router
from app.api.document import router as document_router

app = FastAPI(title="Collaborative Text Editor API")

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
