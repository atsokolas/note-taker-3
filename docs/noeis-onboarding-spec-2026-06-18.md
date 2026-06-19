# Spec — New-user onboarding: from empty to a living wiki

**For:** Codex
**Author:** Athan + Claude (product session, 2026-06-18)
**One-line:** The Wiki is the product, but a new wiki is empty. Onboarding's only job is to get a user from nothing to *a wiki page the agent wrote from their material* as fast as possible, then give them a reason to return tomorrow.

**The good news:** ~80% of the plumbing already exists. This is mostly **orchestration** of existing pieces into a narrative, plus three genuinely new bits (paste-a-link ingest, starter packs, the first-run orchestrator). See the reuse map in §6.

---

## 1. The two ahas (design around both, in order)

- **Thin aha** — one good page from one source. ~90 seconds. "I dropped in an article, the agent wrote me a cited encyclopedia entry." Instant, personal, works with zero prior content.
- **Thick aha** — the *graph*: morning paper, "recently grown," pages linking pages. Needs ~5 overlapping sources. Can't be faked minute one.

**Rule: deliver the thin aha immediately, make the thick aha inevitable.** Never make a user import 50 things before they see anything.

## 2. Two personas, one magic moment

Onboarding must serve both and converge them on the same payoff (watch the agent build → land on a living page → return hook).

- **Persona A — Cold (no base).** Arrives with nothing to connect. Risk: blank wiki, no magic. Manufacture the thin aha from one pasted thing; offer a starter pack to *show* the thick aha before they've earned it; turn saving into a habit so the corpus grows.
- **Persona B — Importer (Readwise / Kindle / Notion / Evernote).** Has a library. Connect → inhale → cluster → build first pages live → thick aha fast → turn on continuous sync.

## 3. The arc: Show → Feed → Build → Hook

One narrative, not a tour. Do **not** open the three cabinets. Lead with Wiki as the payoff; keep Think hidden until after trust is earned.

### Screen 1 — SHOW (≈5s)
Land a brand-new user on a **real, pre-built example wiki page** (gorgeous, cited, alive — e.g. the existing "Loss Aversion" page rendered read-only), with one line over it:
> *"This is what Noeis builds from your reading. Let's make yours."*
One primary button: **Start** → Screen 2. Sell the destination before asking for anything.

### Screen 2 — FEED (≈15s) — the self-segmenting fork
One screen that lets the user self-identify, no forced quiz:

- **Primary block — "Connect your reading"** (Persona B): the existing connectors as a grid — Readwise, Kindle (via Readwise), Notion, Evernote, upload file. Reuse `DataIntegrations.jsx` cards + existing OAuth/token flows (§6).
- **Secondary block — "Don't have a library yet? Start with one thing"** (Persona A):
  - **Paste a link or text** — hero of the cold path. "Drop in something you read this week." (NEW endpoint, §6.)
  - **"Just show me an example"** — load a **starter pack** (§5) so a skeptic sees the full graph with zero personal content.
  - **Adopt a shared wiki** — if the user arrived via a `/share/wiki/:id` link, "Make this mine" *is* their feed (see `noeis-wiki-adoption-spec-2026-06-18.md`). This is also the growth loop: a shared link → signup → onboarding with content already built.

Both blocks lead to the same Screen 3.

### Screen 3 — BUILD (the magic, 60–90s)
This is the moment the whole product turns on. **No spinner. Ever.** Show the agent *thinking out loud* as it metabolizes, reusing the existing SSE draft stream (`POST /api/wiki/pages/:id/ai/draft/stream`, stages `maintaining → drafted → saved → graph_synced → complete`). Map each stage to a human narration line:

- Importer: *"Reading 312 highlights across 14 books… clustering into topics… your strongest cluster is decision-making… drafting 'Loss Aversion'… pulling 4 claims… linking to 'Opportunity Cost'…"*
- Cold (pasted article): *"Reading what you dropped in… extracting the claims… drafting 'X'… citing the source…"*

Words appear on the page in real time. A small counter climbs: `1 page · 6 claims · 2 links`. The **build is the onboarding** — the product demonstrates itself.

- Importer builds the **top cluster's page first** (fastest relevance), then continues 2–3 more in the background so the morning paper has a graph.
- Cold builds **one** page (thin aha), then nudges toward the next source.

### Screen 4 — HOOK (≈10s) — the reason to return
Land the user on their freshly-built page, alive. Then the return promise, tuned per persona:

- **Importer:** *"Tomorrow morning, Noeis will have grown this while you slept."* → one toggle to enable continuous Readwise/Notion **auto-sync** (cadence). This is the morning-paper loop, established day one. **Depends on the overnight refresh scheduler — Codex must check and confirm it exists (recon found maintenance is on-demand only); if not, it's a separate prerequisite. See §5.4 and the adoption spec §7.**
- **Cold:** *"Add 2 more sources and your pages start connecting."* → install the **browser extension** (already built) / share-sheet so saving becomes a habit, plus a gentle "feed me one thing a day" cadence. Cold users need a *habit*, not just a sync.

End on the return promise, **not** a "You're all set ✓" checkmark.

## 4. Magic details (cheap, high-leverage)

- **Narrate, never spin.** Every second of the build names what the agent is thinking. This narration *is* the product's personality.
- **First page is about *them*, fast.** Importers: pick the topic with the most highlights. Cold: whatever they pasted.
- **Counter that climbs** as the page grows — makes the graph feel like it's forming under their hands.
- **"While you slept" is the retention spine** — set the expectation on day one that returning = something new exists.
- **Honest sample.** Starter-pack pages are clearly badged *"Sample — feed me your reading to make these yours,"* with a one-click "clear sample" once real content lands.

## 5. New work (the ~20% that doesn't exist yet)

1. **Paste-a-link / paste-text ingest** (cold path's thin aha). No endpoint today. Add `POST /api/import/url` (server-side fetch + Readability extract — **reuse the extension's `fetch-article.js` / `Readability.js`**) and `POST /api/import/text` (raw text → source). Each creates a source and fires the existing wiki source event so a build can follow immediately.
2. **Starter packs (= first-party adoptable wikis).** The locked set is in §9. **Implement packs as official shared wikis adopted via the adoption feature** (`noeis-wiki-adoption-spec-2026-06-18.md`), not a separate seeding path — one mechanism, two uses. A pack is a first-party `visibility:'shared'` collection; "Just show me an example" runs the same adopt flow, badged *"Sample — feed me your reading to make it yours,"* with one-click "clear sample." This avoids building a parallel `isSample` seeding system.
3. **First-run orchestrator.** Replace the dismissible checklist (`OnboardingManager.jsx`) with the Show→Feed→Build→Hook arc, gated on a new-account flag + zero-content detection (reuse the empty-state detection in `WikiFrontPage.jsx:201`). Keep the checklist as a fallback "resume onboarding" affordance. Must also accept a carried `/share/wiki/:id` adopt hand-off (logged-out adopt → signup → land here with content already built).
4. **Return hook wiring + scheduler check.** Surface the auto-sync cadence toggle and the extension-install nudge at the end of the arc. **Dependency: Codex must check and confirm whether a server-side scheduled refresh exists** (recon found maintenance is on-demand only — no cron; `wikiBriefingService` only compiles stats). If a scheduler exists, just expose it; if not, the overnight "while you slept" grow is a **separate prerequisite** to build — flag it in the PR, don't fake it. (Same dependency as adoption spec §7.)
5. **Build narration layer.** A mapping from SSE stages → human "thinking" copy, with the climbing counter. Pure frontend on top of the existing stream.

## 6. Reuse map (what already exists — do NOT rebuild)

| Need | Already exists | File |
|---|---|---|
| Readwise connect (OAuth + token + CSV) | ✅ | `server/routes/importRoutes.js:1213–1650`, `server/services/import/readwiseClient.js` |
| Notion connect (OAuth) | ✅ | `server/routes/importRoutes.js` (Notion block), `note-taker-ui/src/api/imports.js:82` |
| Evernote / Markdown upload | ✅ | `server/routes/importRoutes.js:2342–2795` |
| Connector cards UI + activation tracking | ✅ | `note-taker-ui/src/pages/DataIntegrations.jsx` |
| Browser extension (Readability capture) | ✅ | `manifest.json`, `content.js`, `fetch-article.js`, `Readability.js` |
| **Live build stream (the magic)** | ✅ SSE stages | `server/routes/wikiRoutes.js:2147–2245` (`/ai/draft/stream`), `note-taker-ui/src/api/wiki.js:185` |
| Wiki page create + autolink/graph sync | ✅ | `server/routes/wikiRoutes.js:1911–1965`, `syncPageGraph()` |
| Empty-state detection | ✅ | `note-taker-ui/src/components/wiki/WikiFrontPage.jsx:201–221` |
| Onboarding gate (localStorage) | ✅ (replace) | `note-taker-ui/src/components/OnboardingManager.jsx` |
| Import session state machine + post-import suggestions | ✅ | `server/routes/importSessionRoutes.js` |
| Signup (no auto-seed today) | ✅ | `server/routes/authDiscoveryRoutes.js:44–75` |

## 7. Acceptance criteria

1. A brand-new account that **connects Readwise** sees: connect → live build narration (not a spinner) → lands on a real wiki page built from their highlights → auto-sync hook. Time-to-first-page measured and reported.
2. A brand-new account with **no library** can paste a URL or text and watch one page build live, landing on it in under ~2 minutes, with zero connectors.
3. **"Just show me an example"** loads a starter-pack graph (multiple linked pages), clearly badged as sample, with a working "clear sample."
4. The build screen never shows a bare spinner — it always narrates a stage and shows the climbing counter.
5. The flow ends on the return promise + an enabled continuous feed (auto-sync for importers, extension nudge for cold), not a static "all set."
6. Onboarding fires only for genuinely new/zero-content users; returning users never see it; it's resumable.
7. Live verification on production, both personas, before close.

## 8. Metrics to instrument (so we can tell if it works)

- **Time-to-first-page** (signup → first agent-built page rendered) — the north star.
- Activation: % of new users who reach a built page in session 1.
- Feed-path split: connect vs paste vs starter-pack.
- D1/D7 return rate, and % who enabled a continuous feed during onboarding.

## 9. Starter packs — locked set

Tuned to the ICP (the live library skews investing / Munger / mental models, and these pages already exist in the seed wiki — Loss Aversion, Opportunity Cost, Circle of Competence, Margin of Safety, First Principles, Compound Interest — so pack #1 is demonstrable today). Each pack is a first-party adoptable shared wiki (§5.2). Ship these three; a user picks one (or "surprise me"):

1. **Mental Models** *(default / hero pack)* — the Munger latticework. Pages: First Principles Thinking, Opportunity Cost, Margin of Safety, Circle of Competence, Incentives, Compound Interest, Inversion. The richest graph (heavily inter-linked) → best thick-aha demo, and it mirrors what the product already builds.
2. **Behavioral Economics & Decision-Making** — Loss Aversion, Prospect Theory, Anchoring, Availability Heuristic, Base Rates, Hyperbolic Discounting. Tight cluster, great for showing claims + citations.
3. **How to Think About AI** — Scaling Laws, Agents, Context Windows, Evals, Capability vs Alignment. For the tech-curious newcomer; broadens reach beyond finance.

*(Optional 4th if we want a value-investing on-ramp matching the Poor Charlie's / Intelligent Investor highlights in the library: **Value Investing** — Intrinsic Value, Moats, Mr. Market, Capital Allocation, Owner Earnings.)*

Each pack page is badged as sample until the user feeds their own material; "clear sample" removes the pack in one click.

## 10. Open product decisions (for Athan)
- **Cold-user nudge cadence:** default is to prompt for source #2 *immediately* after the first page builds, while the aha is hot. Soften if it feels pushy.
- **Pack count:** ship 3, hold the optional Value Investing 4th unless you want it in v1.
- **Adoption spec** (`noeis-wiki-adoption-spec-2026-06-18.md`) carries its own decisions (anonymous vs credited authors, collections in v1, snapshot-only) — they affect the "Adopt a shared wiki" on-ramp here.
