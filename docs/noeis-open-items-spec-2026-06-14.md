# Spec — Three open items that keep surviving update sessions

**For:** Codex
**Author:** Athan + Claude (live product test, 2026-06-14)
**Why this exists:** These three were flagged in three consecutive user tests and have NOT moved. Two of them have not moved because **the fix is not in the code that's been getting edited.** This spec points at the exact files and the actual root cause for each, verified by reading the source — not guessed from symptoms.

**Verification rule (applies to all three):** Do not mark an item done from a unit test alone. Each item has a live repro on `https://www.noeis.io`. Reproduce the symptom first, ship, then reproduce again and confirm it changed. State the before/after observation in the PR.

---

## Item 1 (P0) — The wiki agent answers only from the open page; it does not reason across the graph

### The live symptom (reproduced 3×, identical each time)
On a wiki page (e.g. "Loss Aversion", `/wiki/workspace?page=<id>`), type into the workspace chat composer (placeholder *"Ask, paste a source, or type / for wiki commands"*):

> How does loss aversion connect to opportunity cost?

"Opportunity Cost" is its own wiki page and is listed in the Explore index. Expected: the agent opens/considers the Opportunity Cost page and synthesizes across both. Actual, every time, byte-for-byte:
- The reply is drawn only from the **currently open** page (it talks about antifragility from the Loss Aversion page, never reaches Opportunity Cost).
- It pastes the open page's raw "Open Questions" text into the answer.
- It signs off: `Read the selected wiki page.` → `Answered from the selected wiki page.` → `Composed reply in 0.5s.`

### Root cause (this is why prior sessions failed)
There are **two** answer paths in the backend and the chat composer is wired to the wrong one:

1. **`server/services/wikiAskService.js`** — the graph-aware path. It already exists and already does what we want:
   - `loadWikiAskCorpus()` (~lines 862–969): scans recent pages, extracts title candidates from the question, ranks related pages, pulls concepts + backlinks.
   - `buildAskGraphContext()` (~lines 813–860), `buildRelatedPageContexts()` (~lines 265–302), `buildBacklinkContexts()` (~lines 388–414), `rankWikiPageCandidates()` (~lines 233–263).
   - It can return up to 3 related pages + 4 concepts + 4 backlinks into the synthesis prompt.
   - **This service is NOT called by the chat composer.**

2. **`server/routes/agentChatRoutes.js`** — the endpoint the composer actually hits (`POST /api/agent/chat/stream`). For a wiki page question it calls `generateCollaborativeReply()` from `server/services/collaborativeAgentService.js`, which has its own simpler, single-page retrieval. The sign-off strings live here:
   - `'Read the selected wiki page.'` — line ~524, emitted whenever `context?.pageId` is present.
   - `'Answered from the selected wiki page.'` — line ~567, emitted when `!result?.retrieval?.searchedWorkspace`.
   - `'Composed reply in ${…}s.'` — line ~572.
   - Whether it even looks beyond the page is gated by `shouldSearchWorkspaceForWikiPage()` (line ~515). In practice this gate is returning false for graph questions, so it never searches.

The frontend that builds the payload: **`note-taker-ui/src/components/wiki/WikiWorkspace.jsx`** (~lines 2287–2302), sends `context: { pageId: selectedPageId, … }` and calls `streamChatWithAgent(chatPayload)`.

So: the composer → `agentChatRoutes` → `collaborativeAgentService` (single page). The good graph code in `wikiAskService` is dead-ended for chat.

### The fix
Route page-scoped wiki chat questions through the graph-aware path. Preferred approach:

1. In `server/routes/agentChatRoutes.js`, when `context.pageId` is present AND the question is not trivially about the open page only, call `wikiAskService.askWikiPage()` (or refactor so `generateCollaborativeReply` for wiki scope delegates to `buildAskGraphContext`/`loadWikiAskCorpus`). The synthesis prompt must include the related pages + backlinks the corpus loader returns.
2. Fix the gate. Find `shouldSearchWorkspaceForWikiPage()` and `isSelectedPageOnlyQuestion()` (referenced in `wikiAskService.js` ~line 888). A question that names another concept ("connect X to **opportunity cost**", "how does this relate to Y", "compare with Z") must NOT be classified as selected-page-only. When the question contains a title/term that matches another page, force the graph path.
3. The activity receipts must tell the truth. When related pages are pulled, emit `Searched workspace` / `Retrieved N items` and list which pages (e.g. *"Read Loss Aversion + Opportunity Cost"*). Only emit `Answered from the selected wiki page.` when the answer genuinely used one page.
4. **Stop pasting raw "Open Questions" text into answers.** The current reply regurgitates the page's open-questions section. The synthesis should answer the user's question, optionally citing, not dump a section. Find where the page body/sections are concatenated into the reply in the collaborative path and remove the open-questions blob from the answer surface.

Note on linking: wiki pages have **no stored `linkedPages` field** (`WikiPage` schema, `server/models/index.js` ~lines 455–478). Links are computed — backlinks by text scan (`server/services/wikiBacklinkService.js`), related pages by token/title scoring (`wikiAskService.js`). That's fine; reuse the scoring that already exists. Do not add a schema migration for this item.

### Acceptance criteria
1. Live: on the Loss Aversion page, "How does loss aversion connect to opportunity cost?" produces an answer that **references Opportunity Cost's content** (e.g. the foregone-next-best-alternative framing) and ties the two together. Paste the actual reply in the PR.
2. The reply no longer dumps the raw "Open Questions" list.
3. Activity receipts reflect reality: when 2 pages are used, it does not claim "Answered from the selected wiki page."
4. A page-only question ("summarize this page") still stays fast and single-page — don't over-fetch on every message.
5. Add/extend a backend test that asserts a cross-concept question pulls a related page into the synthesis context.

---

## Item 2 (P1) — The agent does not file the library; 235 / 253 sources sit Unfiled

### The live symptom
`/library` Cabinet shows **ALL ARTICLES 253 / UNFILED 235** (93% unfiled). The "Corpus maintenance" block says *"230 unfiled sources already have highlights ready to classify"* with a **Review filing suggestions** action. Clicking it does not produce suggestions — nothing gets filed.

### Root cause
- **There is no auto-filing and no real suggestion generation.** "Review filing suggestions" → `handleReviewFiling()` in `note-taker-ui/src/pages/Library.jsx` (~lines 191–197) **just switches the scope to `unfiled` and opens the Cabinet.** It's a view filter, not a suggestion engine.
- The only filing logic is `handleOrganizeLibrary()` (`Library.jsx` ~lines 364–387) which fires `chatWithAgent("Clean up library structure and stage a reviewable organization plan")`. That intent is detected in `server/services/collaborativeAgentService.js` (~line 1758, `cleanup_structure`).
- Classification itself is **regex on title+snippet**, not LLM: `inferOrganizationFolderName()` in `server/services/agentRunExecution.js` (~lines 43–51) — a handful of hardcoded keyword buckets (Transportation, Blockchain and Crypto, Technology and Innovation, Company News and Updates, Personal/Professional, else Curated Research). `buildGeneratedStructureOperations()` (~lines 43–104) applies it to unfiled articles that have highlights; `server/services/agentStructureExecution.js` (~lines 177–256) executes create/move ops.
- Data model: an article is "filed" when `folder` (ObjectId, ref `Folder`) is set; **unfiled = `folder` null/missing** (`server/models/index.js` ~lines 128–187). Move endpoint: `PATCH /api/articles/:id/move` (`server/routes/legacyContentRoutes.js` ~lines 484–516); frontend `moveArticleToFolder()` (`note-taker-ui/src/api/articles.js` ~lines 54–62). Unfiled/ready counts: `buildMaintenanceSummary()` in `note-taker-ui/src/components/library/libraryReadingRoomModel.js` (~lines 110–173).

### The fix
Make "Review filing suggestions" actually generate a reviewable filing proposal, and make the classification good enough to trust.

1. **Wire the action to the engine.** `handleReviewFiling()` should trigger the `cleanup_structure` proposal flow scoped to **unfiled articles that have highlights** (the ~230), not just filter the view. It should return a staged bundle (proposed folder per article) the user can review and approve. Keep human-in-the-loop approval — do not silently mutate. (If you want an "auto-file high-confidence" toggle, make it opt-in and clearly labeled.)
2. **Upgrade classification from regex to LLM.** Replace/augment `inferOrganizationFolderName()` with an LLM categorizer that, given the article title + snippet + existing folder names, returns the best existing folder or proposes a new one, with a confidence. Reuse existing folder names so it consolidates instead of inventing duplicates. Keep the regex as a cheap fallback if the LLM call fails.
3. **Show progress honestly.** After a filing run, the unfiled count must visibly drop and the Cabinet category counts must rise. The "230 ready to classify" line should reflect the post-run state.

### Acceptance criteria
1. Live: from `/library`, "Review filing suggestions" produces a concrete list of proposed (article → folder) moves for the unfiled-with-highlights set. Approving them reduces UNFILED from 235 toward single/low double digits and increases category counts. Paste before/after counts in the PR.
2. Proposals use existing folders where sensible (no near-duplicate folders like "AI" + "Technology and Innovation" for the same item without reason).
3. Nothing is moved without user approval (unless an explicit opt-in auto-file is toggled).
4. Counts in the maintenance block and Cabinet are consistent after a run.

---

## Item 3 (P2) — Wiki front page dark mode is cool blue-black, not warm near-black

### The live symptom
On `/wiki` in dark mode, `getComputedStyle(document.body).backgroundColor` = **`rgb(13, 20, 34)`** (cool blue-black, `#0d1422`). The rest of the app and the design language require a **warm near-black** (`#14110d` / `rgb(20,17,13)`). Design language §5: dark mode is warm, never cold blue-black. Unchanged for 3 cycles.

### Root cause
The cool color is `--bg-shell: #0d1422` defined in `note-taker-ui/src/styles/dashboard-refresh.css` (~line 29, dark theme) and applied via `body { background: var(--bg-shell); }` (~line 44). That paints the **body**.

The warm override exists but isn't winning on this route:
- `note-taker-ui/src/styles/stitch-editorial.css` (~line 56): `body.noeis-editorial { background: var(--vellum-bg) !important; }` and `--vellum-bg: #14110d;` (~line 145, dark).
- `note-taker-ui/src/styles/wiki-front-page.css` (~lines 15–19): sets `background: var(--vellum-bg, var(--canvas))` but only on `.wiki-front-page` / `.page-area:has(.wiki-front-page)` containers — **not on `body`** — and those containers are likely transparent over the body, so the cool body shows through.

Net: the warm `body.noeis-editorial` rule only helps if the `noeis-editorial` class is actually on `<body>` for the wiki front page route. The measured cool body means either (a) `noeis-editorial` is not applied on the `/wiki` front-page route, or (b) `dashboard-refresh.css`'s `body` rule is overriding. Both are plausible; confirm which.

### The fix
1. Confirm in the browser whether `<body>` has class `noeis-editorial` on `/wiki` (the front page route), the way it does on `/wiki/workspace` (the article reader, which is correctly warm). If it's missing on the front page, add it where the route mounts (WikiFrontPage should put the body in the editorial register like every other reading surface).
2. If the class is present but `--bg-shell` still wins, repoint the wiki front-page background to the warm token on the **body/shell** level (not just inner containers), or ensure `body.noeis-editorial`'s warm `!important` rule loads after / outranks `dashboard-refresh.css`.
3. Do not introduce a new color literal. Use the existing `--vellum-bg` (`#14110d`) / `--canvas` (`#16140f`, `theme.css` ~line 69) tokens.

### Acceptance criteria
1. Live: on `/wiki` in dark mode, `getComputedStyle(document.body).backgroundColor` returns the warm token (`rgb(20, 17, 13)` / `#14110d`), matching `/wiki/workspace` and the rest of the app. Paste the measured value in the PR.
2. Light mode unchanged. No other route's background regresses (check `/`, `/library`, `/think`, `/wiki/workspace`).

---

## Summary for the PR description
- **Item 1** is the one that matters. Root cause: chat is wired to `collaborativeAgentService` (single page) instead of the already-built graph path in `wikiAskService`. Fix the routing + the page-only gate + stop dumping open-questions text.
- **Item 2**: "Review filing suggestions" is a no-op view filter; classification is regex-only. Wire it to the cleanup_structure engine and upgrade to LLM categorization.
- **Item 3**: cool `--bg-shell` body paints through on `/wiki`; ensure the warm editorial token wins on the front page route.
- Verify all three **live**, before/after, not just via unit tests.

---

# Codex addendum — product/user-test gaps not covered by Claude's three-item spec

**Author:** Codex product pass, production user test after `cfe5c9b`, 2026-06-14
**Scope:** These are not replacements for Items 1-3 above. Item 1 remains the primary product risk. This addendum adds the weaker interaction/detail gaps I saw while using production as a user.

**Do not duplicate already-closed cleanup.** The following should be treated as closed unless a fresh repro proves otherwise:
- Library blank highlight-only imports: fixed in `cfe5c9b`. `Poor Charlie's Almanack by Charles T. Munger` opens as a `Highlight edition` with 27 highlights in the main reader.
- Library filler copy: fixed; rows show real metadata/highlight counts.
- Readwise connection default: fixed; `/connections#sources` presents browser approval as the primary path and token paste as advanced/fallback.
- `MORE` topbar button: fixed; it opens a menu.
- Library `TEST`/`Blah` cruft: Claude reports fixed. Do not spend another pass on those exact labels unless they reappear live.

## Item 3 status note — dark wiki front page has conflicting evidence

Claude's latest report says `/wiki` body background is still `rgb(13,20,34)`. Codex measured `/wiki` on production after `cfe5c9b` and saw `rgb(20,17,13)` after the front page resolved.

**Required next step before coding Item 3:** re-measure live in the browser with:

```js
getComputedStyle(document.body).backgroundColor
document.body.className
```

on both:
- `/wiki`
- `/wiki/workspace?page=<known page id>`

If `/wiki` is warm on the current deployed bundle, close Item 3 with live evidence instead of editing CSS again. If it is still cool for Claude/Safari but warm in Codex, treat it as either deployment/cache/theme-state divergence or a body-class timing issue.

## Item 4 (P1) — Highlight-only Library books technically render, but the reader still puts agent chrome before the material

### Live symptom
Opening a highlight-only Readwise book now shows the saved highlights, which fixes the blank-page bug. But the first viewport is dominated by:
- article header
- `Draft-first article moves`
- `AgentSkillDock`
- `ThoughtPartnerPanel`

The actual `Highlight edition` content begins below the agent band. In the production narrow browser test, the first visible viewport of `Poor Charlie's Almanack` showed mostly agent cards; the highlight body only appeared after scrolling the internal `.three-pane__main` container.

This is a product problem, not a data bug. A user who opens a book of highlights expects the highlights first. Agent moves should be available, but not allowed to displace the reading object.

### Source pointers
- `note-taker-ui/src/components/ArticleReader.jsx`
  - agent band renders before content: `.article-reader-agent-band` with `AgentSkillDock` + `ThoughtPartnerPanel`.
  - highlight fallback renders later as `.article-highlight-edition`.
- `note-taker-ui/src/styles/theme.css`
  - `.article-highlight-edition*` styles were added with the blank-page fix.
- `note-taker-ui/src/styles/stitch-editorial.css`
  - `.article-reader-agent-band*` layout lives around the reader polish section.

### Fix
For `isHighlightOnlyImport`:
1. Render `.article-highlight-edition` before `.article-reader-agent-band`, or collapse the agent band into a compact "Use these highlights" affordance below the first few highlights.
2. Change the agent headline from `Draft-first article moves` to a highlight-specific line, e.g. `Use these highlights`.
3. Keep selection/highlight capture working. The highlight edition must remain selectable and must still support `MagneticReadingRail`.

### Acceptance criteria
1. Live: open a highlight-only Readwise book. The first viewport after the header contains the `Highlight edition` lead and at least one highlight.
2. Agent actions are still reachable but do not occupy the dominant first reading viewport.
3. Existing full-text articles keep the current article-reader layout unless intentionally changed.
4. Add/extend an `ArticleReader` test proving highlight-only imports render the highlight edition before the agent action band.

## Item 5 (P1) — Wiki ask composer has ambiguous "ASK" mode/submit behavior, especially at narrow width

### Live symptom
On `/wiki/workspace?page=Loss Aversion` at narrow width, there are two ask surfaces:
- hidden/zero-rect workspace chat textarea: `placeholder="Ask, paste a source, or type / for wiki commands"`
- visible top input: `placeholder="Ask, paste a source, or type /"` with visible `ASK` and `BUILD` buttons

In Codex's production user pass, entering `How does loss aversion connect to opportunity cost?` in the visible top input and pressing `ASK` changed the URL to `&pane=chat`, but no visible answer appeared after ~20 seconds. The control behaved like a pane/mode switch, not a clear submit. This compounds Item 1: even if graph retrieval is fixed, the user must understand which composer actually sends the question.

### Source pointers
- `note-taker-ui/src/components/wiki/WikiWorkspace.jsx`
  - workspace composer around `.wiki-workspace-chat__composer`, `.wiki-workspace-chat__composer-field`, `.wiki-workspace-chat__send`.
  - visible top/wiki page command input uses the `ASK`/`BUILD` controls nearby.
- `note-taker-ui/src/styles/wiki-critical.css`
- `note-taker-ui/src/styles/think-home-polish.css`
  - composer visual treatment and `.wiki-workspace-chat__send` styles.
- Backend endpoint for actual stream: `POST /api/agent/chat/stream` in `server/routes/agentChatRoutes.js`.

### Fix
1. Make the visible `ASK` path either submit the typed question directly or clearly open/focus the real chat composer with the text preserved.
2. If it only switches panes, do not label it `ASK`; label the action honestly, e.g. `Open chat`.
3. Ensure the real `Send` button is visible/reachable after switching panes, and that the typed question is not stranded in a mode-switch input.
4. Tie this UX fix to Item 1's graph-aware answer path so the acceptance test uses the same user flow.

### Acceptance criteria
1. Live narrow-width test: type `How does loss aversion connect to opportunity cost?` into the visible wiki ask field and click the primary action. A visible answer streams or appears without requiring a second hidden composer interaction.
2. The UI shows an unambiguous progress/streaming state.
3. The answer path uses the graph-aware behavior from Item 1.
4. Regression test in `WikiWorkspace.test.jsx` for the visible ask field preserving/submitting text.

## Item 6 (P2) — Think calm home loses the main product moment at narrow width and feels too empty at desktop width

### Live symptom
At narrow in-app browser width (~599px), `/think?tab=home` first viewport is almost entirely `ThinkShelfRail`:
- search corpus
- concepts list
- questions list
- notebook list

The orientation h1 (`Your "investing" thread is warm again: 4 newer sources.`) exists in the DOM but is not the first visible product moment. At desktop width, the h1 is beautiful, but the center has too much empty space before `In motion` appears. It feels like a title page, not a working desk.

### Source pointers
- `note-taker-ui/src/pages/ThinkMode.jsx`
  - `ThinkShelfRail` mounts around the index surfaces.
  - `CalmIndexView` renders the calm h1/in-motion/on-shelf center.
- `note-taker-ui/src/components/think/ThinkShelfRail.jsx`
- `note-taker-ui/src/components/think/CalmIndexView.jsx`
- `note-taker-ui/src/styles/stitch-editorial.css`
  - `.think-shelf-rail*`, `.think-calm-index*`.

### Fix
1. On narrow widths, make the main calm orientation lead appear before the shelf rail, or collapse the shelf rail behind a compact `Shelf` disclosure. Do not let navigation/list material consume the first viewport.
2. On desktop, pull `In motion` closer to the h1 so the first viewport contains both orientation and live work.
3. Preserve the shelf rail on index surfaces; this is a layout priority fix, not a removal.

### Acceptance criteria
1. Live narrow-width screenshot: first viewport contains the calm h1 and at least one `In motion` row before or alongside shelf navigation.
2. Live desktop screenshot: h1 + first `In motion` row are both visible without scrolling.
3. Existing `ThinkMode.templates.test.jsx` queued prompt/mounting tests still pass.
4. Add a layout smoke test where feasible for `ThinkShelfRail` not preceding the h1 on narrow index view.

## Item 7 (P2) — Library browse right rail and raw theme tags still weaken the reading-room feel

### Live symptom
Library browse is much better: one article search, real metadata, worth-reopening lead. But the right rail still takes meaningful horizontal space for low-value browse context:
- `Thought partner`
- `MARGINALIA / ACTIVE REASONING`
- empty/abstract `Highlights / Notebook / Concepts / Questions`
- `Current shelf`
- `Curated theme`

It also exposes raw tags like `imported`, `favorite`, `alphabet`, `ai`, `ai-capex`, `Know` in places that feel like internal metadata rather than curated product language. Claude reports test labels are gone; this is a separate issue: not test cruft, but uncurated taxonomy leaking into primary copy.

### Source pointers
- `note-taker-ui/src/pages/Library.jsx`
  - `topThemeTags` and `themes: ${topThemeTags.join(', ')}` around the right-rail summary.
  - browse/right rail around `library-context-stack--browse`.
- `note-taker-ui/src/components/library/LibraryContext.jsx`
- `note-taker-ui/src/styles/stitch-editorial.css`
  - `.library-context-stack--browse`, `.library-context-section*`.

### Fix
1. In browse mode, demote or collapse the right rail by default unless it has article-specific content. The central Library list/search should be the product's main surface.
2. Filter or editorialize raw theme tags before showing them in primary copy. `imported`, `favorite`, and one-word internal tags should not become the first signal of the Library's "Curated theme."
3. Keep article reading mode rich. The rail earns its place once a specific article/highlight is selected.

### Acceptance criteria
1. Live `/library` browse first viewport gives the article list/search more space than the right context rail.
2. `themes:` no longer displays raw low-signal tags such as `imported`, `favorite`, `alphabet`, `ai` as the primary thematic statement.
3. Reading a selected article still shows highlights/marginalia context in the rail.
4. Add/extend a Library test that raw maintenance/import tags are filtered out of `topThemeTags` display while legitimate user themes remain.

## Suggested implementation order

1. **Item 1 + Item 5 together:** graph-aware wiki ask routing plus a clear visible ask submission path. This is the product-defining gap.
2. **Item 2:** real reviewable Library filing proposals.
3. **Item 4:** make highlight-only books read like books of highlights, not agent workbenches.
4. **Item 6:** Think responsive layout polish.
5. **Item 7:** Library browse right rail/tag editorialization.
6. **Item 3 only after revalidation:** if dark wiki front page is still cool in the current production bundle, fix it; otherwise close with measured evidence.

## Delegation notes

Good Cursor/Grok tasks:
- Item 4: move/reorder highlight-only reader layout and add `ArticleReader` ordering test.
- Item 6: responsive CSS/layout investigation for `ThinkShelfRail` vs `CalmIndexView`, with screenshots at 599px and 1440px.
- Item 7: raw theme-tag filtering inventory and test.

Keep for Codex/backend owner:
- Item 1: graph-aware routing from `agentChatRoutes` to `wikiAskService`.
- Item 2: filing proposal generation and LLM categorization.
- Item 5: visible wiki ask flow if it touches stream routing and backend activity receipts.
