import httpx
from fastapi import HTTPException
from .config import get_settings

settings = get_settings()

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-20250514"
HEADERS = {
    "Content-Type": "application/json",
    "x-api-key": settings.anthropic_api_key,
    "anthropic-version": "2023-06-01",
}


async def call_claude(system: str, user: str, max_tokens: int = 1200) -> tuple[str, int]:
    """
    Appelle l'API Anthropic et retourne (texte_réponse, tokens_utilisés).
    Lève une HTTPException en cas d'erreur.
    """
    payload = {
        "model": MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(ANTHROPIC_URL, headers=HEADERS, json=payload)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur service de génération ({resp.status_code}): {resp.text[:300]}",
        )

    data = resp.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    tokens = data.get("usage", {}).get("input_tokens", 0) + data.get("usage", {}).get("output_tokens", 0)

    return text, tokens


def parse_json(text: str) -> dict | list:
    import json, re
    clean = re.sub(r"```json\s*|```", "", text).strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Réponse JSON invalide: {e}")
