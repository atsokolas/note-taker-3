# Spec — Return Loop fixes (post-live-test)

**For:** Codex
**Author:** Athan + Claude (live user test on `https://www.noeis.io`, logged-in real account, 2026-06-29; extended with a full product/feel audit later the same day)
**Context:** The return-loop push (commits `ce38378b` + `bb3a17fb`) is mostly working — the morning paper, graph ask, status chip, and filing review UI all shipped and verified live. This spec covers the gaps found while driving the product as a user, plus a measured feel/perf audit and a reading-surface audit. Two of the three "action" payoffs are currently hollow (⌘K can't create; filing proposes with a dumb classifier you can barely reach), the daily-open surface waits ~10s on a recomputed briefing, and the flagship reading surface leaks raw wikilink markup. These are the fixes.

**Verification rule:** every item has a live repro on `https://www.noeis.io`. Reproduce the symptom, ship, then reproduce again and confirm it changed. Paste the actual before/after (screenshot or API result) in the PR. Do not close from a unit test alone.

## Codex status addendum — 2026-07-02

This section reflects repo state after commits through `115e42a2`. Keep the original repros below as historical evidence, but execute against this current status so parallel agents do not reopen stale items.

**Confirmed already addressed in code:**
- **P0-1 Command Palette create actions** — `CommandPalette.jsx` now pins the Actions section above async search results in the query branch, with focused coverage for "keeps create actions pinned above async search results so clicks do not drift," wiki page creation, and collection creation.
- **P0-2 Think `threadId` deep links** — `ThinkMode.jsx` now preserves explicit `?threadId=` instead of replacing it with the newest thread, and library filing receipts include `/think?tab=threads&threadId=<id>`.
- **P1-1 filing rationale/classifier path** — the current filing flow uses `server/services/libraryFilingService.js`, which supports LLM classification, regex fallback, confidence/source-quality metadata, and per-operation rationale. The older regex path in `agentRunExecution.js` remains for other agent-run flows but is not the primary Library "Review filing suggestions" route.
- **P1-2 stale filing proposal default** — the Library UI calls `startLibraryFilingSuggestions()` without `resumeExisting`; the route only reuses old proposals when the request explicitly sets `resumeExisting`.
- **P2 lead/title carry-overs** — `WikiFrontPage` no longer reveals the lead word-by-word, and `scripts/normalize_wiki_titles.js` safely backfilled the obvious stored title cases (`Availability Heuristic`, `Endowment Effect`, `Circle of Competence`) without changing slugs.
- **P0-0 raw wikilink markup leak** — `renderTiptapDoc` now sanitizes literal `[[...]]` text, including malformed citation-interleaved forms such as `[[ [2,3]Circle of Competence [2,3]]]`; `WikiPageReadView` lazily resolves those labels through the page catalog only for affected pages.
- **P0-0b briefing speed, limited pass** — `/wiki` now renders a 36h local cached Morning Paper immediately when available and refreshes with one `listWikiPages({ limit: 80, includeLowQuality: 1 })` request plus one briefing request. The full server-side briefing read-model/precompute target remains separate.
- **P1-4 wiki Open Questions circulation, first pass** — server extracts Open Questions sections from eligible wiki pages as virtual `sourceType: "wiki_open_question"` rows in `/api/questions` and concept question lists; briefing answerable-question logic considers those virtual rows when matching pages gained new source material.

**Still execute / verify:**
- **P0-0 / P0-0b / P1-4 live verification** — code and `wiki:qa` are green, but production proof is still required after deploy: no rendered `[[`, cache-first warm `/wiki`, and wiki-origin Open Questions visible in Think / briefing.
- **P0-0b full precompute** — if the limited cache/dedupe pass is not enough after production timing, build the persisted briefing read-model in the scheduled maintenance worker so `GET /api/wiki/briefing` becomes a fast read.
- **P1-3 filing count drop** — real-account batch acceptance is allowed by Athan, but first inspect the proposal rows and capture before/after counts.
- **P2-b density pass** — keep separate from correctness/performance work; coordinate with design-polish specs.

---

## 0. Verified working — DO NOT rebuild (tested live this session)
- **Morning paper return loop** ✅ — full editorial lead ("A new library source was added, prompting the agent to rebuild 'Alphabet is Berkshire Hathaway 2.0'… consider reviewing it"), RETURN PATH next-action card, EVIDENCE SURFACED. Clicking RETURN PATH lands on the correct page.
- **Wiki graph ask** ✅✅ — on a page, "how does this relate to circle of competence and margin of safety?" pulled 3 related pages + 5 highlights + 4 backlinks, synthesized them, and showed a truthful receipt naming the pages it read ("Read … + Circle of Competence + Mental Models in Decision Making + Margin of Safety in Value Investing"). This was the previously-broken behavior. Leave it alone.
- **System status chip + receipts** (Ch.0.5) ✅ — topbar chip lights during background work and resolves to an honest receipt ("230 unfiled articles across 6 proposed folders. Nothing moves until you approve.") with a Recent Activity history. Don't regress.
- **Filing structure-proposal review UI** ✅ — bulk Select all / Accept selected / Reject selected / Clear, per-item move with destination + Reject step. (Reachability + quality are the problems below, not the UI itself.)
- **Graph-motif wiki background** ✅ and **escalated machinery nav** ("Knowledge map · All pages · Needs review · Review (8)") ✅ — both polish items landed.

---

## P0-0 — Raw wikilink markup renders in reading prose
**Symptom (verified live, zoomed screenshot):** on the "Margin of Safety in Value Investing" read view, the prose renders literal double-bracket markup with citation markers interleaved: *"the mental model of a `[[ [2,3]Circle of Competence [2,3]]]`: investors should…"* and again *"the concept of `[[ [2,3]Opportunity Cost [2,3]]]`"*. Raw wikilink syntax + superscript refs jammed inside, on the flagship reading surface. This is the single most jarring detail in the app — the surrounding typography is excellent, which makes it worse.
**Likely cause:** the wikilink autolink/render pipeline doesn't handle a wikilink whose inner text carries citation spans (the citation markers got inserted *inside* the `[[…]]` before link rendering), so the parser fails and falls through to literal text.
**Fix:** render `[[Title]]` as a proper wikilink even when citation/superscript nodes are adjacent or embedded; never let `[[` / `]]` reach the reader. Audit other pages for the same pattern (grep rendered plainText for `[[`).
**Acceptance:** the Margin of Safety page shows "Circle of Competence" and "Opportunity Cost" as clean links with their citation superscripts outside the link text; no page renders literal `[[`. Paste before/after screenshots.

## P0-0b — The morning paper takes ~10s on every open (recomputed briefing + duplicate fetches)
**Symptom (measured live, resource timing):** every visit to `/wiki` shows the "Checking overnight edits and drift signals…" skeleton for many seconds. Measured: `GET /api/wiki/briefing` takes **7.8–14.5s** (warm backend, three separate loads), and the client fetches it **twice** per load, plus `wiki/pages` **three times**. The maintained-page view similarly fetches its own page **3×** and `connections` **2×**. Layout shift is excellent (CLS 0.002–0.036) — the problem is purely wait + waste.
**Why it matters:** this is the daily-return surface — the product's whole bet — and it greets the user with a 10-second skeleton every single time. Perceived speed is the #1 "feel" gap vs. Notion-class products.
**Fix (three parts, in value order):**
1. **Dedupe the fetches.** Find why briefing/pages/page/connections fire 2–3× per mount (double-mount effect, missing request cache, or competing components) and make each load fetch once.
2. **Cache-first render.** Persist the last briefing (localStorage or server-side) and render it *instantly* on open, then refresh in place — never show a skeleton when a previous paper exists. Same pattern for the maintained page (render last-known, update silently).
3. **Precompute the briefing.** The 6h scheduled maintenance worker (`wikiScheduledMaintenanceWorker.js`) should compute and store the briefing read-model so `GET /api/wiki/briefing` is a fast read (<500ms), not a 8–14s on-demand computation (`wikiBriefingService.js`).
**Acceptance:** warm `/wiki` open shows a real morning paper (not skeleton) in under 1s; `briefing` endpoint returns <500ms; each API endpoint fires exactly once per load (paste the network waterfall before/after).

## P0-1 — ⌘K "New Wiki page" / "New collection" actions are unreachable (list reflow)
**Symptom (verified live, twice):** open ⌘K, type a topic (e.g. "compounding test page"), click the generated **"New Wiki page from '…'"** action → palette closes and **no page is created** (confirmed via `GET /api/wiki/pages` — newest page was still Jun 21, nothing new persisted), no navigation, no receipt.

**Root cause (confirmed in source):** in `note-taker-ui/src/components/CommandPalette.jsx`, the `sections` builder (`const sections = useMemo`, ~line 749) pushes the `actionSection` **after** all async search-result sections in the `q` branch — order is Wiki pages → Pages → Notes → Highlights → Claims → Evidence → Articles → **`list.push(actionSection)` (~line 896)** → Wiki. So:
- While the search request is in flight, `searchGroups` is empty, those sections filter out, and the Actions block sits near the top — visible and clickable.
- The instant results arrive, the list re-renders and the Actions block jumps far down below Notes/Articles. A click aimed at where "New Wiki page from X" *was* now lands on a Note that reflowed into that row → palette closes, nothing created.

The handler itself (`createWiki`, ~line 375 → `createWikiPage`) is fine; the action is just never stably positioned to click.

**Fix:**
1. **Pin the core actions** ("New Think note", "Pull reference", "New Wiki page from '<q>'", "New collection") to a **stable position at/near the top** of the list, independent of async search results. They must not reflow when `searchGroups` populates.
2. Make selection resilient to re-render (don't let an async result update move the item under the user's cursor / change which item a pending Enter/click resolves to).
3. **Confirm createWiki end-to-end** once reachable: clicking "New Wiki page from 'X'" creates a page, fires the `setLatestReceipt` ("Wiki page created"), and navigates to the new page.

**Acceptance:** open ⌘K, type a topic, wait for results to settle, click "New Wiki page from '<topic>'" → a new wiki page exists (`GET /api/wiki/pages` shows it), the status chip shows the receipt, and you land on the page. Paste the before/after page list + a screenshot of the created page. Repeat for "New collection."

---

## P0-2 — Think threads view ignores `threadId` (filing proposal nearly unreachable)
**Symptom (verified live):** after running filing, the status-chip receipt's **"View details"** link, *and* a direct URL to the filing thread (`/think?tab=threads&threadId=6a3485bd17eb3d3d389fc1ce`), both **bounce to the newest active thread** (the Wiki workspace graph-ask thread) instead of the requested one. The "Library filing suggestions" thread (which holds the 230→folders structure proposal) is only reachable by **clicking it in the left-rail thread list**. A user who follows the receipt never sees their filing plan.

**Fix:**
1. The Think threads view must **honor the `threadId` query param** on load and select that thread, not default to the most-recent active thread. (Grep the threads tab/view that reads `?tab=threads` — it's overriding the requested id.)
2. The filing receipt's `nextAction.href` / "View details" must deep-link to the **filing thread** (the `sourceThreadId` of the structure proposal), not a generic `/think?tab=threads`.

**Acceptance:** run filing → click "View details" on the receipt → land directly on the "Library filing suggestions" thread with the proposal visible. Also: pasting a `?threadId=<id>` URL opens that exact thread. Paste both.

---

## P1-1 — Filing classifier is still regex; no "why this category"
**Symptom (verified live, real account):** the staged plan routes by the old keyword buckets, with obvious misclassifications:
- *Poor Charlie's Almanack* (Munger, investing/mental-models) → **"Technology and Innovation"** ❌
- *Shoe Dog* (Nike memoir) → **"Curated Research"** (the catch-all fallback)
- *Steve Jobs* → "Technology and Innovation", *Benjamin Franklin* → "Curated Research"

Each item shows only "Destination: <folder>" with **no rationale**. This is `inferOrganizationFolderName()` in `server/services/agentRunExecution.js` (regex buckets), applied by `buildGeneratedStructureOperations()` and executed via `server/services/agentStructureExecution.js`.

**Fix (Ch.3a quality):**
1. Replace the regex buckets with **LLM classification** (keep regex as a fallback only). The agent should propose folders that actually fit (a Munger book is not "Technology and Innovation").
2. Add a one-line **"why this category"** rationale per item in the proposal (the StructureProposalReview row should render it).

**Acceptance:** re-run filing on the real account → destinations are sensible (Munger/Buffett-style books group under an investing/mental-models shelf, not tech), and each row shows a short reason. Paste 6–8 item→destination+reason rows.

## P1-2 — "Review filing suggestions" reopens a stale proposal instead of regenerating
**Symptom (verified live):** clicking "Review filing suggestions" surfaced a proposal **last updated 6/18/2026** ("Reopened Review…") rather than generating a fresh plan against the current 248 unfiled items. So the plan a user reviews can be weeks stale.
**Fix:** "Review filing" should generate a **current** proposal (or clearly offer "resume existing vs. regenerate"). Trace `startLibraryFilingSuggestions` (`note-taker-ui/src/pages/Library.jsx handleReviewFiling`) → `server/routes/libraryFilingRoutes.js`.
**Acceptance:** click Review filing → the proposal's timestamp is now, and item count reflects current unfiled. Paste the timestamp + count.

## P1-3 — Prove the unfiled count actually drops on accept
Unfiled is still **248/266 (93%)** because filing only ever *proposes*; nobody has accepted. After P1-1/P1-2, accept a batch and confirm the Cabinet count drops and articles land in the right folders.
**Acceptance:** before/after `UNFILED` counts in the Library Cabinet around a bulk-accept. Paste both.

---

## P1-4 — Circulate page Open Questions into Think + the morning paper (cheapest big win)
**Symptom (verified live):** wiki pages already contain **excellent** agent-generated Open Questions (e.g. Margin of Safety: *"What quantitative threshold best balances protection against valuation error with the opportunity cost of capital in different asset classes?"* — three of that quality on one page). Yet Think's Questions rail says **"No questions yet"** and the morning paper's "questions now answerable" slot rarely fires. The provocation engine exists; nothing circulates its output. (The public landing page promises "Questions stay visible until something actually resolves them" — currently unkept.)
**Fix:** surface wiki-page Open Questions as first-class Question objects: list them in Think's Questions rail (linked back to their page), and let the briefing's answerable-questions detector consider them. No new generation needed — this is plumbing from existing page sections to existing surfaces.
**Acceptance:** Think → Questions lists the open questions from wiki pages with links; a question whose concept gains new evidence appears in the morning paper. Paste both.

## P2 — carry-overs (still open, low risk)
- **Morning-paper lead clamp** — **worse than previously scoped: it hits the real account too, on roughly half of loads.** Observed live same-day: "A new library article arrived and the recent", "A new article entered the", "…imported one source with a" (real account), plus the seed account's known clamp — versus fully-formed leads on other loads. Sentence-boundary trim in `server/services/wikiBriefingService.js` and/or remove the char-clamp in `WikiFrontPage.jsx` so **no** template/branch can dangle. Acceptance: 10 consecutive reloads on both accounts; every lead ends on terminal punctuation. Paste all 10.
- **Title casing** — "the Availability Heuristic" still shows the lowercase leading article in Library + wiki. One-time backfill/normalization of existing titles (forward-fix at creation already exists). Acceptance: no page title starts with a lowercase article.

## P2-b — Density pass: the maintained page and Library are over-furnished (design, not bug)
**Measured live:** the maintained-page view renders **45 buttons + 48 links + 3 rails** around the article; Library renders **44 buttons / 17 panels**. The wiki front page — the calmest, best surface — has **5 buttons**. The reading register wants content-first; the chrome competes with it.
**Direction (taste call, don't over-engineer):** default the maintained page to article + quiet header + one agent affordance; tuck secondary controls (share panel, overview stats, graph traces, contents) behind hover/collapse/⌘K, in the spirit of Notion's hidden-until-reached-for controls. Library similarly: one lead, controls on demand. Coordinate with `noeis-design-polish-v2-spec-2026-06-25.md` (list unification) rather than duplicating it.
**Acceptance:** maintained page shows ≤ ~15 interactive controls on load with nothing essential lost (screenshot before/after + control count).

---

## Priority
1. **P0-0 (markup leak)** — smallest fix, most jarring defect, flagship surface.
2. **P0-0b (briefing speed: dedupe → cache-first → precompute)** — the daily open must not cost 10 seconds.
3. **P0-1 (⌘K create) + P0-2 (thread routing)** — make the paper's promise actionable.
4. **P1-1..3 (filing quality + freshness + prove the drop)** and **P1-4 (question circulation** — cheapest big win, consider pulling forward**)**.
5. **P2 carry-overs + density pass** last.

## The line
The return loop earns the daily open; these fixes make the daily open *instant, clean, and actionable*. Right now the best screen in the product is gated behind a 10-second skeleton, the prose leaks markup, a user who tries to act hits a dead ⌘K and an unreachable stale filing plan, and the product's best thinking (its own open questions) never leaves the page it was written on. Close those and the minute-5 impression survives to day 30.
</content>
