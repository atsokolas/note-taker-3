# AI Service (FastAPI + ChromaDB)

Minimal AI microservice for embeddings and semantic search.

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

ChromaDB persists to `ai_service/.chroma`.

## Auth

Set `AI_SHARED_SECRET` in the ai_service environment. All requests must include:

```
Authorization: Bearer <AI_SHARED_SECRET>
```

## Endpoints

- `GET /health` -> `{ status: "ok" }`
- `POST /embed/upsert` (stub)
- `POST /search` (stub)
- `POST /similar` (stub)
