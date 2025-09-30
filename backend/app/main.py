from fastapi import FastAPI
from app.api.v1.auth import router as auth_router
from app.core.config import settings

app = FastAPI(title="ClientSynth Backend", version="0.1.0")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/ready")
async def ready():
    return {"ready": True}

app.include_router(auth_router)

@app.get("/")
async def root():
    return {"service": "clientsynth-backend", "version": "0.1.0", "env": {"log_level": settings.LOG_LEVEL}}
