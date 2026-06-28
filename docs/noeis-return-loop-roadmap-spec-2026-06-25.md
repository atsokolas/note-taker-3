# Spec — Product roadmap: "From beautiful reading room to thinking system"

**For:** Codex
**Author:** Athan + Claude (synthesis of two independent product reviews + live ground-truth, 2026-06-25)
**Thesis:** the design is good enough; the next chapters must prove Noeis is a *thinking system*. Two independent reviews converged on the same #1 bet: **make the daily Return Loop intelligent (insight, not maintenance).** This spec scopes that and the follow-on chapters.

**Verification rule:** every item has a live acceptance test on `https://www.noeis.io`; paste before/after evidence in the PR. Do not mark done from a unit test alone.

---

## 0. Already shipped — DO NOT rebuild (verified live)
A prior review listed these as "to do"; they're done. Don't re-spend:
- **Graph-aware agent answers** ✅ — cross-concept questions already pull current page + related pages + backlinks + highlights and synthesize with a truthful receipt (*"Searched … 3 related wiki pages, 5 highlights, 4 backlinks. Read X + Y + Z"*). Page-only questions stay fast. (`server/services/wikiAskService.js`, wired via `agentChatRoutes`.) **The remaining graph gap is temporal + contradiction queries — see Ch.1.3.**
- **Share → adopt** ✅ — "Make this mine," provenance (`adoptedFrom`), starter packs, logged-out→onboarding handoff. (Polish/SEO is Ch.3b.)
- **Filing suggestions exist** ✅ (partial) — "Review filing suggestions" generates a reviewable plan; the *quality + bulk UX* is Ch.3a.
- **6h scheduled maintenance** ✅ — `server/services/wikiScheduledMaintenanceWorker.js` runs `maintainWikiPage({trigger:'scheduled'})`. Ch.1 consumes its output; do not rebuild the scheduler.

## 0.5 Cross-cutting product layer — Feedback, optimistic UI, and system status
**Why this is now in scope:** Noeis already has isolated status patterns, but they are inconsistent: `App.js` uses optimistic save/revert for UI settings, Wiki chat streams receipts and errors, `DataIntegrations.jsx` has connector-local busy states and durable `lastSyncResult`, Library filing has a one-off receipt, and public/share pages use simple copy states. Chapter 1 and Chapter 2 will make this worse unless the product gets one shared contract for "what is happening, what changed, what persisted, and what needs user review."

**Goal:** every meaningful agent/import/command action follows the same loop:
1. **Optimistic affordance** — the UI acknowledges the user's action immediately, without pretending durable work is complete.
2. **Live system state** — a concise, visible, `aria-live` status says what is happening now.
3. **Durable receipt** — when work completes, persist a receipt object that can be rendered on the originating surface, surfaced in the morning paper, and used by agents/MCP.
4. **Recoverable failure** — errors preserve the draft/context, name the failed stage, and offer a retry or a review path.
5. **Global awareness without noise** — the top-level shell can indicate background work or the latest durable action without turning the product into a notification center.

**Shared vocabulary / object shape:**
```ts
type NoeisReceipt = {
  id: string;
  kind: 'import' | 'wiki_maintenance' | 'wiki_ask' | 'filing' | 'command' | 'share_adoption';
  source: 'readwise' | 'notion' | 'evernote' | 'wiki' | 'library' | 'think' | 'system';
  status: 'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed' | 'needs_review';
  title: string;
  summary: string;
  metrics?: Record<string, number>;
  touched?: Array<{ type: 'page' | 'article' | 'note' | 'highlight' | 'concept' | 'question' | 'folder'; id: string; title: string }>;
  nextAction?: { label: string; href?: string; intent?: string };
  error?: { stage: string; message: string; retryable: boolean };
  createdAt: string;
  completedAt?: string;
};
```

This shape does not require a new big-bang model immediately. Chapter 1.2 can start by normalizing the existing import/session/connection results into this contract, then Wiki maintenance and command actions can adopt it.

**System status surfaces to standardize:**
- **Connections cards:** connected/not connected is not enough. Show current activity, last durable receipt, and the next useful action.
- **Wiki front page:** morning paper consumes receipts and scheduled maintenance outputs; it should not poll random one-off client state.
- **Wiki workspace chat:** keep the existing streamed receipts, but persist the final receipt if it changed objects.
- **Library:** filing/import receipts should stay visible after reload and should point to the changed articles/folders.
- **Command palette / universal command:** every command should enter `queued/running/completed/failed` and produce a receipt if it mutates durable state.
- **Topbar/system shell:** add a quiet status affordance for background work and latest durable action. It should be glanceable, not a toast stack.

**Optimistic UI rules:**
- Optimistically show local intent for low-risk local changes (draft text, selected filters, queued command, selected filing review action).
- Do **not** optimistically claim imported counts, created pages, accepted filing, or graph changes until the backend persists them.
- If optimistic state fails, restore the previous state and keep the user's draft/action context intact.
- Every async button should have a busy label that describes the current stage, not generic "Loading."

**Acceptance:** perform one action in each surface — import/sync, wiki ask or rebuild, Library filing, and command palette durable action. In each case, the user sees immediate acknowledgement, live status, a durable receipt after completion, and a recoverable failure state in tests. Paste before/after evidence for at least one success and one forced failure.

---

# CHAPTER 1 (the bet) — The Return Loop: the agent earns the daily open

**Goal:** opening Noeis cold, you immediately know **what changed, what needs attention, and the one good next move.** The morning paper today reports *maintenance* ("8 drift signals queued"); it must report *insight*.

### 1.1 Morning paper → an intelligent daily editorial
**Where:** read model `server/services/wikiBriefingService.js` composes the briefing; `note-taker-ui/src/components/wiki/WikiFrontPage.jsx` renders it; signals come from the scheduled worker's runs/revisions, freshness timestamps, claims, and the graph.
**Detect & surface (each only when real — quality-gated, never fabricated):**
1. **What changed overnight + why it matters** — pages refreshed by the scheduler, what new evidence arrived, what claim/support changed. (From maintenance runs/revisions since last visit.)
2. **Questions now answerable** — a `Question` whose linked concept/tag gained enough new evidence/highlights to answer it. ("Your question on hidden tradeoffs is now answerable.")
3. **Pages that gained source material** — weak/stale pages that got new backing sources (candidate to rebuild/deepen).
4. **New connections** — new graph edges between concepts since last visit.
5. **One high-quality next action** — a single, specific, do-able move (rebuild page X, answer question Y, file Z).
**Register:** keep the calm editorial voice; this replaces the mono "drift signals" machinery line as the lead substance. Honesty rule: if there's nothing real, say so quietly ("Quiet night — nothing drifted") rather than inventing.
**Acceptance:** open `/wiki` cold → within one screen you can name what changed and what to do next. Paste the rendered editorial.

### 1.2 Import receipts that feed the loop
**Where:** import sync handlers in `server/routes/importRoutes.js` (Readwise/Notion/Evernote) + the connections cards (`DataIntegrations.jsx`) + the morning paper.
**Build:** after a sync, persist + surface a structured receipt using the 0.5 receipt contract, not just a count: *"Readwise synced 47 highlights from 5 books → 18 attached to existing concepts, 9 opened new questions, 3 sources need filing."* The same receipt object feeds (a) the connections card status (the Notion-spec on-card status, generalized to all connectors), (b) the morning paper's "what changed," and (c) the quiet system-status affordance.
**Acceptance:** run a sync → connections card shows the rich receipt; the next morning paper references what that import changed. Paste both.

### 1.3 Temporal + contradiction queries (the remaining graph gap)
**Where:** `server/services/wikiAskService.js` corpus loader + the synthesis prompt.
**Build the two query types graph traversal doesn't yet handle:**
- **Temporal:** "what changed in my thinking on X over the last month" — use revision history / freshness timestamps to diff a concept's evolution.
- **Contradiction:** "where do these two pages disagree" — claims already carry support/contradiction roles; surface the conflicting claims explicitly.
**Acceptance:** both questions return answers that cite the specific changes / conflicting claims. Paste the replies.

---

# CHAPTER 2 — The action command surface (the differentiator)

**Goal:** the universal command (⌘K — "Search fragments", aria "Open command palette") stops being just search/route and becomes a **do** surface that completes the loop: **retrieve → synthesize → attach → leave a receipt.**
**Where:** the command palette component (grep `Search fragments` / `Open command palette`) + a new intent router that calls existing services (`wikiAskService`, the wiki build pipeline `/ai/draft/stream`, the filing pipeline, library/highlight search).
**Intents (each must produce a durable object + a receipt, not just a chat reply):**
- **Retrieve:** "find the highlight I saved about compounding from Munger" → opens/links the exact highlight.
- **Synthesize:** "turn my highlights on incentives into a wiki page" → builds the page (existing build pipeline) and reports it.
- **Compare:** "compare my notes on opportunity cost and loss aversion" → a synthesized comparison, optionally saved as a page/section.
- **Temporal:** "what changed since I last opened this concept" (shares Ch.1.3).
- **Maintain:** "clean up my imported Readwise books" → triggers the filing proposal (Ch.3a).
**Acceptance:** one plain-English command **creates or updates a durable object** (a page, a question, a filing) and leaves a visible receipt conforming to 0.5 — not just an ephemeral answer. Paste the command + the object it produced.

---

# CHAPTER 3 — Keep the brain clean + make shared pages count

### 3a. Library maintenance for real
**Where:** `Library.jsx` (filing UX), `server/services/collaborativeAgentService.js` (`cleanup_structure`), `server/services/agentRunExecution.js` (`inferOrganizationFolderName` — currently regex), `server/services/agentStructureExecution.js`.
**Build on the existing reviewable plan:**
- **LLM classification** replacing the regex buckets (better folder/concept assignment; keep regex as fallback).
- **Bulk accept/reject** on the filing proposal + **"why this category?"** one-line rationale per item.
- **Duplicate / source merge.**
- **"Turn these N highlights into a question / wiki section"** action.
- **Source quality states** (strong / thin / needs-review) so the pile is triageable.
**Acceptance:** after a Readwise import, the user sees a reviewable agent proposal — *"I sorted 235 imports into 7 shelves. Review 12 uncertain ones."* — with bulk accept and per-item reasons; unfiled drops meaningfully on accept. Paste before/after counts.

### 3b. Public shared-wiki pages: clarity + structure
**Where:** `note-taker-ui/src/pages/SharedWikiPage.jsx` + the public read endpoint.
**Build:** polish the public reader (typography, scroll), keep references visible + private backlinks disabled (already), clean adoption provenance, and add **semantic HTML + meta tags + JSON-LD structured data** so public pages are indexable / AI-answerable. (Product-structure now; the distribution payoff is later.)
**Acceptance:** a logged-out visitor understands what Noeis is within ~20s on a shared page; the page has valid structured metadata. Paste the rendered page + the head/meta.

---

## Sequencing & priority
1. **Chapter 0.5 foundation slice** — define the receipt contract + normalize import/connection receipts first so later features do not invent one-off feedback patterns.
2. **Chapter 1 (Return Loop)** — the bet. Ship 1.1 (intelligent morning paper) first; 1.2 (receipts) and 1.3 (temporal/contradiction) close behind and reinforce it.
3. **Chapter 2 (command surface)** — the differentiator, built on the working graph + Ch.1 detectors + the shared receipt/status contract.
4. **Chapter 3** — maintenance (3a) and public-page structure (3b).
5. **Polish backlog** runs alongside, never dominating — tracked in `noeis-design-polish-v2-spec-2026-06-25.md` (nav P0, list unification, lead clamp, graph-motif background, title backfill). Do the P0 nav fix regardless of chapter order.

## The line this draws
Chapter 1 is the line between "beautiful knowledge app" and "I trust this to help me think." Everything is gated on the agent producing **honest, real** signals — never fabricated insight. A quiet, true morning paper beats a busy, invented one.
