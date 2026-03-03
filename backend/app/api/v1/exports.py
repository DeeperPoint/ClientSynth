from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import StreamingResponse
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


# NOTE: /recent MUST be declared before /{export_id} to avoid FastAPI
# matching the literal string "recent" as an export_id path parameter.
@router.get("/recent", response_model=List[dict])
def recent_exports(tenant_id: str, limit: int = 10, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _assert_tenant_access(db, user.id, tenant_id)
    q = db.query(Export).filter(Export.tenant_id == tenant_id).order_by(Export.created_at.desc()).limit(max(1, min(limit, 50)))
    results = []
    for e in q.all():
        results.append({
            "id": e.id,
            "name": e.name,
            "format": e.format,
            "status": e.status,
            "file_size": e.file_size,
            "created_at": getattr(e, "created_at", None),
        })
    return results


@router.get("/{export_id}", response_model=dict)
def get_export(export_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    exp = db.get(Export, export_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Not found")
    _assert_tenant_access(db, user.id, exp.tenant_id)
    return {
        "id": exp.id,
        "job_id": exp.job_id,
        "tenant_id": exp.tenant_id,
        "name": exp.name,
        "format": exp.format,
        "status": exp.status,
        "file_path": exp.file_path,
        "file_size": exp.file_size,
        "filters": exp.filters,
        "created_at": getattr(exp, "created_at", None),
    }


@router.get("/{export_id}/download")
def download_export(export_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    exp = db.get(Export, export_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Not found")
    _assert_tenant_access(db, user.id, exp.tenant_id)
    if exp.status != "completed" or not exp.file_path:
        raise HTTPException(status_code=400, detail="Export not ready")
    import os
    if not os.path.exists(exp.file_path):
        raise HTTPException(status_code=404, detail="File missing")
    def iterfile():
        with open(exp.file_path, "rb") as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                yield chunk
    media_type = "text/csv" if exp.format == "csv" else "application/json"
    filename = f"{exp.name}.{exp.format}"
    return StreamingResponse(iterfile(), media_type=media_type, headers={
        "Content-Disposition": f"attachment; filename={filename}"
    })


@router.delete("/{export_id}", response_model=dict)
def delete_export(export_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    exp = db.get(Export, export_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Not found")
    _assert_tenant_access(db, user.id, exp.tenant_id)
    import os
    if exp.file_path and os.path.exists(exp.file_path):
        try:
            os.remove(exp.file_path)
        except OSError:
            pass
    db.delete(exp)
    db.commit()
    return {"deleted": True, "id": export_id}
