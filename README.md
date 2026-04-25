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
- `capture_completed`
- `concept_created`
- `revisit_scheduled`
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
- `HF_PROVIDER` (default: `groq`)
- `HF_TEXT_MODEL` (default: `openai/gpt-oss-120b`)
- `HF_TEXT_MODEL_FALLBACKS` (default: `openai/gpt-oss-120b:cerebras,openai/gpt-oss-120b:fireworks-ai,Qwen/Qwen3-Next-80B-A3B-Instruct:novita`)
- `HF_AGENT_CHAT_ROUTES` (thought-partner route; default: `openai/gpt-oss-120b:groq,openai/gpt-oss-120b:cerebras,openai/gpt-oss-120b:fireworks-ai,Qwen/Qwen3-Next-80B-A3B-Instruct:novita`)
- `HF_AGENT_TOOL_ROUTES` (tool-router route; default: `openai/gpt-oss-120b:groq,openai/gpt-oss-120b:cerebras,openai/gpt-oss-120b:fireworks-ai,Qwen/Qwen3-Coder-Next:novita`)
- `HF_AGENT_STRUCTURE_ROUTES` (structure-planner route; default: `openai/gpt-oss-120b:groq,openai/gpt-oss-120b:cerebras,openai/gpt-oss-120b:fireworks-ai,google/gemma-4-26B-A4B-it:novita`)
- `HF_AGENT_DEEP_AUDIT_ROUTES` (deep reasoning route; default: `Qwen/Qwen3-Next-80B-A3B-Thinking:novita,deepseek-ai/DeepSeek-V4-Pro:together,openai/gpt-oss-120b:groq`)
- `HF_EMBEDDING_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)

Health check:

- `GET /api/ai/health` → proxies to ai_service `/health`

Agent workflow harness:

- `npm run agent:harness` runs the deterministic synthetic harness for the ten canonical agent workflows.
- `npm run agent:harness:realistic` runs the same contracts against anonymized realistic workspace fixtures with messy notes, folder drift, trust-boundary decisions, and memory updates.
- `npm run agent:harness:live` runs the same workflow contracts against the configured Hugging Face model routes.
- `npm run agent:harness:integrations` runs the Librarian and Memory steward workflows and adds dry-run service payloads for `AgentStructureProposal` and `WorkingMemoryItem`.
- `npm run agent:harness:ci` runs the deterministic regression gate used by CI: synthetic mock, realistic mock, and realistic integration dry-run. It fails when pass rate drops below `AGENT_HARNESS_MIN_PASS_RATE` (default `1.0`) or any suite has unexpected failures.
- `npm run agent:harness:ci:live` runs the same regression gate plus the live realistic Hugging Face suite. Use this for scheduled/manual checks when `HF_TOKEN` is configured.
- `npm run agent:bakeoff -- --workflow=librarian --candidate=model:provider,other-model:provider` forces selected workflows through explicit candidate model/provider pairs and writes a route/model comparison report to `tmp/agent-model-bakeoff-runs`.
- Add `-- --outcome-telemetry=path/to/metrics.json` or `-- --outcome-telemetry-url=https://your-api/api/agent/harness-metrics --outcome-telemetry-token=JWT` to a bakeoff run to compare candidate pass rates against production `outcomeTelemetry` acceptance buckets.
- Bakeoff reports include promotion recommendations. Defaults require `passRate >= 1`, `avgLatencyMs <= 30000`, at least one case, and zero production-overprediction buckets; tune with `AGENT_BAKEOFF_PROMOTION_MIN_PASS_RATE`, `AGENT_BAKEOFF_PROMOTION_MAX_AVG_LATENCY_MS`, `AGENT_BAKEOFF_PROMOTION_MIN_CASES`, and `AGENT_BAKEOFF_PROMOTION_MAX_OVERPREDICTING`.
- Set `AGENT_BAKEOFF_FAIL_ON_ALERT=true` only after scheduled bakeoff output is stable; otherwise the workflow records alerts in the GitHub step summary without blocking.
- `npm run agent:approval-smoke -- --base-url=https://your-api --token=JWT --action=reject` creates a real pending `memory.commit` approval, verifies it is listable, rejects it with an audit note, and writes a JSON report to `tmp/agent-approval-smoke-runs`. Use `--action=approve` only when you intentionally want the smoke test to commit working-memory rows.
- Add `-- --workflow=thought_partner,librarian` to limit a run to specific workflows.
- Add `-- --fixture-set=realistic` to use the realistic fixture set with any harness mode, including live runs.
- Controlled writes are opt-in only: add `-- --write-mode=stage --approve-writes --workflow=librarian` to create pending structure proposals without applying folder changes, `-- --write-mode=stage --approve-writes --workflow=memory_steward` to create pending `memory.commit` approvals, or `-- --write-mode=commit --approve-writes --workflow=memory_steward` to commit approved working-memory updates. `dry_run` remains the default.
- CI/scheduled reports are written to `tmp/agent-harness-regression-runs`; individual harness artifacts continue to land in `tmp/agent-harness-runs`.
- The harness metrics endpoint now exposes comparison matrices for route × model/provider, live route × model/provider, fixture set × model/provider, route × fixture set, and failure messages. The Thought Partner panel prefers live model-route rows and shows pass rate plus average latency.
- `POST /api/agent/memory-approvals` stages working-memory updates as `memory.commit` protocol approvals. Approving the protocol approval executes the commit into `WorkingMemoryItem`; rejecting it stores the user decision note for audit review.
- `GET /api/agent/write-boundary` summarizes the safety split between approved memory commits, pending memory approvals, and staged structure proposals. The Thought Partner panel renders this as a write-boundary card plus a separate Memory approvals review queue.
- The harness metrics response also includes `outcomeTelemetry`, which compares real content-edit, structure-plan, artifact-draft, and agent-run outcomes against matching harness pass rates. The Thought Partner panel surfaces underperforming/aligned buckets as production feedback for the harness.
- The scheduled GitHub live harness job also runs a non-blocking model bakeoff and uploads bakeoff artifacts. Manual workflow dispatch can run the deployed approval smoke when `AGENT_APPROVAL_SMOKE_BASE_URL` and `AGENT_APPROVAL_SMOKE_TOKEN` are configured.

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
