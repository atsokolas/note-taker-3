# Note Taker

## Product overview (marketing + docs)

Note Taker is a Think-first knowledge workspace for turning reading into reusable insight.
The user journey is now intentionally page-based and should be described that way in external copy.

Core product flow:

- Login or register (`/login`, `/register`) with optional Chrome extension setup
- Capture material (manual notes, paste, markdown, Readwise CSV, or extension clipping)
- Work from the Think main screen (`/think`) across Home, Notebook, Concepts, Questions, Handoffs, Paths, and Insights
- Configure appearance, onboarding, integrations, and export controls in Settings (`/settings`)

Agentic capabilities (optional, human-in-the-loop):

- Thought Partner in-context chat for concept/notebook/question/handoff workflows
- Concept suggestions and synthesis helpers sourced from the user's own library
- Handoff queue shared between user, native agents, and personal BYO agents
- Orchestration policy + external bridge tokens for advanced A2A/MCP-compatible runtimes

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

## Product analytics (backend-only, privacy-safe)

The backend now records critical product events as JSON lines (default) with pseudonymous user IDs.
No highlight text, note content, usernames, or raw queries are logged.

Tracked events:

- `user_signup`
- `highlight_captured`
- `workspace_created`
- `semantic_search_performed`
- `ai_draft_generated`
- `ai_draft_accepted`
- `related_highlight_clicked`

Environment variables:

- `ANALYTICS_ENABLED` (default: `true`)
- `ANALYTICS_LOG_PATH` (default: `server/logs/product-events.jsonl`)
- `ANALYTICS_HASH_SALT` (recommended, used to hash user/object ids)
- `POSTHOG_HOST` and `POSTHOG_PROJECT_API_KEY` (optional; if set, events are also mirrored to self-hosted PostHog)
- `POSTHOG_TIMEOUT_MS` (default: `3000`)

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


## Product education page (docs.noeis.io draft)

A publish-ready HTML draft for docs.noeis.io lives at:

- `docs/docs.noeis.io/index.html`

It documents the current marketing narrative across:

- how the product works end to end
- Think main screen behavior
- settings and integrations
- login/signup messaging
- agentic capabilities and safety controls

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
