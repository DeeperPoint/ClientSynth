from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.v1.auth import get_current_user
from app.models.identity import User, UserTenantRole
from app.models.seeds import Seed, SeedImage
from app.services.image_provider import LocalSeedImageProvider
from app.services.storage import LocalStorage


router = APIRouter(prefix="/api/v1/images", tags=["images"])


class GenerateRequest(BaseModel):
    tenant_id: str
    job_id: str
    record_id: str
    field_name: str
    seed_id: str
    seed_image_id: str
    prompt: str = ""
    style: str = "professional"


def _assert_tenant_access(db: Session, user_id: str, tenant_id: str):
    utr = db.query(UserTenantRole).filter(UserTenantRole.user_id == user_id, UserTenantRole.tenant_id == tenant_id).first()
    if not utr:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to tenant")


@router.post("/generate")
def generate(req: GenerateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _assert_tenant_access(db, user.id, req.tenant_id)

    seed = db.get(Seed, req.seed_id)
    if not seed or seed.tenant_id != req.tenant_id:
        raise HTTPException(status_code=404, detail="Seed not found")
    img = db.get(SeedImage, req.seed_image_id)
    if not img or img.seed_id != seed.id:
        raise HTTPException(status_code=404, detail="Seed image not found")

    provider = LocalSeedImageProvider()
    result = provider.generate_from_seed(img.width or 512, img.height or 512, req.prompt, req.style)

    storage = LocalStorage()
    path, url = storage.save_generated(req.tenant_id, req.job_id, req.record_id, req.field_name, result.content)

    return {"url": url, "content_type": result.content_type, "w": result.width, "h": result.height}


