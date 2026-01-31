import logging
import os
import hashlib
import hmac
from typing import List, Optional, Dict, Any

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
    if not provided or not hmac.compare_digest(
        provided, AI_SHARED_SECRET.strip()
    ):
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
            "Qwen/Qwen2.5-Coder-7B-Instruct"
        ),
        "text_models_fallback": os.environ.get("HF_TEXT_MODELS_FALLBACK", ""),
        "base_url": "https://router.huggingface.co/hf-inference/models",
        "timeout_ms": int(os.environ.get("HF_TIMEOUT_MS", "30000")),
    }


def _raise_hf_error(task: str, exc: Exception) -> None:
    raise HTTPException(
        status_code=502,
        detail=(
            f"HF {task} failed: {exc}. "
            "Try a different HF_*_MODEL; not all models are served by the provider."
        )
    ) from exc


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


def _normalize_embeddings(result: Any, expected_count: int) -> List[List[float]]:
    if isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, (int, float)):
            return [list(map(float, result))]
        if isinstance(first, list) and first:
            if isinstance(first[0], (int, float)):
                if expected_count == 1 and len(result) != 1:
                    return [_mean_pool_token_embeddings(result)]
                return [list(map(float, vec)) for vec in result]
            if isinstance(first[0], list):
                return [_mean_pool_token_embeddings(tokens) for tokens in result]
    raise HTTPException(status_code=502, detail="HF embeddings response invalid")


def _router_base_url() -> str:
    return "https://router.huggingface.co/hf-inference/models"


def build_router_url(model: str, path: str) -> str:
    return f"{_router_base_url().rstrip('/')}/{model}/{path.lstrip('/')}"


def _hf_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _post_hf(
    url: str,
    token: str,
    payload: Dict[str, Any],
    timeout_ms: int,
    retries: int = 1
) -> httpx.Response:
    headers = _hf_headers(token)
    attempt = 0
    while True:
        try:
            with httpx.Client(timeout=timeout_ms / 1000.0) as client:
                res = client.post(url, headers=headers, json=payload)
            logger.info("[HF] POST %s status=%s", url, res.status_code)
            return res
        except Exception:
            if attempt < retries:
                attempt += 1
                continue
            raise


def _is_not_found_response(res: httpx.Response) -> bool:
    if res.status_code == 404:
        return True
    body = res.text or ""
    return "Not Found" in body


def _parse_json_or_text(res: httpx.Response, limit: int = 300) -> Any:
    try:
        return res.json()
    except ValueError:
        return (res.text or "")[:limit]


def _parse_generation_output(body: Any) -> str:
    if isinstance(body, list) and body:
        first = body[0]
        if isinstance(first, dict):
            return str(first.get("generated_text", "")).strip()
        if isinstance(first, str):
            return first.strip()
    if isinstance(body, dict):
        return str(body.get("generated_text", "")).strip()
    if isinstance(body, str):
        return body.strip()
    return ""


def _parse_fallback_models(raw: str) -> List[str]:
    if not raw:
        return []
    parts = [item.strip() for item in raw.split(",")]
    return [item for item in parts if item]


def _build_model_candidates(primary: str, fallback_raw: str) -> List[str]:
    candidates: List[str] = []
    for model in [primary] + _parse_fallback_models(fallback_raw):
        if model and model not in candidates:
            candidates.append(model)
    return candidates


def hf_chat_complete(
    prompt: str,
    model_candidates: List[str],
    token: str,
    timeout_ms: int,
) -> Dict[str, Any]:
    if not model_candidates:
        raise HTTPException(status_code=500, detail="HF_TEXT_MODEL not configured")
    last_not_found: Optional[str] = None
    for model in model_candidates:
        chat_url = build_router_url(model, "v1/chat/completions")
        chat_payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}]
        }
        res = _post_hf(chat_url, token, chat_payload, timeout_ms)
        body = _parse_json_or_text(res)
        if _is_not_found_response(res):
            last_not_found = f"{model} not found"
            continue
        if res.status_code in (400, 401, 403):
            raise HTTPException(
                status_code=502,
                detail=(
                    f"HF generation failed: {body}. "
                    "Try a different HF_*_MODEL; not all models are served by the provider."
                )
            )
        if res.status_code < 200 or res.status_code >= 300:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"HF generation failed: {body}. "
                    "Try a different HF_*_MODEL; not all models are served by the provider."
                )
            )
        text_out = ""
        if isinstance(body, dict):
            text_out = (
                body.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            ).strip()
        if not text_out:
            text_out = _parse_generation_output(body)
        if text_out:
            logger.info("[HF] chat model used=%s", model)
            return {
                "model": model,
                "text": text_out,
                "method": "chat",
                "url": chat_url,
                "status": 200,
            }
        raise HTTPException(status_code=502, detail="HF text response empty")
    raise HTTPException(
        status_code=502,
        detail=(
            f"HF generation failed: {last_not_found or 'Not Found'}. "
            "Try a different HF_*_MODEL; not all models are served by the provider."
        )
    )


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
    candidates = _build_model_candidates(
        config["text_model"],
        config["text_models_fallback"]
    )
    return {
        "token_set": bool(config["token"]),
        "provider": "hf-inference",
        "hf_base_url": config["base_url"],
        "embedding_model": config["embedding_model"],
        "text_model": config["text_model"],
        "fallback_count": len(candidates) - 1 if candidates else 0,
    }


@app.post("/debug/hf-embed", dependencies=[Depends(require_shared_secret)])
def debug_hf_embed():
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    url = build_router_url(config["embedding_model"], "pipeline/feature-extraction")
    res = _post_hf(
        url,
        config["token"],
        {"inputs": ["hello world", "test sentence"]},
        config["timeout_ms"],
    )
    body = _parse_json_or_text(res)
    vectors: List[List[float]] = []
    if res.status_code >= 200 and res.status_code < 300:
        try:
            vectors = _normalize_embeddings(body, expected_count=2)
        except HTTPException:
            vectors = []
    return {
        "provider": "hf-inference",
        "embedding_model": config["embedding_model"],
        "url": url,
        "status": res.status_code,
        "preview": vectors[0][:5] if vectors else [],
    }


@app.post("/debug/hf-generate", dependencies=[Depends(require_shared_secret)])
def debug_hf_generate():
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    prompt = "Say hello in one sentence."
    candidates = _build_model_candidates(
        config["text_model"],
        config["text_models_fallback"]
    )
    result = hf_chat_complete(
        prompt,
        candidates,
        config["token"],
        config["timeout_ms"],
    )
    return {
        "provider": "hf-inference",
        "text_model": result["model"],
        "method": result["method"],
        "url": result["url"],
        "status": result["status"],
        "preview": result["text"][:200],
    }


@app.post("/debug/hf-smoke", dependencies=[Depends(require_shared_secret)])
def debug_hf_smoke():
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    embed_url = build_router_url(config["embedding_model"], "pipeline/feature-extraction")
    embed_res = _post_hf(
        embed_url,
        config["token"],
        {"inputs": ["hello world", "test sentence"]},
        config["timeout_ms"],
    )
    embed_body = _parse_json_or_text(embed_res)
    embed_ok = embed_res.status_code >= 200 and embed_res.status_code < 300
    embed_preview: List[float] = []
    if embed_ok:
        try:
            vectors = _normalize_embeddings(embed_body, expected_count=2)
            embed_preview = vectors[0][:5] if vectors else []
        except HTTPException:
            embed_ok = False
    prompt = "Say hello in one sentence."
    candidates = _build_model_candidates(
        config["text_model"],
        config["text_models_fallback"]
    )
    gen_ok = True
    gen_method = "chat"
    gen_url = ""
    gen_preview = ""
    try:
        gen_result = hf_chat_complete(
            prompt,
            candidates,
            config["token"],
            config["timeout_ms"],
        )
        gen_method = gen_result["method"]
        gen_url = gen_result["url"]
        gen_preview = gen_result["text"][:200]
    except HTTPException as exc:
        gen_ok = False
        gen_preview = exc.detail if isinstance(exc.detail, str) else "generation failed"
    return {
        "provider": "hf-inference",
        "embedding_model": config["embedding_model"],
        "text_model": config["text_model"],
        "embedding": {
            "ok": embed_ok,
            "url": embed_url,
            "status": embed_res.status_code,
            "preview": embed_preview,
        },
        "generation": {
            "ok": gen_ok,
            "method": gen_method,
            "url": gen_url,
            "status": 200 if gen_ok else 502,
            "preview": gen_preview,
        },
    }


@app.post("/embed", dependencies=[Depends(require_shared_secret)])
def embed(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts are required")
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    try:
        url = build_router_url(
            config["embedding_model"],
            "pipeline/feature-extraction"
        )
        res = _post_hf(
            url,
            config["token"],
            {"inputs": req.texts},
            config["timeout_ms"],
        )
        body = _parse_json_or_text(res)
        if res.status_code < 200 or res.status_code >= 300:
            raise HTTPException(
                status_code=502,
                detail=f"HF embeddings failed: {body}. "
                "Try a different HF_*_MODEL; not all models are served by the provider."
            )
        embeddings = _normalize_embeddings(body, expected_count=len(req.texts))
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        _raise_hf_error("embeddings", exc)
    return {"vectors": embeddings, "model": config["embedding_model"]}


@app.post("/synthesize", dependencies=[Depends(require_shared_secret)])
def synthesize(req: SynthesizeRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="items are required")
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")

    items_text = "\n".join(
        f"- ({item.type}) {item.id}: {item.text}" for item in req.items
    )
    guidance = req.prompt or "Summarize the themes and connections."
    prompt = (
        "Return ONLY valid JSON with keys: themes (array of strings), "
        "connections (array of objects with a, b, why), and questions "
        "(array of strings). No extra text.\n\n"
        f"Items:\n{items_text}\n\nInstruction: {guidance}"
    )
    try:
        candidates = _build_model_candidates(
            config["text_model"],
            config["text_models_fallback"]
        )
        result = hf_chat_complete(
            prompt,
            candidates,
            config["token"],
            config["timeout_ms"],
        )
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        _raise_hf_error("generation", exc)
    return {
        "text": result["text"],
        "model": result["model"],
        "method": result["method"],
    }
