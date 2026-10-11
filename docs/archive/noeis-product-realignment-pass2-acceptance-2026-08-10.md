# Noeis product realignment — Pass 2 acceptance

Date: 2026-08-10

## Verdict

**PASS locally** for the Wiki front door and living-article recomposition.

This is local source, automated, and rendered browser evidence only. It is not an exact-tree, clean-candidate, merge, deploy, or production verdict.

## What changed

- The Wiki front door now leads with a specific continuity sentence, one living page, secondary pages, the living index, and one quiet composer.
- Activity, movement, review, decisions, watcher administration, and specialized builders are behind one closed `Review and system activity` disclosure.
- `updatedAt` is no longer presented as a review or material maintenance event. Cached and failed-refresh states are labeled honestly.
- Accepted Wiki article content now precedes dossier candidate review and operational machinery.
- Page maintenance is explicit and closed by default. Loading a page does not invoke maintenance or rebuild APIs.
- The article exposes only restrained, real actions: inspect sources, review research where applicable, and update when editing is available.
- Candidate research, maintenance traces, graph traces, claim health, and restore controls remain separate from accepted knowledge and behind disclosures.
- On selected mobile articles, the legacy Chat/Wiki switcher and inline quick agent were removed. The contextual Thought partner is available only through the explicit drawer.

## Automated evidence

Focused command:

```text
CI=true npm test -- --runInBand --watch=false \
  src/components/wiki/WikiWorkspace.test.jsx \
  src/components/wiki/WikiFrontPage.test.jsx \
  src/components/wiki/WikiPageReadView.test.jsx \
  src/components/agent/AgentContextShell.test.jsx \
  src/layout/RightDrawer.test.jsx \
  src/layout/ThreePaneLayout.test.jsx \
  src/styles/stitchEditorialCss.test.js
```

Result: **7 suites / 183 tests passed**.

`CI=true npm run build` passed. `git diff --check` passed.

The Wiki article suite still emits existing React `act(...)` warnings in explicit maintenance-action tests. They do not fail the suite, but clean-console test evidence remains a later quality task.

## Rendered browser evidence

Authenticated, real routed UI; no response interception or mocked API responses.

- 1440px, 1320px, and 430px: Wiki front and selected article have no horizontal overflow.
- Front page: system/activity disclosure is closed at every viewport.
- Article: maintenance and research review are closed; accepted article begins in the first reading screen.
- 430px: no legacy workspace quick prompt or Chat/Wiki switcher on a selected article; the explicit Thought partner drawer trigger remains.
- 430px drawer: opens as a modal sheet, locks body scroll, closes with Escape, and restores focus to its trigger.
- Separate 430px Chromium context with `prefers-reduced-motion: reduce`: the article renders without overflow; maintenance and research remain closed.
- Passive selected-article load produced **zero Wiki maintenance/rebuild POSTs**.

Screenshots:

- `output/noeis-product-realignment-pass2-2026-08-10/wiki-front-1440.png`
- `output/noeis-product-realignment-pass2-2026-08-10/wiki-front-1320.png`
- `output/noeis-product-realignment-pass2-2026-08-10/wiki-front-430.png`
- `output/noeis-product-realignment-pass2-2026-08-10/wiki-article-1440.png`
- `output/noeis-product-realignment-pass2-2026-08-10/wiki-article-1320.png`
- `output/noeis-product-realignment-pass2-2026-08-10/wiki-article-430.png`
- `output/noeis-product-realignment-pass2-2026-08-10/wiki-article-430-reduced-motion.png`

## Imagen comparison

The rendered hierarchy now matches the selected direction: warm editorial field, living knowledge first, serif reading plane, narrow functional controls, calm context, and operational machinery that recedes until requested. The implementation deliberately preserves current product typography/tokens instead of copying an image literally.

## Remaining boundary

- No clean candidate or exact-tree materialization.
- No merge, deploy, or production proof.
- The ten-second requirement is supported by the direct lead/return paths but has not yet been measured with an independent cold-user study.
- Pass 3 must make blank Think and exact Wiki continuation share the same calm workspace without weakening ObjectId, reload, proposal-separation, or no-duplicate-POST guarantees.
