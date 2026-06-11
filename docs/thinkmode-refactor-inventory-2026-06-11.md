# ThinkMode refactor inventory — 2026-06-11

Scope: AT-398 investigation plus the first proof extraction. Source file: `note-taker-ui/src/pages/ThinkMode.jsx`.

## Current shape

`ThinkMode.jsx` is still the owner of routing, view state, data hooks, prompt routing, shells, rails, and modals. It is 6.5k+ lines and uses one large `mainPanel` ternary plus multiple editorial shells. That means dead JSX variables are deploy risk because Vercel builds with `CI=true`.

## Active view branches

| Branch | Lines before extraction | Reachability |
| --- | ---: | --- |
| `home` | 4131-4165 | Reached through `homeEditorialLayout`; fallback only with `legacyShell=0`. |
| `notebook` | 4166-4219 | Reached through `notebookEditorialLayout`; fallback only with `legacyShell=0`. |
| `questions` | 4220-4278 | Suspicious dead branch: final return always selects `questionEditorialLayout` for questions. |
| `threads` | 4279-4292 | Reached through fallback `ThreePaneLayout`. |
| `handoffs` | 4293-4306 | Reached through fallback `ThreePaneLayout`. |
| `paths` | 4307-4311 | Reached through fallback `ThreePaneLayout`. |
| `insights` | 4312-4315 | Reached through fallback `ThreePaneLayout`. |
| `concepts` index | 4316-4438 | Reached through `conceptIndexEditorialLayout`; now extracted to `ConceptsIndexView`. |
| selected concept final branch | 4439-4707 | Suspicious dead branch: final return selects `selectedConceptLayout` before fallback. |

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
| `questionEditorialLeftPanel` | 5684 | 6308 | Active questions shell. |
| `questionEditorialMainPanel` | 5976 | 6312 | Active questions main panel. |
| `questionEditorialRightPanel` | 6096 | 6315 | Active questions right rail. |
| `questionEditorialLayout` | 6304 | 6334 | Active for all questions views. |

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
3. Prove or delete the suspicious `mainPanel` questions branch. Do not delete until a route matrix confirms no `legacyShell` path needs it.
4. Prove or delete the suspicious selected-concept final branch. It appears masked by `selectedConceptLayout`.
5. Extract `QuestionEditorialView` only after the dead branch decision; it is the highest-risk next target because prompt routing and `QuestionEditor` evidence props are coupled.
6. Extract `NotebookEditorialView` after question path stabilizes.

## Cursor-delegatable follow-ups

- Expand this inventory with exact dependency props for `questionEditorialLayout`.
- Write a no-edit report proving whether `mainPanel` questions branch is unreachable.
- Write a no-edit report proving whether the selected-concept final branch is unreachable.
- Add targeted tests for any branch before deletion.
