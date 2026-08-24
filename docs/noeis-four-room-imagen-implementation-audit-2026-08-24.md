# Noeis four-room Imagen implementation audit

Date: 2026-08-24
Verdict: **PASS for the local composition and interaction slice; the full Imagen release gate remains open**
Confidence: **high**

This audit is governed by [the checksummed Imagen acceptance specification](noeis-four-room-imagen-acceptance-spec-2026-08-24.md). The images remain the authority. The verdict distinguishes a locally rendered implementation from merge, deploy, and production proof.

## What changed

- Library, Think, Wiki, and Judgment now share one calm collection grammar through `RoomShelf`, rather than four unrelated left rails.
- The shared agent kernel now presents as Source Guide, Thought Partner, Wiki Steward, or Skeptical Partner according to the room and selected object.
- Library holds its shelf, source list, selected source/provenance, and Source Guide together on desktop. The recent-source endpoint was reduced from roughly 12.3 seconds to roughly 1.9 seconds in the real service path; fresh rendered rows appeared in roughly 1.5 seconds.
- Think is content-first on mobile and keeps the Thought Partner embedded beside a named note instead of mounting a second generic agent.
- Wiki explicitly groups General wikis, Repository wikis, and Investment dossiers, carries type labels on rows, and uses a mobile collection drawer. Ordinary Wiki pages remain article-first with contents, citations, page facts, and Wiki Steward context.
- Judgment now renders the account's open claims/cases in the shared shelf and a truthful casebook/trend surface with a Skeptical Partner.
- Redundant Wiki article styling and duplicate test seams were removed. Shared shelf and agent contracts replace room-specific copies.

## Acceptance evidence

### Automated

- Four-room focused frontend suites: **12 suites / 240 tests passed**.
- Full Wiki frontend gate through `npm run wiki:qa`: **53 suites / 519 tests passed**.
- `server/services/libraryMixedSourceService.test.js`: **passed**.
- Optimized frontend build: **passed**.
- `git diff --check`: **passed** as part of `wiki:qa`.

The focused Jest run still emits pre-existing jsdom XHR `AggregateError` console noise from isolated network calls. The tests pass, but that noise should be removed in a later test-hygiene slice.

### Rendered

Fresh authenticated evidence is in `output/playwright/noeis-four-room-imagen-implementation-2026-08-24/`.

- Desktop: `library-final-desktop-settled-r2.png`, `think-final-desktop.png`, `wiki-final-desktop.png`, `judgment-final-desktop.png`.
- Safari-sidebar/tablet band: the four `*-final-tablet.png` captures.
- Mobile: `library-final-mobile.png`, `think-final-mobile-content-first.png`, `wiki-final-mobile-drawer-open.png`, `judgment-final-mobile.png`.
- Ordinary Wiki reader: `wiki-parenting-final-desktop-reader-projection.png`.
- Reference comparisons: the four `*-reference-vs-implementation.png` images.

The Wiki mobile collection is collapsed by default and opens through a native button with truthful `aria-expanded` state. Think puts the document before the shelf at mobile width. Library and Judgment protect the central object and reduce secondary rails to mobile affordances.

## Room-by-room judgment

| Room | Local judgment | Remaining gap |
| --- | --- | --- |
| Library | **Pass** — one coherent shelf/list/reader/provenance workspace | Sources without stored readable text remain provenance-first; richer related-evidence and carry-to-Think modules are still shallow |
| Think | **Pass** — dominant document, consistent collection shelf, embedded partner | Imported source text can still contain legacy extraction artifacts such as `attr(href)`; this is content hygiene, not layout |
| Wiki | **Pass** — truthful type groups plus an article-first ordinary reader | The reader preserves prose width with Back to Wiki + contents instead of retaining the full searchable collection beside long articles |
| Judgment | **Pass** — real cases, casebook counts, trend context, skeptical role | The strongest target state is an opened case; the index remains intentionally lighter until a case is selected |

## What is not yet proven

1. The role-specific agents share a sound retrieval/proposal kernel, but their deeper action modules are not yet as differentiated as the Imagen examples. Presentation and selected-object context are real; sophisticated Source Guide carry actions, Wiki maintenance review, and Skeptical Partner calibration actions remain follow-up product work.
2. Reduced-motion behavior is covered in CSS and component contracts but was not independently emulated in the selected browser during this pass.
3. The local browser and automated gates do not prove a clean commit, merge, deployment, or authenticated production behavior.

## Release status

The earlier **40% complete / materially incomplete** assessment is superseded. The current local implementation is recognizably faithful in composition, hierarchy, collection grammar, typography, responsive posture, and room-native language. It is ready for user evaluation on the local server.

The complete Imagen specification remains **open** until the deeper room-native agent actions, reduced-motion browser proof, and authorized merge/deploy/production gates are complete.

## Post-audit interaction repairs

The user review found two concrete ownership errors and both are now closed locally:

- A Library article row now opens the full Reading Room directly at its exact `articleId`; the provenance preview remains contextual information rather than a false destination.
- Think owns one embedded Thought Partner across its note-first surface. The shell no longer mounts a second generic Agent rail beside it.

Verification: 74/74 focused tests passed, the optimized build passed, and fresh browser evidence is saved as `library-direct-reader-r2.png` and `think-single-agent-r2.png`.

## Strict rail correction after user review

The earlier pass shared tokens and components but did not yet share enough composition. The user correctly identified that Library and Think still read as unrelated left columns, and that Wiki's decorative page mark looked like an unexplained checkbox.

The follow-up closes that gap locally:

- `RoomShelf` now supplies the common density, search treatment, section rules, full-row active state, and aligned metadata used by all three rooms.
- Library search lives in the shelf, folder counts are visible, and the duplicate list search is removed.
- Think's note shelf is a real Think navigator with Notebook, Concepts, Questions, and a separate Recent notes group.
- Wiki search lives in the shelf, visible page titles are available in a Pages group, and the decorative box was deleted from both markup and CSS.
- Wiki mobile still collapses the collection behind `Browse wikis`; desktop and mobile were both rendered after the repair.

Fresh evidence: `audit-r4-01-library.png`, `audit-r5-think-note-open.png`, `audit-r5-wiki-desktop.png`, `audit-r5-wiki-mobile.png`, plus the three `*-reference-vs-implementation-r4.png` comparisons. The repair gate is 5 suites / 50 tests, optimized build, and the final `design-qa.md` verdict.

## Library cabinet recovery

The rebuilt Library shelf exposed a real large-account regression: it rendered every folder returned by `/api/folders?includeCounts=true`, but the sticky desktop rail had no bounded height or overflow behavior. Folders below the viewport were therefore present in the document but unreachable. The rail now has a viewport-bounded, independently scrollable desktop cabinet; the mobile layout releases that bound and keeps the existing drawer. Loading, API failure, and a genuinely empty cabinet no longer collapse into the same blank state.

Proof is local: the focused cabinet and CSS suites pass 13/13, the optimized frontend build passes, a 32-folder component corpus remains fully mounted, and the real QA route renders all three of that account's stored folders at 1320px and through the 430px drawer. This does not prove the user's production account contents, merge, deployment, or production behavior.
