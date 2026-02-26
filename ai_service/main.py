import json
import logging
import os
import re
import hashlib
import hmac
import time
from typing import List, Optional, Dict, Any, Set

import httpx
from fastapi import FastAPI, HTTPException, Request, Depends, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, conlist
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("ai_service")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Note Taker AI Service")


class UpstreamStructuredError(Exception):
    def __init__(self, status_code: int, payload: Dict[str, Any]):
        self.status_code = status_code
        self.payload = payload
        super().__init__(str(payload.get("detail") or payload))


@app.exception_handler(UpstreamStructuredError)
async def handle_upstream_structured_error(
    request: Request, exc: UpstreamStructuredError
):
    return JSONResponse(status_code=exc.status_code, content=exc.payload)

AI_SHARED_SECRET = os.getenv("AI_SHARED_SECRET", "")
MAX_SYNTH_TOTAL_CHARS = int(os.getenv("AI_SYNTH_MAX_CHARS", "20000"))
MAX_SYNTH_ITEM_CHARS = int(os.getenv("AI_SYNTH_MAX_ITEM_CHARS", "800"))
MAX_SYNTH_ITEMS = int(os.getenv("AI_SYNTH_MAX_ITEMS", "40"))
ENABLE_JSON_SCHEMA = os.getenv("HF_JSON_SCHEMA", "false").lower() == "true"
HF_MODELS_CACHE_TTL_SEC = int(os.getenv("HF_MODELS_CACHE_TTL_SEC", "300"))


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


class SynthResponse(BaseModel):
    themes: conlist(str, min_length=3, max_length=3)
    connections: conlist(str, min_length=3, max_length=3)
    questions: conlist(str, min_length=3, max_length=3)


def get_hf_config() -> Dict[str, Any]:
    return {
        "token": os.environ.get("HF_TOKEN", ""),
        "provider": os.environ.get("HF_PROVIDER", "hf-inference"),
        "embedding_model": os.environ.get(
            "HF_EMBEDDING_MODEL",
            "sentence-transformers/all-MiniLM-L6-v2"
        ),
        "text_model": os.environ.get(
            "HF_TEXT_MODEL",
            "Qwen/Qwen2.5-Coder-7B-Instruct"
        ),
        "models_base_url": os.environ.get(
            "HF_MODELS_BASE_URL",
            "https://router.huggingface.co/hf-inference/models"
        ).rstrip("/"),
        "router_base_url": os.environ.get(
            "HF_ROUTER_BASE_URL",
            "https://router.huggingface.co/v1"
        ).rstrip("/"),
        "timeout_ms": int(os.environ.get("HF_TIMEOUT_MS", "30000")),
    }


def _raise_hf_error(task: str, exc: Exception) -> None:
    if isinstance(exc, UpstreamStructuredError):
        raise exc
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


def build_models_inference_url(models_base_url: str, model: str, path: str) -> str:
    return f"{models_base_url.rstrip('/')}/{model}/{path.lstrip('/')}"


def _hf_headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


async def _post_hf(
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
            async with httpx.AsyncClient(timeout=timeout_ms / 1000.0) as client:
                res = await client.post(url, headers=headers, json=payload)
            logger.info("[HF] POST %s status=%s", url, res.status_code)
            return res
        except Exception:
            if attempt < retries:
                attempt += 1
                continue
            raise


async def _get_hf(
    url: str,
    token: str,
    timeout_ms: int,
    retries: int = 1
) -> httpx.Response:
    headers = _hf_headers(token)
    attempt = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=timeout_ms / 1000.0) as client:
                res = await client.get(url, headers=headers)
            logger.info("[HF] GET %s status=%s", url, res.status_code)
            return res
        except Exception:
            if attempt < retries:
                attempt += 1
                continue
            raise


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


def _stringify_error_body(body: Any) -> str:
    if isinstance(body, str):
        return body
    try:
        return json.dumps(body)
    except Exception:
        return str(body)


def _hf_credits_depleted(body: Any) -> bool:
    return "credit balance is depleted" in _stringify_error_body(body).lower()


def _raise_hf_response_error(
    task: str,
    body: Any,
    provider: str,
) -> None:
    if _hf_credits_depleted(body):
        raise UpstreamStructuredError(
            status_code=429,
            payload={
                "detail": "HF credits depleted",
                "action": "buy_credits_or_wait",
                "provider": provider,
            },
        )
    raise HTTPException(status_code=502, detail=f"HF {task} failed: {body}")


def _strip_think_blocks(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)


def _strip_code_fences(text: str) -> str:
    text = re.sub(r"```[a-zA-Z0-9_-]*", "", text)
    return text.replace("```", "")


def _clean_model_output(text: str) -> str:
    cleaned = _strip_think_blocks(text)
    cleaned = _strip_code_fences(cleaned)
    return cleaned.strip()


_HF_MODELS_CACHE: Dict[str, Dict[str, Any]] = {}


def _normalize_provider_name(value: Any) -> str:
    return str(value or "").strip().lower()


def _collect_provider_names(value: Any) -> Set[str]:
    names: Set[str] = set()
    if isinstance(value, str):
        normalized = _normalize_provider_name(value)
        if normalized:
            names.add(normalized)
        return names
    if isinstance(value, list):
        for item in value:
            names.update(_collect_provider_names(item))
        return names
    if isinstance(value, dict):
        for key in ("provider", "id", "name", "slug"):
            if isinstance(value.get(key), str):
                normalized = _normalize_provider_name(value.get(key))
                if normalized:
                    names.add(normalized)
        for key in ("provider", "providers", "inferenceProvider", "inferenceProviders"):
            if key in value:
                names.update(_collect_provider_names(value.get(key)))
        return names
    return names


def _model_provider_support(models_body: Any, model: str, provider: str) -> Dict[str, bool]:
    if not isinstance(models_body, list):
        return {"found": False, "supported": False}
    provider_name = _normalize_provider_name(provider)
    for entry in models_body:
        if not isinstance(entry, dict):
            continue
        entry_model = str(
            entry.get("id")
            or entry.get("model")
            or entry.get("name")
            or ""
        ).strip()
        if entry_model != model:
            continue
        names: Set[str] = set()
        provider_info_present = False
        for key in ("providers", "inferenceProviders", "provider", "inferenceProvider"):
            if key in entry:
                provider_info_present = True
                names.update(_collect_provider_names(entry.get(key)))
        if not provider_info_present:
            # If provider metadata is absent in the listing, treat presence as pass.
            return {"found": True, "supported": True}
        return {"found": True, "supported": provider_name in names}
    return {"found": False, "supported": False}


async def _ensure_text_model_supported(config: Dict[str, Any]) -> None:
    model = str(config.get("text_model") or "").strip()
    provider = str(config.get("provider") or "hf-inference").strip()
    router_base_url = str(config.get("router_base_url") or "").rstrip("/")
    token = str(config.get("token") or "")
    timeout_ms = int(config.get("timeout_ms") or 30000)

    if not model:
        raise HTTPException(status_code=500, detail="HF_TEXT_MODEL not configured")
    if not router_base_url:
        raise HTTPException(status_code=500, detail="HF_ROUTER_BASE_URL not configured")

    cache_key = f"{router_base_url}|{provider}|{model}"
    now = time.time()
    cached = _HF_MODELS_CACHE.get(cache_key)
    if cached and (now - float(cached.get("ts", 0))) < HF_MODELS_CACHE_TTL_SEC:
        if cached.get("ok"):
            return
        raise UpstreamStructuredError(
            status_code=400,
            payload={
                "detail": "HF model not supported by enabled provider",
                "model": model,
                "provider": provider,
            },
        )

    models_url = f"{router_base_url}/models"
    res = await _get_hf(models_url, token, timeout_ms)
    body = _parse_json_or_text(res)
    if res.status_code < 200 or res.status_code >= 300:
        _raise_hf_response_error("models list", body, provider)

    support = _model_provider_support(body, model, provider)
    if not support["found"] or not support["supported"]:
        _HF_MODELS_CACHE[cache_key] = {"ts": now, "ok": False}
        raise UpstreamStructuredError(
            status_code=400,
            payload={
                "detail": "HF model not supported by enabled provider",
                "model": model,
                "provider": provider,
            },
        )
    _HF_MODELS_CACHE[cache_key] = {"ts": now, "ok": True}


def _extract_first_json_object(text: str) -> str:
    start = text.find("{")
    if start == -1:
        return text
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == "\"":
                in_string = False
            continue
        if ch == "\"":
            in_string = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return text[start:]


def _is_valid_synthesis_payload(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    if set(data.keys()) != {"themes", "connections", "questions"}:
        return False
    for key in ("themes", "connections", "questions"):
        values = data.get(key)
        if not isinstance(values, list) or len(values) != 3:
            return False
        if not all(isinstance(item, str) for item in values):
            return False
    return True


def _parse_and_validate_synthesis(text: str) -> SynthResponse:
    cleaned = _clean_model_output(text)
    cleaned = _extract_first_json_object(cleaned)
    data = json.loads(cleaned)
    if not _is_valid_synthesis_payload(data):
        raise ValueError("Synthesis output failed validation.")
    return SynthResponse.model_validate(data)


def _fallback_synthesis() -> Dict[str, Any]:
    fallback = ["(AI unavailable)", "(AI unavailable)", "(AI unavailable)"]
    return {
        "themes": fallback,
        "connections": fallback,
        "questions": fallback,
    }


def _build_synthesis_schema() -> Dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "Synthesis",
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "themes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 3,
                        "maxItems": 3,
                    },
                    "connections": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 3,
                        "maxItems": 3,
                    },
                    "questions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 3,
                        "maxItems": 3,
                    },
                },
                "required": ["themes", "connections", "questions"],
            },
        },
    }


async def hf_chat_complete(
    prompt: str,
    model: str,
    token: str,
    timeout_ms: int,
    router_base_url: str,
    provider: str = "hf-inference",
    system: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 500,
    response_format: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not model:
        raise HTTPException(status_code=500, detail="HF_TEXT_MODEL not configured")
    chat_url = f"{router_base_url}/chat/completions"
    messages: List[Dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    chat_payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    if response_format:
        chat_payload["response_format"] = response_format
    res = await _post_hf(chat_url, token, chat_payload, timeout_ms)
    body = _parse_json_or_text(res)
    if res.status_code < 200 or res.status_code >= 300:
        if response_format and res.status_code in (400, 422):
            logger.warning("[HF] response_format unsupported; retrying without schema")
            chat_payload.pop("response_format", None)
            res = await _post_hf(chat_url, token, chat_payload, timeout_ms)
            body = _parse_json_or_text(res)
        if res.status_code < 200 or res.status_code >= 300:
            _raise_hf_response_error("generation", body, provider)
    text_out = ""
    if isinstance(body, dict):
        text_out = (
            body.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        ).strip()
    if not text_out:
        text_out = _parse_generation_output(body)
    if not text_out:
        raise HTTPException(status_code=502, detail="HF text response empty")
    text_out = _strip_think_blocks(text_out).strip()
    logger.info("[HF] chat model used=%s", model)
    return {
        "model": model,
        "text": text_out,
        "method": "chat",
        "url": chat_url,
        "status": res.status_code,
        "body": body,
    }


def _truncate_items(items: List[SynthesizeItem]) -> Dict[str, Any]:
    total_before = sum(len(item.text or "") for item in items)
    max_item_before = max((len(item.text or "") for item in items), default=0)
    truncated_items: List[SynthesizeItem] = []
    total_after = 0
    for item in items[-MAX_SYNTH_ITEMS:]:
        text = item.text or ""
        if len(text) > MAX_SYNTH_ITEM_CHARS:
            text = text[:MAX_SYNTH_ITEM_CHARS]
        if total_after + len(text) > MAX_SYNTH_TOTAL_CHARS:
            break
        total_after += len(text)
        truncated_items.append(SynthesizeItem(type=item.type, id=item.id, text=text))
    max_item_after = max((len(i.text) for i in truncated_items), default=0)
    truncated = (
        len(truncated_items) != len(items)
        or total_before > total_after
        or max_item_before > max_item_after
    )
    stats = {
        "count_before": len(items),
        "count_after": len(truncated_items),
        "total_chars_before": total_before,
        "total_chars_after": total_after,
        "max_item_chars_before": max_item_before,
        "max_item_chars_after": max_item_after,
        "truncated": truncated,
    }
    return {"items": truncated_items, "stats": stats}


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
        "token_set": bool(config["token"]),
        "provider": config["provider"],
        "hf_models_base_url": config["models_base_url"],
        "hf_router_base_url": config["router_base_url"],
        "hf_models_list_url": f"{config['router_base_url']}/models",
        "hf_chat_completions_url": f"{config['router_base_url']}/chat/completions",
        "embedding_model": config["embedding_model"],
        "text_model": config["text_model"],
    }


@app.post("/debug/hf-embed", dependencies=[Depends(require_shared_secret)])
async def debug_hf_embed():
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    url = build_models_inference_url(
        config["models_base_url"],
        config["embedding_model"],
        "pipeline/feature-extraction",
    )
    res = await _post_hf(
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
        "provider": config["provider"],
        "embedding_model": config["embedding_model"],
        "url": url,
        "status": res.status_code,
        "preview": vectors[0][:5] if vectors else [],
    }


@app.post("/debug/hf-generate", dependencies=[Depends(require_shared_secret)])
async def debug_hf_generate():
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    await _ensure_text_model_supported(config)
    prompt = (
        "Return JSON only with keys themes, connections, questions; "
        "each array must contain exactly 3 short strings."
    )
    result = await hf_chat_complete(
        prompt,
        config["text_model"],
        config["token"],
        config["timeout_ms"],
        config["router_base_url"],
        provider=config["provider"],
        system="You must output ONLY valid JSON with keys themes, connections, questions.",
        temperature=0.0,
        max_tokens=200,
    )
    return {
        "provider": config["provider"],
        "text_model": result["model"],
        "method": result["method"],
        "url": result["url"],
        "status": result["status"],
        "body": result["body"],
    }


@app.post("/debug/hf-smoke", dependencies=[Depends(require_shared_secret)])
async def debug_hf_smoke():
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    embed_url = build_models_inference_url(
        config["models_base_url"],
        config["embedding_model"],
        "pipeline/feature-extraction",
    )
    embed_res = await _post_hf(
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
    prompt = (
        "Return JSON only with keys themes, connections, questions; "
        "each array must contain exactly 3 short strings."
    )
    gen_ok = True
    gen_method = "chat"
    gen_url = ""
    gen_preview = ""
    gen_status = 200
    try:
        await _ensure_text_model_supported(config)
        gen_result = await hf_chat_complete(
            prompt,
            config["text_model"],
            config["token"],
            config["timeout_ms"],
            config["router_base_url"],
            provider=config["provider"],
            system="You must output ONLY valid JSON with keys themes, connections, questions.",
            temperature=0.0,
            max_tokens=200,
        )
        gen_method = gen_result["method"]
        gen_url = gen_result["url"]
        gen_preview = gen_result["text"][:200]
        gen_status = gen_result["status"]
    except (HTTPException, UpstreamStructuredError) as exc:
        gen_ok = False
        if isinstance(exc, HTTPException):
            gen_preview = exc.detail if isinstance(exc.detail, str) else "generation failed"
        else:
            gen_preview = str(exc.payload.get("detail") or "generation failed")
        gen_status = exc.status_code
    return {
        "provider": config["provider"],
        "hf_models_base_url": config["models_base_url"],
        "hf_router_base_url": config["router_base_url"],
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
            "status": gen_status,
            "preview": gen_preview,
        },
    }


@app.post("/embed", dependencies=[Depends(require_shared_secret)])
async def embed(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts are required")
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    try:
        url = build_models_inference_url(
            config["models_base_url"],
            config["embedding_model"],
            "pipeline/feature-extraction"
        )
        res = await _post_hf(
            url,
            config["token"],
            {"inputs": req.texts},
            config["timeout_ms"],
        )
        body = _parse_json_or_text(res)
        if res.status_code < 200 or res.status_code >= 300:
            _raise_hf_response_error("embeddings", body, config["provider"])
        embeddings = _normalize_embeddings(body, expected_count=len(req.texts))
    except Exception as exc:
        if isinstance(exc, (HTTPException, UpstreamStructuredError)):
            raise
        _raise_hf_error("embeddings", exc)
    return {"vectors": embeddings, "model": config["embedding_model"]}


@app.post("/synthesize", dependencies=[Depends(require_shared_secret)])
async def synthesize(req: SynthesizeRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="items are required")
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")

    truncation = _truncate_items(req.items)
    items = truncation["items"]
    stats = truncation["stats"]
    if stats["truncated"]:
        logger.info(
            "[HF] synthesize input truncated: count %s->%s total_chars %s->%s max_item %s->%s",
            stats["count_before"],
            stats["count_after"],
            stats["total_chars_before"],
            stats["total_chars_after"],
            stats["max_item_chars_before"],
            stats["max_item_chars_after"],
        )
    else:
        logger.info(
            "[HF] synthesize input size: count=%s total_chars=%s max_item=%s",
            stats["count_after"],
            stats["total_chars_after"],
            stats["max_item_chars_after"],
        )
    if not items:
        raise HTTPException(status_code=400, detail="items are required")

    items_text = "\n".join(
        f"- ({item.type}) {item.id}: {item.text}" for item in items
    )
    guidance = req.prompt or "Summarize the themes and connections."
    system_instruction = (
        "You MUST output ONLY valid JSON that matches the schema. "
        "No <think> blocks, no markdown, no code fences, no extra keys."
    )
    prompt = (
        f"Items:\n{items_text}\n\nInstruction: {guidance}"
    )
    response_format = _build_synthesis_schema() if ENABLE_JSON_SCHEMA else None
    try:
        await _ensure_text_model_supported(config)
    except Exception as exc:
        if isinstance(exc, (HTTPException, UpstreamStructuredError)):
            raise
        _raise_hf_error("generation", exc)

    raw_outputs: List[str] = []
    attempt_prompts: List[str] = []
    for attempt in range(3):
        if attempt == 0:
            attempt_prompt = prompt
        elif attempt == 1:
            previous = raw_outputs[-1] if raw_outputs else ""
            attempt_prompt = (
                "Return JSON ONLY. Rewrite the following into a valid JSON object with exactly "
                "keys themes, connections, questions. Each key must map to an array of exactly "
                "3 strings. No markdown. No prose.\n\n"
                f"Previous invalid output:\n{previous}"
            )
        else:
            attempt_prompt = (
                "STRICT MODE. Output exactly one JSON object and nothing else. "
                "Schema: {\"themes\":[3 strings],\"connections\":[3 strings],\"questions\":[3 strings]}. "
                "No extra keys. No markdown. No explanation.\n\n"
                f"Items:\n{items_text}\n\nInstruction: {guidance}"
            )
        attempt_prompts.append(attempt_prompt)
        try:
            result = await hf_chat_complete(
                attempt_prompt,
                config["text_model"],
                config["token"],
                config["timeout_ms"],
                config["router_base_url"],
                provider=config["provider"],
                system=system_instruction,
                temperature=0.0,
                max_tokens=450,
                response_format=response_format,
            )
        except Exception as exc:
            if isinstance(exc, (HTTPException, UpstreamStructuredError)):
                raise
            _raise_hf_error("generation", exc)
        raw_text = result["text"]
        raw_outputs.append(raw_text)
        try:
            return _parse_and_validate_synthesis(raw_text).model_dump()
        except Exception:
            continue

    first_raw = raw_outputs[0] if raw_outputs else ""
    final_raw = raw_outputs[-1] if raw_outputs else ""
    sanitized = _extract_first_json_object(_clean_model_output(final_raw or first_raw))
    logger.warning(
        "[HF] synthesize invalid JSON after retries. attempts=%s first_snippet=%s final_snippet=%s",
        len(raw_outputs),
        first_raw[:200],
        final_raw[:200],
    )
    logger.warning(
        "[HF] synthesize fallback. model=%s provider=%s raw_snippet=%s",
        config["text_model"],
        config["provider"],
        sanitized[:300],
    )
    return _fallback_synthesis()
