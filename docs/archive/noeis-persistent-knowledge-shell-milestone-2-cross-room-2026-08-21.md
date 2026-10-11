# Persistent knowledge shell — Milestone 2 cross-room acceptance

Date: 2026-08-21
Candidate: uncommitted worktree on `codex/noeis-persistent-knowledge-shell-2026-08-20`
Base: `3652d2e5da022198bd4630fff4eb5809ef497796`

## Outcome

Milestone 2 passes locally and in an authenticated rendered browser journey. Library, Think, Wiki, and Judgment now expose stable semantic object identity through one persistent shell. The global shell, TopBar, and Agent rail retain DOM identity while the active room and exact object change.

The accepted journey used real QA-account objects:

1. Library article `6a1f869f9f6e43675009e672` opened its connected Question `6a1f869f9f6e43675009e67d` in Think.
2. Think moved to an ordinary Wiki page without remounting the shell or losing an unsent Agent draft.
3. Wiki page `6a65449b0ea2a3b563a2f897` opened its Judgment case through a direct exact-page link.
4. Judgment declared `judgment_claim` identity for the same page id.
5. One browser Back returned to the exact Wiki page with the same shell nodes and the unsent Agent draft intact.

## Repairs and cleanup

- Replaced hard-reloading cross-room anchors in `ReferencePullIn` with React Router links. The old anchors remounted the application and discarded warm Agent state.
- Added an exact Wiki-to-Judgment door for Wiki pages that carry a Judgment case.
- Added a pure Think surface descriptor so Question, Concept, Agent thread, handoff, learning-path, and insight postures declare stable identity; name-only Concepts fail closed until their record id loads.
- Exposed current semantic object type and id as observable shell attributes for browser acceptance and future contextual-agent binding.
- Deleted the unconsumed `SurfaceFrame` component and test. The active-room thread CSS remains because the real shell uses it.
- Narrowed Wiki list projection from the entire Judgment subtree to the exact summary fields used by the Judgment index. This repairs the root projection contract and avoids loading large case histories on every Wiki list request.

## Verification

- `wikiRoutes.summaryProjection.test.js`: pass.
- Cross-room focused UI matrix: 6 suites, 71 tests: pass.
- Production frontend build: pass.
- `git diff --check`: pass.
- Authenticated browser acceptance: pass at 1440 and 430 widths; exact identity and one-Back return were inspected.
- Evidence: `output/playwright/noeis-cross-room-continuity-2026-08-21/`.

The root `wiki:qa` run passed dossier prechecks and the repaired projection test, then failed to complete because the unchanged `wikiRoutes.contract.test.js` process remained open. It was stopped after the process hung; this is not a green cumulative gate and is tracked separately.

## Proof boundary

This is local implementation, focused automated verification, production-build verification, and authenticated rendered-browser proof. It is not a commit, push, merge, deployment, production acceptance, or isolated disposable-database run. Intermittent Mongo Atlas pool resets were observed while repeating the browser journey; runtime reliability remains a separate concern.

## Next

Milestone 3: make contextual-agent contracts declarative. Each room should register its permitted context, suggestions, and actions without adding inference or branching inside the shared Agent rail. First reconcile the Wiki workspace's richer embedded-agent path with the now-proven persistent global Agent so there is one authority and no feature loss.
