from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.v1.auth import get_current_user
from app.models.identity import User, UserTenantRole
from app.models.schema import Schema


router = APIRouter(prefix="/api/v1/schemas", tags=["schemas"])


class SchemaCreate(BaseModel):
    tenant_id: str
    name: str
    description: str | None = None
    schema_definition: Dict[str, Any] = Field(default_factory=dict)


class SchemaResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str | None
    schema_definition: Dict[str, Any]

    class Config:
        from_attributes = True


def _assert_tenant_access(db: Session, user_id: str, tenant_id: str):
    utr = db.query(UserTenantRole).filter(UserTenantRole.user_id == user_id, UserTenantRole.tenant_id == tenant_id).first()
    if not utr:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to tenant")


@router.post("/", response_model=SchemaResponse)
def create_schema(payload: SchemaCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _assert_tenant_access(db, user.id, payload.tenant_id)

    if not isinstance(payload.schema_definition, dict) or "fields" not in payload.schema_definition:
        raise HTTPException(status_code=400, detail="schema_definition must include 'fields'")

    s = Schema(
        tenant_id=payload.tenant_id,
        name=payload.name,
        description=payload.description,
        schema_definition=payload.schema_definition,
        created_by=user.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("/", response_model=List[SchemaResponse])
def list_schemas(tenant_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _assert_tenant_access(db, user.id, tenant_id)
    result = db.query(Schema).filter(Schema.tenant_id == tenant_id).order_by(Schema.created_at.desc()).all()
    return result


@router.get("/{schema_id}", response_model=SchemaResponse)
def get_schema(schema_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.get(Schema, schema_id)
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    _assert_tenant_access(db, user.id, s.tenant_id)
    return s


