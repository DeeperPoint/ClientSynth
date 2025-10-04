from fastapi import APIRouter, HTTPException
import os
import httpx

router = APIRouter(prefix="/api/v1/openrouter", tags=["openrouter"])

@router.get("/image-models")
async def list_image_models():
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="OPENROUTER_API_KEY not configured")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000"),
        "X-Title": os.getenv("OPENROUTER_APP_TITLE", "ClientSynth"),
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        payload = r.json()
        tokens = [
            "gpt-image",
            "dall-e",
            "flux",
            "stable-diffusion",
            "stable-image",
            "sd3",
            "recraft",
            "ideogram",
            "kandinsky",
            "playground",
            "kolors",
        ]
        models = []
        for m in payload.get("data", []):
            mid = str(m.get("id"))
            arch = m.get("architecture") or {}
            modality = (arch.get("modality") or "").lower()
            is_image_modality = ("image" in modality)
            has_image_token = any(t in mid for t in tokens)
            if mid and (is_image_modality or has_image_token):
                models.append({
                    "id": mid,
                    "name": m.get("name") or mid,
                    "modality": arch.get("modality"),
                    "provider": (m.get("top_provider") or {}).get("name"),
                })
        # Sort by name for easier selection
        models.sort(key=lambda x: x["name"]) 
        return {"count": len(models), "models": models}
