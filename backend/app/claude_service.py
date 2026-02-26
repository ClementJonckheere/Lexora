import httpx
from fastapi import HTTPException
from .config import get_settings

MODEL = "gemini-2.5-flash-lite"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


async def call_claude(system: str, user: str, max_tokens: int = 1200) -> tuple[str, int]:
    """
    Appelle l'API Gemini et retourne (texte_réponse, tokens_utilisés).
    Lève une HTTPException en cas d'erreur.
    """
    settings = get_settings()
    url = f"{GEMINI_BASE_URL}/{MODEL}:generateContent?key={settings.gemini_api_key}"

    payload = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"maxOutputTokens": max_tokens},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur service de génération ({resp.status_code}): {resp.text[:300]}",
        )

    data = resp.json()
    candidates = data.get("candidates", [])
    text = ""
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)

    usage = data.get("usageMetadata", {})
    tokens = usage.get("totalTokenCount", 0)

    return text, tokens


def parse_json(text: str) -> dict | list:
    import json, re
    clean = re.sub(r"```json\s*|```", "", text).strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Réponse JSON invalide: {e}")
