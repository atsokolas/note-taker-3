# ThinkMode refactor inventory — 2026-06-11

Scope: AT-398 investigation plus staged proof extractions and dead-branch removal. Source file: `note-taker-ui/src/pages/ThinkMode.jsx`.

## Current shape

`ThinkMode.jsx` is still the owner of routing, view state, data hooks, prompt routing, shells, rails, and modals. It is 6k+ lines and uses one large `mainPanel` ternary plus multiple editorial shells. That means dead JSX variables are deploy risk because Vercel builds with `CI=true`.

## Active view branches

| Branch | Lines before extraction | Reachability |
| --- | ---: | --- |
| `home` | 4131-4165 | Reached through `homeEditorialLayout`; fallback only with `legacyShell=0`. |
| `notebook` | 4166-4219 | Reached through `notebookEditorialLayout`; fallback only with `legacyShell=0`. |
| `questions` | 4220-4278 | Removed on 2026-06-11. Final return always selects `questionEditorialLayout` for questions. |
| `threads` | 4279-4292 | Reached through fallback `ThreePaneLayout`. |
| `handoffs` | 4293-4306 | Reached through fallback `ThreePaneLayout`. |
| `paths` | 4307-4311 | Reached through fallback `ThreePaneLayout`. |
| `insights` | 4312-4315 | Reached through fallback `ThreePaneLayout`. |
| `concepts` index | 4316-4438 | Reached through `conceptIndexEditorialLayout`; now extracted to `ConceptsIndexView`. |
| selected concept final branch | 4439-4707 | Removed on 2026-06-11. Final return selects `selectedConceptLayout` before fallback. |

## Panel and shell variables

| Variable | Defined | Referenced | Notes |
| --- | ---: | --- | --- |
| `defaultLeftPanel` | 2831 | 3351 | Fallback/legacy left rail. |
| `homeEditorialLeftPanel` | 3041 | 5568 | Home editorial shell. |
| `notebookEditorialLeftPanel` | 3188 | 3346, 5584 | Notebook shell and legacy fallback. |
| `handoffLeftPanel` | 3297 | 3344 | Handoffs fallback shell. |
| `threadLeftPanel` | 3304 | 3342 | Threads fallback shell. |
| `leftPanel` | 3329 | 6344 | Fallback `ThreePaneLayout` only. |
| `insightsPanel` | 3353 | 4314 | Insights `mainPanel` branch. |
| `mainPanel` | 4131 | 5571, 5587, 5674, 6345 | Shared main body; contains suspicious dead branches. |
| `workingMemoryDrawer` | 4748 | 4803, 4820 | Used inside fallback `rightPanel`. |
| `rightPanel` | 4763 | 6346 | Fallback `ThreePaneLayout` only. |
| `selectedConceptLayout` | 5149 | 6326 | Active selected-concept shell. |
| `conceptIndexEditorialRightPanel` | 5313 | 5678 | Active concept index right rail. |
| `notebookEditorialRightPanel` | 5365 | 5590 | Active notebook right rail. |
| `homeEditorialRightPanel` | 5452 | 5574 | Active home right rail. |
| `homeEditorialLayout` | 5564 | 6328 | Home shell when not `legacyShell=0`. |
| `notebookEditorialLayout` | 5580 | 6330 | Notebook shell when not `legacyShell=0`. |
| `conceptIndexEditorialLayout` | 5629 | 6332 | Concept index shell. |
| `questionEditorialLayout` | 4977 | 5035 | Active questions shell; extracted to `QuestionEditorialView`. |

## First extraction proof

Created `note-taker-ui/src/components/think/concepts/ConceptsIndexView.jsx`.

This moves the AT-329 concept-index rendering out of `ThinkMode.jsx` while keeping all state and side effects in the parent. Explicit props:

- `orientation`
- `conceptsError`
- `conceptsLoading`
- `filteredConcepts`
- `motion`
- `allConceptsCount`
- `search`
- `onSelectConcept`
- `onOpenComposer`
- `onOpenTemplatePicker`
- `renderConceptComposer`
- `describeMotionNote`

This is intentionally not a full concepts refactor. It only proves the extraction seam for a low-risk, display-heavy branch.

## Dead-branch removal proof

Removed two unreachable `mainPanel` branches from `ThinkMode.jsx`:

- `activeView === 'questions'`: superseded by `questionEditorialLayout` in the final return.
- Selected concept fallback branch: superseded by `selectedConceptLayout` when `isConceptWorkbenchView` is true.

Follow-on cleanup removed the dead support code owned only by those branches:

- Legacy summary-edit state and save handler.
- Legacy concept pin toggles and add-modal path.
- Legacy concept highlight pagination state.
- Unused imports for the old question/concept collection panels.
- The `showLegacyConceptCollections = false` marker.

Verification:

```bash
CI=1 npm test -- --watchAll=false --runInBand src/pages/ThinkMode.templates.test.jsx
CI=true npm run build
```

Both pass after removal.

## Question extraction proof

Created `note-taker-ui/src/components/think/questions/QuestionEditorialView.jsx`.

This moves the active question editorial shell out of `ThinkMode.jsx`:

- Left `EditorialRail` question navigation.
- Question evidence derivation for support/counter lanes and per-line evidence docking.
- Main question editor and inline evidence dock.
- Right thought-partner rail, dialectical margin, wiki promotion, draft queue, backlinks, related highlights, and related concepts.
- The question editorial shell wrapper.

Parent-owned state and side effects intentionally remain in `ThinkMode.jsx`:

- URL/search-param routing and active question selection.
- Question save/create/answer mutations.
- ThoughtPartner context and queued prompt routing.
- Reference pull-in rendering.
- Wiki promotion mutation state.
- Agent draft queue handlers.

Shared rail primitives moved to `note-taker-ui/src/components/think/EditorialRail.jsx` so future view extractions do not keep depending on `ThinkMode.jsx` local components.

Verification:

```bash
CI=1 npm test -- --watchAll=false --runInBand src/pages/ThinkMode.templates.test.jsx
CI=true npm run build
```

Both pass after extraction.

## Notebook extraction proof

Created `note-taker-ui/src/components/think/notebook/NotebookEditorialView.jsx`.

This moves the active notebook editorial surface out of `ThinkMode.jsx`:

- Left `EditorialRail` notebook navigation, notebook search, working notebook lists, concept lists, and question lists.
- Main notebook landing/editor branch, including the empty-state prompt tiles and `NotebookEditor` wiring.
- Right passive thought-partner rail, reference pull-in, draft queue, notebook posture actions, `NotebookContext`, and wiki promotion controls.
- The notebook editorial shell wrapper.

Parent-owned state and side effects intentionally remain in `ThinkMode.jsx`:

- URL/search-param routing and active notebook entry selection.
- Notebook create/save/delete mutations and insertion ref registration.
- ThoughtPartner context and queued prompt routing.
- Reference pull-in rendering.
- Wiki promotion mutation state.
- Folder/move modal state.

The extraction keeps the `legacyShell=0` route alive by rendering the same component in `left`, `main`, and `right` variants for the old `ThreePaneLayout` fallback instead of deleting that path.

Verification:

```bash
CI=1 npm test -- --watchAll=false --runInBand src/pages/ThinkMode.templates.test.jsx
CI=true npm run build
```

Both pass after extraction.

## AT-354 diagnostic

The persistent rail clip is probably not the rail column itself. The right rail column is narrow by design:

- Concept selected shell: `.concept-editorial-shell` uses `220px minmax(0, 1fr) 336px`.
- Question shell: `.question-editorial-shell` uses `250px minmax(0, 1fr) 300px`, then `260px minmax(0, 1fr) 320px` under the 1360px breakpoint.

Likely fixed-width/no-wrap descendants:

- `.concept-editorial-evidence__result-head`
- `.concept-editorial-evidence__item-footer`
- `.question-editorial-shell__right .related-embed-row`
- `.question-editorial-shell__right .context-connection-row`

Patch added wrap/min-width rules for those selectors. Browser proof still needs to measure live concept and question rails.

Measurement snippet:

```js
const rail = document.querySelector(
  '.concept-editorial-shell__stream, .question-editorial-shell__right'
);
[...rail.querySelectorAll('*')]
  .map(el => ({
    cls: el.className,
    tag: el.tagName,
    client: el.clientWidth,
    scroll: el.scrollWidth,
    delta: el.scrollWidth - el.clientWidth,
    text: el.textContent?.trim().slice(0, 80)
  }))
  .filter(x => x.delta > 4)
  .sort((a, b) => b.delta - a.delta)
  .slice(0, 20);
```

Pass condition: rail `scrollWidth <= clientWidth + 1` for both concept and question rails.

## Test harness

Primary harness: `note-taker-ui/src/pages/ThinkMode.templates.test.jsx`.

Coverage summary:

- `/think`: default concept workspace, calm index, stale status, posture tab, advanced routes menu.
- `/think?tab=concepts&concept=...`: selected concept posture, wiki promotion, view-transition navigation, name-only concept persistence before pull/promote.
- `/think?tab=questions&questionId=...`: question wiki promotion, dialectical margin, support/counter dock, pulled references, cleanup prompt.
- `/think?tab=notebook` and `entryId`: passive notebook posture, notebook wiki promotion.
- `/think?tab=home`: template picker and Home command reference persistence.
- `/think?tab=concepts` empty: first-run concept composer.
- Parameterized notebook/concepts/questions: cleanup prompt routes to the last-mounted ThoughtPartner context.

Required gate for future `ThinkMode.jsx` changes:

```bash
CI=1 npm test -- --watchAll=false --runInBand src/pages/ThinkMode.templates.test.jsx
CI=true npm run build
```

## Sequenced plan

1. Land the `ConceptsIndexView` extraction and AT-354 narrow CSS hardening.
2. Browser-measure concept and question right rails. If AT-354 still fails, patch only the measured descendant.
3. Extract `NotebookEditorialView` after question path stabilizes.
4. Reduce the remaining `mainPanel` fallback branches for threads/handoffs/paths/insights into route-specific modules.
5. Purge stale legacy CSS only after route extraction stabilizes and selector reachability is rechecked.

## Cursor-delegatable follow-ups

- Inventory stale CSS selectors after the deleted legacy concept branch, especially concept collection and old add-modal selectors. Safe-looking candidates include `.think-concept-hero`, old concept summary/toolbar selectors, `.concept-suggestion-actions`, and legacy concept collection/card selectors. Keep workbench/editorial/insights paths such as `.concept-editorial-shell*`, `.think-concept-loading`, and `.concept-highlight-card` until browser reachability is proven.
- Write a no-edit extraction plan for the remaining fallback route modules: `ThreadsView`, `HandoffsView`, `PathsView`, and `InsightsView`. Include exact props, tests, and whether each branch is still mounted under `legacyShell=0`.
- Browser-QA `/think?tab=notebook&legacyShell=0` to confirm the extracted notebook `left`/`main`/`right` variants still match the pre-extraction fallback.
