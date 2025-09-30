import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey, Integer, JSON
from app.models.base import Base


class Export(Base):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant.id", ondelete="CASCADE"))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("job.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    format: Mapped[str] = mapped_column(String(20))  # csv|json
    status: Mapped[str] = mapped_column(String(20), default="pending")
    file_path: Mapped[str | None] = mapped_column(String(2048))
    file_size: Mapped[int | None] = mapped_column(Integer)
    filters: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("user.id"))


