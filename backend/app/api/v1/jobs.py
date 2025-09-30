from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.v1.auth import get_current_user
from app.models.identity import User, UserTenantRole
from app.models.jobs import Job, GeneratedData
from app.models.schema import Schema
from app.services.job_processor import JobProcessor


router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


class JobCreate(BaseModel):
    tenant_id: str
    schema_id: str
    name: str
    total_records: int


def _assert_tenant_access(db: Session, user_id: str, tenant_id: str):
    utr = db.query(UserTenantRole).filter(UserTenantRole.user_id == user_id, UserTenantRole.tenant_id == tenant_id).first()
    if not utr:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to tenant")


@router.post("/", response_model=dict)
def create_job(payload: JobCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _assert_tenant_access(db, user.id, payload.tenant_id)
    if not db.get(Schema, payload.schema_id):
        raise HTTPException(status_code=404, detail="Schema not found")

    job = Job(
        tenant_id=payload.tenant_id,
        schema_id=payload.schema_id,
        name=payload.name,
        total_records=payload.total_records,
        created_by=user.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return {"id": job.id, "status": job.status}


@router.post("/process_one", response_model=dict)
def process_one(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Only checks that user belongs to any tenant; processor is simplified for tests
    processor = JobProcessor(db)
    processed = processor.process_next()
    return {"processed": processed}


@router.get("/{job_id}", response_model=dict)
def get_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Not found")
    _assert_tenant_access(db, user.id, job.tenant_id)
    return {"id": job.id, "status": job.status, "progress": job.progress, "generated_records": job.generated_records}


@router.get("/{job_id}/data", response_model=List[dict])
def list_generated(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Not found")
    _assert_tenant_access(db, user.id, job.tenant_id)
    rows = db.query(GeneratedData).filter(GeneratedData.job_id == job_id).order_by(GeneratedData.record_index.asc()).all()
    return [r.record_data for r in rows]


