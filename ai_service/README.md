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
- `HF_EMBEDDING_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)
- `HF_TEXT_MODEL` (default: `google/flan-t5-base`)
- `HF_BASE_URL` (default: `https://router.huggingface.co`)
- `HF_TIMEOUT_MS` (default: `30000`)

## Auth

Requests to `/embed` and `/synthesize` must include:

```
x-ai-secret: <AI_SHARED_SECRET>
```

## Endpoints

- `GET /health` -> `{ "status": "ok", "message": "Server is warm." }`
- `POST /embed`
- `POST /synthesize`

## Example curl

```bash
curl http://localhost:8001/health
```

```bash
curl -X POST http://localhost:8001/embed \
  -H "x-ai-secret: $AI_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"texts":["hello world","second text"]}'
```

```bash
curl -X POST http://localhost:8001/synthesize \
  -H "x-ai-secret: $AI_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"type":"highlight","id":"h1","text":"Example highlight text."}]}'
```
