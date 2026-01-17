# Note Taker

## Ollama (local LLM)

The backend can talk to a local Ollama server (no paid APIs).

Environment variables:

- `OLLAMA_HOST` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `llama3.1:8b-instruct`)
- `OLLAMA_EMBED_MODEL` (default: `nomic-embed-text`)

Health check:

- `GET /api/ai/health` → `{ ok, model, available }`

## Semantic search (Qdrant + embeddings)

Vector DB uses Qdrant (run locally via Docker).

Environment variables:

- `QDRANT_HOST` (default: `http://localhost:6333`)
- `QDRANT_API_KEY` (optional, if your Qdrant uses auth)

Endpoints:

- `GET /api/search/semantic?q=...` → `{ results: [{ type, objectId, title, snippet, score }] }`
- `GET /api/highlights/:id/related` → `{ results: [...] }`
