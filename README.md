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
- `POST /api/concepts/:conceptId/agent/build` -> runs the library-only concept agent loop. Supports `preview: true` for confirm-before-apply, and `applyPreview: true` to apply the latest stored preview.
- `POST /api/concepts/:conceptId/agent/suggest` -> generates AI draft suggestions from your library for the concept (`library_only`)
- `GET /api/concepts/:conceptId/agent/suggestions` -> returns active AI-generated draft suggestions (pending + accepted, excluding discarded)
- `POST /api/concepts/:conceptId/agent/suggestions/:draftId/accept` -> accepts selected or all pending AI draft suggestions; accepted items are added to workspace Inbox
- `POST /api/concepts/:conceptId/agent/suggestions/:draftId/discard` -> discards selected or all pending AI draft suggestions
- `GET /api/debug/agent-metrics` -> returns in-memory observability counters for scout/build and AI upstream outcomes

AI draft suggestions are explicitly marked as AI-generated, require user acceptance to enter Inbox, and persist until discarded.

Patch operations:

- `addGroup`, `updateGroup`, `deleteGroup`
- `addItem`, `moveItem`, `updateItem`, `deleteItem`

## Design system & layout rules

The UI shell now uses a shared token-driven layer designed for Think-first navigation:

- `Think` is the post-login landing route (`/think?tab=home`).
- Global chrome is composed from reusable primitives:
  - `AppShell` (`note-taker-ui/src/layout/AppShell.jsx`)
  - `LeftNav` (`note-taker-ui/src/layout/LeftNav.jsx`)
  - `TopBar` (`note-taker-ui/src/layout/TopBar.jsx`)
  - `RightDrawer` (`note-taker-ui/src/layout/RightDrawer.jsx`)
  - `SurfaceCard`, `PillButton`, `Chip` (`note-taker-ui/src/components/ui.js`)
  - `SkeletonBlock` (`note-taker-ui/src/components/SkeletonBlock.jsx`)
- Think Home + Concept workspace/materials follow a document-first visual hierarchy (not board/kanban).
- Right column context/working-memory is user-collapsible and persists per route via localStorage keys.

### Where to tweak tokens

- Primary UI token overrides: `note-taker-ui/src/styles/dashboard-refresh.css`
- Existing base theme variables/components: `note-taker-ui/src/styles/theme.css`
- Base spacing/type aliases: `note-taker-ui/src/styles/tokens.css`

### Think Home / Shell polish checklist

- Tokens:
  - spacing / radii / surface aliases live in `note-taker-ui/src/styles/dashboard-refresh.css` (`--space-*`, `--radius-*`, `--surface-*`, `--text-*`)
- Shell components:
  - `note-taker-ui/src/layout/AppShell.jsx`
  - `note-taker-ui/src/layout/LeftNav.jsx`
  - `note-taker-ui/src/layout/TopBar.jsx`
  - `note-taker-ui/src/layout/RightDrawer.jsx`
- Think page composition:
  - `note-taker-ui/src/pages/ThinkMode.jsx`
  - `note-taker-ui/src/components/think/ThinkHome.jsx`
- Verify after style tweaks:
  - light + dark mode both preserve contrast hierarchy
  - right drawer collapses/expands cleanly and main panel reflows
  - Think Home “Continue” module remains the primary visual CTA
  - no overflow in nav/topbar/right drawer on smaller widths

### Visual Regression Baseline (Think Home)

- Screenshot matrix + capture checklist:
  - `docs/ui-regression/think-home-baseline.md`
- Think-specific polish overrides (split out for maintainability):
  - `note-taker-ui/src/styles/think-home-polish.css`
