from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.v1.auth import get_current_user
from app.models.identity import User, Tenant, UserTenantRole


router = APIRouter(prefix="/api/v1/tenants", tags=["tenants"])


class TenantCreate(BaseModel):
    name: str
    slug: str


class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str

    class Config:
        from_attributes = True


@router.post("/", response_model=TenantResponse)
def create_tenant(payload: TenantCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    exists = db.query(Tenant).filter(Tenant.slug == payload.slug).first()
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slug already exists")
    t = Tenant(name=payload.name, slug=payload.slug)
    db.add(t)
    db.commit()
    db.refresh(t)
    # owner membership for creator
    db.add(UserTenantRole(user_id=user.id, tenant_id=t.id, role="owner"))
    db.commit()
    return t


@router.get("/", response_model=list[TenantResponse])
def list_my_tenants(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # naive join
    rows = (
        db.query(Tenant)
        .join(UserTenantRole, UserTenantRole.tenant_id == Tenant.id)
        .filter(UserTenantRole.user_id == user.id)
        .all()
    )
    return rows
