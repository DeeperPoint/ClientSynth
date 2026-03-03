from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.api.v1.auth import get_current_user
from app.models.identity import UserTenantRole, User
from app.models.documents import DocumentTemplate
from app.services.storage import get_storage
from app.services.pdf_generator import fill_pdf_bytes
import os


router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


class UploadResponse(BaseModel):
    id: str
    name: str
    filename: str | None


def _assert_tenant_access(db: Session, user_id: str, tenant_id: str):
    utr = db.query(UserTenantRole).filter(UserTenantRole.user_id == user_id, UserTenantRole.tenant_id == tenant_id).first()
    if not utr:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to tenant")


@router.post("/templates/upload", response_model=UploadResponse)
def upload_template(tenant_id: str, name: str, file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _assert_tenant_access(db, user.id, tenant_id)
    if not (file.content_type == "application/pdf" or file.filename.lower().endswith(".pdf")):
        raise HTTPException(status_code=400, detail="Only PDF templates are supported")

    content = file.file.read()
    storage = get_storage()
    # Save under templates path: job_id = "templates", record_id = tenant_id, field_name = name
    path_or_key, url = storage.save_bytes(tenant_id, "templates", tenant_id, name, content, ext=".pdf", content_type="application/pdf")

    tpl = DocumentTemplate(
        tenant_id=tenant_id,
        name=name,
        filename=file.filename,
        storage_key=path_or_key,
        content_type="application/pdf",
        created_by=user.id,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return UploadResponse(id=tpl.id, name=tpl.name, filename=tpl.filename)


class GenerateRequest(BaseModel):
    tenant_id: str
    template_id: str
    data: dict


@router.post("/generate")
def generate(req: GenerateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _assert_tenant_access(db, user.id, req.tenant_id)
    tpl = db.get(DocumentTemplate, req.template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    # Load template bytes from storage
    storage = get_storage()
    # For LocalStorage we saved file:// path; for S3 we saved a key. Try to load when local.
    template_bytes = None
    if tpl.storage_key and tpl.storage_key.startswith("/"):
        try:
            with open(tpl.storage_key, "rb") as f:
                template_bytes = f.read()
        except Exception:
            template_bytes = None
    # If template_bytes still None, try to fetch via URL
    if template_bytes is None and tpl.storage_key:
        # If S3 key, and storage is S3Storage, we could call S3.get_object; but keep simple and try path
        raise HTTPException(status_code=500, detail="Unable to load template bytes from storage; ensure local storage or extend S3 loader")

    try:
        out = fill_pdf_bytes(template_bytes, req.data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    file_path, url = storage.save_bytes(req.tenant_id, "generated", tpl.id, out, ext=".pdf", content_type="application/pdf")
    return {"url": url, "path": file_path}

