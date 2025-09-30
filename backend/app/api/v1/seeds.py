from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from typing import List
from sqlalchemy.orm import Session
import zipfile
import io
from PIL import Image

from app.database import get_db
from app.api.v1.auth import get_current_user
from app.models.identity import User, UserTenantRole
from app.models.seeds import Seed, SeedImage, SeedQualityFeedback


router = APIRouter(prefix="/api/v1/seeds", tags=["seeds"])


def _assert_tenant_access(db: Session, user_id: str, tenant_id: str):
    utr = db.query(UserTenantRole).filter(UserTenantRole.user_id == user_id, UserTenantRole.tenant_id == tenant_id).first()
    if not utr:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to tenant")


@router.post("/upload")
def upload_seed(
    tenant_id: str = Form(...),
    name: str = Form(...),
    description: str = Form(""),
    category: str = Form(""),
    zip_file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _assert_tenant_access(db, user.id, tenant_id)

    if not zip_file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed")

    seed = Seed(
        tenant_id=tenant_id,
        name=name,
        description=description,
        category=category or None,
        upload_status="processing",
        created_by=user.id,
    )
    db.add(seed)
    db.commit()
    db.refresh(seed)

    content = zip_file.file.read()
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            images_added = 0
            for info in z.infolist():
                if info.is_dir():
                    continue
                filename = info.filename
                if not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff")):
                    continue
                data = z.read(info)
                try:
                    with Image.open(io.BytesIO(data)) as im:
                        width, height = im.size
                        content_type = f"image/{im.format.lower()}"
                except Exception:
                    continue

                img = SeedImage(
                    seed_id=seed.id,
                    tenant_id=tenant_id,
                    filename=filename.split("/")[-1],
                    s3_key=f"local://{seed.id}/{filename}",
                    s3_url=f"local://{seed.id}/{filename}",
                    file_size=len(data),
                    content_type=content_type,
                    width=width,
                    height=height,
                )
                db.add(img)
                images_added += 1

            seed.total_images = images_added
            seed.processed_images = images_added
            seed.upload_status = "completed"
            db.commit()
    except zipfile.BadZipFile:
        seed.upload_status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid zip file")

    return {"id": seed.id, "images": seed.total_images, "status": seed.upload_status}


@router.get("/", response_model=list[dict])
def list_seeds(tenant_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _assert_tenant_access(db, user.id, tenant_id)
    seeds = db.query(Seed).filter(Seed.tenant_id == tenant_id).order_by(Seed.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "category": s.category,
            "status": s.upload_status,
            "total_images": s.total_images,
        }
        for s in seeds
    ]


@router.get("/{seed_id}/images", response_model=list[dict])
def list_seed_images(seed_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seed = db.get(Seed, seed_id)
    if not seed:
        raise HTTPException(status_code=404, detail="Not found")
    _assert_tenant_access(db, user.id, seed.tenant_id)
    images = db.query(SeedImage).filter(SeedImage.seed_id == seed_id).all()
    return [
        {
            "id": i.id,
            "filename": i.filename,
            "url": i.s3_url,
            "w": i.width,
            "h": i.height,
        }
        for i in images
    ]


@router.post("/{seed_id}/feedback")
def submit_feedback(
    seed_id: str,
    quality_rating: int = Form(...),
    feedback_type: str = Form("manual"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    seed = db.get(Seed, seed_id)
    if not seed:
        raise HTTPException(status_code=404, detail="Not found")
    _assert_tenant_access(db, user.id, seed.tenant_id)

    fb = SeedQualityFeedback(
        seed_id=seed_id,
        seed_image_id=None,
        job_id=None,
        tenant_id=seed.tenant_id,
        quality_rating=int(quality_rating),
        feedback_type=feedback_type,
        feedback_data={},
        created_by=user.id,
    )
    db.add(fb)
    db.commit()
    return {"ok": True}


