# Noeis

## Product overview (marketing + docs)

Noeis is a four-room knowledge workspace for turning reading into durable understanding and better judgment.
Library grounds what you know, Think is the native notebook, Wiki maintains durable synthesis, and Judgment compounds decisions, outcomes, and lessons.

Core product flow:

- Login or register (`/login`, `/register`) with optional Chrome extension setup
- Capture material (manual notes, paste, markdown, Readwise CSV, or extension clipping)
- Open on the Wiki return surface (`/wiki`), then move through Library (`/library`), Think (`/think`), Wiki, and Judgment (`/judgment`) without losing source context
- Ask the persistent thought partner to retrieve owned material, then insert grounded objects directly into the Think notebook
- Configure appearance, onboarding, integrations, and export controls in Settings (`/settings`)

Agentic capabilities (optional, human-in-the-loop):

- Thought Partner in-context chat for concept/notebook/question/handoff workflows
- Concept suggestions and synthesis helpers sourced from the user's own library
- Handoff queue shared between user, native agents, and personal BYO agents
- Orchestration policy + external bridge tokens for advanced A2A/MCP-compatible runtimes

Release design and acceptance details: [Noeis four-room implementation plan](docs/noeis-four-room-implementation-plan-2026-08-11.md).

## Semantic search (MongoDB Atlas Vector Search)

Vectors live in the `vectoritems` collection on the same Atlas cluster as
everything else — no separate vector database to run or provision. Embeddings
come from OpenRouter (`OPENROUTER_API_KEY`), the same account as the text model.

First-time setup (idempotent, safe to re-run):

```bash
node scripts/create_vector_index.js     # builds the Atlas index, polls to READY
node scripts/backfill_embeddings.js --user <id>   # or --all-users
```

`GET /health` reports `vectorIndex.status` and `vectorIndex.itemCount`. A READY
index with zero items means the backfill has not run — it is called out
explicitly there because two previous vector stores emptied themselves in
production without anything noticing.

Endpoints:

- `GET /api/semantic/related?sourceType=highlight&sourceId=...` → `{ results: [...] }`
- `GET /api/highlights/:id/related` → `{ results: [...] }`
- `POST /api/semantic/margins` `{ paragraphs, articleId?, excludeHighlightIds? }` → `{ notes: [{ paragraph, relation: 'close', highlight }] }` — the closest highlight from another source per paragraph (at most five); empty when nothing is close or no embedding provider is configured

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

## AI

The Node API calls OpenRouter directly for both text generation and embeddings.
Without `OPENROUTER_API_KEY` (or `HF_TOKEN` for text), AI features stay quiet and
the rest of the app works. Model routes and the remaining knobs are documented in
`.env.example`.

Agent eval:

- `npm run agent:eval` seeds a small reading library (`server/agentEval/library.js`), asks the thought partner the questions in `server/agentEval/cases.js` from the surfaces readers use, and scores each answer. It checks that the right sources were found, that the answer carries their actual words, that it cites only what it used, that it never invents a quotation or answers with a template, and that it says so when the library has nothing.
- With `HF_TOKEN` or `OPENROUTER_API_KEY` in `.env` it measures the model path; without one it measures what readers get when the model is unavailable. `modelAnswered` in the summary says which.
- `npm run agent:eval:check` exits non-zero when any rate falls below `server/agentEval/baseline.json`. Raise the baseline with `-- --update-baseline` after an improvement lands.
- `-- --case=summary,hiring --verbose` runs selected cases and prints the replies. Reports are written to `tmp/agent-eval/`.
- The eval starts its own in-memory MongoDB. Set `AGENT_EVAL_MONGODB_URI` to use a throwaway server instead; it never reads `MONGODB_URI`.
- `npm run agent:approval-smoke -- --base-url=https://your-api --token=JWT --action=reject` creates a real pending `memory.commit` approval, verifies it is listable, rejects it with an audit note, and writes a JSON report to `tmp/agent-approval-smoke-runs`. Use `--action=approve` only when you intentionally want the smoke test to commit working-memory rows.
- `POST /api/agent/memory-approvals` stages working-memory updates as `memory.commit` protocol approvals. Approving the protocol approval executes the commit into `WorkingMemoryItem`; rejecting it stores the user decision note for audit review.
- `GET /api/agent/write-boundary` summarizes the safety split between approved memory commits, pending memory approvals, and staged structure proposals. The Thought Partner panel renders this as a write-boundary card plus a separate Memory approvals review queue.


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

The UI shell now uses a shared token-driven layer across the four primary rooms:

- `Wiki` is the post-login return route (`/wiki`); Library, Think, Wiki, and Judgment remain persistent primary navigation.
- Global chrome is composed from reusable primitives:
  - `AppShell` (`note-taker-ui/src/layout/AppShell.jsx`)
  - `TopBar` (`note-taker-ui/src/layout/TopBar.jsx`)
  - `RightDrawer` (`note-taker-ui/src/layout/RightDrawer.jsx`)
  - `SurfaceCard`, `PillButton`, `Chip` (`note-taker-ui/src/components/ui.js`)
- Think remains a native document-first notebook. Judgment alone offers a board posture for moving through one case without turning the product into a generic dashboard.
- Right column context/working-memory is user-collapsible and persists per route via localStorage keys.

### Where to tweak tokens

- Primary UI token overrides: `note-taker-ui/src/styles/dashboard-refresh.css`
- Existing base theme variables/components: `note-taker-ui/src/styles/theme.css`
- Cross-room semantic roles and motion rules: `note-taker-ui/src/styles/semantic-theme.css`

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
