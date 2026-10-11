# Wiki Reshape — Post-Deploy Test Plan (2026-05-28)

**Commit shipped:** `1c4d33c` → `main` (auto-deploys to noeis.io)
**Tickets in this drop:** AT-287, AT-288, AT-289, AT-290, AT-291, AT-292, AT-293
**Vision anchor:** `docs/prd-llm-native-wiki-reshape.md` — Karpathy "LLM Wiki"
**Thesis we are testing against:** *The LLM is the writer. The user is the reader, sourcer, and questioner.* Every check below asks "does this make the wiki feel like a Wikipedia article the agent keeps current, not a Notion doc with helpers?"

This plan is split into two owners:
- **Claude (me)** — what the `wiki:qa` gate + code review already prove, and what I re-verify on each change.
- **Codex** — live in-browser QA on https://www.noeis.io, the part the gate cannot see.

---

## Part 1 — Claude (gate + code, already green on `1c4d33c`)

`npm run wiki:qa` passed exit 0 before push. It covers:

- `git diff --check`, `node -c` syntax on all wiki server modules.
- Contract test `wikiRoutes.contract.test.js`.
- Proposal / intelligence / maintenance harnesses.
- Graph connection + wikiGraph route tests.
- Jest claim tests `wikiMaintenanceService.claim.test.js`.
- All `src/components/wiki` component tests, including the new AT-293 regression in `WikiProductIndex.test.jsx`.
- Clean production `npm run build`.

Re-run the gate on any follow-up change. Do not ship wiki changes that skip it.

---

## Part 2 — Codex live QA (the real test)

Test on desktop (≥1280px) **and** mobile (~390px) unless a row says otherwise. For each ticket: the vision tie-in, the exact repro, pass criteria, and the regression we are guarding against (from our own history).

### AT-287 — Agent synthesis on page-scoped questions
- **Vision:** "ask the right questions" → the agent must actually *answer with synthesis*, not return a canned claim pick.
- **History caught:** page-scoped questions were gated out of LLM synthesis and returned a deterministic claim-pick in ~0.3s — felt dead.
- **Repro:** Open any wiki page with sources → ask the page a substantive question in the agent pane (e.g. "How does X relate to Y?").
- **Pass:** Answer is a real synthesized response grounded in the page's claims/sources (not a single quoted claim), streams word-by-word, takes more than the old ~0.3s, and cites page material.
- **Watch:** an instant one-liner that just echoes one claim = regression.

### AT-288 — Inline `[[wiki-links]]` + hover preview + SPA routing
- **Vision §6.2:** the agent's prose carries inline links; clicking lands on the related page; hover previews it. This is the "click a link in the prose" job.
- **History caught:** (a) autolinking only ran on the discussion-promote path, not the main agent draft path; (b) raw `<a href>` clicks caused a full page reload instead of SPA navigation.
- **Repro:**
  1. Open a page whose body references another existing page title.
  2. Confirm the title renders as an underlined internal link in the prose.
  3. Hover it → preview card (destination title + excerpt + source count) appears (~250ms).
  4. Click it → navigates to that page **without a full reload** (no white flash; React Router transition; View Transition if supported).
  5. Trigger a fresh agent draft on a page → confirm new matching titles get linked.
- **Pass:** all five. Cmd/Ctrl/middle-click still opens in a new tab (modifier clicks must NOT be hijacked).
- **Watch:** full-page reload on link click, or links only appearing after a discussion-promote.

### AT-289 — Breathing conic-gradient composer border
- **Vision (epic A, Living Agent):** the surface should feel alive while the agent works.
- **Repro:** Focus the agent composer; then send a message and watch while the response streams.
- **Pass:** idle = subtle breathing ring; focus-within = brighter/faster; `data-streaming` = full opacity, fastest. `prefers-reduced-motion: reduce` kills the animation. Textarea text stays above the ring and fully legible.
- **Watch:** ring clipping the textarea, z-index covering text, or motion ignoring reduced-motion.

### AT-290 — Inter removed, system-ui chrome (free fonts only)
- **Hard constraint:** nothing licensed; Newsreader (Google, free) for body/headings, `system-ui` stack for UI chrome.
- **Repro:** DevTools → inspect computed `font-family` on wiki body text and on UI chrome.
- **Pass:** no `Inter` anywhere in the wiki surface; body/headings = Newsreader/serif, chrome = system-ui stack.
- **Watch:** any `Inter` reference loading.

### AT-291 — Single h1, 44px tap targets (epic D, empty states / a11y)
- **Repro:** Run an accessibility/heading-order check on the workspace; tap interactive controls on mobile.
- **Pass:** exactly one `<h1>` per view (agent pane title is `<h2 class="wiki-workspace-chat__title">`); interactive controls ≥44×44px on mobile.
- **Watch:** two h1s, or sub-44px tap targets.

### AT-292 — Workspace body width + rail behavior (epic B, Editorial Reader)
- **Vision §6.1:** Wikipedia-shaped, generous line-height, readable measure (~700–720px body).
- **Repro:** Open a page in the workspace at desktop and at ~1100px and mobile.
- **Pass:** body column reads at a comfortable measure (~700px+), rails collapse via container query on narrow viewports, **no horizontal scroll** at any width.
- **Watch:** cramped body, or rails forcing horizontal overflow.

### AT-293 — Wiki home "Key pages" preview clamp
- **Vision:** `/wiki` is a calm entry point, not a wall of text.
- **History caught:** card preview dumped the full flattened article body (section-heading runs + `[1]` citation markers) when a page had no curated summary.
- **Repro:** Open https://www.noeis.io/wiki → inspect Key pages cards, especially a page with no curated summary (e.g. Investing).
- **Pass:** each card excerpt is a tight 1–2 line / ~160-char excerpt, **no `[n]` citation markers**, no leading title echo, sentence- or word-boundary truncation with ellipsis. Clicking a card still routes to the correct page. No horizontal scroll desktop or mobile.
- **Watch:** verbose multi-paragraph dump, visible `[1]`/`[2,3]` markers, or title repeated at the start.

---

## Part 3 — Cross-cutting regression sweep (both owners)

Pulled from issues we have hit repeatedly across the wiki PRs:

1. **No full-page reloads** anywhere internal links route (AT-288 root cause).
2. **No horizontal overflow** at 390px / 768px / 1100px / 1280px+ (AT-292/293 history).
3. **Streaming actually streams** word-by-word; no instant canned answers (AT-287 history).
4. **Free fonts only** — zero `Inter`, zero licensed faces (hard constraint).
5. **Reduced-motion respected** on the composer ring and any new animation (AT-289).
6. **Existing capabilities survive** the reshape with no regression: claim popover, ambient presence, daily briefing, ask composer, discussions, changes-since-visit banner (PRD §8).
7. **Parallel-agent injection friction** (PRD §11 known risk) — if any draft/ingest produces garbled or duplicated body content, capture it; this is a known soft spot.

---

## Part 4 — Vision gaps NOT in this drop (do not file as regressions)

These are PRD scope still ahead, so absence is expected, not a bug:
- Graph view as `/wiki` index (R2.1) — still card-grid/list.
- "Drop a source" ingest pipeline + activity log (R2.2/R2.3).
- "Save answer as wiki page" promotion (R3.1).
- Schema editor in Settings (R3.2/R3.3).

If Codex wants to comment on these, file as new backlog items under the "Noeis LLM-Native Wiki Reshape" project, not as regressions on this deploy.

---

## How to report

- **Pass:** note ticket ID + viewport tested.
- **Fail:** ticket ID, viewport, exact repro, screenshot, and which "Watch" it tripped. File in Linear under the wiki reshape project, link this commit `1c4d33c`.
