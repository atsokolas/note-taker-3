# Spec — Return Loop fixes (post-live-test)

**For:** Codex
**Author:** Athan + Claude (live user test on `https://www.noeis.io`, logged-in real account, 2026-06-29)
**Context:** The return-loop push (commits `ce38378b` + `bb3a17fb`) is mostly working — the morning paper, graph ask, status chip, and filing review UI all shipped and verified live. This spec covers the gaps found while driving the product as a user. Two of the three "action" payoffs are currently hollow (⌘K can't create; filing proposes with a dumb classifier you can barely reach). These are the fixes.

**Verification rule:** every item has a live repro on `https://www.noeis.io`. Reproduce the symptom, ship, then reproduce again and confirm it changed. Paste the actual before/after (screenshot or API result) in the PR. Do not close from a unit test alone.

---

## 0. Verified working — DO NOT rebuild (tested live this session)
- **Morning paper return loop** ✅ — full editorial lead ("A new library source was added, prompting the agent to rebuild 'Alphabet is Berkshire Hathaway 2.0'… consider reviewing it"), RETURN PATH next-action card, EVIDENCE SURFACED. Clicking RETURN PATH lands on the correct page.
- **Wiki graph ask** ✅✅ — on a page, "how does this relate to circle of competence and margin of safety?" pulled 3 related pages + 5 highlights + 4 backlinks, synthesized them, and showed a truthful receipt naming the pages it read ("Read … + Circle of Competence + Mental Models in Decision Making + Margin of Safety in Value Investing"). This was the previously-broken behavior. Leave it alone.
- **System status chip + receipts** (Ch.0.5) ✅ — topbar chip lights during background work and resolves to an honest receipt ("230 unfiled articles across 6 proposed folders. Nothing moves until you approve.") with a Recent Activity history. Don't regress.
- **Filing structure-proposal review UI** ✅ — bulk Select all / Accept selected / Reject selected / Clear, per-item move with destination + Reject step. (Reachability + quality are the problems below, not the UI itself.)
- **Graph-motif wiki background** ✅ and **escalated machinery nav** ("Knowledge map · All pages · Needs review · Review (8)") ✅ — both polish items landed.

---

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

## P2 — carry-overs (still open, low risk)
- **Morning-paper lead clamp** — the real account renders a complete sentence, but the QA seed account (`qa_editor_seed`) still truncates mid-sentence ("…imported one source with **a**"). Sentence-boundary trim in `server/services/wikiBriefingService.js` / remove the char-clamp in `WikiFrontPage.jsx` so no template/branch can dangle. Acceptance: reload the seed account's `/wiki` several times; lead always ends on terminal punctuation.
- **Title casing** — "the Availability Heuristic" still shows the lowercase leading article in Library + wiki. One-time backfill/normalization of existing titles (forward-fix at creation already exists). Acceptance: no page title starts with a lowercase article.

---

## Priority
P0-1 (⌘K create) and P0-2 (thread routing) first — they make the morning paper's promise actionable. Then P1 (filing quality + freshness + prove the drop). P2 carry-overs last.

## The line
The return loop earns the daily open; these fixes make the daily open *lead somewhere*. Right now a user who tries to act on the paper hits a dead ⌘K and an unreachable, stale, mis-sorted filing plan. Close those and the loop is whole.
</content>
