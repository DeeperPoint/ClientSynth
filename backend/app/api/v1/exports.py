from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session
import csv, io, json

from app.database import get_db
from app.api.v1.auth import get_current_user
from app.models.identity import User, UserTenantRole
from app.models.jobs import Job, GeneratedData
from app.models.exports import Export


router = APIRouter(prefix="/api/v1/exports", tags=["exports"])


class ExportCreate(BaseModel):
    job_id: str
    format: str  # csv|json
    filters: dict = {}


def _assert_tenant_access(db: Session, user_id: str, tenant_id: str):
    utr = db.query(UserTenantRole).filter(UserTenantRole.user_id == user_id, UserTenantRole.tenant_id == tenant_id).first()
    if not utr:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to tenant")


def _generate_csv(records: list[dict]) -> bytes:
    if not records:
        return b""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(records[0].keys()))
    writer.writeheader()
    writer.writerows(records)
    return output.getvalue().encode("utf-8")


@router.post("/", response_model=dict)
def create_export(payload: ExportCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.get(Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _assert_tenant_access(db, user.id, job.tenant_id)

    exp = Export(tenant_id=job.tenant_id, job_id=job.id, name=f"export_{job.id}", format=payload.format, status="processing", created_by=user.id, filters=payload.filters or {})
    db.add(exp)
    db.commit()
    db.refresh(exp)

    rows = db.query(GeneratedData).filter(GeneratedData.job_id == job.id).order_by(GeneratedData.record_index.asc()).all()
    records = [r.record_data for r in rows]

    if payload.format == "json":
        content = json.dumps(records, indent=2).encode("utf-8")
        path = f"/tmp/clientsynth/exports/{exp.id}.json"
    elif payload.format == "csv":
        content = _generate_csv(records)
        path = f"/tmp/clientsynth/exports/{exp.id}.csv"
    else:
        raise HTTPException(status_code=400, detail="Unsupported format")

    import os
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)

    exp.status = "completed"
    exp.file_path = path
    exp.file_size = len(content)
    db.commit()

    return {"id": exp.id, "status": exp.status, "path": path}


