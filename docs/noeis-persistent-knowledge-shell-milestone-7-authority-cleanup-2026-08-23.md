# Persistent Knowledge Shell — Milestone 7 authority cleanup

Date: 2026-08-23
Plan authority: `docs/noeis-persistent-knowledge-shell-registry-spec-2026-08-20.md`

## Outcome

Milestone 7 is complete locally. Navigation, authenticated route ownership, room identity, contextual-agent eligibility, connector/capability explanation, background-loop status, and semantic theme projection now resolve through one declarative system contract. The old lists and compatibility layers were removed only after their consumers moved and parity tests passed.

The result remains deliberately smaller than a plugin framework: manifests explain and resolve the existing product, while backend authentication, ownership, approval, receipts, Mongo identities, and accepted knowledge remain authoritative.

## Authority removed

- `noeisSurfaceDefinitions.js` is the sole declarative source for primary, utility, and secondary navigation; four-room metadata; route matching; and authenticated prefix ownership.
- `appNavigation.js`, `appRoutes.js`, `noeisSurfaceModel.js`, the command palette, keyboard shortcuts, TopBar, and the system registry consume projections of that source rather than maintaining parallel lists.
- The system registry no longer owns a second navigation manifest and rejects executable authority fields such as `execute`, `handler`, `authorize`, `mutate`, and `write`.
- Connections now has one mounted implementation. The unreachable standalone wrapper and duplicate agent/bridge panels were deleted.
- Page-specific agent eligibility and Wiki presence shims were removed after contextual-agent parity was established.
- Theme consumers were migrated from the old original, dashboard, and `nt` token dialects. The duplicate token and rebrand stylesheets were deleted; stable semantic domain roles remain where they describe real room-specific meaning.
- Obsolete reading-mode utilities, duplicate tests, and dead `wiki-product-index` CSS were deleted. The critical Wiki stylesheet is 31,622 bytes, below the existing 32 KiB budget without weakening the budget.

## Engineering repairs found during cleanup

- Keyboard room shortcuts now use router navigation instead of a document reload.
- TopBar accepts the shell-owned route location, fixing stale active-room styling after browser Back restoration.
- `useSemanticRelated` now keys result types stably instead of recreating an array dependency and retriggering its effect.
- Wiki preflight search is injectable. Lexical unit tests no longer initialize the real embedding client and wait through network retries.
- React scheduling warnings in the changed Wiki maintenance and Settings paths were removed, along with stale asynchronous assumptions in Working Memory, Concept template, Idea Workbench, App, and NoteCard tests.
- The semantic package now owns the final 430px room-navigation visibility rule, preventing the active room label from colliding with theme and More controls while keeping every room available inside More.
- Obsolete assertions were updated to the current flexible Wiki layout rather than preserving dead UI structure.
- Shared capability and loop snapshots are now scoped by an opaque account fingerprint. A browser account switch cannot reuse the prior account's cached readiness or loop state, and an older in-flight request cannot overwrite the new scope.
- Contextual Agent registration now has explicit surface ownership and revision identity. Delayed retrievals, proposal exit timers, and detail-to-index navigation cannot write into the next room or object; a surface without retrieval explains that state instead of swallowing Ask.
- The mobile Agent dialog traps keyboard focus and uses the semantic floating-surface token rather than a dead theme fallback.
- Wiki maintenance reports `ready` only for an explicit completed run. Unknown states fail closed, loop receipts expose only the compact status contract, weekly editions sort by their canonical edition label, and Judgment summaries retain their dependency identities.

## Verification

- Canonical surface, route, navigation, and TopBar regression matrix: 4 suites / 38 tests passed.
- Full frontend rerun on the current-main release tree: 268 suites / 1,899 tests passed in one command.
- `npm run wiki:qa` passed end to end on the current-main release tree, including the maintenance quality harness, 146 claim and briefing checks, the Wiki component suites, and its final production build.
- A separate production frontend build passed.
- `WikiPageReadView` warning-cleanup verification passed 78 / 78 tests without React scheduling warnings.
- Settings hydration verification passed 8 / 8 tests without React scheduling warnings.
- `git diff --check` passed.

## Rendered browser acceptance

Authenticated rendered acceptance passed on the normal local application path. The accepted pre-materialization tree covered all four rooms at desktop, sidebar-width, mobile, and reduced motion. The exact current-main release tree was then rechecked with:

- Library → Think → Wiki → Judgment at 1440px;
- browser Back restoration to Library with the correct active-room marker;
- the retained open Library shelf at 1320px with zero horizontal overflow;
- Library and an exact accepted Wiki page at 430px with zero horizontal overflow;
- one mobile Agent trigger and a working Agent drawer;
- keyboard focus contained inside the mobile Agent dialog, with Shift-Tab and Tab wrapping correctly;
- an explicit error when the Wiki index has no exact object to retrieve against, rather than a silent Ask;
- one visible current-room label at 430px, with all four rooms available inside More;
- reduced motion reporting `--noeis-motion-base: 1ms` and a `0.001s` TopBar transition;
- zero browser-console errors and zero browser-console warnings.

The shell stayed mounted, the room-specific agent context changed correctly, restored routes displayed the correct active-room marker, and the journey produced zero console errors and zero console warnings. Wiki and Library had no horizontal overflow at 1320px or 430px. Mobile exposed exactly one Agent trigger and the drawer rendered correctly. With reduced motion enabled, shell animation was disabled and transition duration resolved to the intended 1ms safety value.

Accepted-tree evidence: `output/playwright/noeis-persistent-shell-milestone-7-2026-08-23/`.

Current-main exact-tree evidence: `output/playwright/noeis-persistent-shell-release-2026-08-23/`.

The Wiki QA seed script created disposable local QA pages for the authenticated browser pass. This is test data, not production mutation.

The monolithic frontend suite still prints intentional failure-path `console.error` output and pre-existing test-environment noise in older suites outside the Milestone 7 authority paths. They do not fail the suite and were not introduced by this milestone, but they remain test-harness cleanup debt; this ledger does not relabel noisy output as clean.

## Current-main materialization

The accepted implementation was reconciled onto `origin/main` at `b4da1a1b591458bb62db7c9d2b0056bd0b5eac45` as a reviewable, ordered chain. Main advanced once during final review; the chain was rebased, the overlapping test-hygiene changes were reconciled, and the exact rebased tree was reverified:

1. `1c254405` — Define the Noeis system registry contracts.
2. `51de47eb` — Project durable knowledge loops into the shell.
3. `e8f43d5e` — Converge connector and capability readiness.
4. `7b150fed` — Give each knowledge room an explicit agent contract.
5. `84c18286` — Unify shell navigation and semantic theme.
6. `7565c093` — Remove obsolete helpers and stabilize async tests.
7. `6adcad2b` — Cancel stale room hydration and isolate digest tests.
8. `5535f97b` — Keep the mobile room header legible.
9. `05437ede` — Harden persistent shell continuity boundaries.

The only content conflict against current main was the Library shelf styling. Resolution retained current main's newer open-shelf composition while preserving this milestone's semantic-theme migration. The isolated worktree required read-only links to the canonical dependency trees for verification; those links are local runtime setup and are not tracked.

## Proof boundary

This is a clean current-main commit sequence with cumulative local implementation, automated verification, production-build verification, and authenticated exact-tree rendered-browser acceptance. It is not a push, merge, deployment, or production proof.

## Remaining release work

1. Push and merge only with explicit authorization; independent frontend, backend, security, API, and red-team review has been reconciled into the current exact tree.
2. Verify the deployed frontend and API separately, including authenticated desktop, sidebar-width, mobile, reduced-motion, reload, exact-object, and Back behavior.
3. Run a cold-user product test in production and record usability observations separately from engineering correctness.
4. Address remaining global test-console noise as a separate bounded hygiene project; do not mix unrelated legacy-test rewrites into this release.
