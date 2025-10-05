import os
import io
import base64
import httpx
import logging
from urllib.parse import urlparse
from dataclasses import dataclass
from typing import Optional, Tuple
from PIL import Image
from app.core.config import settings
try:
    import boto3  # type: ignore
except Exception:  # pragma: no cover
    boto3 = None


@dataclass
class GenerationResult:
    content: bytes
    content_type: str
    width: int
    height: int


class BaseImageProvider:
    def generate_from_seed(self, width: int, height: int, prompt: str, style: str = "professional") -> GenerationResult:
        raise NotImplementedError

    def generate_from_seed_url(self, seed_image_url: str, prompt: str, style: str = "professional") -> GenerationResult:
        raise NotImplementedError


class LocalSeedImageProvider(BaseImageProvider):
    """Deterministic local provider for tests.

    It does not read the seed image bytes. Instead, it uses seed metadata (width/height)
    to generate a new solid-color image, simulating image-to-image generation.
    """

    def _load_seed_bytes(self, seed_ref: str) -> tuple[bytes, str]:
        # file:// path
        if seed_ref.startswith("file://"):
            path = seed_ref[len("file://"):]
            with open(path, "rb") as f:
                data = f.read()
            return data, "image/png"
        # Local filesystem path
        if os.path.exists(seed_ref):
            with open(seed_ref, "rb") as f:
                data = f.read()
            return data, "image/png"
        # s3 key
        if settings.AWS_S3_BUCKET and boto3 is not None and not seed_ref.startswith("http"):
            s3 = boto3.client("s3", region_name=settings.AWS_REGION)
            obj = s3.get_object(Bucket=settings.AWS_S3_BUCKET, Key=seed_ref)
            body = obj["Body"].read()
            content_type = obj.get("ContentType", "image/png")
            return body, content_type
        # http(s)
        with httpx.Client(timeout=30) as client:
            resp = client.get(seed_ref)
            resp.raise_for_status()
            return resp.content, resp.headers.get("content-type", "image/png")

    def generate_from_seed(self, width: int, height: int, prompt: str, style: str = "professional") -> GenerationResult:
        color = (0, 128, 255) if style == "professional" else (200, 50, 50)
        img = Image.new("RGB", (max(1, width), max(1, height)), color=color)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return GenerationResult(content=buf.getvalue(), content_type="image/png", width=width, height=height)

    def generate_from_seed_url(self, seed_image_url: str, prompt: str, style: str = "professional") -> GenerationResult:
        # Try to read the seed and make a light, deterministic transform instead of a blue square
        try:
            data, _ = self._load_seed_bytes(seed_image_url)
            base = Image.open(io.BytesIO(data)).convert("RGB")
            target = 512
            # Fit into 512x512 with letterboxing
            base.thumbnail((target, target), Image.LANCZOS)
            canvas = Image.new("RGB", (target, target), (0, 0, 0))
            x = (target - base.width) // 2
            y = (target - base.height) // 2
            canvas.paste(base, (x, y))

            # Apply a subtle tint from prompt hash so outputs are not identical
            import hashlib
            h = hashlib.md5((prompt or "").encode("utf-8")).hexdigest()
            tint = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
            overlay = Image.new("RGB", (target, target), tint)
            out = Image.blend(canvas, overlay, 0.08)

            buf = io.BytesIO()
            out.save(buf, format="PNG")
            return GenerationResult(content=buf.getvalue(), content_type="image/png", width=target, height=target)
        except Exception:
            # Last resort
            return self.generate_from_seed(512, 512, prompt, style)


class OpenRouterImageProvider(BaseImageProvider):
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        # Example image-capable model; override via env OPENROUTER_IMAGE_MODEL
        self.model = model or os.getenv("OPENROUTER_IMAGE_MODEL", "black-forest-labs/flux-1.1-pro")
        self.logger = logging.getLogger(__name__)

    def _load_seed_bytes(self, seed_ref: str) -> tuple[bytes, str]:
        # file:// path
        if seed_ref.startswith("file://"):
            path = seed_ref[len("file://"):]
            with open(path, "rb") as f:
                data = f.read()
            return data, "image/png"
        # Local filesystem path
        if os.path.exists(seed_ref):
            with open(seed_ref, "rb") as f:
                data = f.read()
            return data, "image/png"
        # s3://bucket/key or bare S3 key (with configured bucket)
        if seed_ref.startswith("s3://") or (settings.AWS_S3_BUCKET and not seed_ref.startswith("http")):
            if boto3 is None:
                raise RuntimeError("boto3 is required to load S3 objects")
            if seed_ref.startswith("s3://"):
                parsed = urlparse(seed_ref)
                bucket = parsed.netloc
                key = parsed.path.lstrip("/")
            else:
                bucket = settings.AWS_S3_BUCKET
                key = seed_ref
            s3 = boto3.client("s3", region_name=settings.AWS_REGION)
            obj = s3.get_object(Bucket=bucket, Key=key)
            body = obj["Body"].read()
            content_type = obj.get("ContentType", "image/png")
            return body, content_type
        # http(s) URL
        with httpx.Client(timeout=30) as client:
            resp = client.get(seed_ref)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "image/png")
            return resp.content, content_type

    def generate_from_seed(self, width: int, height: int, prompt: str, style: str = "professional") -> GenerationResult:
        # Requires seed image URL for i2i; this method is not used in OR mode
        raise NotImplementedError("Use generate_from_seed_url with OpenRouterImageProvider")

    def generate_from_seed_url(self, seed_image_url: str, prompt: str, style: str = "professional") -> GenerationResult:
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required for image generation")

        seed_bytes, content_type = self._load_seed_bytes(seed_image_url)
        data_url = f"data:{content_type};base64,{base64.b64encode(seed_bytes).decode('ascii')}"

        def _extract_image_from_response(client: httpx.Client, data: dict) -> tuple[bytes, str]:
            choice = (data.get("choices") or [{}])[0]
            message = choice.get("message", {})
            content = message.get("content")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") in ("output_image", "image", "image_url"):
                        img_url = part.get("image_url", {}).get("url") if isinstance(part.get("image_url"), dict) else part.get("image_url")
                        if img_url:
                            if img_url.startswith("data:"):
                                header, b64 = img_url.split(",", 1)
                                return base64.b64decode(b64), header.split(";")[0].split(":", 1)[1]
                            r2 = client.get(img_url)
                            r2.raise_for_status()
                            return r2.content, r2.headers.get("content-type", "image/png")
            images = message.get("images") or []
            if images:
                img_url = images[0].get("image_url", {}).get("url")
                if img_url:
                    if img_url.startswith("data:"):
                        header, b64 = img_url.split(",", 1)
                        return base64.b64decode(b64), header.split(";")[0].split(":", 1)[1]
                    r2 = client.get(img_url)
                    r2.raise_for_status()
                    return r2.content, r2.headers.get("content-type", "image/png")
            raise RuntimeError("No images returned from OpenRouter response")

        def _try_with_model(client: httpx.Client, model_id: str) -> tuple[bytes, str]:
            # Try OpenAI-style content format first (widely compatible)
            payload_primary = {
                "model": model_id,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    }
                ],
            }
            try:
                resp = client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000"),
                        "X-Title": os.getenv("OPENROUTER_APP_TITLE", "ClientSynth"),
                    },
                    json=payload_primary,
                )
                resp.raise_for_status()
                data = resp.json()
                return _extract_image_from_response(client, data)
            except httpx.HTTPStatusError as e:
                self.logger.warning(
                    f"OpenRouter image gen 1st attempt failed for {model_id}: {e.response.status_code} {e.response.text[:200]}"
                )
                # Try alternate payload shape
                payload_alt = {
                    "model": model_id,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": prompt},
                                {"type": "input_image", "image_url": {"url": data_url}},
                            ],
                        }
                    ],
                    "modalities": ["image", "text"],
                }
                resp2 = client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000"),
                        "X-Title": os.getenv("OPENROUTER_APP_TITLE", "ClientSynth"),
                    },
                    json=payload_alt,
                )
                resp2.raise_for_status()
                data2 = resp2.json()
                return _extract_image_from_response(client, data2)

        with httpx.Client(timeout=60) as client:
            out_bytes, out_type = _try_with_model(client, self.model)
            # Dimensions are unknown; default to 512x512 to avoid extra parsing
            return GenerationResult(content=out_bytes, content_type=out_type, width=512, height=512)


def get_image_provider() -> BaseImageProvider:
    if os.getenv("OPENROUTER_API_KEY"):
        return OpenRouterImageProvider()
    return LocalSeedImageProvider()


