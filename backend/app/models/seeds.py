import uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, ForeignKey, JSON, Integer, Boolean
from app.models.base import Base


class Seed(Base):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2048))
    category: Mapped[str | None] = mapped_column(String(100))
    upload_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|processing|completed|failed
    total_images: Mapped[int] = mapped_column(Integer, default=0)
    processed_images: Mapped[int] = mapped_column(Integer, default=0)
    zip_file_path: Mapped[str | None] = mapped_column(String(1024))
    s3_prefix: Mapped[str | None] = mapped_column(String(512))
    extra_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("user.id"))

    images: Mapped[list["SeedImage"]] = relationship(back_populates="seed", cascade="all, delete-orphan")


class SeedImage(Base):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    seed_id: Mapped[str] = mapped_column(String(36), ForeignKey("seed.id", ondelete="CASCADE"))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(255))
    s3_key: Mapped[str] = mapped_column(String(1024))
    s3_url: Mapped[str] = mapped_column(String(2048))
    file_size: Mapped[int | None]
    content_type: Mapped[str | None] = mapped_column(String(100))
    width: Mapped[int | None]
    height: Mapped[int | None]
    extra_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict)

    seed: Mapped[Seed] = relationship(back_populates="images")


class SeedUsage(Base):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    seed_id: Mapped[str] = mapped_column(String(36), ForeignKey("seed.id", ondelete="CASCADE"))
    seed_image_id: Mapped[str] = mapped_column(String(36), ForeignKey("seedimage.id", ondelete="CASCADE"))
    job_id: Mapped[str | None] = mapped_column(String(36))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant.id", ondelete="CASCADE"))
    record_id: Mapped[str | None] = mapped_column(String(64))
    field_name: Mapped[str | None] = mapped_column(String(255))
    generated_image_url: Mapped[str | None] = mapped_column(String(2048))
    usage_context: Mapped[dict] = mapped_column(JSON, default=dict)


class SeedQualityFeedback(Base):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    seed_id: Mapped[str] = mapped_column(String(36), ForeignKey("seed.id", ondelete="CASCADE"))
    seed_image_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("seedimage.id", ondelete="CASCADE"))
    job_id: Mapped[str | None] = mapped_column(String(36))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenant.id", ondelete="CASCADE"))
    quality_rating: Mapped[int] = mapped_column(Integer)
    feedback_type: Mapped[str] = mapped_column(String(50))
    feedback_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("user.id"))


