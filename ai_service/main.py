import asyncio
import json
import logging
import os
import re
import hashlib
import hmac
import time
import math
import threading
from typing import List, Optional, Dict, Any, Set, Literal

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
MAX_SYNTH_OUTPUT_ITEM_CHARS = int(os.getenv("AI_SYNTH_MAX_OUTPUT_ITEM_CHARS", "220"))
MAX_SYNTH_ITEMS = int(os.getenv("AI_SYNTH_MAX_ITEMS", "40"))
MAX_SYNTH_ATTEMPTS = max(1, int(os.getenv("AI_SYNTH_MAX_ATTEMPTS", "1")))
MAX_SYNTH_LATENCY_MS = max(2000, int(os.getenv("AI_SYNTH_MAX_LATENCY_MS", "12000")))
MAX_SYNTH_GENERATION_TOKENS = max(120, int(os.getenv("AI_SYNTH_MAX_TOKENS", "260")))
CONCEPT_QUERY_MIN = 6
CONCEPT_QUERY_MAX = 12
CONCEPT_GROUP_MIN = 3
CONCEPT_GROUP_MAX = 8
CONCEPT_GROUP_ITEM_REFS_MAX = 12
CONCEPT_OUTLINE_MIN = 5
CONCEPT_OUTLINE_MAX = 12
CONCEPT_OUTLINE_BULLETS_MAX = 8
CONCEPT_CLAIMS_MIN = 5
CONCEPT_CLAIMS_MAX = 12
CONCEPT_CLAIM_EVIDENCE_MAX = 3
CONCEPT_OPEN_QUESTIONS_MIN = 5
CONCEPT_OPEN_QUESTIONS_MAX = 12
CONCEPT_NEXT_ACTIONS_MIN = 3
CONCEPT_NEXT_ACTIONS_MAX = 8
ENABLE_JSON_SCHEMA = os.getenv("HF_JSON_SCHEMA", "false").lower() == "true"
HF_MODELS_CACHE_TTL_SEC = int(os.getenv("HF_MODELS_CACHE_TTL_SEC", "300"))
VECTOR_STORE_PATH = os.getenv("AI_VECTOR_STORE_PATH", "/tmp/note_taker_ai_vectors.json")


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


class ConceptCandidateItem(BaseModel):
    type: Literal["article", "highlight"]
    id: str
    title: Optional[str] = None
    text: str
    source: Optional[str] = None
    score: float


class ConceptPlanRequest(BaseModel):
    concept_title: str
    concept_description: Optional[str] = None
    candidate_items: List[ConceptCandidateItem] = Field(default_factory=list)


class ConceptPlanItemRef(BaseModel):
    type: Literal["article", "highlight"]
    id: str
    why: str


class ConceptPlanGroup(BaseModel):
    title: str
    description: str
    item_refs: List[ConceptPlanItemRef] = Field(default_factory=list)


class ConceptPlanOutlineSection(BaseModel):
    heading: str
    bullets: List[str] = Field(default_factory=list)


class ConceptPlanEvidence(BaseModel):
    type: Literal["highlight"] = "highlight"
    id: str
    quote: str


class ConceptPlanClaim(BaseModel):
    claim: str
    evidence: List[ConceptPlanEvidence] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"]


class ConceptPlanResponse(BaseModel):
    queries: List[str] = Field(default_factory=list)
    groups: List[ConceptPlanGroup] = Field(default_factory=list)
    outline: List[ConceptPlanOutlineSection] = Field(default_factory=list)
    claims: List[ConceptPlanClaim] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)
    next_actions: List[str] = Field(default_factory=list)


class EmbeddingUpsertItem(BaseModel):
    id: str
    userId: str
    objectType: str
    objectId: str
    subId: Optional[str] = None
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EmbedUpsertRequest(BaseModel):
    items: List[EmbeddingUpsertItem] = Field(default_factory=list)


class EmbedDeleteRequest(BaseModel):
    ids: List[str] = Field(default_factory=list)


class EmbedGetRequest(BaseModel):
    ids: List[str] = Field(default_factory=list)


class SearchRequest(BaseModel):
    userId: str
    query: str
    types: Optional[List[str]] = None
    limit: Optional[int] = 12


class SimilarRequest(BaseModel):
    userId: str
    sourceId: str
    types: Optional[List[str]] = None
    limit: Optional[int] = 12


def _parse_model_fallbacks(value: str) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for raw in str(value or "").split(","):
        model = raw.strip()
        if not model or model in seen:
            continue
        seen.add(model)
        out.append(model)
    return out


def get_hf_config() -> Dict[str, Any]:
    text_model = os.environ.get(
        "HF_TEXT_MODEL",
        "Qwen/Qwen2.5-Coder-7B-Instruct"
    ).strip()
    fallback_default = (
        "Qwen/Qwen2.5-Coder-7B-Instruct,"
        "mistralai/Mistral-7B-Instruct-v0.3"
    )
    fallbacks = _parse_model_fallbacks(
        os.environ.get("HF_TEXT_MODEL_FALLBACKS", fallback_default)
    )
    return {
        "token": os.environ.get("HF_TOKEN", ""),
        "provider": os.environ.get("HF_PROVIDER", "hf-inference"),
        "embedding_model": os.environ.get(
            "HF_EMBEDDING_MODEL",
            "sentence-transformers/all-MiniLM-L6-v2"
        ),
        "text_model": text_model,
        "text_model_fallbacks": [m for m in fallbacks if m != text_model],
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


def _looks_like_html(value: str) -> bool:
    text = str(value or "").lower()
    return "<html" in text or "<!doctype html" in text or "</html>" in text


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
    body_text = _stringify_error_body(body)
    body_lc = body_text.lower()
    if _looks_like_html(body_text) and (
        "just a moment" in body_lc
        or "rate limit" in body_lc
        or "too many requests" in body_lc
        or "cloudflare" in body_lc
    ):
        raise UpstreamStructuredError(
            status_code=429,
            payload={
                "detail": "HF provider temporarily rate-limited",
                "action": "retry_later",
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
    entries: List[Any]
    if isinstance(models_body, list):
        entries = models_body
    elif isinstance(models_body, dict) and isinstance(models_body.get("data"), list):
        # HF router can return OpenAI-style list payloads: {"object":"list","data":[...]}.
        entries = models_body.get("data") or []
    else:
        return {"found": False, "supported": False}
    provider_name = _normalize_provider_name(provider)
    for entry in entries:
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


def _build_candidate_models(config: Dict[str, Any]) -> List[str]:
    primary = str(config.get("text_model") or "").strip()
    fallbacks = config.get("text_model_fallbacks") or []
    out: List[str] = []
    seen: Set[str] = set()
    for model in [primary, *fallbacks]:
        clean = str(model or "").strip()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        out.append(clean)
    return out


async def _ensure_text_model_supported(config: Dict[str, Any]) -> str:
    requested_model = str(config.get("text_model") or "").strip()
    provider = str(config.get("provider") or "hf-inference").strip()
    router_base_url = str(config.get("router_base_url") or "").rstrip("/")
    token = str(config.get("token") or "")
    timeout_ms = int(config.get("timeout_ms") or 30000)
    candidates = _build_candidate_models(config)

    if not requested_model:
        raise HTTPException(status_code=500, detail="HF_TEXT_MODEL not configured")
    if not router_base_url:
        raise HTTPException(status_code=500, detail="HF_ROUTER_BASE_URL not configured")
    if not candidates:
        raise HTTPException(status_code=500, detail="No HF text models configured")

    now = time.time()
    unresolved: List[str] = []
    attempted_models: List[str] = []
    for model in candidates:
        cache_key = f"{router_base_url}|{provider}|{model}"
        cached = _HF_MODELS_CACHE.get(cache_key)
        if not cached or (now - float(cached.get("ts", 0))) >= HF_MODELS_CACHE_TTL_SEC:
            unresolved.append(model)
            continue
        attempted_models.append(model)
        if cached.get("ok"):
            return model

    if unresolved:
        models_url = f"{router_base_url}/models"
        res = await _get_hf(models_url, token, timeout_ms)
        body = _parse_json_or_text(res)
        if res.status_code < 200 or res.status_code >= 300:
            _raise_hf_response_error("models list", body, provider)
        for model in unresolved:
            support = _model_provider_support(body, model, provider)
            ok = bool(support["found"] and support["supported"])
            _HF_MODELS_CACHE[f"{router_base_url}|{provider}|{model}"] = {"ts": now, "ok": ok}
            attempted_models.append(model)
            if ok:
                if model != requested_model:
                    logger.warning(
                        "[HF] primary text model unsupported; using fallback model=%s requested=%s provider=%s",
                        model,
                        requested_model,
                        provider,
                    )
                return model

    raise UpstreamStructuredError(
        status_code=400,
        payload={
            "detail": "HF model not supported by enabled provider",
            "model": requested_model,
            "provider": provider,
            "requested_model": requested_model,
            "attempted_models": attempted_models or candidates,
        },
    )


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


def _normalize_synthesis_string(value: Any) -> str:
    text = str(value or "").strip()
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"^\s*(?:[-*•]|\d+\.)\s*", "", text)
    if len(text) > MAX_SYNTH_OUTPUT_ITEM_CHARS:
        text = text[:MAX_SYNTH_OUTPUT_ITEM_CHARS].rstrip()
    return text


def _normalize_synthesis_payload(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    normalized: Dict[str, Any] = {}
    for key in ("themes", "connections", "questions"):
        value = data.get(key)
        if not isinstance(value, list):
            normalized[key] = value
            continue
        cleaned = [_normalize_synthesis_string(item) for item in value]
        cleaned = [item for item in cleaned if item]
        normalized[key] = cleaned[:3]
    for key, value in data.items():
        if key not in normalized:
            normalized[key] = value
    return normalized


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
    data = _normalize_synthesis_payload(data)
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


def _normalize_concept_plan_string(value: Any, max_chars: int = 260) -> str:
    text = str(value or "").strip()
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"^\s*(?:[-*•]|\d+\.)\s*", "", text)
    if len(text) > max_chars:
        text = text[:max_chars].rstrip()
    return text


def _dedupe_strings(values: List[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for value in values:
        clean = _normalize_concept_plan_string(value)
        if not clean or clean in seen:
            continue
        seen.add(clean)
        out.append(clean)
    return out


def _pad_strings(values: List[str], minimum: int, maximum: int, fallbacks: List[str]) -> List[str]:
    out = _dedupe_strings(values)[:maximum]
    for fallback in fallbacks:
        if len(out) >= minimum:
            break
        clean = _normalize_concept_plan_string(fallback)
        if clean and clean not in out:
            out.append(clean)
    while len(out) < minimum:
        out.append(f"Placeholder {len(out) + 1}")
    return out[:maximum]


def _collect_candidate_maps(req: ConceptPlanRequest) -> Dict[str, Any]:
    candidates_by_id: Dict[str, ConceptCandidateItem] = {}
    ordered_ids: List[str] = []
    highlight_ids: List[str] = []
    highlight_text_by_id: Dict[str, str] = {}
    for item in req.candidate_items:
        candidate_id = str(item.id or "").strip()
        if not candidate_id or candidate_id in candidates_by_id:
            continue
        candidates_by_id[candidate_id] = item
        ordered_ids.append(candidate_id)
        if item.type == "highlight":
            highlight_ids.append(candidate_id)
            highlight_text_by_id[candidate_id] = _normalize_concept_plan_string(
                item.text,
                max_chars=220,
            )
    return {
        "candidates_by_id": candidates_by_id,
        "ordered_ids": ordered_ids,
        "highlight_ids": highlight_ids,
        "highlight_text_by_id": highlight_text_by_id,
    }


def _build_default_item_refs(
    req: ConceptPlanRequest,
    ordered_ids: List[str],
    candidates_by_id: Dict[str, ConceptCandidateItem],
    offset: int,
) -> List[Dict[str, str]]:
    if not ordered_ids:
        return []
    refs: List[Dict[str, str]] = []
    take = min(len(ordered_ids), 3)
    for idx in range(take):
        selected_id = ordered_ids[(offset + idx) % len(ordered_ids)]
        candidate = candidates_by_id[selected_id]
        refs.append(
            {
                "type": candidate.type,
                "id": selected_id,
                "why": _normalize_concept_plan_string(
                    f"Useful context for {req.concept_title} because it covers a distinct angle.",
                    max_chars=200,
                ) or "Useful context for this theme.",
            }
        )
    return refs[:CONCEPT_GROUP_ITEM_REFS_MAX]


def _build_concept_plan_prompt(req: ConceptPlanRequest) -> str:
    title = _normalize_concept_plan_string(req.concept_title, max_chars=140) or "Concept"
    description = _normalize_concept_plan_string(req.concept_description, max_chars=400)
    candidate_lines: List[str] = []
    for item in req.candidate_items:
        title_text = _normalize_concept_plan_string(item.title, max_chars=120) or "(untitled)"
        text = _normalize_concept_plan_string(item.text, max_chars=500)
        source = _normalize_concept_plan_string(item.source, max_chars=140) or "(none)"
        candidate_lines.append(
            "- " + json.dumps(
                {
                    "type": item.type,
                    "id": item.id,
                    "title": title_text,
                    "source": source,
                    "score": round(float(item.score), 4),
                    "text": text,
                },
                ensure_ascii=False,
            )
        )
    candidate_block = "\n".join(candidate_lines) if candidate_lines else "- (no candidates)"
    highlight_ids = [item.id for item in req.candidate_items if item.type == "highlight"]
    return (
        "Return ONLY a valid JSON object. No markdown, no prose, no code fences.\n"
        "Top-level keys must be exactly: queries, groups, outline, claims, open_questions, next_actions.\n"
        "Hard constraints:\n"
        "- queries: min 6 max 12 strings.\n"
        "- groups: min 3 max 8 objects; each object has title, description, item_refs.\n"
        "- groups.item_refs: each item_ref has type,id,why and max 12 refs per group.\n"
        "- outline: min 5 max 12 sections; each section has heading and bullets; max 8 bullets per section.\n"
        "- claims: min 5 max 12; each claim has claim,evidence,confidence.\n"
        "- claims.evidence: max 3 entries per claim; each entry must be {\"type\":\"highlight\",\"id\":\"<highlight-id>\",\"quote\":\"...\"}.\n"
        "- claims evidence ids must be from provided highlight IDs only.\n"
        "- open_questions: min 5 max 12 strings.\n"
        "- next_actions: min 3 max 8 strings.\n"
        "- confidence must be one of low, medium, high.\n\n"
        f"Concept title: {title}\n"
        f"Concept description: {description or '(none)'}\n"
        f"Valid highlight IDs for claims.evidence: {json.dumps(highlight_ids)}\n"
        "Candidate items:\n"
        f"{candidate_block}\n"
    )


def _parse_concept_plan_json(raw_text: str) -> Dict[str, Any]:
    cleaned = _clean_model_output(raw_text)
    cleaned = _extract_first_json_object(cleaned)
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("Concept plan output must be a JSON object.")
    return parsed


def _fallback_concept_plan(req: ConceptPlanRequest) -> Dict[str, Any]:
    meta = _collect_candidate_maps(req)
    candidates_by_id = meta["candidates_by_id"]
    ordered_ids = meta["ordered_ids"]
    highlight_ids = meta["highlight_ids"]
    highlight_text_by_id = meta["highlight_text_by_id"]
    concept = _normalize_concept_plan_string(req.concept_title, max_chars=120) or "Concept"

    groups = [
        {
            "title": f"{concept} foundations",
            "description": f"Establishes the core context and framing for {concept}.",
            "item_refs": _build_default_item_refs(req, ordered_ids, candidates_by_id, offset=0),
        },
        {
            "title": f"{concept} evidence threads",
            "description": f"Collects evidence that supports or challenges the main assumptions for {concept}.",
            "item_refs": _build_default_item_refs(req, ordered_ids, candidates_by_id, offset=2),
        },
        {
            "title": f"{concept} practical implications",
            "description": f"Translates {concept} into implementation and decision impacts.",
            "item_refs": _build_default_item_refs(req, ordered_ids, candidates_by_id, offset=4),
        },
    ]

    claims: List[Dict[str, Any]] = []
    for idx in range(CONCEPT_CLAIMS_MIN):
        evidence: List[Dict[str, str]] = []
        if highlight_ids:
            highlight_id = highlight_ids[idx % len(highlight_ids)]
            quote = (
                highlight_text_by_id.get(highlight_id)
                or "Relevant highlight evidence."
            )
            evidence.append(
                {
                    "type": "highlight",
                    "id": highlight_id,
                    "quote": quote,
                }
            )
        claims.append(
            {
                "claim": f"{concept} claim {idx + 1}: an important relationship should be validated.",
                "evidence": evidence,
                "confidence": "medium" if idx < 3 else "low",
            }
        )

    return {
        "queries": [
            f"{concept} definition and scope",
            f"{concept} primary mechanisms",
            f"{concept} supporting evidence",
            f"{concept} counterarguments",
            f"{concept} implementation examples",
            f"{concept} risks and limitations",
        ],
        "groups": groups,
        "outline": [
            {
                "heading": "Context and framing",
                "bullets": [f"Define the core problem addressed by {concept}."],
            },
            {
                "heading": "Evidence landscape",
                "bullets": ["Summarize strongest supporting and opposing evidence."],
            },
            {
                "heading": "Key themes",
                "bullets": ["Describe recurring patterns across articles and highlights."],
            },
            {
                "heading": "Claims and confidence",
                "bullets": ["Map major claims to available supporting highlights."],
            },
            {
                "heading": "Action plan",
                "bullets": ["List concrete next steps to deepen and validate understanding."],
            },
        ],
        "claims": claims,
        "open_questions": [
            f"What assumptions about {concept} remain unverified?",
            f"Which evidence is strongest for {concept}, and what is missing?",
            "Where do source materials disagree most significantly?",
            "What external context is needed to interpret current evidence?",
            "Which hypothesis should be tested first to reduce uncertainty?",
        ],
        "next_actions": [
            "Run semantic searches using the query set and collect additional candidates.",
            "Prioritize high-signal highlights and map each one to a claim.",
            "Draft a first-pass narrative using the outline and resolve open questions.",
        ],
    }


def _sanitize_concept_plan_payload(data: Any, req: ConceptPlanRequest) -> Dict[str, Any]:
    payload = data if isinstance(data, dict) else {}
    meta = _collect_candidate_maps(req)
    candidates_by_id = meta["candidates_by_id"]
    candidate_ids = set(meta["ordered_ids"])
    ordered_candidate_ids = meta["ordered_ids"]
    highlight_ids = set(meta["highlight_ids"])
    highlight_ids_ordered = meta["highlight_ids"]
    highlight_text_by_id = meta["highlight_text_by_id"]
    concept = _normalize_concept_plan_string(req.concept_title, max_chars=120) or "Concept"

    raw_queries = payload.get("queries") if isinstance(payload.get("queries"), list) else []
    query_candidates = [
        _normalize_concept_plan_string(item, max_chars=180)
        for item in raw_queries
    ]
    query_fallbacks = [
        f"{concept} definition and scope",
        f"{concept} primary mechanisms",
        f"{concept} supporting evidence",
        f"{concept} counterarguments",
        f"{concept} implementation examples",
        f"{concept} risks and limitations",
        f"{concept} historical context",
        f"{concept} case studies",
        f"{concept} measurable outcomes",
        f"{concept} decision framework",
    ]
    queries = _pad_strings(
        query_candidates,
        CONCEPT_QUERY_MIN,
        CONCEPT_QUERY_MAX,
        query_fallbacks,
    )

    groups: List[Dict[str, Any]] = []
    raw_groups = payload.get("groups") if isinstance(payload.get("groups"), list) else []
    for index, group in enumerate(raw_groups[:CONCEPT_GROUP_MAX]):
        if not isinstance(group, dict):
            continue
        title = _normalize_concept_plan_string(group.get("title"), max_chars=120)
        if not title:
            title = f"{concept} theme {index + 1}"
        description = _normalize_concept_plan_string(group.get("description"), max_chars=260)
        if not description:
            description = f"This theme captures a relevant angle of {concept}."

        refs: List[Dict[str, str]] = []
        seen_refs: Set[str] = set()
        raw_refs = group.get("item_refs") if isinstance(group.get("item_refs"), list) else []
        for ref in raw_refs:
            if not isinstance(ref, dict):
                continue
            ref_type = str(ref.get("type") or "").strip().lower()
            ref_id = str(ref.get("id") or "").strip()
            why = _normalize_concept_plan_string(ref.get("why"), max_chars=220)
            if ref_id not in candidate_ids:
                continue
            candidate = candidates_by_id.get(ref_id)
            if not candidate:
                continue
            candidate_type = str(candidate.type).lower()
            if ref_type not in {"article", "highlight"}:
                ref_type = candidate_type
            if candidate_type != ref_type:
                ref_type = candidate_type
            if not why:
                why = "Relevant supporting context for this theme."
            ref_key = f"{ref_type}:{ref_id}"
            if ref_key in seen_refs:
                continue
            seen_refs.add(ref_key)
            refs.append({"type": ref_type, "id": ref_id, "why": why})
            if len(refs) >= CONCEPT_GROUP_ITEM_REFS_MAX:
                break
        groups.append(
            {
                "title": title,
                "description": description,
                "item_refs": refs,
            }
        )

    group_fallback_titles = [
        f"{concept} foundations",
        f"{concept} evidence threads",
        f"{concept} practical implications",
        f"{concept} strategic choices",
        f"{concept} unresolved tensions",
    ]
    while len(groups) < CONCEPT_GROUP_MIN:
        idx = len(groups)
        groups.append(
            {
                "title": group_fallback_titles[idx % len(group_fallback_titles)],
                "description": _normalize_concept_plan_string(
                    f"This theme organizes a core viewpoint for {concept}.",
                    max_chars=260,
                ) or "This theme organizes a core viewpoint.",
                "item_refs": _build_default_item_refs(
                    req,
                    ordered_candidate_ids,
                    candidates_by_id,
                    offset=idx * 2,
                ),
            }
        )
    groups = groups[:CONCEPT_GROUP_MAX]

    outline: List[Dict[str, Any]] = []
    raw_outline = payload.get("outline") if isinstance(payload.get("outline"), list) else []
    for idx, section in enumerate(raw_outline[:CONCEPT_OUTLINE_MAX]):
        if not isinstance(section, dict):
            continue
        heading = _normalize_concept_plan_string(section.get("heading"), max_chars=120)
        if not heading:
            heading = f"{concept} section {idx + 1}"
        raw_bullets = section.get("bullets") if isinstance(section.get("bullets"), list) else []
        bullets = _dedupe_strings(
            [
                _normalize_concept_plan_string(item, max_chars=180)
                for item in raw_bullets
            ]
        )[:CONCEPT_OUTLINE_BULLETS_MAX]
        if not bullets:
            bullets = [f"Connect this section back to {concept}."]
        outline.append({"heading": heading, "bullets": bullets})

    outline_fallbacks = [
        ("Context and framing", [f"Define why {concept} matters in this context."]),
        ("Evidence landscape", ["Summarize strongest support and strongest objections."]),
        ("Theme synthesis", ["Identify recurring patterns across candidate items."]),
        ("Claim mapping", ["Attach claims to specific highlight evidence where possible."]),
        ("Next steps", ["Translate open questions into concrete actions."]),
        ("Risks and caveats", ["Document uncertainty and contradictory evidence."]),
    ]
    while len(outline) < CONCEPT_OUTLINE_MIN:
        heading, bullets = outline_fallbacks[len(outline) % len(outline_fallbacks)]
        outline.append({"heading": heading, "bullets": bullets[:CONCEPT_OUTLINE_BULLETS_MAX]})
    outline = outline[:CONCEPT_OUTLINE_MAX]

    claims: List[Dict[str, Any]] = []
    raw_claims = payload.get("claims") if isinstance(payload.get("claims"), list) else []
    for idx, claim_obj in enumerate(raw_claims[:CONCEPT_CLAIMS_MAX]):
        if not isinstance(claim_obj, dict):
            continue
        claim_text = _normalize_concept_plan_string(claim_obj.get("claim"), max_chars=240)
        if not claim_text:
            claim_text = f"{concept} claim {idx + 1} needs validation."
        confidence = str(claim_obj.get("confidence") or "").strip().lower()
        if confidence not in {"low", "medium", "high"}:
            confidence = "medium"

        evidence: List[Dict[str, str]] = []
        raw_evidence = claim_obj.get("evidence") if isinstance(claim_obj.get("evidence"), list) else []
        seen_evidence: Set[str] = set()
        for evidence_obj in raw_evidence:
            if not isinstance(evidence_obj, dict):
                continue
            ev_type = str(evidence_obj.get("type") or "").strip().lower()
            ev_id = str(evidence_obj.get("id") or "").strip()
            quote = _normalize_concept_plan_string(evidence_obj.get("quote"), max_chars=240)
            if ev_type != "highlight":
                continue
            if ev_id not in highlight_ids:
                continue
            if ev_id in seen_evidence:
                continue
            seen_evidence.add(ev_id)
            if not quote:
                quote = highlight_text_by_id.get(ev_id) or "Relevant highlight evidence."
            evidence.append({"type": "highlight", "id": ev_id, "quote": quote})
            if len(evidence) >= CONCEPT_CLAIM_EVIDENCE_MAX:
                break
        claims.append(
            {
                "claim": claim_text,
                "evidence": evidence,
                "confidence": confidence,
            }
        )

    while len(claims) < CONCEPT_CLAIMS_MIN:
        idx = len(claims)
        evidence: List[Dict[str, str]] = []
        if highlight_ids_ordered:
            highlight_id = highlight_ids_ordered[idx % len(highlight_ids_ordered)]
            evidence.append(
                {
                    "type": "highlight",
                    "id": highlight_id,
                    "quote": (
                        highlight_text_by_id.get(highlight_id)
                        or "Relevant highlight evidence."
                    ),
                }
            )
        claims.append(
            {
                "claim": f"{concept} claim {idx + 1}: a key relationship requires deeper evidence.",
                "evidence": evidence,
                "confidence": "medium" if idx < 3 else "low",
            }
        )
    claims = claims[:CONCEPT_CLAIMS_MAX]

    raw_open_questions = payload.get("open_questions") if isinstance(payload.get("open_questions"), list) else []
    open_questions = _pad_strings(
        [
            _normalize_concept_plan_string(item, max_chars=220)
            for item in raw_open_questions
        ],
        CONCEPT_OPEN_QUESTIONS_MIN,
        CONCEPT_OPEN_QUESTIONS_MAX,
        [
            f"What assumptions about {concept} remain unverified?",
            "Where does current evidence conflict?",
            "Which missing source would most reduce uncertainty?",
            "What edge case could invalidate the current direction?",
            "What should be tested first?",
            "What tradeoff is not yet quantified?",
            "Which stakeholder perspective is missing?",
        ],
    )

    raw_next_actions = payload.get("next_actions") if isinstance(payload.get("next_actions"), list) else []
    next_actions = _pad_strings(
        [
            _normalize_concept_plan_string(item, max_chars=220)
            for item in raw_next_actions
        ],
        CONCEPT_NEXT_ACTIONS_MIN,
        CONCEPT_NEXT_ACTIONS_MAX,
        [
            "Run the proposed semantic queries and collect additional candidates.",
            "Map candidate highlights to top claims and identify weakly supported claims.",
            "Draft a first-pass synthesis using the outline and resolve open questions.",
            "Prioritize contradictions and gather targeted follow-up evidence.",
        ],
    )

    return {
        "queries": queries,
        "groups": groups,
        "outline": outline,
        "claims": claims,
        "open_questions": open_questions,
        "next_actions": next_actions,
    }


_VECTOR_STORE_LOCK = threading.RLock()
_VECTOR_STORE: Dict[str, Dict[str, Any]] = {}
_VECTOR_STORE_LOADED = False


def _safe_float_vector(values: Any) -> Optional[List[float]]:
    if not isinstance(values, list) or not values:
        return None
    out: List[float] = []
    for value in values:
        if not isinstance(value, (int, float)):
            return None
        out.append(float(value))
    return out


def _load_vector_store_if_needed() -> None:
    global _VECTOR_STORE_LOADED, _VECTOR_STORE
    if _VECTOR_STORE_LOADED:
        return
    with _VECTOR_STORE_LOCK:
        if _VECTOR_STORE_LOADED:
            return
        try:
            if os.path.exists(VECTOR_STORE_PATH):
                with open(VECTOR_STORE_PATH, "r", encoding="utf-8") as fh:
                    raw = json.load(fh)
                if isinstance(raw, dict):
                    loaded: Dict[str, Dict[str, Any]] = {}
                    for key, value in raw.items():
                        if not isinstance(key, str) or not isinstance(value, dict):
                            continue
                        vec = _safe_float_vector(value.get("embedding"))
                        if not vec:
                            continue
                        loaded[key] = {
                            "id": str(value.get("id") or key),
                            "userId": str(value.get("userId") or ""),
                            "objectType": str(value.get("objectType") or ""),
                            "objectId": str(value.get("objectId") or ""),
                            "subId": str(value.get("subId") or ""),
                            "text": str(value.get("text") or ""),
                            "metadata": value.get("metadata") if isinstance(value.get("metadata"), dict) else {},
                            "embedding": vec,
                            "updatedAtMs": int(value.get("updatedAtMs") or int(time.time() * 1000)),
                        }
                    _VECTOR_STORE = loaded
        except Exception as exc:
            logger.warning("[AI] failed to load vector store from %s: %s", VECTOR_STORE_PATH, exc)
            _VECTOR_STORE = {}
        finally:
            _VECTOR_STORE_LOADED = True


def _persist_vector_store() -> None:
    _load_vector_store_if_needed()
    directory = os.path.dirname(VECTOR_STORE_PATH) or "."
    os.makedirs(directory, exist_ok=True)
    tmp_path = f"{VECTOR_STORE_PATH}.tmp"
    with _VECTOR_STORE_LOCK:
        serializable = {
            key: {
                **value,
                "embedding": list(value.get("embedding") or []),
            }
            for key, value in _VECTOR_STORE.items()
        }
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(serializable, fh)
    os.replace(tmp_path, VECTOR_STORE_PATH)


def _normalize_types(types: Optional[List[str]]) -> Optional[Set[str]]:
    if not types:
        return None
    normalized = {
        str(t or "").strip().lower()
        for t in types
        if str(t or "").strip()
    }
    return normalized or None


def _clamp_limit(value: Optional[int], default: int = 12, max_limit: int = 50) -> int:
    try:
        parsed = int(value if value is not None else default)
    except Exception:
        parsed = default
    if parsed < 1:
        return 1
    return min(parsed, max_limit)


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for i in range(len(a)):
        av = float(a[i])
        bv = float(b[i])
        dot += av * bv
        norm_a += av * av
        norm_b += bv * bv
    if norm_a <= 0 or norm_b <= 0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def _vector_result(record: Dict[str, Any], score: Optional[float] = None) -> Dict[str, Any]:
    out = {
        "id": record.get("id", ""),
        "objectType": record.get("objectType", ""),
        "objectId": record.get("objectId", ""),
        "subId": record.get("subId", ""),
        "metadata": record.get("metadata", {}) if isinstance(record.get("metadata"), dict) else {},
        "document": record.get("text", ""),
    }
    if score is not None:
        out["score"] = score
    return out


async def _hf_embed_texts(texts: List[str], config: Optional[Dict[str, Any]] = None) -> List[List[float]]:
    if not texts:
        return []
    cfg = config or get_hf_config()
    if not cfg["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    try:
        url = build_models_inference_url(
            cfg["models_base_url"],
            cfg["embedding_model"],
            "pipeline/feature-extraction"
        )
        res = await _post_hf(
            url,
            cfg["token"],
            {"inputs": texts},
            cfg["timeout_ms"],
        )
        body = _parse_json_or_text(res)
        if res.status_code < 200 or res.status_code >= 300:
            _raise_hf_response_error("embeddings", body, cfg["provider"])
        return _normalize_embeddings(body, expected_count=len(texts))
    except Exception as exc:
        if isinstance(exc, (HTTPException, UpstreamStructuredError)):
            raise
        _raise_hf_error("embeddings", exc)


def _upsert_vector_records(items: List[EmbeddingUpsertItem], embeddings: List[List[float]]) -> int:
    if len(items) != len(embeddings):
        raise HTTPException(status_code=500, detail="embedding count mismatch")
    _load_vector_store_if_needed()
    now_ms = int(time.time() * 1000)
    with _VECTOR_STORE_LOCK:
        for item, embedding in zip(items, embeddings):
            clean_id = str(item.id or "").strip()
            clean_user = str(item.userId or "").strip()
            clean_type = str(item.objectType or "").strip()
            clean_object_id = str(item.objectId or "").strip()
            clean_text = str(item.text or "").strip()
            if not clean_id or not clean_user or not clean_type or not clean_object_id or not clean_text:
                raise HTTPException(status_code=400, detail="embedding item missing required fields")
            _VECTOR_STORE[clean_id] = {
                "id": clean_id,
                "userId": clean_user,
                "objectType": clean_type,
                "objectId": clean_object_id,
                "subId": str(item.subId or ""),
                "text": clean_text,
                "metadata": item.metadata if isinstance(item.metadata, dict) else {},
                "embedding": [float(v) for v in embedding],
                "updatedAtMs": now_ms,
            }
    _persist_vector_store()
    return len(items)


def _get_vector_records(ids: List[str]) -> List[Dict[str, Any]]:
    _load_vector_store_if_needed()
    with _VECTOR_STORE_LOCK:
        return [
            {
                "id": rec["id"],
                "userId": rec.get("userId", ""),
                "embedding": list(rec.get("embedding") or []),
                "objectType": rec.get("objectType", ""),
                "objectId": rec.get("objectId", ""),
                "subId": rec.get("subId", ""),
                "metadata": rec.get("metadata", {}),
                "document": rec.get("text", ""),
            }
            for key in ids
            if isinstance(key, str) and key in _VECTOR_STORE
            for rec in [_VECTOR_STORE[key]]
        ]


def _delete_vector_records(ids: List[str]) -> int:
    _load_vector_store_if_needed()
    deleted = 0
    with _VECTOR_STORE_LOCK:
        for raw_id in ids:
            key = str(raw_id or "").strip()
            if key and key in _VECTOR_STORE:
                del _VECTOR_STORE[key]
                deleted += 1
    if deleted:
        _persist_vector_store()
    return deleted


def _search_vectors(
    query_vector: List[float],
    *,
    user_id: str,
    types: Optional[List[str]],
    limit: int,
    exclude_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    _load_vector_store_if_needed()
    types_filter = _normalize_types(types)
    safe_user_id = str(user_id or "").strip()
    safe_exclude = str(exclude_id or "").strip()
    scored: List[Dict[str, Any]] = []
    with _VECTOR_STORE_LOCK:
        values = list(_VECTOR_STORE.values())
    for record in values:
        if safe_user_id and str(record.get("userId") or "") != safe_user_id:
            continue
        if safe_exclude and str(record.get("id") or "") == safe_exclude:
            continue
        rec_type = str(record.get("objectType") or "").lower()
        if types_filter and rec_type not in types_filter:
            continue
        embedding = record.get("embedding")
        if not isinstance(embedding, list):
            continue
        score = _cosine_similarity(query_vector, embedding)
        if score <= 0:
            continue
        scored.append(_vector_result(record, score=score))
    scored.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    return scored[:limit]


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
    if provider:
        chat_payload["provider"] = provider
    if response_format:
        chat_payload["response_format"] = response_format
    retry_delays_sec = [0.0, 0.6, 1.4]
    transient_statuses = {429, 502, 503, 504}
    res = None
    body: Any = None
    for attempt, delay in enumerate(retry_delays_sec):
        if delay > 0:
            await asyncio.sleep(delay)
        res = await _post_hf(chat_url, token, chat_payload, timeout_ms)
        body = _parse_json_or_text(res)
        if res.status_code not in transient_statuses:
            break
        if attempt < len(retry_delays_sec) - 1:
            logger.warning(
                "[HF] transient generation status=%s attempt=%s/%s; retrying",
                res.status_code,
                attempt + 1,
                len(retry_delays_sec),
            )
    assert res is not None
    if res.status_code < 200 or res.status_code >= 300:
        if response_format and res.status_code in (400, 422):
            logger.warning("[HF] response_format unsupported; retrying without schema")
            chat_payload.pop("response_format", None)
            res = await _post_hf(chat_url, token, chat_payload, timeout_ms)
            body = _parse_json_or_text(res)
        if res.status_code in (400, 422) and provider:
            body_text = _stringify_error_body(body).lower()
            if "unknown field" in body_text and "provider" in body_text:
                logger.warning("[HF] provider field unsupported by upstream; retrying without provider")
                chat_payload.pop("provider", None)
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
        "text_model_fallbacks": config["text_model_fallbacks"],
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
    selected_model = await _ensure_text_model_supported(config)
    prompt = (
        "Return JSON only with keys themes, connections, questions; "
        "each array must contain exactly 3 short strings."
    )
    result = await hf_chat_complete(
        prompt,
        selected_model,
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
        "text_model_requested": config["text_model"],
        "text_model_selected": result["model"],
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
    gen_model = config["text_model"]
    try:
        selected_model = await _ensure_text_model_supported(config)
        gen_model = selected_model
        gen_result = await hf_chat_complete(
            prompt,
            selected_model,
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
        "text_model_requested": config["text_model"],
        "text_model_selected": gen_model,
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
    embeddings = await _hf_embed_texts(req.texts, config=config)
    return {"vectors": embeddings, "model": config["embedding_model"]}


@app.post("/embed/upsert", dependencies=[Depends(require_shared_secret)])
async def embed_upsert(req: EmbedUpsertRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="items are required")
    texts = [str(item.text or "").strip() for item in req.items]
    if not all(texts):
        raise HTTPException(status_code=400, detail="embedding item text is empty")
    config = get_hf_config()
    embeddings = await _hf_embed_texts(texts, config=config)
    upserted = _upsert_vector_records(req.items, embeddings)
    vector_dim = len(embeddings[0]) if embeddings else 0
    return {
        "upserted": upserted,
        "vector_dim": vector_dim,
        "model": config["embedding_model"],
    }


@app.post("/embed/get", dependencies=[Depends(require_shared_secret)])
async def embed_get(req: EmbedGetRequest):
    if not req.ids:
        return {"results": []}
    return {"results": _get_vector_records(req.ids)}


@app.post("/embed/delete", dependencies=[Depends(require_shared_secret)])
async def embed_delete(req: EmbedDeleteRequest):
    if not req.ids:
        return {"deleted": 0}
    deleted = _delete_vector_records(req.ids)
    return {"deleted": deleted}


@app.post("/search", dependencies=[Depends(require_shared_secret)])
async def search(req: SearchRequest):
    query = str(req.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    safe_limit = _clamp_limit(req.limit, default=12, max_limit=50)
    query_vector = (await _hf_embed_texts([query], config=get_hf_config()))[0]
    results = _search_vectors(
        query_vector,
        user_id=req.userId,
        types=req.types,
        limit=safe_limit,
    )
    return {"results": results}


@app.post("/similar", dependencies=[Depends(require_shared_secret)])
async def similar(req: SimilarRequest):
    source_id = str(req.sourceId or "").strip()
    user_id = str(req.userId or "").strip()
    if not source_id or not user_id:
        raise HTTPException(status_code=400, detail="userId and sourceId are required")
    source_records = _get_vector_records([source_id])
    if not source_records:
        return {"results": [], "source_found": False}
    source = source_records[0]
    if str(source.get("userId") or "") and str(source.get("userId")) != user_id:
        return {"results": [], "source_found": False}
    query_vector = _safe_float_vector(source.get("embedding")) or []
    if not query_vector:
        return {"results": [], "source_found": False}
    safe_limit = _clamp_limit(req.limit, default=12, max_limit=50)
    results = _search_vectors(
        query_vector,
        user_id=user_id,
        types=req.types,
        limit=safe_limit,
        exclude_id=source_id,
    )
    return {"results": results, "source_found": True}


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
        selected_model = await _ensure_text_model_supported(config)
    except Exception as exc:
        if isinstance(exc, (HTTPException, UpstreamStructuredError)):
            raise
        _raise_hf_error("generation", exc)

    raw_outputs: List[str] = []
    started_at = time.monotonic()
    max_attempts = max(1, min(MAX_SYNTH_ATTEMPTS, 3))
    for attempt in range(max_attempts):
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        if elapsed_ms >= MAX_SYNTH_LATENCY_MS:
            logger.warning(
                "[HF] synthesize latency budget exceeded before attempt=%s elapsed_ms=%s budget_ms=%s",
                attempt + 1,
                elapsed_ms,
                MAX_SYNTH_LATENCY_MS,
            )
            break
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
        try:
            result = await hf_chat_complete(
                attempt_prompt,
                selected_model,
                config["token"],
                min(int(config["timeout_ms"]), MAX_SYNTH_LATENCY_MS),
                config["router_base_url"],
                provider=config["provider"],
                system=system_instruction,
                temperature=0.0,
                max_tokens=MAX_SYNTH_GENERATION_TOKENS,
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
        "[HF] synthesize invalid JSON after retries. attempts=%s elapsed_ms=%s first_snippet=%s final_snippet=%s",
        len(raw_outputs),
        int((time.monotonic() - started_at) * 1000),
        first_raw[:200],
        final_raw[:200],
    )
    logger.warning(
        "[HF] synthesize fallback. model=%s provider=%s raw_snippet=%s",
        selected_model,
        config["provider"],
        sanitized[:300],
    )
    return _fallback_synthesis()


@app.post("/plan/concept", dependencies=[Depends(require_shared_secret)])
async def plan_concept(req: ConceptPlanRequest):
    if not req.candidate_items:
        raise HTTPException(status_code=400, detail="candidate_items are required")
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")

    try:
        selected_model = await _ensure_text_model_supported(config)
    except Exception as exc:
        if isinstance(exc, (HTTPException, UpstreamStructuredError)):
            raise
        _raise_hf_error("generation", exc)

    system_instruction = (
        "You MUST output ONLY valid JSON with no markdown, no code fences, "
        "no explanation, and no extra top-level keys."
    )
    first_prompt = _build_concept_plan_prompt(req)
    max_tokens = max(MAX_SYNTH_GENERATION_TOKENS, 650)
    first_raw = ""
    second_raw = ""
    try:
        first_result = await hf_chat_complete(
            first_prompt,
            selected_model,
            config["token"],
            config["timeout_ms"],
            config["router_base_url"],
            provider=config["provider"],
            system=system_instruction,
            temperature=0.0,
            max_tokens=max_tokens,
        )
        first_raw = first_result["text"]
    except Exception as exc:
        if isinstance(exc, (HTTPException, UpstreamStructuredError)):
            raise
        _raise_hf_error("generation", exc)

    parsed: Dict[str, Any]
    try:
        parsed = _parse_concept_plan_json(first_raw)
    except Exception:
        fix_prompt = (
            "Fix this output into valid JSON only. "
            "Keep the same intended content if possible. "
            "Return exactly one JSON object with keys: "
            "queries, groups, outline, claims, open_questions, next_actions.\n\n"
            f"Invalid output:\n{first_raw}"
        )
        try:
            second_result = await hf_chat_complete(
                fix_prompt,
                selected_model,
                config["token"],
                config["timeout_ms"],
                config["router_base_url"],
                provider=config["provider"],
                system=system_instruction,
                temperature=0.0,
                max_tokens=max_tokens,
            )
        except Exception as exc:
            if isinstance(exc, (HTTPException, UpstreamStructuredError)):
                raise
            _raise_hf_error("generation", exc)
        second_raw = second_result["text"]
        try:
            parsed = _parse_concept_plan_json(second_raw)
        except Exception:
            logger.warning(
                "[HF] plan/concept invalid JSON after fix retry. first_snippet=%s second_snippet=%s",
                first_raw[:220],
                second_raw[:220],
            )
            parsed = _fallback_concept_plan(req)

    sanitized = _sanitize_concept_plan_payload(parsed, req)
    return ConceptPlanResponse.model_validate(sanitized).model_dump()
