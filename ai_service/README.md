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

## Endpoints

- `GET /health` -> `{ ok: true }`
- `POST /embed/upsert` (stub)
- `POST /search` (stub)
- `POST /similar` (stub)
