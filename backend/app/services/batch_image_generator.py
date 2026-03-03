import logging
from typing import Iterable, List, Tuple
from sqlalchemy.orm import Session

from app.models.seeds import Seed, SeedImage
from app.services.image_provider import get_image_provider, LocalSeedImageProvider
from app.services.storage import LocalStorage


class BatchImageGenerator:
    """
    Generate N images by iterating over a seed's images in order, top-to-bottom (insertion/filename order),
    calling the image provider once per output. If repeat_per_image > 1, use each seed image multiple times before
    moving to the next one.
    """

    def __init__(self, db: Session):
        self.db = db
        self.provider = get_image_provider()
        self.storage = LocalStorage()
        self.logger = logging.getLogger(__name__)

    def generate(
        self,
        tenant_id: str,
        seed_id: str,
        total_outputs: int,
        repeat_per_image: int = 1,
        prompt: str = "",
        style: str = "professional",
        job_id: str | None = None,
        record_prefix: str = "batch",
        field_name: str = "image",
    ) -> List[dict]:
        seed = self.db.get(Seed, seed_id)
        if not seed or seed.tenant_id != tenant_id:
            raise ValueError("Seed not found or access denied")

        images: List[SeedImage] = (
            self.db.query(SeedImage)
            .filter(SeedImage.seed_id == seed_id)
            .order_by(SeedImage.created_at.asc())
            .all()
        )
        if not images:
            return []

        # Build a flat schedule: each seed image repeated `repeat_per_image` times,
        # then cycle the whole list until we reach `total_outputs`.
        results: List[dict] = []
        num_images = len(images)
        out_index = 0
        while out_index < total_outputs:
            # Cycle through seed images
            img = images[(out_index // repeat_per_image) % num_images]
            # Use the seed image URL so OpenRouter provider can perform image-to-image; local provider
            # will ignore bytes and return a deterministic image of default size.
            try:
                gen = self.provider.generate_from_seed_url(img.s3_url, prompt, style)
            except Exception:
                # Fallback: local deterministic generator using width/height or defaults
                self.logger.warning(
                    f"Provider failed for seed image {img.id} ({img.s3_url}); falling back to local generator"
                )
                local = LocalSeedImageProvider()
                w = img.width or 512
                h = img.height or 512
                gen = local.generate_from_seed(w, h, prompt, style)
            record_id = f"{record_prefix}-{out_index}"
            _, url = self.storage.save_generated(tenant_id, job_id or "batch", record_id, field_name, gen.content)
            results.append({
                "source_image_id": img.id,
                "index": out_index,
                "url": url,
                "content_type": gen.content_type,
                "w": gen.width,
                "h": gen.height,
            })
            out_index += 1
        return results
