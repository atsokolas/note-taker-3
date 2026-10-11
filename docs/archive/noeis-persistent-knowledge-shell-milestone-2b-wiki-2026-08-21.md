# Persistent knowledge shell — Milestone 2B Wiki

Date: 2026-08-21
Status: implemented, tested, and rendered locally; uncommitted

## Outcome

Wiki now declares the exact object the user is working with—workspace, page, revision, or claim—into the shared Noeis surface contract. The shared agent stays one persistent collaborator, while each Wiki projection keeps its own job and rendering:

- ordinary personal Wiki remains article-first;
- repo pages retain repo-specialized presentation;
- investment and company dossiers retain their specialized readers;
- research editions and living theses retain their existing projections;
- the workspace keeps its local build, ingest, lint, and maintenance tools.

The architecture adds identity and continuity around those projections; it does not force them into one visual template.

## Implementation

- Added `wikiSurfaceModel.js` as the single mapping from Wiki data to shared room/object/projection identity.
- Declared Morning Paper, read, edit, and workspace identity through `useNoeisSurface`.
- Bound page, revision, accepted revision, and focused claim identities where available.
- Consolidated duplicated desktop/mobile context-agent markup in `WikiPageReadView` into one internal projection reused by both responsive branches.
- Deleted the unreachable `WikiAgentPresence` component and its tests. The still-used shared presence CSS was deliberately retained.
- Preserved the workspace-local thought partner because it owns different build and maintenance actions; the global agent remains excluded there, preventing duplicate collaborators.

## Verification

- Focused Wiki identity/integration tests: 6 suites / 215 tests passed.
- Full Wiki frontend matrix: 54 suites / 517 tests passed.
- Production frontend build passed.
- `git diff --check` passed.
- Authenticated local browser proof passed for:
  - Morning Paper at 1440px;
  - ordinary Wiki reading at 1440px, 1320px, and 430px;
  - selected-page workspace at 1440px;
  - no horizontal overflow at 1440px, 1320px, or 430px;
  - desktop contextual rail and mobile Agent drawer;
  - Escape closes the drawer and returns focus to its trigger;
  - reduced motion produces zero-second transition and animation durations.
- Evidence: `output/playwright/noeis-wiki-surface-2026-08-21/`.

## Known gates and boundaries

- The root `wiki:qa` command reaches an unchanged backend failure in `server/routes/__tests__/wikiRoutes.summaryProjection.test.js`: judgment must be requested field-by-field rather than as a whole subtree. No backend file in that path changed in this slice.
- Existing `WikiPageReadView` tests still emit asynchronous React `act(...)` warnings even though all assertions pass. These warnings predate this slice and should be removed in the dedicated test-cleanup pass rather than hidden.
- Local API responses for reading-loop and knowledge-movement projections returned 500 during the Morning Paper browser run while the API logged repeated Mongo connection resets and pool clears. The primary Wiki page and workspace journeys still rendered; the read models need a stable-connection rerun before this is classified as a product defect.
- This is local rendered proof. It is not a commit, push, merge, deploy, or production result.

## Next

Adapt Judgment to the same exact identity contract without changing its claim-first job. Then run the full cross-room continuity journey—Library to Think to Wiki to Judgment and Back—before promoting the shared contextual-agent contract into Milestone 3.
