import os
import httpx
from typing import Dict, Any


class AIGenerator:
    def __init__(self, api_key: str | None = None, model: str = "google/gemini-2.5-flash"):
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.model = model

    async def generate_field_value(self, context: Dict[str, Any]) -> str:
        # Fallback when key not available
        if not self.api_key:
            field_name = context.get("field_name", "field")
            idx = context.get("record_index", 0)
            return f"Sample {field_name} {idx+1}"

        system = self._system_prompt_for(context)
        prompt = self._build_prompt(context)
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": prompt},
                        ],
                        "max_tokens": 100,
                        "temperature": 0.6,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
        except Exception:
            # Robust fallback
            field_name = context.get("field_name", "field")
            idx = context.get("record_index", 0)
            return f"Sample {field_name} {idx+1}"

    def generate_field_value_sync(self, context: Dict[str, Any]) -> str:
        # If no key, return fallback immediately (used by sync job processor)
        if not self.api_key:
            field_name = context.get("field_name", "field")
            idx = context.get("record_index", 0)
            return f"Sample {field_name} {idx+1}"
        # Synchronous OpenRouter call
        system = self._system_prompt_for(context)
        prompt = self._build_prompt(context)
        try:
            import httpx as _httpx
            resp = _httpx.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 100,
                    "temperature": 0.6,
                },
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
        except Exception:
            field_name = context.get("field_name", "field")
            idx = context.get("record_index", 0)
            return f"Sample {field_name} {idx+1}"

    def _system_prompt_for(self, context: Dict[str, Any]) -> str:
        ft = context.get("field_type", "text")
        return {
            "name": "Generate realistic human names.",
            "email": "Generate realistic email addresses.",
            "company": "Generate realistic company names.",
            "text": "Generate short, realistic text snippet.",
            "description": "Generate concise descriptive text.",
        }.get(ft, "Generate realistic data.")

    def _build_prompt(self, context: Dict[str, Any]) -> str:
        field_name = context.get("field_name", "field")
        desc = context.get("field_description", "")
        existing = context.get("existing_data", {})
        parts = [f"Field: {field_name}"]
        if desc:
            parts.append(f"Description: {desc}")
        if existing:
            pairs = ", ".join(f"{k}: {v}" for k, v in existing.items() if v is not None)
            parts.append(f"Context: {pairs}")
        parts.append("Return only the value.")
        return "\n".join(parts)


