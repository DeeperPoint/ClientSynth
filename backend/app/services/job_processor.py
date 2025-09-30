from typing import Dict, Any
from sqlalchemy.orm import Session
from app.models.jobs import Job, GeneratedData, JobLog
from app.models.schema import Schema
from app.models.seeds import Seed, SeedImage
from app.services.ai_text import AIGenerator
from app.services.image_provider import get_image_provider
from app.services.storage import LocalStorage


class JobProcessor:
    def __init__(self, db: Session):
        self.db = db

    def process_next(self) -> bool:
        job = (
            self.db.query(Job)
            .filter(Job.status == "pending")
            .order_by(Job.created_at.asc())
            .first()
        )
        if not job:
            return False
        job.status = "processing"
        self.db.commit()
        try:
            self._process_job(job)
            job.status = "completed"
            job.progress = 100
            self.db.commit()
            return True
        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            self.db.commit()
            return False

    def _process_job(self, job: Job) -> None:
        schema: Schema = self.db.get(Schema, job.schema_id)
        fields = schema.schema_definition.get("fields", [])
        ai = AIGenerator()
        image_provider = get_image_provider()
        storage = LocalStorage()
        for i in range(job.total_records):
            record = {}
            # First generate non-image fields
            text_fields = [f for f in fields if f.get("type") != "image"]
            image_fields = [f for f in fields if f.get("type") == "image"]

            for f in text_fields:
                name = f.get("name")
                ftype = f.get("type")
                context = {
                    "field_type": ftype,
                    "field_name": name,
                    "field_description": f.get("description", ""),
                    "record_index": i,
                    "existing_data": record,
                }
                record[name] = ai.generate_field_value_sync(context)

            # Then generate image fields with context of text fields
            for f in image_fields:
                name = f.get("name")
                # For now, pick any seed image for tenant if exists; selection logic later
                seed_img = (
                    self.db.query(SeedImage)
                    .join(Seed, SeedImage.seed_id == Seed.id)
                    .filter(Seed.tenant_id == job.tenant_id)
                    .first()
                )
                if seed_img:
                    gen = image_provider.generate_from_seed_url(seed_img.s3_url, f.get("prompt", ""))
                    _, url = storage.save_generated(job.tenant_id, job.id, str(i), name, gen.content)
                    record[name] = url
                else:
                    record[name] = f"file://placeholder/{name}/{i}"
            gd = GeneratedData(job_id=job.id, tenant_id=job.tenant_id, record_index=i, record_data=record)
            self.db.add(gd)
            job.generated_records = i + 1
            job.progress = int(((i + 1) / job.total_records) * 100)
            self.db.commit()
        self._log(job.id, "info", f"Generated {job.total_records} records")

    def _log(self, job_id: str, level: str, message: str, meta: Dict[str, Any] | None = None):
        self.db.add(JobLog(job_id=job_id, level=level, message=message, meta=meta or {}))
        self.db.commit()


