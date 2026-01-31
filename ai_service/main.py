import json
import logging
import os
import time
import hashlib
from typing import List, Optional, Dict, Any
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Request, Depends, Header
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("ai_service")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Note Taker AI Service")

AI_SHARED_SECRET = os.getenv("AI_SHARED_SECRET", "")


def _secret_fp(secret: str) -> str:
    if not secret:
        return ""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()[:12]


print(f"[AI] AI_SHARED_SECRET length: {len(AI_SHARED_SECRET)}")
print(
    f"[AI] AI_SHARED_SECRET sha256[:12]: "
    f"{_secret_fp(AI_SHARED_SECRET) or 'EMPTY'}"
)

def require_shared_secret(
    x_ai_shared_secret: str = Header(default="", alias="x-ai-shared-secret")
):
    if not AI_SHARED_SECRET:
        logger.error("AI_SHARED_SECRET is not configured")
        raise HTTPException(status_code=500, detail="AI_SHARED_SECRET not configured")
    provided = x_ai_shared_secret.strip()
    if not provided or provided != AI_SHARED_SECRET.strip():
        logger.warning("Unauthorized ai_service request")
        raise HTTPException(status_code=401, detail="unauthorized")


class EmbedRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)


class SynthesizeItem(BaseModel):
    type: str
    id: str
    text: str


class SynthesizeRequest(BaseModel):
    items: List[SynthesizeItem] = Field(default_factory=list)
    prompt: Optional[str] = None


def get_hf_config() -> Dict[str, Any]:
    return {
        "token": os.environ.get("HF_TOKEN", ""),
        "embedding_model": os.environ.get(
            "HF_EMBEDDING_MODEL",
            "sentence-transformers/all-MiniLM-L6-v2"
        ),
        "text_model": os.environ.get(
            "HF_TEXT_MODEL",
            "google/flan-t5-base"
        ),
        "base_url": os.environ.get(
            "HF_BASE_URL",
            "https://router.huggingface.co"
        ).rstrip("/"),
        "timeout_ms": int(os.environ.get("HF_TIMEOUT_MS", "30000")),
    }


def encode_model(model: str) -> str:
    return "/".join(quote(part, safe="") for part in model.split("/"))


def build_hf_url(base_url: str, model: str) -> str:
    return f"{base_url}/hf-inference/models/{encode_model(model)}"


def hf_post(url: str, token: str, payload: Dict[str, Any], timeout_ms: int, retries: int = 1) -> Any:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    attempt = 0
    while True:
        try:
            with httpx.Client(timeout=timeout_ms / 1000.0) as client:
                res = client.post(url, headers=headers, json=payload)
            if res.status_code != 200:
                body = res.text[:300] if res.text else ""
                raise HTTPException(
                    status_code=res.status_code,
                    detail=f"HF error {res.status_code}: {body}"
                )
            return res.json()
        except HTTPException:
            if attempt < retries:
                time.sleep(0.3)
                attempt += 1
                continue
            raise
        except Exception as exc:
            if attempt < retries:
                time.sleep(0.3)
                attempt += 1
                continue
            raise HTTPException(status_code=502, detail=f"HF request failed: {exc}") from exc


def parse_synthesis(output: str) -> Dict[str, Any]:
    try:
        data = json.loads(output)
        if isinstance(data, dict):
            return {
                "summary": data.get("summary", ""),
                "bullets": data.get("bullets", []),
                "connections": data.get("connections", [])
            }
    except Exception:
        pass
    return {
        "summary": output.strip(),
        "bullets": [],
        "connections": []
    }


@app.get("/health")
def health():
    return {"status": "ok", "message": "Server is warm."}

@app.get("/debug/headers")
def debug_headers(request: Request):
    return {key.lower(): value for key, value in request.headers.items()}


@app.get("/debug/secret")
def debug_secret():
    return {
        "expected_len": len(AI_SHARED_SECRET),
        "expected_fp": _secret_fp(AI_SHARED_SECRET) or "EMPTY"
    }


@app.post("/embed", dependencies=[Depends(require_shared_secret)])
def embed(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts are required")
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    url = build_hf_url(config["base_url"], config["embedding_model"])
    payload = {"inputs": req.texts, "options": {"wait_for_model": True}}
    result = hf_post(url, config["token"], payload, config["timeout_ms"], retries=1)
    if not isinstance(result, list):
        raise HTTPException(status_code=502, detail="HF embeddings response invalid")
    return {"embeddings": result, "model": config["embedding_model"]}


@app.post("/synthesize", dependencies=[Depends(require_shared_secret)])
def synthesize(req: SynthesizeRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="items are required")
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    url = build_hf_url(config["base_url"], config["text_model"])

    items_text = "\n".join(
        f"- ({item.type}) {item.id}: {item.text}" for item in req.items
    )
    guidance = req.prompt or "Summarize the themes and connections."
    prompt = (
        "You are a concise assistant. Return JSON with keys: "
        "summary (string), bullets (array of strings), connections "
        "(array of objects with a, b, why). No extra text.\n\n"
        f"Items:\n{items_text}\n\nInstruction: {guidance}"
    )
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 256,
            "temperature": 0.2,
            "return_full_text": False
        },
        "options": {"wait_for_model": True}
    }
    result = hf_post(url, config["token"], payload, config["timeout_ms"], retries=1)
    output_text = ""
    if isinstance(result, list) and result:
        output_text = result[0].get("generated_text", "")
    elif isinstance(result, dict):
        output_text = result.get("generated_text", "")
    if not output_text:
        raise HTTPException(status_code=502, detail="HF text response empty")
    return parse_synthesis(output_text)
