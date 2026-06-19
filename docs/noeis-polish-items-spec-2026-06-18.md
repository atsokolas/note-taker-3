# Spec — Polish items caught in the 2026-06-18 user test

**Authors:** Athan + Claude (live user test, `https://www.noeis.io`)
**Context:** The three big open items (graph-aware agent, library filing suggestions, wiki dark-mode) verified **fixed** in this test. Wiki build works and self-heals. These are the smaller things caught during that pass — polish + two investigations, not regressions.

**Ownership split (so Codex and Cursor don't collide):**
- **Cursor (frontend/CSS, isolated):** Item 1 (lingering "Failed to build" message), Item 2 (dark body token). See the Cursor prompt at the bottom — start these now.
- **Codex (backend/data/agent):** Item 3 (answer quality), Item 4 (corpus cruft), Item 5 (scheduler investigation).

**Global rule:** every item has a live repro. Reproduce the symptom on production first, fix, then reproduce again and paste the before/after in the PR. Do not close from a unit test alone. Frontend changes must pass `CI=true npm run build` (warnings = errors) and `npm run wiki:qa` before push.

---

## Item 1 (P2, Cursor) — "Failed to build" message lingers after the agent self-heals

### Live symptom
Run `/build <Topic>` in the wiki workspace chat (the composer with placeholder *"Ask, paste a source, or type / for wiki commands"*). When the first draft misses quality gates, the agent correctly self-recovers — the chat shows:
> `Created ECONOMIC MOATS. Drafting it now.` → `Failed to build a wiki page for "Economic Moats".` → `The first draft missed quality gates, so I am rebuilding it once with stricter instructions.` → `Agent ready for Economic Moats.`

The page ends up **perfect (921 words, 20 claims)** — but the red/alarming **`Failed to build a wiki page`** line stays in the chat log. To a user it reads as a failure even though it succeeded.

### Fix
The failure line should not persist once the retry succeeds. Either (a) remove/replace the failed-attempt message when the subsequent attempt completes, or (b) reframe it inline as a non-alarming step (e.g. *"First pass needed another try — rebuilding with stricter instructions."*). Preferred: reframe, so the self-healing is visible but reads as competence, not error.

### Where to look
- Grep the frontend for the literal string `Failed to build a wiki page` and `rebuilding it once with stricter instructions` to find the emit/render site.
- The wiki workspace chat + build stream handling lives in `note-taker-ui/src/components/wiki/WikiWorkspace.jsx` (stream/activity handling ~lines 2287–2316). The build stream is `POST /api/wiki/pages/:id/ai/draft/stream` (`server/routes/wikiRoutes.js:2147–2245`) with stages `maintaining → drafted → saved → graph_synced → complete`. If the "Failed" string is emitted server-side as an activity receipt, the **clear-on-success** still belongs in the frontend chat state (don't change the backend retry logic — Codex is verifying that path).

### Test instructions (do this live)
1. On `/wiki/workspace`, run `/build <a topic likely to trip the quality gate once>` (Economic Moats reproduced it). 
2. Watch the chat. Confirm: after the page completes, **no standalone "Failed to build" line remains** — it's gone or reframed as a recovery step.
3. Confirm the built page itself is unaffected (words/claims populate, status Draft).
4. Paste the final chat transcript in the PR.

---

## Item 2 (P3, Cursor) — Finish the dark token at the body level on `/wiki`

### Live symptom
On `/wiki` in dark mode the front page now renders warm (good — `.wiki-front-page` computes `rgb(20, 17, 13)`), **but `document.body` is still `rgb(13, 20, 34)`** (cool blue-black). The warm container covers the viewport so it's not visible in normal scroll, but the cool body can flash on overscroll/rubber-band bounce and anywhere the container doesn't paint.

### Root cause (from prior recon)
- Cool body color: `--bg-shell: #0d1422` in `note-taker-ui/src/styles/dashboard-refresh.css` (~line 29, dark), applied via `body { background: var(--bg-shell); }` (~line 44).
- Warm token: `--vellum-bg: #14110d` (`note-taker-ui/src/styles/stitch-editorial.css` ~line 145), applied to `body.noeis-editorial` (~line 56, `!important`).
- The front-page container was already repointed to warm (`wiki-front-page.css`). The body stays cool because either `noeis-editorial` isn't on `<body>` for the `/wiki` route, or `dashboard-refresh.css`'s `body` rule wins.

### Fix
Make `<body>` warm on `/wiki` like it is on `/wiki/workspace` (which renders correctly). Confirm whether `noeis-editorial` is on `<body>` for the front-page route; if missing, add it where WikiFrontPage mounts. If present but overridden, ensure the warm `body.noeis-editorial` rule outranks `--bg-shell`. Use the existing `--vellum-bg` / `--canvas` (`theme.css` ~line 69, `#16140f`) tokens — **do not introduce a new color literal.**

### Test instructions (do this live)
1. Dark mode, `/wiki`. In console: `getComputedStyle(document.body).backgroundColor` → must be `rgb(20, 17, 13)` (or `#14110d`).
2. Overscroll/rubber-band at the top and bottom — no blue tint visible.
3. Verify no regression: check `getComputedStyle(document.body).backgroundColor` on `/`, `/library`, `/think`, `/wiki/workspace` in dark mode (all warm), and light mode unchanged everywhere.
4. Paste the measured values in the PR.

---

## Item 3 (P3, Codex) — "Summarize this page in one sentence" returns a mid-page point, not a whole-page summary

### Live symptom
On the Investing page, asked *"Summarize this page in one sentence."* The routing was correct (stayed single-page, fast, 1.3s) but the answer was a single narrow claim — *"Practitioners who possess deep sector expertise may profit from a narrow focus, but they must maintain rigorous risk limits…"* — rather than a summary of the whole page. Instruction-following on summarize/overview-type asks is loose.

### Fix
In the single-page wiki answer path (the `collaborativeAgentService` wiki branch, per `noeis-open-items-spec-2026-06-14.md`), detect summarize/overview/TL;DR intents and synthesize from the page's overview + section structure rather than returning one retrieved sentence. Keep it one sentence when asked for one, but make it represent the page.

### Test instructions (do this live)
1. Open a multi-section wiki page. Ask "Summarize this page in one sentence." → the sentence should cover the page's main thesis, not a single sub-point.
2. Ask "Give me a 3-bullet overview." → bullets should span the major sections.
3. Confirm a normal cross-concept question still routes to the graph (don't regress Item 1 of the open-items spec).

---

## Item 4 (P2, Codex) — Garbled/junk pages are polluting the graph, Explore, and retrieval

### Live symptom
- The agent's retrieval receipt listed a page titled **"Complementary Machine Thing"** (nonsense).
- The wiki Explore index shows **"Cia Teach Investor Behavioural Investment"** (garbled).
These surface in Explore, in "related pages," and in agent receipts. They don't crash anything but they erode trust ("why is my encyclopedia citing gibberish?").

### Fix (two parts — do NOT auto-delete the user's data)
1. **Investigate origin:** why are malformed-title pages being created? Likely a bad `/build` parse or an import artifact. Find and stop the source so new ones aren't minted.
2. **Defensive surfacing:** add a guard so obviously-malformed/low-quality pages (e.g. empty body, failed-draft stubs, non-topic titles) are excluded from Explore + related-page retrieval until they pass a quality bar — without deleting them.
3. **Surface for the owner:** give the user a clear way to find and delete these (a "needs review / low quality" filter), rather than the system silently removing pages.

### Test instructions
1. Reproduce: load `/wiki`, confirm whether garbled titles still appear in Explore.
2. After fix: garbled/empty pages no longer appear in Explore or in agent retrieval receipts.
3. Confirm a legitimate new `/build` page still appears normally.
4. Report what was creating the malformed pages.

---

## Item 5 (P1 investigation, Codex) — Confirm whether a scheduled refresh actually runs

### Why
Both `noeis-onboarding-spec-2026-06-18.md` (the "while you slept" hook) and `noeis-wiki-adoption-spec-2026-06-18.md` (the "kept updated" promise) depend on an overnight/background refresh. During this test multiple pages showed *"reviewed 2h ago"* and the morning paper auto-featured a page built minutes earlier — but that could be session-triggered maintenance, not a scheduler. Prior recon found **no cron/scheduled job** — maintenance appeared on-demand only (`wikiMaintenanceService.js` runs on click; `wikiBriefingService.js` only compiles stats).

### Task (investigation, report — don't build yet)
- Confirm definitively whether any scheduled/background refresh exists (search `cron`, `schedule`, `setInterval`, `node-cron`, `agenda`, `bull`, queue workers, Render cron jobs, and any "morning"/"nightly"/"drift" trigger).
- Explain what actually produced the "reviewed 2h ago" timestamps and the morning-paper auto-feature.
- If no scheduler exists: state that clearly. It's then a **separate prerequisite** to build for onboarding + adoption — scope it as its own task, don't fake it.
- Report findings in the PR description; this gates the two big specs.

---

## Summary table

| # | Item | Owner | Sev | Type |
|---|---|---|---|---|
| 1 | "Failed to build" lingers after self-heal | Cursor | P2 | FE polish |
| 2 | Dark body token still cool on `/wiki` | Cursor | P3 | CSS |
| 3 | Summarize answer is a mid-page point | Codex | P3 | Backend prompt |
| 4 | Garbled pages pollute graph/Explore | Codex | P2 | Backend/data |
| 5 | Confirm scheduled refresh exists | Codex | P1 (investigate) | Investigation |
