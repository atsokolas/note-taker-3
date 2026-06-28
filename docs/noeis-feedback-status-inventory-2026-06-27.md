# Feedback & status inventory — 2026-06-27

**Scope:** Chapter 0.5 cross-cutting layer vs. current frontend patterns in the seven listed surfaces (+ imported child components/hooks).

**Finding:** `ReceiptCard` and `SystemStatus` **do not exist** anywhere in `note-taker-ui/src`. The closest shared primitive is **`SurfaceNotice`** (`note-taker-ui/src/components/feedback/SurfaceNotice.jsx`).

---

## Chapter 0.5 requirements (summary)

From `docs/noeis-return-loop-roadmap-spec-2026-06-25.md` §0.5, every meaningful action should follow:

1. **Optimistic affordance** — immediate acknowledgement without claiming durable work is done
2. **Live system state** — concise visible `aria-live` status
3. **Durable receipt** — persisted `NoeisReceipt` object renderable on surface, morning paper, agents
4. **Recoverable failure** — preserve draft/context, name failed stage, offer retry/review
5. **Global awareness without noise** — TopBar quiet status for background work / latest durable action

Shared `NoeisReceipt` shape: `id`, `kind`, `source`, `status`, `title`, `summary`, `metrics?`, `touched?`, `nextAction?`, `error?`, `createdAt`, `completedAt?`.

Surfaces to standardize: Connections cards, Wiki front page, Wiki workspace chat, Library filing, Command palette, TopBar/shell.

---

## 1. States by surface

### `note-taker-ui/src/pages/DataIntegrations.jsx`

| State type | Implementation | Persistence |
|---|---|---|
| **Loading** | `sessionLoading` → "Loading current session…"; per-action flags (`readwiseSyncing`, `notionSyncing`, `previewing.*`, `importing.*`, `busy` aggregate) | Ephemeral |
| **Working / stage** | `importStatus.message` via `setStatus()`; session `progress.stage/percent/indexingState`; button labels (`Syncing…`, `Previewing…`, `Connecting…`) | `importStatus` ephemeral; session progress **API** (`getActiveImportSession`, 3s poll while `importing`) |
| **Success** | `SurfaceNotice` variant `success`; `getSessionMessage()` for completed sessions; `importStats` summary block; `importReceipt` callout (`data-testid="import-receipt"`) | Session + connection **`lastSyncResult`** durable via API; `importStats` **lost on reload** |
| **Warning** | `SurfaceNotice` variant `warning`; indexing/embedding warnings | Connection `lastSyncResult.indexingFailures` durable |
| **Error** | `SurfaceNotice` variant `error`; `setStatus(..., 'error')`; failed session status | Session `failed` durable; ephemeral toast-like `importStatus` |
| **Receipt / status UI** | Return-loop feed cards; Notion status block (`data-testid="notion-sync-receipt"`); import session card; `getReceiptDestination()` handoff links | Partially durable (connections, sessions); receipt callout is client-derived from ephemeral `importStats` |

**Imported:** `SurfaceNotice`, `getEmbeddingJobStatus`, import session/connection APIs, `readFirstInsightState` / `rememberFirstInsight` (localStorage activation).

---

### `note-taker-ui/src/pages/Library.jsx` (+ children)

| State type | Implementation | Persistence |
|---|---|---|
| **Loading** | `foldersLoading`, `articlesLoading`, `articleLoading`; `LibraryMain` / `LibraryArticleList` skeletons; `AgentPresence status="working"` | Ephemeral |
| **Error** | `foldersError`, `articlesError`, `articleError`, `moveError` → `status-message error-message` | Ephemeral |
| **Success / receipt** | `filingReceipt` → `LibraryReadingRoomLead` (`data-testid="library-filing-receipt"`) | **Ephemeral** (React state); proposal durable in DB via API |
| **Busy** | `filingLaunching` → "Classifying…"; `moving` → Move modal "Moving…"; `organizeLaunching` | Ephemeral |
| **Optimistic** | `addHighlightOptimistic` → `ArticleReader` temp highlights | Reverted on API failure via `removeHighlight` |

**Imported:** `AgentPresence` (aria-live), `AgentTicker`, `LibraryReadingRoomLead`, `LibraryMain`, `LibraryArticleList`, `MoveToFolderModal`, `useArticleDetail`, `ArticleReader`.

---

### `note-taker-ui/src/components/wiki/WikiWorkspace.jsx` (+ children)

| State type | Implementation | Persistence |
|---|---|---|
| **Loading** | Pane fallbacks; Library sources pane; activity pane; schema editor | Ephemeral |
| **Live status** | `wiki-workspace-chat__presence` with `agentStatus`; `AgentTicker`; Send `busy ? 'Sending...'` | Ephemeral; thread partially durable |
| **Streaming receipts** | `activityReceipts` on messages; `appendReceipt` during stream; `<ol class="wiki-workspace-chat__receipts">` | In-session only unless thread rehydrated |
| **Success / recovery** | `SurfaceNotice` variant `recovering` for build retry; `appendBuildSuccessMessage` | Ephemeral messages |
| **Error** | `role="alert"` errors; chat failure restores composer draft; `autoBuildNotice` (`role="alert"`) | Draft preserved; notices ephemeral |
| **Ingest / maintenance** | `WikiIngestResultCard`, `WikiIngestRippleStrip`, ingest run polling | Run records durable (API); UI state mixed |

**Imported:** `SurfaceNotice`, `AgentTicker`, `ReferencePullIn` (has `aria-live`), nested panes with local `status` spans.

---

### `note-taker-ui/src/components/wiki/WikiFrontPage.jsx` (+ `WikiBuildPageComposer`)

| State type | Implementation | Persistence |
|---|---|---|
| **Loading** | `aria-busy="true"`; `role="status"` copy ("Checking overnight edits…") | Ephemeral |
| **Error** | `wiki-index__error` with `role="alert"` | Ephemeral |
| **Content** | `getWikiBriefing()` → lead sentence, drift counts | **API durable** (briefing service) |
| **Build composer** | `WikiBuildPageComposer`: busy, `AgentTicker`, `role="status"` status, `role="alert"` error | Ephemeral; navigates to workspace with `build=1` |

**Gap vs 0.5:** Morning paper does **not** consume import/maintenance **receipt objects** — only briefing summary + page metadata.

---

### `note-taker-ui/src/components/CommandPalette.jsx`

| State type | Implementation | Persistence |
|---|---|---|
| **Loading** | `loading` → `<p className="muted small">Searching…</p>` | Ephemeral |
| **Empty** | "No results." | — |
| **Actions** | `createNote`, `createWiki` — errors logged, fallback navigate | No receipt, no busy label on create actions |
| **a11y** | No `aria-live` / `role="status"` on search state | — |

**Gap vs 0.5:** Search/route only — no `queued/running/completed/failed` lifecycle or durable receipts for mutating commands.

---

### `note-taker-ui/src/layout/TopBar.jsx`

| State type | Implementation | Persistence |
|---|---|---|
| **Busy hint** | `themeSaving ? 'is-busy'` on theme pill | Ephemeral |
| **Command entry** | Opens palette via `onSearchOpen` | — |

**Gap vs 0.5:** No global system-status affordance for background work or latest durable action.

---

### `note-taker-ui/src/App.js`

| State type | Implementation | Persistence |
|---|---|---|
| **Route loading** | `RouteLoadingFallback` — `role="status"` + `aria-live="polite"` | Ephemeral |
| **Auth bootstrap** | `isLoading` → same fallback | Ephemeral |
| **Optimistic UI** | `handleUiSettingsChange`: optimistic `setUiSettings` before `saveUiSettings` | localStorage + API on success; **no revert on save failure** |
| **Palette shell** | Mounts `CommandPalette`; ⌘K handler | — |

---

## 2. Durable vs ephemeral

| Pattern | Durable after reload | Mechanism |
|---|---|---|
| Import session status/progress | Yes | `GET /api/import/sessions/active` |
| Connection `lastSyncAt`, `lastSyncResult`, `lastError` | Yes | Import connections API |
| First-insight activation | Yes | localStorage (`readFirstInsightState`) |
| `importStats`, `importStatus.message` | **No** | Component state only |
| Library `filingReceipt` | **No** | Component state; proposal in DB, not re-shown on Library |
| Wiki chat messages/receipts | **Partial** | `persistThread: true` → Think threads; fresh workspace visit starts empty |
| UI settings optimistic theme | **Mostly** | localStorage cache; failed API save not rolled back |
| Highlight optimistic add | **Yes if saved** | API persistence; temp id reverted on failure |
| Wiki briefing / front page editorial | Yes | `getWikiBriefing()` |
| Command palette action outcomes | **No** | Navigate away, no receipt |
| TopBar status | **No** | Nothing stored |

---

## 3. `aria-live` and `role="status"` (target surfaces + key imports)

| Location | Markup |
|---|---|
| `App.js:93-100` | `RouteLoadingFallback` — `role="status" aria-live="polite"` |
| `SurfaceNotice.jsx:36` | `role={error?'alert':'status'} aria-live={assertive?'assertive':'polite'}` |
| `AgentPresence.jsx:17-18` | `role="status" aria-live="polite"` (Library agent card) |
| `WikiWorkspace.jsx:2486-2487` | Chat presence — `role="status" aria-live="polite"` |
| `WikiWorkspace.jsx:1023` | Schema pane inline status — `role="status"` (no aria-live) |
| `WikiWorkspace.jsx:2680-2693` | Activity receipt list — **no** aria-live on `<ol>` |
| `WikiFrontPage.jsx:254,273` | Loading copy — `role="status"` (no aria-live) |
| `WikiBuildPageComposer.jsx:90` | Build status — `role="status"` |
| `LibraryArticleList.jsx:175` | Row "Opening" — `role="status"` (720ms ephemeral) |
| `LibraryReadingRoomLead.jsx:92-99` | Filing receipt — **no** role/aria-live |
| `CommandPalette.jsx:429` | "Searching…" — **no** role/aria-live |
| `TopBar.jsx` | **None** for system status |
| `DataIntegrations.jsx` | Via `SurfaceNotice` only (not inline status spans) |

---

## 4. Optimistic UI today

| Surface | Pattern | Compliant with 0.5? |
|---|---|---|
| **App.js** | Theme/settings optimistic before save | Partial — no failure revert |
| **Library / ArticleReader** | Temp highlight → API → replace/remove | Yes for low-risk local change |
| **Library filing** | Clears receipt, navigates to Think thread | No false import claims |
| **DataIntegrations** | Optimistic `currentSession` status `importing` during sync | OK for in-progress; counts only after API |
| **WikiWorkspace chat** | Pending assistant message + streaming deltas | OK — doesn't claim persistence until stream completes |
| **CommandPalette** | None for creates | N/A |
| **WikiFrontPage composer** | Navigates before build completes | Acknowledges intent; build completion deferred to workspace |

**Anti-patterns vs 0.5:** No optimistic import counts or filing acceptance; sync stats shown only after API response.

---

## 5. Gaps vs Chapter 0.5

| Requirement | Current state | Gap |
|---|---|---|
| Shared `NoeisReceipt` contract | Ad-hoc shapes: import stats, filing `{stage, summary}`, chat `activityReceipts` | No normalized `id/kind/source/status/touched/nextAction/error` |
| Connections: activity + last receipt + next action | Return-loop feed + Notion card + session card; rich counts not structured receipts | Missing unified receipt on cards; Readwise lacks Notion-style sync result line on card |
| Wiki front: receipts feed morning paper | Briefing summary only | Import/maintenance receipts not wired |
| Wiki chat: persist final receipt if objects changed | Streamed receipts in memory; thread persistence separate | No durable receipt object linked to mutated wiki entities |
| Library: filing receipt survives reload | One-off `<p>` in lead strip | Lost on reload; no links to changed articles/folders |
| Command palette: action lifecycle + receipt | Search + navigate/create | No status phases, no receipts |
| TopBar: quiet global status | Theme busy class only | **Missing entirely** |
| Live `aria-live` on all async work | Strong in wiki chat + SurfaceNotice + AgentPresence | Weak on CommandPalette, Library filing receipt, connections inline metrics |
| Recoverable failure | Wiki chat preserves composer; import session preserves text | App settings don't revert; CommandPalette silent failures |
| Stage-specific busy labels | Good on DataIntegrations buttons | Generic "Loading…", "Searching…" elsewhere |

---

## 6. Lowest-risk extraction plan

**Goal:** Introduce shared **`ReceiptCard`** + **`SystemStatus`** without big-bang refactor.

### Existing consolidation target

**`SurfaceNotice`** already provides: variant tones (`working/success/warning/error/recovering/info`), optional action button, `role` + `aria-live`. Extend rather than replace.

### Proposed APIs

```tsx
// ReceiptCard — extends SurfaceNotice
type ReceiptCardProps = {
  receipt: Partial<NoeisReceipt>; // require at least summary + status
  compact?: boolean;
  showMetrics?: boolean;
  onRetry?: () => void;
  className?: string;
};

// SystemStatus — TopBar glanceable chip
type SystemStatusProps = {
  phase: 'idle' | 'working' | 'completed' | 'failed';
  label: string; // "Syncing Readwise…"
  receipt?: NoeisReceipt; // latest durable when idle/completed
  href?: string; // deep link to originating surface
};
```

Internally, **`ReceiptCard`** wraps **`SurfaceNotice`** + optional metrics/`touched` list + `nextAction` link. Map `receipt.status` → `SurfaceNotice` variant.

### Migration order (lowest risk first)

1. **`DataIntegrations.jsx`** — Normalize `importStats` + connection `lastSyncResult` into `NoeisReceipt` at API boundary; replace `import-callout` + duplicate Notion summary with `ReceiptCard`. Backend already persists session/connection data.

2. **`LibraryReadingRoomLead.jsx`** — Replace filing `<p>` with `ReceiptCard`; persist last receipt id in sessionStorage or fetch from structure proposal API on mount.

3. **`WikiWorkspace.jsx`** — On stream `onFinal`, if `touched` entities returned, render final message with `ReceiptCard` instead of raw `<ol>`; keep streaming list for live phase.

4. **`WikiFrontPage.jsx`** — Add optional briefing section rendering latest import receipts from API (depends on Ch 1.2 backend).

5. **`CommandPalette.jsx`** — Add local `actionPhase` + `ReceiptCard` footer for mutating actions (`createWiki`, future intents).

6. **`TopBar.jsx` + `App.js`** — Mount `SystemStatus` fed by a thin `useSystemStatus()` hook reading latest receipt from context (populated by steps 1–3).

### Files to touch later (not now)

- New: `note-taker-ui/src/components/feedback/ReceiptCard.jsx`, `SystemStatus.jsx`, `noeisReceipt.js` (normalize helpers)
- Extend: `SurfaceNotice.jsx` (optional `asChild` or shared variant map)
- Migrate: `DataIntegrations.jsx`, `LibraryReadingRoomLead.jsx`, `WikiWorkspace.jsx`, `WikiFrontPage.jsx`, `CommandPalette.jsx`, `TopBar.jsx`, `App.js`
- Backend alignment: `server/routes/importRoutes.js`, `server/services/libraryFilingService.js`, `server/services/wikiBriefingService.js`
- Tests: `SurfaceNotice.test.jsx`, `LibraryReadingRoomLead.test.jsx`, new ReceiptCard tests

---

## Key findings (executive summary)

- **No `ReceiptCard` / `SystemStatus`** — **`SurfaceNotice`** is the only shared feedback component; wiki chat uses bespoke receipt lists.
- **Best 0.5 partial implementation:** **DataIntegrations** (durable sessions/connections, `SurfaceNotice`, stage-specific busy labels, return-loop feed).
- **Largest gaps:** **TopBar** (no global status), **CommandPalette** (no action lifecycle/receipts), **Library filing receipt** (ephemeral), **WikiFrontPage** (no receipt consumption).
- **Accessibility:** Strong in wiki chat presence and `SurfaceNotice`; weak on palette search, filing receipt, and receipt lists without `aria-live`.
- **Optimistic UI:** Highlights and wiki chat streaming are sound; **App theme settings don't revert on save failure**.
