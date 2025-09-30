from fastapi import FastAPI
from app.api.v1.auth import router as auth_router
from app.core.config import settings
from app.api.v1.schemas import router as schemas_router
from app.api.v1.seeds import router as seeds_router
from app.api.v1.images import router as images_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.exports import router as exports_router

app = FastAPI(title="ClientSynth Backend", version="0.1.0")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/ready")
async def ready():
    return {"ready": True}

app.include_router(auth_router)
app.include_router(schemas_router)
app.include_router(seeds_router)
app.include_router(images_router)
app.include_router(jobs_router)
app.include_router(exports_router)

@app.get("/")
async def root():
    return {"service": "clientsynth-backend", "version": "0.1.0", "env": {"log_level": settings.LOG_LEVEL}}
