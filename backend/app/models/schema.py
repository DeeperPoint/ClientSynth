import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey, JSON, Integer
from app.models.base import Base


class Schema(Base):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(1024))
    schema_definition: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("user.id"))


