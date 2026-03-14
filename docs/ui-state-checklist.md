# Calm UI State Checklist

Use this checklist when changing any route-level UI in the calm theme.

## Shared Rules

- Primary content surfaces use `--calm-system-surface-primary`.
- Secondary/supporting surfaces use `--calm-system-surface-secondary`.
- Rows follow the same rhythm (`min-height: 40px`, consistent title/meta line-height).
- Error states use `.status-message.error-message` and route-level `has-error` classes.

## Think (`/think`)

- Loading: group has `.is-loading`.
- Empty: group has `.is-empty` and shows `.think-calm-empty-line`.
- Selected: row uses `.think-index__row.is-active`.
- Hover: row hover style remains subtle.
- Error: controls use `.think-index__controls.has-error`.
- Collapsed: group has `.is-collapsed`, toggle uses `aria-expanded="false"`.

## Library (`/library`)

- Loading: `.library-article-list.is-loading`.
- Empty: `.library-article-list.is-empty`.
- Selected: reading state entered by selecting article row.
- Hover: `.library-article-row:hover`.
- Error: `.library-article-list.has-error` and `.status-message.error-message`.
- Collapsed: `.library-context-section.is-collapsed`.

## Map (`/map`)

- Loading: `.map-view-page.is-loading`.
- Empty: `.map-view-page.is-empty`.
- Selected: `.map-side-panel.has-selection`.
- Hover: filter chips and detail rows.
- Error: `.map-view-page.has-error`.
- Collapsed: `.map-side-panel.is-collapsed` when no selection.

## Return Queue (`/return-queue`)

- Loading: `.return-queue-page.is-loading`.
- Empty: `.return-queue-page.is-empty` and `.return-queue-section.is-empty`.
- Selected: action focus states within rows.
- Hover: `.return-queue-row:hover`.
- Error: `.return-queue-page.has-error`.
- Collapsed: section-level empty/collapsed treatment through `.is-empty`.

## Visual Regression

- Run `npm run test:visual` in `note-taker-ui/`.
- Baseline snapshots live in Playwright's snapshot output.
- If intentional UI updates are made, refresh baselines with:
  - `npx playwright test e2e/visual-regression.spec.js --update-snapshots`
