# Design QA

Scope: strict rail and collection-list correction for Library, Think, and Wiki against the checksummed 1672×941 Imagen references.

## Accepted corrections

- One shared shelf grammar now governs the three rails: room name and count, one search field, compact primary views, named groups, full-row selection, and saved-object rows.
- Library search moved into the Library rail. The duplicate source-list search is gone; folder counts use the same right-aligned metadata treatment as the primary scopes.
- Think's note surface is no longer a flat `Notes` dump. Its rail is named `Think`, exposes Notebook / Concepts / Questions, and separates the current workspace from Recent notes.
- Wiki search moved into the Wiki rail. The rail now includes a Pages group in addition to view, type, and workspace groups.
- The unlabeled decorative square before every Wiki title was removed. A Wiki row is now one legible title/type/state/open target.
- Desktop rails use the same width, rule, density, warm selection field, and typographic hierarchy. Mobile still folds the Wiki collection behind a truthful `Browse wikis` control.
- Library's existing folders are no longer clipped by the sticky desktop rail. The full cabinet remains mounted and scrollable, while loading, failure, and truly empty states are now explicit; mobile retains its truthful shelf drawer.

## Reference comparison

Source references:

- `docs/assets/noeis-four-room-imagen-acceptance-2026-08-24/library.png`
- `docs/assets/noeis-four-room-imagen-acceptance-2026-08-24/think.png`
- `docs/assets/noeis-four-room-imagen-acceptance-2026-08-24/wiki.png`

Fresh implementation evidence:

- `output/playwright/noeis-four-room-imagen-implementation-2026-08-24/audit-r4-01-library.png`
- `output/playwright/noeis-four-room-imagen-implementation-2026-08-24/audit-r5-think-note-open.png`
- `output/playwright/noeis-four-room-imagen-implementation-2026-08-24/audit-r5-wiki-desktop.png`
- `output/playwright/noeis-four-room-imagen-implementation-2026-08-24/audit-r5-wiki-mobile.png`
- `output/playwright/noeis-four-room-imagen-implementation-2026-08-24/audit-r5-library-folders-1320.png`
- `output/playwright/noeis-four-room-imagen-implementation-2026-08-24/audit-r5-library-folders-mobile.png`
- Side-by-side comparisons: `library-reference-vs-implementation-r4.png`, `think-reference-vs-implementation-r4.png`, and `wiki-reference-vs-implementation-r4.png`.

The implementation intentionally does not copy decorative icons or Greek illustrations without a real icon asset contract. Composition, density, hierarchy, selection, grouping, and responsive behavior are the acceptance target for this slice.

## Verification

- Focused rail/list suites: 5 suites / 50 tests passed.
- Optimized frontend build: passed.
- Rendered Library, opened Think note, Wiki desktop, and Wiki mobile: passed.
- Wiki page-mark absence is asserted in the component suite.
- Direct Think note opening from the rebuilt rail: passed.
- Library cabinet regression: 32 folders remain mounted in the component proof; desktop overflow and mobile release contracts passed; the real QA account rendered all three stored folders and mobile opened them from the collapsed drawer.
- No P0, P1, or P2 visual issues remain in this rail/list slice.

## Outside this local slice

- Clean commit, merge, deployment, and authenticated production acceptance remain unproven.
- Deeper room-specific agent actions and exact decorative art remain broader Imagen-plan work, not rail regressions.

final result: passed
