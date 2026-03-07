# AI Service (FastAPI + Hugging Face)

Lightweight AI microservice that calls Hugging Face hosted inference over HTTP.
This service intentionally avoids local ML dependencies for fast deploys.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run locally

```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

## Environment variables

- `AI_SHARED_SECRET` (required)
- `HF_TOKEN` (required)
- `HF_PROVIDER` (default: `hf-inference`)
- `HF_EMBEDDING_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)
- `HF_TEXT_MODEL` (default: `Qwen/Qwen2.5-Coder-7B-Instruct`)
- `HF_TEXT_MODEL_FALLBACKS` (optional comma-separated list)
- `HF_ROUTER_BASE_URL` (default: `https://router.huggingface.co/v1`)
- `HF_MODELS_BASE_URL` (default: `https://router.huggingface.co/hf-inference/models`)
- `HF_TIMEOUT_MS` (default: `30000`)
- `AI_SYNTH_MAX_ATTEMPTS` (default: `1`)
- `AI_SYNTH_MAX_LATENCY_MS` (default: `12000`)
- `AI_SYNTH_MAX_TOKENS` (default: `260`)

## Auth

Requests to protected endpoints must include:

```
x-ai-shared-secret: <AI_SHARED_SECRET>
```

## Endpoints

- `GET /health` -> `{ "status": "ok", "message": "Server is warm." }`
- `POST /embed`
- `POST /embed/upsert`
- `POST /embed/get`
- `POST /embed/delete`
- `POST /search`
- `POST /similar`
- `POST /synthesize`
- `POST /plan/concept`

### Synthesize JSON safety

`/synthesize` uses a sanitize + retry + validate flow with a latency budget:
1) sanitize model output (strip `<think>` blocks and code fences)
2) extract the first JSON object substring
3) parse and validate against a strict schema (exact keys, 3 strings each)
4) if invalid, retry strict attempts up to `AI_SYNTH_MAX_ATTEMPTS` (default 1)
5) stop early if `AI_SYNTH_MAX_LATENCY_MS` is exceeded, then return a strict fallback payload

`/plan/concept` also returns strictly sanitized JSON and enforces hard
list-size and ID-reference constraints before responding.

## Example curl

```bash
curl http://localhost:8001/health
```

```bash
curl -X POST http://localhost:8001/embed \
  -H "x-ai-shared-secret: $AI_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"texts":["hello world","second text"]}'
```

```bash
curl -X POST http://localhost:8001/synthesize \
  -H "x-ai-shared-secret: $AI_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"type":"highlight","id":"h1","text":"Example highlight text."}]}'
```
