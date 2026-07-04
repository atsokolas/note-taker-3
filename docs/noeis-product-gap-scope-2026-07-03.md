# Noeis Product Gap Scope — 2026-07-03

## Goal

Tighten the strongest live product loop:

Morning Paper → useful next action → wiki page → graph-aware answer → receipt / saved next step.

The latest real-account product test shows the wiki/graph-agent loop is now the strongest wedge. The next work should reduce uncertainty, make the graph feel operational, and make source/connection state trustworthy without adding more chrome.

## Current Rating

Current product score: 7.6 / 10.

The product is usable and differentiated when it acts as a maintained wiki with a graph-aware agent. It still loses confidence when surfaces feel empty, loading, or unclear about what happened.

## Push 1 — Knowledge Map Becomes Operational

### Problem

The Knowledge Map is improved but still feels like a status object more than a working tool. During testing it briefly sat on `Loading knowledge map...`; after focused retry it loaded in about 3 seconds. Scroll trapping is fixed, but the user still lacks a clear reason to use the map.

### Product Change

Make the map answer: "What should I do here?"

Add a compact "Map workbench" band above or beside the graph:

- **Review weak bridge** — page pair with the weakest relationship / highest drift.
- **Open center page** — strongest hub page.
- **Build missing bridge** — suggested bridge page from orphan clusters.
- **Fresh source gap** — page with drift and no recent source.

Each item should deep-link to a real page/action. Avoid vague metrics-only cards.

### Acceptance

- `/wiki/workspace?view=graph` loads a map or a meaningful map fallback within 4s on production.
- User sees one obvious next action above the graph without scrolling deep.
- Normal wheel scroll over the graph moves the workspace pane.
- Cmd/Ctrl + scroll remains available for intentional graph zoom.
- No horizontal overflow at desktop, 1280–1400px, and mobile.

### Suggested Owner

Codex for graph data/action selection and verification.
Cursor can take the visual layout once action data is available.

## Push 2 — Library Empty/Scope Trust

### Problem

The tested real-account Library route showed `0 SOURCES / 0 UNFILED`. If the user has data elsewhere, this looks like data loss or sync failure. If the scope is truly empty, the UI should say why and offer the next best route.

### Product Change

Add a scope-aware Library state:

- Show current scope clearly: `All`, `Unfiled`, `Cabinet`, `Search`.
- If a scoped view is empty but the corpus has articles elsewhere, show: "No sources in this view. 253 sources are in Library."
- Add one-click recovery: `Show all sources`.
- If Library is truly empty, show source import/connect actions with last receipt status.

### Acceptance

- `/library?scope=unfiled` never implies the whole Library is empty unless total source count is actually zero.
- Empty scoped views expose corpus total and route back to populated Library.
- If import/sync recently ran, the receipt appears near the empty state.

### Suggested Owner

Cursor: UI copy and state rendering.
Codex: API count/receipt data if missing.

## Push 3 — Connections Trust Receipts

### Problem

Connections is understandable but still feels utilitarian. Users cannot reliably tell what is connected, what synced, what failed, or what will happen next without leaving the page.

### Product Change

Every source card gets a durable state line:

- `Connected · last synced 7:41 PM · 252 highlights`
- `Needs attention · token expired · reconnect`
- `Ready to connect · browser approval`
- `Manual import · last ENEX import 23 notes`

Add one shared receipt primitive for Readwise, Notion, Evernote/file import:

- Last action
- Last result
- Next action
- Where the imported material landed

### Acceptance

- Readwise card does not say "connected" without a last checked/synced state.
- Notion OAuth return shows a visible success/failure receipt on `/connections`.
- Evernote/file import says where notes landed after import.
- Reloading `/connections` preserves the last known source status.

### Suggested Owner

Codex for persisted receipt/data contract.
Cursor for card polish and copy.

## Push 4 — Think Home One Next Move

### Problem

Think Home is calm, but it still shows several competing concepts: drafts, upkeep, output studio, workspace maintenance, and thought partner prompts. It needs a stronger "one best move" above the secondary machinery.

### Product Change

Add a single top-level "Resume this" card derived from real state:

- If a wiki page has fresh graph answer context, resume that.
- Else if a draft is ready, land it.
- Else if upkeep has a due cycle, resume it.
- Else invite a new question.

Everything else remains below, quieter.

### Acceptance

- `/think?tab=home` has exactly one primary next move above the fold.
- The primary move deep-links to the relevant surface.
- If no state exists, the empty state is honest and short.
- No duplicate CTA cluster above the fold.

### Suggested Owner

Codex for state ranking.
Cursor for presentation and responsive proof.

## Push 5 — Agent Answer Follow-through

### Problem

The wiki agent answer is now the product's strongest moment. But after answering, it should offer a concrete follow-up: save as note, turn into question, add to page, or build bridge.

### Product Change

Add post-answer actions when the agent uses graph context:

- `Save answer to Talk`
- `Turn into open question`
- `Build bridge page`
- `Add cited relation`

Show what will be changed before writing. Use existing receipt language after the write.

### Acceptance

- A graph-aware answer displays at least two relevant follow-up actions.
- Actions are disabled or hidden if not supported.
- Write actions produce a SystemStatus receipt and survive reload.
- No raw hidden mutation; user confirms writes.

### Suggested Owner

Codex. This crosses agent answer receipts, wiki writes, and graph edges.

## Delegation Prompts

### Cursor Prompt — Library Empty/Scope Trust

Work only this Noeis slice from `docs/noeis-product-gap-scope-2026-07-03.md`: Push 2 Library Empty/Scope Trust.

Scope:
- Make `/library?scope=unfiled` and other empty scoped Library states explain the current scope.
- If total Library source count is nonzero, show the total and a `Show all sources` recovery action.
- If total is zero, show source connection/import actions and recent receipt state if available.

Do not touch:
- Wiki graph code.
- Connection sync backends.
- Real account data.

Acceptance:
- Focused Library tests for empty scoped view vs truly empty corpus.
- Browser screenshots at desktop, 1280–1400px, and 430px.
- `CI=true npm run build`.

Report back with files changed, tests run, screenshots, and any missing API data.

### Grok Build Prompt — Product/Visual QA

Run product-feel QA only for `docs/noeis-product-gap-scope-2026-07-03.md`.

Scope:
- Test `/wiki`, `/wiki/workspace?view=graph`, `/wiki/workspace?page=6a1b812cdfca58bcaa50fffd`, `/library?scope=all`, `/library?scope=unfiled`, `/think?tab=home`, `/connections`.
- Focus on first-viewport clarity, obvious next action, trust receipts, loading states, and whether the surface feels alive or merely loaded.

Do not edit files.
Do not mutate user data.

Report:
- Rating per surface, 1–10.
- One strongest moment.
- Top five product/detail gaps.
- Screenshots at desktop and mobile.
- Exact copy/UI that confused you.

## Recommended Order

1. Push 1 — Knowledge Map operational next actions.
2. Push 2 — Library scoped-empty trust.
3. Push 3 — Connections trust receipts.
4. Push 5 — Agent answer follow-through.
5. Push 4 — Think Home one next move.

Reason: the wiki/graph loop is already the differentiated wedge. Improve that first, then make adjacent source/Library state trustworthy, then tighten Think as the broader workbench.
