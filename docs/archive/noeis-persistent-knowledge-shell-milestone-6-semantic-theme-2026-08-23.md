# Persistent Knowledge Shell — Milestone 6 semantic theme package

Date: 2026-08-23
Plan authority: `docs/noeis-persistent-knowledge-shell-registry-spec-2026-08-20.md`

## Outcome

Milestone 6 is complete locally. Noeis now applies one versioned semantic theme package to the persistent shell. Light/dark theme, density, typography scale, accent, and brand energy are normalized into one snapshot and committed through the root before paint. Invalid snapshots preserve the last known-good package.

The accepted visual direction remains a warm, Greek-inflected editorial study. Library, Think, Wiki, and Judgment share shell canvas, chrome, paper, ink, rule, typography, spacing, control, focus, shadow, and motion roles. Wiki graph, concept workbench, article reading, repo, and dossier roles remain contained in their rooms.

## Theme contract

- Schema: `theme.editorial`, version `1`.
- Variants: `theme.editorial.light` and `theme.editorial.dark`.
- Canonical root identity: `data-noeis-theme`, committed after compatibility attributes and inline accent values.
- Application: `useLayoutEffect` prevents a post-paint theme change after authentication.
- Fail-closed behavior: malformed theme, density, typography, or accent input cannot replace the active package.
- Reduced motion: shell duration roles collapse to `1ms`; shell animation, scrolling, and transforms are disabled.

## Cleanup completed

- Deleted the unused 1,328-line `noeis-rebrand.css` layer.
- Deleted the duplicate `tokens.css` authority and its import.
- Removed root theme ownership from `theme.css`, `App.css`, `global.css`, and both dashboard token blocks.
- Removed lazy Think CSS ownership of the application shell and TopBar.
- Rebased editorial vellum aliases and theme transitions on semantic roles instead of a second palette and motion clock.
- Preserved compatibility aliases inside the semantic package only; Milestone 7 can remove those names after consumer migration is proven.

## Verification

- Semantic theme, UI preferences, CSS authority, and editorial CSS: 4 suites / 35 tests passed.
- Cumulative changed-surface frontend matrix: 30 suites / 421 tests passed.
- Production frontend build passed; compiled main CSS decreased by about 3.5 KB gzip relative to the preceding worktree build.
- `git diff --check` passed.
- Authenticated rendered acceptance passed at 1440px, 1320px, and 430px.
- Live light-to-dark flip changed `data-noeis-theme` without reload and remained dark through Library → Think → Wiki → Judgment → Back.
- Command palette remained mounted across the room journey.
- Exact Wiki object `/wiki/read/6a1b44af212ce816416db44f` retained its identity, heading, and theme after reload.
- Reduced-motion browser proof reported `prefers-reduced-motion: reduce`, `--noeis-motion-base: 1ms`, and TopBar transition duration `0.001s`.
- Library, Think, Wiki, and Judgment each reported zero horizontal overflow at 430px.

Evidence: `output/playwright/noeis-semantic-theme-milestone-6-2026-08-23/`.

## Verification debt kept visible

The root `npm run wiki:qa` wrapper was not green in this pass. Its dossier, boot, contract, privacy, publication, and early service constituents passed, but `wikiBuildPreflightService.test.js` remained open without completing the wrapper and was stopped after a bounded wait. This is the previously observed process-exit seam, not a Milestone 6 frontend failure. The passing 421-test cumulative frontend matrix, production build, browser evidence, and prior Milestone 5 constituent proof do not turn that wrapper into a pass.

The cumulative frontend tests still emit existing asynchronous React `act(...)` warnings in Wiki maintenance and Settings tests. They do not fail the tests, but they are cleanup debt and should be removed rather than normalized.

## Proof boundary

This is local cumulative implementation, automated verification, production-build verification, and authenticated rendered-browser evidence. It is not an independent review, commit, push, merge, deployment, or production proof.

## Next plan slice

Milestone 7 is the final authority-removal and landing-readiness pass:

1. Inventory every remaining compatibility alias and duplicate navigation, route, connector, capability, loop, and theme list.
2. Migrate the remaining consumers to canonical registry and semantic identities.
3. Delete the old lists, fallback hooks, aliases, and unreachable CSS rather than leaving shims indefinitely.
4. Remove the existing asynchronous test warnings and fix the `wikiBuildPreflightService.test.js` process-exit seam.
5. Rerun the complete contract, cumulative frontend, production build, and responsive browser gates.
6. Only then materialize a clean reviewable commit sequence; merge, deploy, and production acceptance remain separately authorized proof levels.
