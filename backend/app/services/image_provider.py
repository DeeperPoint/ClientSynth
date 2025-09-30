import os
import io
import base64
import httpx
from dataclasses import dataclass
from typing import Optional, Tuple
from PIL import Image


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

    def generate_from_seed(self, width: int, height: int, prompt: str, style: str = "professional") -> GenerationResult:
        color = (0, 128, 255) if style == "professional" else (200, 50, 50)
        img = Image.new("RGB", (max(1, width), max(1, height)), color=color)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return GenerationResult(content=buf.getvalue(), content_type="image/png", width=width, height=height)

    def generate_from_seed_url(self, seed_image_url: str, prompt: str, style: str = "professional") -> GenerationResult:
        # Fallback to fixed-size since we don't read the actual seed here
        return self.generate_from_seed(512, 512, prompt, style)


class OpenRouterImageProvider(BaseImageProvider):
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        # Example image-capable model; override via env OPENROUTER_IMAGE_MODEL
        self.model = model or os.getenv("OPENROUTER_IMAGE_MODEL", "google/gemini-2.5-flash-image-preview")

    def _load_seed_bytes(self, seed_image_url: str) -> tuple[bytes, str]:
        if seed_image_url.startswith("file://"):
            path = seed_image_url[len("file://"):]
            with open(path, "rb") as f:
                data = f.read()
            return data, "image/png"
        # Otherwise fetch
        with httpx.Client(timeout=30) as client:
            resp = client.get(seed_image_url)
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

        # Per OpenRouter docs, include modalities ["image","text"] and read images field from response
        # Ref: https://openrouter.ai/docs/features/multimodal/image-generation
        payload = {
            "model": self.model,
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

        with httpx.Client(timeout=60) as client:
            resp = client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            choice = (data.get("choices") or [{}])[0]
            message = choice.get("message", {})
            images = message.get("images") or []
            if not images:
                # Some models may instead return base64 in content; fallback not implemented
                raise RuntimeError("No images returned from OpenRouter response")
            img_url = images[0]["image_url"]["url"]
            # img_url is a data URL, e.g., data:image/png;base64,...
            if not img_url.startswith("data:"):
                # If a remote URL is returned, fetch it
                r2 = client.get(img_url)
                r2.raise_for_status()
                out_bytes = r2.content
                out_type = r2.headers.get("content-type", "image/png")
            else:
                header, b64 = img_url.split(",", 1)
                out_bytes = base64.b64decode(b64)
                out_type = header.split(";")[0].split(":", 1)[1]

        # Dimensions are unknown; default to 512x512 to avoid extra parsing
        return GenerationResult(content=out_bytes, content_type=out_type, width=512, height=512)


def get_image_provider() -> BaseImageProvider:
    if os.getenv("OPENROUTER_API_KEY"):
        return OpenRouterImageProvider()
    return LocalSeedImageProvider()


