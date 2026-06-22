# Spec — Notion connection fixes + Wiki "all pages" matches Library layout

**For:** Codex
**Author:** Athan + Claude (live test, 2026-06-21)
**Two items, one spec** (test both together): (A) the Notion connection gives no post-connect confirmation and hides sync status; (B) the wiki "all pages" list view doesn't match the Library layout (and puts the agent on the wrong side).

**Verification rule:** reproduce live on `https://www.noeis.io`; paste before/after evidence (URLs, screenshots, states) in the PR. Do not close from a unit test alone.

(Supersedes the standalone `noeis-notion-connection-spec-2026-06-21.md`.)

---

# PART A — Notion connection

## A1 (P0) — Post-OAuth redirect lands on a stale path and drops the success params

### Live repro (confirmed 2026-06-21)
`https://www.noeis.io/data-integrations?source=notion&notion=connected` **redirects to `/connections` and strips the query string** (`location.search` ends empty). The Notion OAuth callback sends the user to that stale URL after a successful connect, so the connection saves server-side but the frontend success handler (`note-taker-ui/src/pages/DataIntegrations.jsx:610–674`, which watches for `source=notion&notion=connected` / `notion=error`) **never sees the params** → no toast, no banner. User lands on `/connections` with zero confirmation ("I can't tell if the redirect worked").

### Root cause
Callback redirects to the old `/data-integrations` route in `server/routes/importRoutes.js`:
- success ~line 2015: `res.redirect('/data-integrations?source=notion&notion=connected')`
- error ~line 2022: `res.redirect('/data-integrations?source=notion&notion=error')`

`/data-integrations` → `/connections` redirect does not preserve the query string.

### Fix
1. Change both redirects (`importRoutes.js` ~2015, ~2022) from `/data-integrations?...` → `/connections?...`.
2. Make the `/data-integrations → /connections` redirect **preserve the query string** (so other legacy links don't silently drop params).
3. Confirm the param-watcher in `DataIntegrations.jsx:610–674` fires on `/connections?...` (it renders there; ensure the effect isn't keyed to the old path).

### Live confirmation (paste in PR)
- Real Notion OAuth connect → lands on `/connections` **with** a visible "Notion connected" toast/banner (URL + screenshot).
- Deny on Notion's consent screen → clear error message, not a silent return.

## A2 (P1) — Sync status invisible at the point of action

### Live symptom
"I never know if it's synced until I go to Library." The data exists — `/connections` shows "Notion — Workspace feed active · Last Notion sync: Apr 19, 2026" and "3 active handoffs" — but it's in the **"What is feeding Morning Paper?" / Return-loop** section, far from the Notion connect/sync control in "Choose a source." Status fields already exist on the connection (`importRoutes.js:483–485`: `lastSyncAt`, `lastValidatedAt`, `lastPreviewAt`) plus counts in the sync response; the card just doesn't surface them.

### Fix
On the Notion **source card** (the one with Connect/Sync in "Choose a source"):
- Disconnected: "Not connected."
- Connected: **"Connected · last synced <relative date> · <N> pages"** (from `lastSyncAt` + last count; fall back to `lastPreviewAt`/`lastValidatedAt`).
- Sync runs synchronously — show an explicit **in-progress → done** state on the card (spinner/"Syncing…" → "Synced N pages just now"), not just a vanishing toast.
- If indexing/embedding had failures, "synced, N still indexing" rather than implying full success.
Keep the Return-loop summary too; just answer "am I connected and current?" at the point of action.

### Live confirmation (paste in PR)
- Notion card shows connected + last-synced + count without scrolling to Return-loop.
- Click Sync → card shows in-progress then "Synced N pages." Screenshots of both.

### Out of scope (note, don't build)
- **Evernote** stays ENEX-only (`docs/evernote-cloud-oauth-spike-2026-06-07.md` — OAuth gated behind manual approval). Improve ENEX export *instructions* on the card; don't build Evernote OAuth.
- **Readwise** connection review is pending separately — not in this spec.

---

# PART B — Wiki "all pages" should match the Library layout

## The goal
The wiki "all pages" view (`/wiki/workspace?view=list`) and Library are both "browse your collection" surfaces, but they're structurally different and the wiki one **puts the agent on the wrong side**. Make the wiki list view reuse Library's spatial grammar so they read as siblings — **left = browse rail, center = list, right = agent** (the design language's left=corpus / center=work / right=agent).

**Match the grammar, not the folders.** Library is a *user-filed* system (folders). The wiki is *agent-grown* — its structure is page type + status + review state + the graph, not user folders. So the wiki's left rail is **facets with counts**, not a folder cabinet.

## What exists today
- **Wiki list view:** `note-taker-ui/src/components/wiki/WikiList.jsx` — top **dropdown** filters (`.wiki-index__filters`, lines 294–319: search + type/visibility/status selects + "Needs review" toggle) and a card grid (`.wiki-index__grid`, card markup lines 48–166: eyebrow type · status · title · excerpt · "N sources" · date · More).
- **Wiki layout / agent placement:** `WikiWorkspace.jsx` renders the list via `rightPane` (lines 3086–3092, `view==='list'` → `<WikiList compact>`), inside a shell (lines 3143–3260) where the **agent (`wiki-workspace__chat-pane`) is on the LEFT** and the list is the right pane. This is backwards vs the design grammar.
- **Library (the target):** `note-taker-ui/src/pages/Library.jsx` uses the shared **`ThreePaneLayout`** (`note-taker-ui/src/layout/ThreePaneLayout.jsx`): `left` = `LibraryCabinet` (All/Unfiled/Highlights + counts + folder tree, `components/library/LibraryCabinet.jsx:17–58`), `main` = `LibraryMain → LibraryArticleList`, `right` = `ThoughtPartnerPanel`. Card = `LibraryArticleRow` (`components/library/LibraryArticleList.jsx:93–167`: date · title · source kicker · excerpt · "N highlights" · Move).

## The build

### B1 — Reuse the three-pane grammar (agent moves to the right)
Render the wiki `view==='list'` surface with the same left/center/right structure as Library (reuse `ThreePaneLayout` if it fits, or match its zones):
- **left** = new wiki facet rail (B2),
- **center** = the wiki page list (B3),
- **right** = the existing wiki Thought-partner agent (move it from the left `wiki-workspace__chat-pane` to the right pane).
The agent on the right also matches Library and the design language. Keep the resizer/collapse behavior consistent with Library's `ThreePaneLayout` toggles.

### B2 — New left "shelf" rail = Library Cabinet, but with wiki facets + counts
Mirror `LibraryCabinet` structure (top items + counts, like folders), driven by the page set:
- **All pages (N)** · **Needs review (N)** at top (primary, like All Articles / Unfiled).
- **By type** (each with count): Concept · Entity · Source · Question · Comparison · Overview · Project · Log · Topic. This replaces the type dropdown.
- **By status** (Draft · Published) and **Shared · Private** — secondary groups with counts (replace those dropdowns). Can be collapsed sections.
- **Search** input at the top of the rail (move the existing `Search pages`).
Selecting a facet filters the center list (reuse `WikiList`'s existing `query/pageType/visibility/status/needsReviewFilter` state — just drive it from the rail instead of dropdowns). Counts computed from the loaded page set; zero-count facets recede (muted or hidden), matching the calm-index pattern.

### B3 — Harmonize the card with `LibraryArticleRow`
Make the wiki page row visually a sibling of the Library row: same row grammar — **date (lead) · title · kicker (type + Draft/Shared tag) · excerpt · meta line (`N sources · N claims · reviewed <date>`) · More**. Reuse Library's row classes/structure (`.library-article-row*`) or a shared component so spacing/typography match exactly. Don't invent a different card; the point is they look like the same product.

### B4 — Scope guardrails
- This is **only** the all-pages list view (`view==='list'`). The wiki **front page** (`/wiki`, morning paper) stays as is — do not touch it.
- Don't break the wiki workspace **page-reading** view (`view` = a page) or its agent chat behavior; only the list-mode shell changes.
- Mobile: keep a working single-pane/tab fallback like both surfaces have today.

## Acceptance criteria (live, paste evidence)
1. `/wiki/workspace?view=list` renders with **left facet rail, center list, right agent** — agent is on the **right**, matching `/library`. Side-by-side screenshots of both.
2. Left rail shows All / Needs review + type facets **with real counts**; clicking a facet filters the list; search works from the rail. The old top dropdowns are gone (or fully replaced).
3. Wiki page rows match the Library row grammar (date · title · kicker · excerpt · meta · More) — visually sibling. Screenshot both rows.
4. Front page `/wiki` unchanged; page-reading view + agent chat unaffected; no console errors; no h-scroll at 1280/1440; both themes.
5. `CI=true npm run build` passes; `npm run wiki:qa` exit 0.

## Priority within this spec
Part A first (small, fixes a connection that *feels* broken). Part B is the larger UI change — do it after A, or in parallel since they don't touch the same files (A = importRoutes + DataIntegrations; B = WikiList/WikiWorkspace + a new facet rail).
