from typing import Dict, Any
import re
import logging
from sqlalchemy.orm import Session
from app.models.jobs import Job, GeneratedData, JobLog
from app.models.schema import Schema
from app.models.seeds import Seed, SeedImage
from app.services.ai_text import AIGenerator
from app.services.image_provider import get_image_provider, LocalSeedImageProvider
from app.services.storage import get_storage
from app.core.config import settings


class JobProcessor:
    def __init__(self, db: Session):
        self.db = db
        self.logger = logging.getLogger(__name__)

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
        # Log job picked up for processing
        try:
            self._log(job.id, "info", "Job picked for processing", {
                "name": job.name,
                "tenant_id": job.tenant_id,
                "schema_id": job.schema_id,
                "total_records": job.total_records,
            })
        except Exception:
            # Best-effort logging; also log to console
            self.logger.info(f"Job {job.id} picked for processing")
        else:
            self.logger.info(f"Job {job.id} picked for processing: total_records={job.total_records}")
        try:
            self._process_job(job)
            job.status = "completed"
            job.progress = 100
            self.db.commit()
            self._log(job.id, "info", "Job processing completed", {
                "generated_records": job.generated_records,
                "progress": job.progress,
            })
            self.logger.info(f"Job {job.id} completed: generated_records={job.generated_records}")
            return True
        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            self.db.commit()
            # Persist failure details
            try:
                self._log(job.id, "error", "Job processing failed", {"error": str(e)})
            except Exception:
                pass
            self.logger.exception(f"Job {job.id} failed")
            return False

    def _process_job(self, job: Job) -> None:
        schema: Schema = self.db.get(Schema, job.schema_id)
        schema_def = schema.schema_definition or {}
        fields = schema_def.get("fields", [])
        seed_rules = {r.get("field"): r for r in (schema_def.get("seed_rules") or []) if isinstance(r, dict) and r.get("field")}
        ai = AIGenerator()
        image_provider = get_image_provider()
        storage = get_storage()
        # Fetch all seed images for the tenant, ordered by id
        seed_images = (
            self.db.query(SeedImage)
            .join(Seed, SeedImage.seed_id == Seed.id)
            .filter(Seed.tenant_id == job.tenant_id)
            .order_by(SeedImage.id.asc())
            .all()
        )
        num_seeds = len(seed_images)
        self._log(job.id, "info", "Preparing generation run", {"seed_images": num_seeds})
        self.logger.info(f"Job {job.id}: {num_seeds} seed images available")

        def _tokens(text: str) -> set[str]:
            return set(t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if t)

        def _field_seed_pool(field: dict) -> list[SeedImage]:
            """Select a per-field pool of seed images.

            Precedence:
            1. If seed_rules contains an entry for this field, apply its explicit match filters.
               Supported match keys: name (substring, case-insensitive), category (exact, case-insensitive),
               filename (substring or simple regex fragment), and id (exact seed_id or seed_image_id).
               If filters yield no results, fall back to heuristic token matching.
            2. Otherwise use heuristic token matching of field name/prompt tokens against
               seed name/category/filename/s3_key.
            3. If still empty, return full seed list.
            Deterministically ordered by SeedImage.id.
            """
            if not seed_images:
                return []
            fname = field.get("name", "")
            fprompt = field.get("prompt", "")
            f_tokens = _tokens(fname) | _tokens(fprompt)
            if not f_tokens:
                return seed_images
            pool: list[SeedImage] = []

            # 1. Explicit rule filtering
            rule = seed_rules.get(fname)
            if rule:
                match = rule.get("match") or {}
                # allow specifying seed_id to lock entire seed, or seed_image_id to lock one image
                seed_id_filter = match.get("seed_id")
                seed_image_id_filter = match.get("seed_image_id")
                name_sub = (match.get("name") or "").lower() if match.get("name") else None
                category_exact = (match.get("category") or "").lower() if match.get("category") else None
                filename_frag = (match.get("filename") or "").lower() if match.get("filename") else None
                for si in seed_images:
                    try:
                        sname = (si.seed.name if si.seed else "")  # type: ignore[attr-defined]
                        scat = (si.seed.category if si.seed else "")  # type: ignore[attr-defined]
                    except Exception:
                        sname = ""; scat = ""
                    if seed_id_filter and (not si.seed or si.seed.id != seed_id_filter):
                        continue
                    if seed_image_id_filter and si.id != seed_image_id_filter:
                        continue
                    if name_sub and name_sub not in sname.lower():
                        continue
                    if category_exact and scat.lower() != category_exact:
                        continue
                    if filename_frag and filename_frag not in (si.filename or "").lower():
                        continue
                    pool.append(si)
                if pool:
                    return pool

            # 2. Heuristic token overlap
            for si in seed_images:
                try:
                    sname = (si.seed.name if si.seed else "")  # type: ignore[attr-defined]
                    scat = (si.seed.category if si.seed else "")  # type: ignore[attr-defined]
                except Exception:
                    sname = ""
                    scat = ""
                meta_source = " ".join([
                    sname or "",
                    scat or "",
                    si.filename or "",
                    (si.s3_key or "").split("/")[-1],
                ])
                s_tokens = _tokens(meta_source)
                if f_tokens & s_tokens:
                    pool.append(si)
            return pool or seed_images

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
                value = ai.generate_field_value_sync(context)
                record[name] = value
                # Optional: log text field generation (kept brief)
                self._log(job.id, "debug", "Generated text field", {"index": i, "field": name})

            # Then generate image fields with full context of previously generated texts
            for f in image_fields:
                name = f.get("name")
                # Select a per-field seed pool (e.g., "farm" images for farm field, "certificate" for certificate field)
                pool = _field_seed_pool(f)
                pool_count = len(pool)
                # Cycle through this pool in order, repeat as needed
                if pool_count > 0:
                    seed_img = pool[i % pool_count]
                    base_prompt = f.get("prompt", "")
                    # add context from previously generated text fields
                    if record:
                        ctx_pairs = ", ".join(f"{k}: {v}" for k, v in record.items() if v is not None)
                        final_prompt = f"{base_prompt} Context: {ctx_pairs}".strip()
                    else:
                        final_prompt = base_prompt
                    # Log intention to generate image
                    self._log(job.id, "info", "Generating image", {
                        "index": i,
                        "field": name,
                        "seed_image_id": seed_img.id,
                        "seed_filename": seed_img.filename,
                        "pool_size": pool_count,
                    })
                    self.logger.info(
                        f"Job {job.id} rec#{i} image field '{name}' using seed {seed_img.id} ({seed_img.filename}); pool_size={pool_count}"
                    )
                    try:
                        # Prefer S3 key if bucket+creds are configured; otherwise use URL (may be file:// or presigned)
                        use_s3_key = bool(settings.AWS_S3_BUCKET and settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY and seed_img.s3_key)
                        seed_ref = seed_img.s3_key if use_s3_key else seed_img.s3_url
                        self.logger.debug(f"Job {job.id} rec#{i} '{name}': using {'s3_key' if use_s3_key else 'url'} for seed load")
                        gen = image_provider.generate_from_seed_url(seed_ref, final_prompt)
                    except Exception:
                        # Fallback: local deterministic generator using width/height or defaults
                        local = LocalSeedImageProvider()
                        w = seed_img.width or 512
                        h = seed_img.height or 512
                        gen = local.generate_from_seed(w, h, final_prompt)
                        self._log(job.id, "warning", "OpenRouter failed; used local image generator fallback", {
                            "index": i,
                            "field": name,
                            "width": w,
                            "height": h,
                        })
                        self.logger.warning(f"Job {job.id} rec#{i} '{name}': OpenRouter failed, using local fallback {w}x{h}")
                    _, url = storage.save_generated(job.tenant_id, job.id, str(i), name, gen.content)
                    record[name] = url
                    self._log(job.id, "info", "Image generated and saved", {"index": i, "field": name})
                    self.logger.info(f"Job {job.id} rec#{i} '{name}': image saved")
                else:
                    record[name] = f"file://placeholder/{name}/{i}"
                    self._log(job.id, "warning", "No seed images available; used placeholder", {"index": i, "field": name})
                    self.logger.warning(f"Job {job.id} rec#{i} '{name}': no seed images, using placeholder")
            gd = GeneratedData(job_id=job.id, tenant_id=job.tenant_id, record_index=i, record_data=record)
            self.db.add(gd)
            job.generated_records = i + 1
            job.progress = int(((i + 1) / job.total_records) * 100)
            self.db.commit()
        self._log(job.id, "info", f"Generated {job.total_records} records")

    def _log(self, job_id: str, level: str, message: str, meta: Dict[str, Any] | None = None):
        self.db.add(JobLog(job_id=job_id, level=level, message=message, meta=meta or {}))
        self.db.commit()


