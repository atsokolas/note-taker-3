# Noeis Wiki Product QA Test Plan - 2026-05-30

## Goal

Verify that the LLM-native wiki experience behaves like the product direction we have been converging on: a source-backed reading and synthesis workspace with an always-available agent, useful wiki graph/list navigation, low-friction page creation, and no obvious layout regressions.

## Environment

- Frontend: `http://localhost:3000`
- Backend: configured app API
- Browser: Codex in-app Browser
- Primary account state: authenticated local/browser session

## Pass Criteria

- Authenticated `/` routes into the app, not the public landing page.
- Global topbar search remains visible and consistent across app surfaces.
- `/wiki` opens the general wiki home/workspace, not an arbitrary page.
- Wiki graph/list both expose usable page navigation.
- Existing wiki pages open from list/graph and render the new workspace read surface.
- Agent workspace is visible near the reading surface, not buried at page bottom.
- Build composer can create a page and route into the workspace with an automatic draft/build handoff.
- Mobile/small viewport wiki workspace shows mutually exclusive Chat/Wiki panes without sideways scrolling.
- Page metrics are nonzero for seeded QA/demo wiki pages: sources, claims, words, and graph relationships.
- Agent can answer a page-grounded question with citations or source references.
- UI/UX feels aligned with the target direction: quiet editorial reading surface, visible agent workspace, source-backed claims, and enough density to be useful without noisy chrome.

## Test Cases

1. Root routing and app shell
   - Open `/`.
   - Confirm redirect to app home and no public landing page under authenticated chrome.
   - Confirm topbar navigation and search field are visible.

2. Wiki home and navigation
   - Open `/wiki`.
   - Confirm general wiki home/workspace appears.
   - Switch between Graph and List.
   - Open a seeded page from list or graph.

3. Wiki page reading surface
   - Confirm the page renders the workspace reader, contents rail, right metadata/source rail, and agent workspace.
   - Confirm no legacy "Open wiki agent" CTA appears when the agent rail is already visible.
   - Confirm metrics are populated and claims/citations appear in article body.

4. Agent page context
   - Ask the page agent: `What is the strongest claim on this page and what source supports it?`
   - Confirm response is page-specific and cites/supports from page material.

5. Build page flow
   - Use the wiki build composer with a throwaway QA topic.
   - Confirm route becomes `/wiki/workspace?page=<id>` and the page drafts/refreshes in the workspace without manual reload.

6. Mobile/small viewport
   - Resize to mobile width.
   - Confirm there is no horizontal page scrolling.
   - Confirm Chat and Wiki panes are mutually exclusive and switchable.

7. Product vision review
   - Evaluate whether the surface feels like an LLM-native wiki rather than a static article page.
   - Note gaps where source inspection, graph behavior, agent affordances, or editorial layout still feel weak.

## Defect Capture

Any failing or weak area should become a Linear issue unless it is already represented by an open backlog item. Completed items should remain closed only if the browser pass verifies the behavior in the product.
