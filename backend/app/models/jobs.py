import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey, Integer, JSON
from app.models.base import Base


class Job(Base):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant.id", ondelete="CASCADE"))
    schema_id: Mapped[str] = mapped_column(String(36), ForeignKey("schema.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    total_records: Mapped[int] = mapped_column(Integer)
    generated_records: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(String(2048))
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("user.id"))


class GeneratedData(Base):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("job.id", ondelete="CASCADE"))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant.id", ondelete="CASCADE"))
    record_index: Mapped[int] = mapped_column(Integer)
    record_data: Mapped[dict] = mapped_column(JSON)


class JobLog(Base):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("job.id", ondelete="CASCADE"))
    level: Mapped[str] = mapped_column(String(20), default="info")
    message: Mapped[str] = mapped_column(String(2048))
    meta: Mapped[dict | None] = mapped_column(JSON, default=dict)


