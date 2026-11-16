# Shared wiki editorial header implementation plan

**Goal:** Ship Athan's approved editorial header mockup, replacing the stacked notices below collection titles.
**Architecture:** Reorder the existing collection header, use native details for optional sharing context, and style only collection routes. Keep adoption, content, citations, entry routes and API unchanged.
**Tech stack:** React, CSS, Jest, Playwright.
**Spec:** Approved November 16 mockup: intro, quiet page/source/review metadata, compact dark Add to my library button with helper, Public sharing details disclosure. No bubbles.

- [x] Add a failing header test: intro precedes adoption; sharing details start closed and retain privacy, review, metrics and import detail.
- [x] Reorganize SharedWikiCollectionPage header; remove redundant receipt from collection header, retain detailed privacy and maintenance facts in disclosure.
- [x] Use collection-scoped styles in wiki.css, existing theme tokens, restrained typography; no new state or dependencies.
- [x] Verify existing adoption/error behavior and empty/missing review metadata. Run targeted shared-page tests and production UI build.
- [x] Inspect real signed-out desktop, 1280 and mobile header; keyboard disclosure and import redirect, no horizontal overflow; run all four collection/entry smoke cases.
- [ ] Draft PR, normal CI merge and production verification.

Verification: 31 focused tests and UI build passed; independent review found no actionable issues. Signed-out Chromium screenshots inspected at 1440, 1280 and 430px; keyboard disclosure, compact 48px import control and signed-out redirect checked. All four collections and 23 entries smoke-tested at desktop/mobile. No body or citation changes. Local Node22.22.3 is below declared22.23.4; hosted CI is the supported-runtime gate.
