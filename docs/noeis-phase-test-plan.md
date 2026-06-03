# Noeis Phase Test Plan

Status: living plan for the current Linear backlog phase.
Specs covered:
- `docs/noeis-vision-architecture.md`
- `docs/prd-llm-native-wiki-reshape.md`
- `docs/noeis-motion-interaction.md`
- `docs/noeis-design-language.md`

## 0. Completion Matrix

This phase is not complete until each row has direct evidence. A passing build alone is not evidence for product fit.

| Area | Spec source | Required proof |
| --- | --- | --- |
| Three-surface architecture | Vision §4, Design §14 | Top nav exposes Library / Think / Wiki as the main surfaces; Concept, Question, and Notebook open as Think postures rather than separate top-level destinations. |
| One agent | Vision §2/§5, Design §8 | The same agent identity, presence dot, ticker, and right-rail posture appear across Home, Think, and Wiki. |
| Connective tissue | Vision §5/§7, Design §13, Motion §3 | Pull-in searches Library, Think, and Wiki objects; save writes reciprocal edges; both `out` and `in` references are visible; legacy wiki graph routes resolve to `/wiki/workspace?page=...`. |
| Library as source | Vision §4/§6/§10, Design §16 | Library articles/highlights are reachable from pull-in and can be used as provenance for Think/Wiki work without leaving the current surface. |
| Think chassis | Vision §4, Design §12, Motion §4 | Concept is the base workspace; Question adds sourced support/counter structure; Notebook makes the agent passive and non-interruptive; switching posture changes behavior and visible workspace shape. |
| Wiki reshape | PRD §6/§9, Vision §4/§7 | Wiki pages open read-first, graph is the default index with list fallback, source feed/build affordances are visible, ask-this-page cites context, and answer promotion remains available. |
| Intake ripple | PRD §6.4, Vision §6, Motion §2 | Dropping a source produces a visible receipt/ticker, affected page candidates, activity/log evidence, and a path to create a page when no relevant page exists. |
| Compounding map | Vision §6/§10, Motion §6/§7 | Think questions/concepts/answers can graduate to Wiki with a visible register transition, and graph/map/backlinks reveal the denser corpus shape. |
| Motion and accessibility | Motion §1/§2/§5, Design §3/§6 | Ticker state has reduced-motion fallback; history strip is accessible; dark tokens stay warm; no core Wiki/Think route creates horizontal scrolling at desktop/tablet/mobile widths. |

## 1. Product Requirements To Prove

### Navigation and Surface Model
- Top-level app reads as Library / Think / Wiki.
- Concept, Question, and Notebook are Think postures, not separate top-level products.
- Switching posture changes visible workspace shape and agent stance.
- Wiki remains settled, reading-first knowledge.
- Library remains intake but its material is summonable elsewhere.

### Connective Tissue
- Pulling in a reference creates a durable forward edge and reciprocal trace.
- Re-pulling the same reference is idempotent and does not duplicate graph rows.
- Connections are visible from the active object as outgoing and incoming context.
- Library highlights, wiki pages, questions, notes, articles, and concepts are searchable as pull-in material.

### Wiki Reshape
- Wiki page opens read-first, not editor-first.
- Existing pages use the new read surface, not legacy editor layout.
- Inline wiki links render as links and support hover/preview behavior where available.
- Wiki index defaults to a graph/map experience with list fallback.
- Drop-source/build-page affordance is available from the Wiki workspace, not hidden behind list mode.
- Ask-this-page answers can be promoted to wiki pages.
- Source/provenance/claim health remain visible without overwhelming the reading column.

### Agent
- One agent identity appears across Library, Think, and Wiki.
- Agent panel has visible computation through the shared ticker.
- Agent answers are grounded in current page/workspace context and cite sources.
- Agent can build or promote wiki pages from commands.
- Agent activity feels live while work is running.

### Motion and Interaction
- Ticker appears in working moments instead of spinners/dead waits.
- Pull-in has an explicit confirmation state.
- Question posture shows support/counter evidence in the margin.
- Reduced-motion users still receive all state changes without relying on animation.
- No horizontal scrolling on Wiki/Think core pages at desktop, tablet, or mobile widths.

## 2. Automated Gates

Run before each deploy candidate:

```bash
cd note-taker-ui
npm test -- --runTestsByPath \
  src/components/agent/AgentTicker.test.jsx \
  src/components/agent/AgentPresence.test.jsx \
  src/components/agent/ThoughtPartnerPanel.test.jsx \
  src/components/ReferencesPanel.test.jsx \
  src/layout/AppShell.test.jsx \
  src/layout/TopBar.test.jsx \
  src/navigation/appNavigation.test.js \
  src/pages/ThinkMode.templates.test.jsx \
  src/pages/Library.agent.test.jsx \
  src/components/references/ReferencePullIn.test.jsx \
  src/components/think/ThinkHome.test.jsx \
  src/components/wiki/WikiWorkspace.test.jsx \
  src/components/wiki/WikiPageReadView.test.jsx \
  src/components/wiki/WikiIndex.test.jsx \
  src/components/wiki/WikiProductIndex.test.jsx \
  src/components/wiki/wikiGraph.test.js \
  src/components/wiki/wikiGraphPalette.test.js \
  src/components/wiki/wikiPageMetrics.test.js \
  src/utils/homeUniversalCommand.test.js \
  src/utils/thinkWikiPromotion.test.js \
  src/utils/ambientAgentContext.test.js \
  src/utils/viewTransitionNavigation.test.js \
  src/styles/themeCss.test.js \
  src/styles/stitchEditorialCss.test.js \
  src/styles/wikiCriticalCss.test.js \
  --watchAll=false --silent
npm run build
```

Backend gates:

```bash
node -c server/routes/connectionsRoutes.js
node -c server/routes/wikiRoutes.js
node -c server/server.js
node server/routes/__tests__/connectionsRoutes.search.test.js
node server/routes/__tests__/wikiRoutes.contract.test.js
node server/services/__tests__/collaborativeAgentService.test.js
npx jest server/services/wikiAskService.test.js --runInBand
node server/services/wikiGraphConnectionService.test.js
```

## 3. Browser QA Paths

Use authenticated local first, then production after deploy.

### Think
- `/think?tab=home`
  - Verify Library / Think / Wiki nav.
  - Verify corpus telemetry and agent ticker.
  - Verify no horizontal overflow at 1440, 1024, 768, 390 widths.
- `/think?tab=concepts&concept=<existing>`
  - Verify Think posture strip is visible.
  - Switch Concept -> Question -> Notebook.
  - Verify the agent ticker remains present.
  - Pull a reference and verify outgoing/incoming counts update.
- `/think?tab=questions&questionId=<existing>`
  - Verify dialectical margin.
  - Verify support and counter cards show source labels and snippets.
  - Pull a related highlight into the question.

### Wiki
- `/wiki/workspace`
  - Verify graph is default and list fallback works.
  - Verify build-page/agent composer is visible without switching to list.
  - Verify feed/drop-source is visible and does not create sideways scrolling.
- `/wiki/workspace?page=<existing>`
  - Verify read-first page.
  - Verify no editor cursor unless edit mode is engaged.
  - Verify agent chat is visible and scoped to the page.
  - Verify inline citations, claim health, source rail, and backlinks/mentions.
- `/wiki/workspace?pane=chat&page=<existing>`
  - Ask a factual question requiring page context.
  - Verify answer cites page/source context.
  - Save/promote answer as wiki page where available.

### Library
- `/library`
  - Verify existing intake experience still works.
  - Verify the default/browse rail exposes the shared Thought partner, agent ticker, and Library context trace.
  - Open an article/highlight and verify it can be referenced from Think/Wiki via pull-in.
- Local seeded provenance fixture:
  - POST `/api/debug/fixtures/library-source-provenance` in non-production.
  - Open the returned `libraryPath` and verify the article, highlight, reference affordance, and graph trace are visible.
  - Open the returned `wikiPath` and verify the seeded source appears as page provenance with no horizontal overflow.
  - DELETE `/api/debug/fixtures/library-source-provenance` after QA cleanup.

## 4. Production Smoke After Deploy

- Hard reload `https://www.noeis.io/`.
- Verify deployed build contains the latest UI changes by checking:
  - Think agent panel ticker.
  - Think posture strip.
  - Question sourced support/counter cards.
  - Reference pull-in two-way trace receipt.
- Repeat the Wiki and Think no-horizontal-overflow checks.

## 5. Current Known Remaining Areas

- No open implementation risks remain from this phase after the `ceecff5` production smoke. Continue normal regression watch for authenticated production data drift, but the backlog proof targets below now have local gates, live deploy evidence, and authenticated production browser evidence.

## 6. Latest Evidence Added

- One-agent identity: `AgentPresence` now defaults to the shared `Thought partner` identity, and source scan shows no remaining `Wiki agent` / `ask the agent` strings in product source.
- Navigation collapse: primary app navigation is guarded as Library / Think / Wiki, with old Notebook / Concept / Question paths treated as Think posture redirects.
- Think promotion provenance: promoted Concept, Question, and Notebook wiki pages now include both graph provenance and a durable return path back to the originating Think object.
- Wiki map search: Home graph/backlink intents route to the Wiki map with a query, and the graph filter preserves map context instead of falling into an empty-wiki state.
- Library source orientation: article ambient context now folds in incoming/outgoing graph traces so the Library surface can explain where a source already matters before the user moves it into Think or Wiki.
- Library one-agent shell: the default Library browse rail now renders the shared Thought partner presence/ticker instead of a static `Context` rail, and the article-reading rail keeps the same agent surface above source pull-in/provenance.
- Intake ripple page creation: no-match source ingest can create an overview wiki page with `initialSourceRef` provenance attached, route to the new page, and start the maintenance stream instead of merely placing a generic `/build` command in the composer.
- Think pull-in context bridge: pulled references in Concept/Question/Notebook now merge into the local Thought partner context immediately after the graph write, so the agent can use the freshly pulled source without waiting for a full reload.
- Pull-in trace navigation: newly-created pull-in graph rows now receive canonical open paths immediately, so the local constellation/backlink trace is navigable before a server refetch normalizes the row.
- Wiki reshape proof: local Browser pass on `/wiki/workspace?view=graph`, `/wiki/workspace?page=6a1b44af212ce816416db44f&pane=wiki`, `/wiki/workspace?page=6a1b44af212ce816416db44f&pane=chat`, and `/wiki/workspace?view=list` shows graph-first index, list fallback, visible drop-source affordance, read-first page with one `h1`, Article/Talk chrome, citations/backlinks/page context, workspace chat with build/pull-in, no editor input in read mode, and zero horizontal overflow at the in-app browser width.
- Design-token hardening: light-mode editorial dropzone tokens are now concrete values instead of self-referential `var(--dropzone-*)` declarations, `--dropzone-text` is defined in light and dark, and `stitchEditorialCss.test.js` guards the full token set against recurrence.
- Compounding map slice: selecting a Wiki graph node now keeps the user on the map, opens an inspector, and surfaces connected Library/Think objects from the persisted graph with routes back to article, highlight, concept, question, and notebook surfaces.
- Question dialectical gauge: challenged question blocks now render a per-claim support/counter balance readout with neutral waiting state when evidence is absent, matching the motion spec’s “balance gauge” requirement beside the claim.
- Question live evidence bridge: the Question posture now passes the same ranked Library/graph support and counter signals used by the dialectical margin into the editor block gauge, and the editor preserves existing challenge evidence metadata instead of dropping it during draft initialization/save.
- Library seeded provenance fixture: non-production `/api/debug/fixtures/library-source-provenance` now creates a repeatable Library article, evidence highlight, overview wiki page, and bidirectional article/highlight <-> wiki graph traces so AT-331/AT-326 can be browser-tested without depending on an account that already has saved articles.
- Current local gate: `Library.agent.test.jsx` passes 2 tests; `ReferencePullIn.test.jsx` passes 9 tests and now guards that a newly-pulled highlight trace link immediately opens `/library?highlightId=...`; `Wiki.test.jsx`, `WikiWorkspace.test.jsx`, `WikiPageReadView.test.jsx`, `WikiIndex.test.jsx`, and `wikiGraph.test.js` pass 128 tests; `stitchEditorialCss.test.js`, `themeCss.test.js`, and `ThinkMode.templates.test.jsx` pass 22 tests; the broader phase gate passes 24 suites / 240 tests; touched component lint plus `npm run build` pass.
- Current browser proof: local `/library?scope=all` shows the shared Thought partner rail with one `agent-ticker`, `Thought partner library trace`, zero horizontal overflow, and no legacy `Context` title in the right rail; local Wiki and Think smoke checks still show shared agent presence/ticker, no legacy Wiki chat, and zero horizontal overflow. The earlier in-app Browser limitation around completing a seeded reciprocal-click path is covered by focused `ReferencePullIn`, Wiki route-contract, and authenticated production graph/read proofs below.
- Seeded ask-to-wiki promotion proof: non-production `/api/debug/fixtures/library-source-provenance` now seeds an answered, cited Talk discussion on the source-backed wiki page. Local Browser QA opened the fixture page, switched to Talk, promoted the seeded answer with `Save as wiki page`, landed on `/wiki/workspace?page=<new>`, and verified the promoted page retained source `[1]`, showed one source/claim, exposed graph traces back to `Debug Fixture - Source-Backed Thesis` and the Library article, and had zero horizontal overflow at the in-app browser width.
- Dark-mode design proof: local Browser QA toggled the app to `html[data-ui-theme='dark']` and verified warm dark tokens (`--canvas: #16140f`, `--raised: #211e17`, `--sunken: #100f0c`, `--spark: #d6ad63`, `--reading-text: #f1eadc`), `color-scheme: dark`, readable wiki rail/body colors, active composer breath animation, and zero horizontal overflow.
- Critical CSS budget proof: non-production fixture banner styles moved from `wiki-critical.css` into deferred polish so the first-paint wiki stylesheet is 30,322 bytes, under the 30 KB budget. The full documented frontend phase gate now passes 25 suites / 249 tests, backend phase gates pass, and `npm run build` compiles successfully without warnings.
- Think shared-state promotion proof: pulled references in Concept/Question/Notebook are now passed into `buildThinkWikiPromotionPayload` as `initialSourceRefs`, rendered in a `Pulled References` article section, and accepted by `/api/wiki/pages` as a multi-source creation path. Backend route contracts verify promoted pages store multiple source refs and create reciprocal source <-> wiki graph edges for highlight and external URL refs. Focused local gates passed: `node -c server/routes/wikiRoutes.js`, `node server/routes/__tests__/wikiRoutes.contract.test.js`, `node server/services/wikiGraphConnectionService.test.js`, and frontend `WikiWorkspace`, `WikiProductIndex`, `WikiPageReadView`, `ThinkMode.templates`, `ThinkHome`, `AgentTicker`, `ReferencePullIn`, and `thinkWikiPromotion` suites passed 8 suites / 157 tests.
- Production closeout proof: commit `ceecff5fe1718bcb6cf8a06304b787c9de015d77` deployed live on Render backend `dep-d8frnf7lk1mc738tv4a0`, frontend `dep-d8frnf7lk1mc738tv470`, and frontend `dep-d8frnf7lk1mc738tv450`; GitHub Pages deployment also completed. Authenticated Chrome QA verified Think Home, Concept, Question, Notebook, Wiki graph, and Wiki read surfaces on `https://www.noeis.io`, with Library / Think / Wiki nav, shared Thought partner, agent ticker, source/reference controls where expected, Article/Talk chrome on the Wiki read page, one `h1`, and zero horizontal overflow at the active desktop viewport. Screenshot artifacts were captured under `/tmp/noeis-prod-smoke-ceecff5/`.
