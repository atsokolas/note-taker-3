# Persistent knowledge shell — Milestone 2B Library

Date: 2026-08-21
Branch: `codex/noeis-persistent-knowledge-shell-2026-08-20`
Base: `3652d2e5da022198bd4630fff4eb5809ef497796`

## Outcome

Library now participates in the persistent knowledge shell without losing its source-first job. Its central plane remains the source browser or reading room, its shelf remains visible on desktop, and the global agent receives the exact selected source identity. The page-local Librarian and its duplicate state were removed.

At compact widths the same agent instance moves into a deliberate drawer. The reading plane is never followed by a second copy of the agent. Escape closes the drawer and returns focus to its trigger; reduced-motion mode removes drawer transitions.

## Product boundary

- Library declares `library_workspace`, `article`, or the selected mixed-source type into the shared surface contract.
- The global agent receives the exact source type, object ID, title, and bounded source facts.
- Existing source operations remain available below the reading plane as “Continue with this source.”
- Source provenance, exact Wiki/claim links, highlighting, folders/shelves, move/keep actions, references, and the existing Think/Wiki pull-in workflow are preserved.
- Agent output remains a proposal. The rendered QA prompt returned no source and was dismissed; no accepted knowledge was changed.

## Cleanup

- Removed the page-local Librarian, duplicate open/selection storage, and dead browse-agent/ticker/marginalia branches.
- Deleted the obsolete `library-room.css` layout.
- Deleted the now-unused `readingMode` helper and its tests.
- Removed all unreachable `.three-pane--library*` selectors from the active stylesheets.
- Kept `AgentSkillDock` elsewhere because Think and Notebook still use it; its future convergence belongs to Milestone 3 rather than this Library fence.

## Verification

- Cumulative Library and shared-shell matrix: 23 suites / 171 tests passed after cleanup.
- Production frontend build passed after the drawer and cleanup changes.
- `git diff --check` passed.
- Authenticated local browser checks passed at 1440×900, 1320×900, and 430×860 with no horizontal overflow.
- Desktop rail is visible at 1320; compact trigger is hidden. At 430 the rail is hidden until the single Agent button opens an accessible dialog.
- Escape focus return passed. Reduced-motion media emulation reported zero-second drawer and backdrop transitions.
- Browser console: zero errors and zero warnings in the verified flow.

Evidence: `output/playwright/noeis-library-surface-2026-08-21/`

## Proof level and remaining work

This is local implementation, automated test, production-build, and authenticated rendered-browser proof. It is not committed, pushed, merged, deployed, or production verified.

Milestone 2 is not complete until Wiki and Judgment declare exact surface identities and the full Library → Think → Wiki → Judgment → Back journey preserves exact object identity and shell state. Milestone 3 must replace remaining page-specific agent docks with one declarative contextual-agent contract and improve evidence grounding; the Library QA answer was exact-object aware but generic and unsourced.
