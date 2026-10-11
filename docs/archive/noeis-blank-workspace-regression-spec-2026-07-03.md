# Spec — P0 regression: wiki workspace renders blank on desktop (+ verification results of the fixes push)

**For:** Codex
**Author:** Athan + Claude (live verification of the fixes push, 2026-07-03, real account on `https://www.noeis.io`)
**Context:** The fixes push (`9abd4a33`…`a7320eef`, deployed) landed real wins — verified live: fetch dedupe ✅, cache-first morning paper ✅ (paper visible ~2s warm), lead clamp fixed ✅ (3/3 clean loads), ⌘K actions pinned ✅ and create works end-to-end ✅ (page `6a4811a1249c05cc55d6ac90` created + receipt chip fired). **But one of the commits (most likely `d64aa8a7` "collapse wiki agent rail on read") introduced a P0 regression that blanks the entire maintained-page view on desktop.** Fix that first; the rest of this spec is the remaining open items with their current verified status.

**Verification rule:** reproduce live on `https://www.noeis.io` on a **desktop-width window (≥1440px)**. Paste before/after screenshots in the PR. Do not close from a unit test alone.

---

## P0-R1 — Wiki workspace read view is a blank white page on desktop

### Symptom (reproduced 3× on 2026-07-03, different pages)
Navigate to any maintained page, e.g. `/wiki/workspace?page=6a1b812cdfca58bcaa50fffd` (Margin of Safety), on a 1568px-wide desktop window:
- The content area renders a **completely blank white void** — no title, no article, no rails. Only the topbar and a small collapsed "ASK" pill (top-left) render.
- Happens on every wiki page tried, including immediately after a successful ⌘K page create (user creates a page → lands on nothing).
- **No console errors.** The page content IS in the DOM (`document.body.innerText` contains the article text) — it is hidden by CSS, not missing.

### Root cause (diagnosed live via computed styles)
The workspace root element carries the **mobile class on desktop**:

```
class="wiki-workspace is-mobile-wiki wiki-workspace--agent-…"   ← on a 1568px window
```

With `is-mobile-wiki` applied:
- `wiki-workspace__mobile-tabs` → `display:none` (w:0, h:0)
- `wiki-workspace__chat-pane` → `display:none`
- the reading pane is likewise collapsed — the mobile layout expects a tab switcher to show one pane at a time, but the tab bar itself is hidden, so **no pane is ever visible**.

So: the new mobile/rail-collapse breakpoint detection **misfires on desktop**, applies the mobile grid, and the mobile grid's controls are also hidden → blank page. Find where `is-mobile-wiki` is set (grep `is-mobile-wiki` in `note-taker-ui/src/components/wiki/WikiWorkspace.jsx` / related CSS) and fix the width detection (likely a wrong media query, a `matchMedia` condition inverted, or a resize-observer reading 0 before first layout and never re-evaluating).

### Fix
1. `is-mobile-wiki` must only apply below the real mobile breakpoint (~<768px). Desktop ≥1024px must always get the desktop grid.
2. Whatever state machine picks the visible pane in mobile mode must never leave **zero** panes visible — even if the breakpoint misfires again, default to showing the reading pane.
3. Keep the collapsed-rail "ASK" pill behavior — the collapse itself is the intended feature (P2-b density); only the breakpoint is broken.

### Acceptance
- `/wiki/workspace?page=6a1b812cdfca58bcaa50fffd` on a ≥1440px window renders title + article + rails. Screenshot.
- Same page at 390px renders the mobile layout **with a working tab/pane switcher** (nothing blank). Screenshot.
- Resize desktop→mobile→desktop live: content never disappears. State it was done.

---

## P0-R2 — Re-verify the reading surface once R1 is fixed (blocked items)

These could not be verified while the page was blank; verify each after R1:

1. **Prose wikilink markup (original P0-0).** The read prose previously rendered literal `[[ [2,3]Circle of Competence [2,3]]]`. Status unknown — verify the Margin of Safety prose renders clean links.
2. **Backlink-snippet markup (confirmed still broken).** The "Mentioned in" panel still renders raw markup — measured **8 literal `[[`** in the DOM, e.g. *"…groups opportunity cost with the [[Circle of Competence]] and [[Margin of Safety in Value Investing]] as a core lens…"*. Strip/render wikilink syntax in backlink snippet text too.
3. **Thread routing (original P0-2).** Receipt "View details" → filing thread, and direct `?threadId=<id>` URLs open that thread. Untested this pass.
4. **Filing quality/freshness (original P1-1/P1-2/P1-3).** LLM classification + "why this category" + regenerate-not-reopen + unfiled count drops on accept. Untested this pass.

Acceptance for each: as written in `noeis-return-loop-fixes-spec-2026-06-29.md`.

---

## P1 — Question circulation reached the briefing but NOT Think (original P1-4, half-done)

**Verified live:** commit `a7320eef` ("circulate generated wiki questions") touched only `server/services/wikiOpenQuestionsService.js`. Think's Questions rail **still shows "No questions yet"** on an account whose wiki pages contain excellent Open Questions (e.g. Margin of Safety has three).
**Fix:** surface wiki-page Open Questions as first-class Question objects in Think's Questions rail, linked back to their page (the other half of the original P1-4).
**Acceptance:** Think → Questions lists the wiki pages' open questions with working links to their pages. Screenshot.

## P1 — Briefing endpoint is still ~9s; precompute didn't land (original P0-0b part 3)

**Verified live:** `GET /api/wiki/briefing` measured **8.8s (cold) / 9.2s (warm)**. The cache-first client render *masks* this well (paper visible ~2s), so it's no longer a P0 — but every visit still burns a 9s background request, and first-ever visits (no cache) still wait the full time.
**Fix:** compute + store the briefing read-model in the 6h scheduled worker (`wikiScheduledMaintenanceWorker.js`), and/or cache it server-side keyed to last maintenance run; `GET /api/wiki/briefing` becomes a fast read.
**Acceptance:** `GET /api/wiki/briefing` returns in <500ms warm. Paste the timing.

---

## Confirmed fixed in this push — do NOT rework (verified live 2026-07-03)
- **Fetch dedupe:** `/wiki` fires briefing ×1, pages ×1 (was ×2/×3). Only `tour/state` ×2 remains (harmless, fold in if trivial).
- **Cache-first morning paper:** warm open shows the full paper in ~2s while the network refresh runs behind it. Cold open (no cache) still shows the skeleton — acceptable until precompute lands.
- **Lead clamp:** 3/3 loads produced complete, well-formed editorials ending on terminal punctuation (e.g. *"…Rebuilding Circle of Competence is recommended."*). Keep an eye on it; the original acceptance (10 consecutive clean reloads on both accounts) still applies if it recurs.
- **⌘K actions:** pinned at the top of the palette after async results settle (the reflow bug is gone); "New Wiki page from '<q>'" **creates a real page end-to-end** (verified: page id `6a4811a1249c05cc55d6ac90` created, status-chip receipt fired, navigation happened). A "New collection from '<q>'" action also now exists.
- **Rail collapse (the ASK pill) on the read view** — the *intent* is right and stays; only its breakpoint detection (P0-R1) is broken.

## Cleanup
Delete the QA artifact page created during verification: **"qzz test topic"** (`page=6a4811a1249c05cc55d6ac90`, created 2026-07-03 via ⌘K by Claude during testing). Owner-delete path; confirm it's gone from Explore/All pages.

## Priority
1. **P0-R1** — the product's core surface is blank on desktop; nothing else matters until this ships.
2. **P0-R2** — re-verify the blocked items the same day R1 lands (esp. prose markup + backlink snippets).
3. **P1 question circulation to Think** (small, high value) and **P1 briefing precompute**.

## The line
The push proved the loop can feel instant — the paper now opens in 2 seconds with a clean lead, and ⌘K finally creates things. But a fast front door into a blank room is worse than a slow one into a furnished room. Fix the breakpoint, re-verify the reading surface, and this cycle is a clear net win.
</content>
