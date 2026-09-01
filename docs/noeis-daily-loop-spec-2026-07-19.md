# Spec — The Daily Loop: world-aware paper, email edition, claim check-ins

**For:** Codex
**Author:** Athan + Claude (strategy synthesis, 2026-07-19)
**Thesis:** Noeis becomes a daily tool by borrowing the world's clock. The corpus is the lens; the world (filings, releases, transcripts, feeds) is what changes every day. The daily shape is: **world-aware morning paper → delivered by email → closed with a one-tap ritual (claim check-in / return path) → fed by frictionless capture.** This spec covers the three core mechanics. Everything here is assembly of machinery that already exists — watchers, briefing precompute, claims, receipts — plus one new subsystem (email delivery).

**What already exists — build ON this, do not rebuild:**
- **Three watcher services, shipped:** `edgarWatcherService.js`, `earningsTranscriptWatcherService.js`, `githubRepoWatcherService.js`, with `externalWatches` schema on wiki pages (`sec_edgar | earnings_transcript | github | reading | manual`) and ticker fields (`server/models/index.js` ~384, 512–594).
- **Morning paper:** precomputed briefing (<500ms), cache-first render, return-path card, receipts integration. (`wikiBriefingService.js`, `WikiFrontPage.jsx`.)
- **Claims with sources + support/contradiction roles** on every page; revision history via maintenance runs.
- **Receipt/status contract (Ch.0.5)** for connect/sync/background states.

**Verification rule:** every item has a live acceptance test on `https://www.noeis.io`; paste before/after evidence in the PR. No closing from unit tests alone.

---

## Part 1 — Watchers become the paper's front page (the clock)

**Goal:** the morning paper's lead is driven by *world events read through the user's pages*, not by maintenance bookkeeping. The three watchers exist; this is wiring + one addition.

### 1.1 Watcher events must outrank maintenance events in the briefing
**Where:** `wikiBriefingService.js` composition + the scheduled worker.
**Build:** when a watcher ingested something since last visit (new filing, new release, new transcript), the paper leads with it, framed against the page it watches: *"NVDA filed a 10-Q yesterday — two claims on your Nvidia dossier gained evidence; one is now contradicted."* Maintenance-only news ("8 drift signals") becomes the quiet fallback, never the headline when world events exist.
**The claim-impact line is the product:** each watcher event should state which claims it touched (supported / contradicted / new evidence), using the existing claim roles. If impact analysis hasn't run yet, say honestly "not yet analyzed — queued."
**Acceptance:** with a ticker watch on a dossier, a new filing produces a paper lead naming the page and the claim impact. Paste the rendered paper.

### 1.2 Add the `reading` watcher (RSS/topic) — the one missing type
**Where:** new `readingWatcherService.js` following the exact pattern of the other three; the enum value already exists.
**Build:** watch an RSS/Atom URL (Substack, blogs) per page or per user; new items become candidate sources for the pages whose topics they match (reuse the filing/relevance scoring from library maintenance). This turns any newsletter into fuel without Readwise.
**Acceptance:** watch a Substack feed; a new post appears as a candidate source on the right page and in the paper.

### 1.3 One watchers surface
**Where:** a "Watching" section on the wiki front page (or Connections) listing every armed watcher with its Ch.0.5-style receipt: *"EDGAR · NVDA · last filing 10-Q Jul 16"*, *"GitHub · openai/agents-js · head abc123"*. One place to see the product's peripheral vision; arm/disarm inline.
**Acceptance:** all armed watchers visible in one list with last-event receipts; arming a new one from there works.

---

## Part 2 — The email edition (the delivery)

**Goal:** the paper arrives; the user doesn't have to remember to visit. The email IS the morning paper — same editorial content, rendered for the inbox.

### 2.1 Infrastructure (new subsystem — keep it boring)
- Provider: **Resend or Postmark** (transactional, simple API, good deliverability). Server-side API key; env-gated (`EMAIL_DISABLED=true` default in dev).
- New `server/services/morningPaperEmailService.js`: renders the precomputed briefing (the same read model — do NOT recompute) into a clean HTML email in the editorial register: serif headline, the lead paragraph, RETURN PATH as the single primary button, claim check-in as the secondary block (Part 3), plain-text fallback.
- Scheduler: a daily cron in the existing worker infrastructure (per-user send hour, default 7:00 local; store timezone on user settings).
- **Controls:** Settings → "Morning paper by email" toggle (default OFF; invite existing users via a one-time prompt), one-click unsubscribe link in every email (List-Unsubscribe header + token URL, no login required). Never send when the briefing is quiet AND empty — skip the day instead of sending filler ("no-news days send nothing" is a feature; say it in settings copy).

### 2.2 The email's job is one click
Every link deep-links: the lead → the affected page, RETURN PATH → the action, check-in → the claim. Email opens are step one; the success metric is **email → in-app return rate**.
**Acceptance:** enable email for the founder account; receive a real morning edition driven by a real watcher event; every link lands correctly logged-in (or via magic-link if session expired). Paste the received email + click-throughs. Forced-failure test: unsubscribe works instantly.

---

## Part 3 — Claim check-ins (the ritual)

**Goal:** a one-tap daily act that compounds the wiki and builds the habit: the agent resurfaces ONE claim; the user reaffirms, revises, or retires it. Judgment's spaced repetition — no competitor has it.

### 3.1 Model
**Where:** extend the existing claim schema (claims live on wiki pages) with a check-in state:
```
checkIn: {
  status: 'unreviewed' | 'reaffirmed' | 'revised' | 'retired',
  lastCheckedAt: Date,
  history: [{ action, at, note?, evidenceDelta? }]   // append-only
}
```
No new collection; claims stay on pages. History is append-only — this becomes "your thinking, versioned" over time.

### 3.2 Selection — one per day, chosen well
Priority order for today's check-in claim: (1) a claim whose sources changed since last check (watcher/contradiction event — ties the ritual to the clock); (2) oldest unreviewed claim on a page the user actually visits; (3) a claim on today's Today's-Page. Never repeat within 14 days. Quality gate: only claims with ≥2 sources (thin claims aren't worth ritualizing).

### 3.3 Surfaces
- **Morning paper (web + email):** a quiet block after the lead — the claim text, its page, what changed since you adopted it, three buttons: **Still hold · Revise · Retire**. Revise opens the page at the claim with the composer prefilled; Retire asks one confirm and marks it (visible strikethrough state on the page, not deletion).
- **After the tap:** the mono register acknowledges — `reaffirmed · 4th time · held 212 days` — and the paper's masthead can carry the streak quietly: `12 consecutive mornings`. No badges, no confetti. The register IS the reward.
**Acceptance:** morning paper shows one well-chosen claim; each of the three actions works and writes history; the claim's page reflects the state; next day selects a different claim. Paste the flow.

---

## Sequencing
1. **Part 1.1** (watcher events lead the paper) — biggest daily-value lift, pure wiring.
2. **Part 3** (check-ins) — small model + two surfaces; ship web-first before email exists.
3. **Part 2** (email edition) — new subsystem; ship once 1+3 make the email worth receiving.
4. **Part 1.2/1.3** (reading watcher + watchers surface) alongside as capacity allows.

## Out of scope (explicitly, for now)
Thought-inbox / share-sheet capture, follows/social layer, second-opinion protocol, streak mechanics beyond the quiet counter. They layer on after the loop proves retention with the 3–5 proof users.

## The line
The test for every piece: **does it survive a busy Tuesday?** A paper that leads with the world's news through your pages, lands in your inbox, and asks for one honest tap — that survives. Anything that demands ceremony doesn't. Ship the metabolism; the magic already lives in the pages.
</content>
