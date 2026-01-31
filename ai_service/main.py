import json
import logging
import os
import hashlib
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Request, Depends, Header
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

from hf_client import (  # noqa: E402
    embeddings_client,
    text_client,
    HF_TOKEN,
    HF_EMBEDDING_MODEL,
    HF_TEXT_MODEL,
    HF_PROVIDER,
)

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
        "token": HF_TOKEN,
        "embedding_model": HF_EMBEDDING_MODEL,
        "text_model": HF_TEXT_MODEL,
        "provider": HF_PROVIDER,
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


def parse_synthesis(output: str) -> Dict[str, Any]:
    try:
        data = json.loads(output)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {
        "summary": output.strip(),
        "themes": [],
        "connections": [],
        "questions": []
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

def _extract_chat_text(result: Any) -> str:
    if hasattr(result, "choices"):
        choices = getattr(result, "choices", [])
        if choices:
            choice = choices[0]
            message = getattr(choice, "message", None)
            if message is not None and hasattr(message, "content"):
                return str(message.content).strip()
            if hasattr(choice, "text"):
                return str(choice.text).strip()
    if isinstance(result, dict):
        choices = result.get("choices") or []
        if choices:
            first = choices[0]
            message = first.get("message", {})
            if isinstance(message, dict) and "content" in message:
                return str(message.get("content", "")).strip()
            if "text" in first:
                return str(first.get("text", "")).strip()
    return ""


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
        "embedding_model": config["embedding_model"],
        "text_model": config["text_model"],
    }


@app.post("/debug/hf-smoke", dependencies=[Depends(require_shared_secret)])
def debug_hf_smoke():
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    result: Dict[str, Any] = {"embedding": {}, "generation": {}}
    try:
        embed_out = embeddings_client.feature_extraction(
            ["hello world", "test sentence"]
        )
        vectors = _normalize_embeddings(embed_out, expected_count=2)
        result["embedding"] = {
            "ok": True,
            "preview": vectors[0][:5] if vectors else []
        }
    except Exception as exc:
        result["embedding"] = {"ok": False, "error": str(exc)}
    try:
        if hasattr(text_client, "chat_completion"):
            chat_out = text_client.chat_completion(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a thinking partner. Return ONLY valid JSON."
                    },
                    {"role": "user", "content": "Say hello in one sentence."}
                ],
                max_tokens=30,
                temperature=0.3,
            )
            text_out = _extract_chat_text(chat_out)
        else:
            text_out = text_client.text_generation(
                "Say hello in one sentence.",
                max_new_tokens=30,
                temperature=0.3,
                return_full_text=False,
            )
        result["generation"] = {
            "ok": True,
            "preview": str(text_out)[:120]
        }
    except Exception as exc:
        result["generation"] = {"ok": False, "error": str(exc)}
    return {
        "provider": config["provider"],
        "embedding_model": config["embedding_model"],
        "text_model": config["text_model"],
        **result,
    }


@app.post("/embed", dependencies=[Depends(require_shared_secret)])
def embed(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts are required")
    config = get_hf_config()
    if not config["token"]:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured")
    try:
        result = embeddings_client.feature_extraction(req.texts)
        embeddings = _normalize_embeddings(result, expected_count=len(req.texts))
    except Exception as exc:
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
    output_text = ""
    try:
        if hasattr(text_client, "chat_completion"):
            result = text_client.chat_completion(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a thinking partner. Return ONLY valid JSON."
                    },
                    {"role": "user", "content": prompt}
                ],
                max_tokens=200,
                temperature=0.3,
            )
            output_text = _extract_chat_text(result)
        else:
            result = text_client.text_generation(
                prompt,
                max_new_tokens=200,
                temperature=0.3,
                return_full_text=False,
            )
            output_text = _extract_generated_text(result)
    except Exception as exc:
        _raise_hf_error("generation", exc)
    if not output_text:
        raise HTTPException(status_code=502, detail="HF text response empty")
    parsed = parse_synthesis(output_text)
    if "themes" not in parsed:
        parsed["themes"] = []
    if "connections" not in parsed:
        parsed["connections"] = []
    if "questions" not in parsed:
        parsed["questions"] = []
    parsed["model"] = config["text_model"]
    return parsed
