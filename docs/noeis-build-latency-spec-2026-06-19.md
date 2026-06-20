# Spec — Wiki build latency: get time-to-readable-page under 30s

**For:** Codex
**Author:** Athan + Claude (live timing + pipeline trace, 2026-06-19)
**Problem:** Building the first wiki page (onboarding paste → draft stream) takes **60–120s** on production. Measured live this session: 115s+ on one run. The dead-air ticker (P1) stops it *looking* frozen, but the absolute wait is now the #1 bounce risk in the new-user funnel — a 2-minute loading screen at the highest-stakes moment of a first session.

**Goal:** **Time-to-readable-page (TTRP) < 30s**, ideally < 15s perceived. "Readable" = the user is looking at their actual page body (or the Hook with the page ready), not a loading screen. Total-to-fully-enriched can stay longer *as long as it's off the critical path.*

**Verification rule (MANDATORY — paste in PR):** time it live on `https://www.noeis.io`. Run the onboarding paste path, paste the **wall-clock seconds** from "Build" click → readable page, before and after, for 3 runs. A unit test does not close this. (This discipline is non-negotiable — see the polish/door specs.)

---

## Where the time actually goes (traced 2026-06-19)

Pipeline: `POST /api/wiki/pages/:id/ai/draft/stream` (`server/routes/wikiRoutes.js:2705–2784`) → `maintainWikiPage()` (`server/services/wikiMaintenanceService.js:1329–1586`) → autolink/graph/revision. **Everything is sequential and blocking.** Budget:

| Step | Type | Est. | On critical path? |
|---|---|---|---|
| collectLibrarySources + collectKnownWikiPages | DB (parallel-ish) | 3–7s | yes |
| **LLM call #1 — initial draft** | LLM, blocking, ~10.75k-token context | **25–40s** | yes |
| materialize + quality gate | local | 2–3s | yes |
| **LLM call #2 — quality rebuild** (fires ~40% of builds, any failure) | LLM, blocking, bigger | **+30–50s** | yes (today) |
| applyAutolinksForPage (target page) | DB scan 600 + local | 1–3s | yes |
| syncPageGraph (target page) | DB delete+insert | 0.5–2s | yes |
| **autolinkPagesToTarget — backlink OTHER pages** | DB loop over 600, per match: save + syncPageGraph + revision | **5–30s** | yes (today) ← shouldn't be |
| createWikiRevision | DB | <0.5s | yes |

**Median ≈ 90s. Two facts dominate:**
1. **The LLM work can run twice** (draft + near-automatic rebuild), and both are fully blocking with no token streaming.
2. **~15–35s of the wait is work on *other* pages** (backlinking the rest of the graph to the new page) — the user is held on a loading screen while the system updates pages they aren't even looking at.

---

## Fixes, ranked by leverage

### Fix 1 (P0, biggest cheap win) — Get the user off the critical path the moment THEIR page is ready
The user is waiting on `complete`, but steps after the page body is materialized + saved only update **other** pages / the graph. Move them off the request.

- After `maintainWikiPage` produces the page body and the page is saved, **emit `complete` / release the user immediately** (route to Hook / render the page).
- Run `autolinkPagesToTarget` (backlinking other pages — `wikiRoutes.js:2015–2048`), and ideally `syncPageGraph` for other pages, **after** the response, as fire-and-forget background work (or hand to the existing `wikiScheduledMaintenanceWorker`). The new page's *own* outbound autolinks (`applyAutolinksForPage`) can stay if cheap, but the 600-page backlink loop must not block.
- Expected saving: **5–30s off TTRP**, zero quality loss (backlinks appear seconds later, the user is already reading).

### Fix 2 (P0) — Stop making the user wait for the quality rebuild
Today any quality-gate failure triggers a second full LLM call inline (`wikiMaintenanceService.js:1422–1497`), ~40% of builds, +30–50s. The user is already getting a decent first draft.

- **Show the first draft as the page; do the rebuild in the background** (next maintenance pass / scheduled worker), not inline. The user reaches a readable page after call #1; the page quietly improves later (that's the whole "kept updated" model).
- If you must keep an inline rebuild, gate it to *severe* failures only (e.g. ≥3 failures or empty body), not any single failure — and never inline during the onboarding first-build.
- Expected saving: removes a 30–50s call from ~40% of builds' critical path.

### Fix 3 (P1) — Stream the draft so perceived latency drops during call #1
The 25–40s draft is a single blocking `await chat(...)` (`wikiMaintenanceService.js:1367`); the client sees nothing until it's fully done.

- Switch the draft call to streaming and pipe tokens/partial body to the SSE so the page **writes itself onscreen** as it generates (the onboarding already has a narration surface and the wiki build elsewhere streams in place — reuse that).
- Doesn't cut total time, but turns 30s of "elapsed…" into watching the article appear — which is also more on-brand (the metabolize moment).

### Fix 4 (P1) — Cut the input context, especially for the first build
The draft prompt stuffs **24 sources × up to 1,300 chars ≈ 31KB ≈ ~10.75k tokens** (`wikiMaintenanceService.js:421–427`, `DEFAULT_SOURCE_LIMIT = 24`). Big input = slow inference.

- For the **onboarding first build**, drop to ~6–8 candidate sources and ~600–800 chars each. The first page does not need the whole library; the scheduler deepens it later.
- Consider a lower `DEFAULT_SOURCE_LIMIT` generally, or summarize sources before stuffing. Expect ~30–40% faster inference on call #1.

### Fix 5 (P2) — Trim the DB work
- `autolinkPagesToTarget` and `applyAutolinksForPage` scan up to **600** pages (`wikiRoutes.js:2022`, `wikiAutolinkService.js`). Limit to the most-recently-updated ~150 for the inline path; full sweep can be background.
- When backlinking does run (background per Fix 1), **batch** the per-page `save + syncPageGraph + createWikiRevision` (currently a sequential nested loop) with bounded concurrency (~10) instead of one-at-a-time.

### Fix 6 (P2) — Onboarding fast-path config
Give the first onboarding build an explicit "fast" profile: fewer sources (Fix 4), no inline rebuild (Fix 2), all graph/backlink work deferred (Fix 1). The first page should land fast and thin-but-real; the 6h scheduler + next visit enrich it. This is the single most important build in the product — optimize it specifically.

---

## Suggested target after fixes
- Onboarding first build TTRP: **draft-only, ~6 sources, no inline rebuild, deferred graph work → target 10–20s** (or perceived-instant if streamed per Fix 3).
- Normal page build TTRP: **< 30s** (one streamed LLM call + materialize + save; everything else background).

## Acceptance criteria (paste live evidence in PR)
1. Onboarding paste→readable-page wall-clock, 3 runs, before vs after. Target median TTRP < 30s (ideally <20s for the onboarding fast-path).
2. Confirm backlinking/graph-sync of *other* pages no longer blocks the user — i.e. the page is readable before those finish (note the deferral in the PR; show the page is reachable while backlinks settle after).
3. Confirm the quality rebuild no longer runs inline on the onboarding first build (or only on severe failures) — paste a build log/timeline showing a single LLM call on the happy path.
4. No regression in final page quality after background enrichment runs (claims/citations/links still populate within a maintenance cycle).
5. If streaming was added (Fix 3): confirm the page body visibly appears progressively, not in one jump.

## Don't break
- The agent cross-graph reasoning, the morning-paper, and the existing `wikiScheduledMaintenanceWorker` (6h) are working — deferred work should ride that worker / a background job, not a new parallel system.
- Keep the live narration / elapsed ticker (P1) as the fallback for whatever still takes a few seconds.
