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
    base_url = os.environ.get("HF_BASE_URL", "https://router.huggingface.co")
    models_base = os.environ.get(
        "HF_MODELS_BASE",
        "https://router.huggingface.co/hf-inference/models"
    )
    return {
        "token": os.environ.get("HF_TOKEN", ""),
        "embedding_model": os.environ.get(
            "HF_EMBEDDING_MODEL",
            "sentence-transformers/all-MiniLM-L6-v2"
        ),
        "text_model": os.environ.get(
            "HF_TEXT_MODEL",
            "mistralai/Mistral-7B-Instruct-v0.3"
        ),
        "base_url": base_url.rstrip("/"),
        "models_base": models_base.rstrip("/"),
        "timeout_ms": int(os.environ.get("HF_TIMEOUT_MS", "30000")),
    }


def build_hf_url(models_base: str, model: str) -> str:
    return f"{models_base.rstrip('/')}/{model}"


def hf_post_json(url: str, payload: Dict[str, Any], timeout_ms: int) -> Any:
    token = os.environ.get("HF_TOKEN", "")
    if not token:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    attempt = 0
    retries = 1
    while True:
        try:
            with httpx.Client(timeout=timeout_ms / 1000.0) as client:
                res = client.post(url, headers=headers, json=payload)
            logger.info("[HF] POST %s status=%s", url, res.status_code)
            if res.status_code < 200 or res.status_code >= 300:
                body = res.text[:300] if res.text else ""
                log_hf(url, res.status_code, body)
                raise HTTPException(
                    status_code=502,
                    detail=f"HF error {res.status_code}: {body}"
                )
            try:
                return res.json()
            except ValueError:
                return res.text
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


def _mean_pool_token_embeddings(token_embeddings: List[List[float]]) -> List[float]:
    if not token_embeddings:
        return []
    dim = len(token_embeddings[0])
    sums = [0.0] * dim
    count = 0
    for token in token_embeddings:
        if len(token) != dim:
            continue
        for i, value in enumerate(token):
            sums[i] += float(value)
        count += 1
    if count == 0:
        return []
    return [value / count for value in sums]


def _normalize_embeddings(result: Any) -> List[List[float]]:
    if isinstance(result, list) and result:
        if isinstance(result[0], list) and result[0]:
            if isinstance(result[0][0], (int, float)):
                return [list(map(float, vec)) for vec in result]
            if isinstance(result[0][0], list):
                return [_mean_pool_token_embeddings(tokens) for tokens in result]
        if isinstance(result[0], (int, float)):
            return [list(map(float, result))]
    raise HTTPException(status_code=502, detail="HF embeddings response invalid")


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


def _extract_generated_text(result: Any) -> str:
    if isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, dict):
            return str(first.get("generated_text", "")).strip()
        if isinstance(first, str):
            return first.strip()
    if isinstance(result, dict):
        return str(result.get("generated_text", "")).strip()
    if isinstance(result, str):
        return result.strip()
    return ""


_HF_STARTUP_CONFIG = get_hf_config()
print(
    "[HF] base_url={base_url} models_base={models_base} "
    "embedding_model={embedding_model} text_model={text_model} "
    "timeout={timeout_ms}".format(**_HF_STARTUP_CONFIG)
)


def log_hf(url: str, status: int, body_snippet: str) -> None:
    logger.warning("[HF] non-2xx url=%s status=%s body=%s", url, status, body_snippet)


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

@app.get("/debug/hf")
def debug_hf():
    config = get_hf_config()
    return {
        "hf_base_url": config["base_url"],
        "hf_models_base": config["models_base"],
        "embedding_model": config["embedding_model"],
        "text_model": config["text_model"],
        "token_set": bool(config["token"])
    }


@app.post("/debug/hf-embed", dependencies=[Depends(require_shared_secret)])
def debug_hf_embed():
    config = get_hf_config()
    url = build_hf_url(config["models_base"], config["embedding_model"])
    payload = {
        "inputs": ["hello world", "test sentence"],
        "options": {"wait_for_model": True}
    }
    token = config["token"]
    if not token:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    with httpx.Client(timeout=config["timeout_ms"] / 1000.0) as client:
        res = client.post(url, headers=headers, json=payload)
    body_text = res.text[:300] if res.text else ""
    if res.status_code < 200 or res.status_code >= 300:
        log_hf(url, res.status_code, body_text)
    try:
        body = res.json()
    except ValueError:
        body = body_text
    return {"url": url, "status": res.status_code, "body": body}


@app.post("/debug/hf-generate", dependencies=[Depends(require_shared_secret)])
def debug_hf_generate():
    config = get_hf_config()
    url = build_hf_url(config["models_base"], config["text_model"])
    payload = {
        "inputs": "Say hello in one sentence.",
        "parameters": {"max_new_tokens": 30, "return_full_text": False},
        "options": {"wait_for_model": True}
    }
    token = config["token"]
    if not token:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    with httpx.Client(timeout=config["timeout_ms"] / 1000.0) as client:
        res = client.post(url, headers=headers, json=payload)
    body_text = res.text[:300] if res.text else ""
    if res.status_code < 200 or res.status_code >= 300:
        log_hf(url, res.status_code, body_text)
    try:
        body = res.json()
    except ValueError:
        body = body_text
    return {"url": url, "status": res.status_code, "body": body}


@app.post("/embed", dependencies=[Depends(require_shared_secret)])
def embed(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts are required")
    config = get_hf_config()
    url = build_hf_url(config["models_base"], config["embedding_model"])
    payload = {"inputs": req.texts, "options": {"wait_for_model": True}}
    result = hf_post_json(url, payload, config["timeout_ms"])
    embeddings = _normalize_embeddings(result)
    return {"vectors": embeddings, "model": config["embedding_model"]}


@app.post("/synthesize", dependencies=[Depends(require_shared_secret)])
def synthesize(req: SynthesizeRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="items are required")
    config = get_hf_config()
    url = build_hf_url(config["models_base"], config["text_model"])

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
            "max_new_tokens": 200,
            "temperature": 0.3,
            "return_full_text": False
        },
        "options": {"wait_for_model": True}
    }
    result = hf_post_json(url, payload, config["timeout_ms"])
    output_text = _extract_generated_text(result)
    if not output_text:
        raise HTTPException(status_code=502, detail="HF text response empty")
    return parse_synthesis(output_text)
