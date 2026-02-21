# Note Taker

## Ollama (local LLM)

The backend can talk to a local Ollama server (no paid APIs).

Environment variables:

- `OLLAMA_HOST` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `llama3.1:8b-instruct`)
- `OLLAMA_EMBED_MODEL` (default: `nomic-embed-text`)

Health check:

- `GET /api/ai/health` → `{ ok, model, dims }`

## Semantic search (Qdrant + embeddings)

Vector DB uses Qdrant (run locally via Docker).

Environment variables:

- `QDRANT_HOST` (default: `http://localhost:6333`)
- `QDRANT_API_KEY` (optional, if your Qdrant uses auth)

Endpoints:

- `GET /api/search/semantic?q=...` → `{ results: [{ type, objectId, title, snippet, score }] }`
- `GET /api/highlights/:id/related` → `{ results: [...] }`

## AI service

AI requests are proxied through the Node backend to a private `ai_service` (FastAPI).

Node environment variables:

- `AI_ENABLED` (true/false)
- `AI_SERVICE_URL` (required when AI is enabled)
- `AI_SHARED_SECRET` (required, must match ai_service)
- `AI_SERVICE_TIMEOUT_MS` (default: `30000`)
- `AI_SERVICE_RETRIES` (default: `1`)

AI service environment variables:

- `AI_SHARED_SECRET` (required)
- `HF_TOKEN` (if the ai_service uses HF)
- `HF_EMBEDDING_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)

Health check:

- `GET /api/ai/health` → proxies to ai_service `/health`

Common failure modes:

- Render free tier can sleep/cold start upstream services.
- Wrong or missing `AI_SERVICE_URL` or `AI_SHARED_SECRET`.

## Concept Workspace (Document Outline)

Concepts now persist a document-outline workspace in `concept.workspace`:

```json
{
  "version": 1,
  "groups": [
    {
      "id": "uuid",
      "title": "Workspace",
      "description": "",
      "collapsed": false,
      "order": 0
    }
  ],
  "items": [
    {
      "id": "uuid",
      "type": "highlight",
      "refId": "mongo-object-id",
      "groupId": "group-uuid",
      "parentId": "",
      "order": 0
    }
  ],
  "updatedAt": "2026-02-21T00:00:00.000Z"
}
```

Workspace endpoints (JWT required):

- `GET /api/concepts/:conceptId/workspace` -> returns workspace and lazily initializes default group if missing
- `PUT /api/concepts/:conceptId/workspace` -> replaces workspace with validated payload
- `PATCH /api/concepts/:conceptId/workspace` -> applies operation payload `{ op, payload }`

Patch operations:

- `addGroup`, `updateGroup`, `deleteGroup`
- `addItem`, `moveItem`, `updateItem`, `deleteItem`
