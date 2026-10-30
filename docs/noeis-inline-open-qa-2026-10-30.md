# Inline Open composer — verification

Implemented in the isolated `codex/inline-open-composer` checkout, based on `4df1c3c78cb923c68d9d94d15a6bc3464377734a`. The concurrent bullet-spacing branch is untouched. No server/schema change, live data mutation, merge or deployment.

## Delivered interaction

Add a follow-up expands a title and Follow-up/Open question selector inside the existing Open margin. Empty notes also show Open. Add creates an unplanned record linked to the displayed note's actual folder and identity. Calendar words remain literal. Escape keeps the draft, Cancel discards unsubmitted text, Enter respects composition. The original editor stays mounted.

`WorkOpenComposer.jsx` replaces the modal-opening trigger inside WorkFollowups. `workOpenDrafts.js` replaces transient form-only state for this new interaction; it reuses Work's immutable storage primitive in a separate namespace that cannot auto-flush. Competing drafts are selectable. A draft on a blank local note also retains enough parent context to stay reachable after reload without submitting. Explicit Add durably captures the blank parent before queueing its child. Stable operation IDs bridge interrupted handoffs. Existing session rows and retry/conflict paths own submitted items. Recovery export/copy/discard includes unsafe Open text.

## Automated checks

- Node `22.23.4`, locked dependencies; no dependency changes committed.
- `npm run test:ui -- --testPathPattern=src/work/ --maxWorkers=2`: **127/127 tests, 9 suites**.
- Coverage includes both kinds, empty state, Today scope versus actual folder, literal day/time words, editor instance/document/block IDs/caret/scroll, Escape/cancel/remount, account isolation, IME guard, offline/retry/double-submit/reload, immutable competing drafts, blank parent/draft recovery, canonical parent linkage and storage failures/recovery.
- One development Tippy warning (`hide() called on a destroyed instance`) from WorkWeekfold; no console errors, act or aggregate errors.
- `git diff --check`: pass.

## Browser evidence

An isolated webpack preview imports the real WorkNotes, editor, session and CSS. All API requests use synthetic records and an in-memory server intercepted in Chromium; external requests are blocked. No real account data is used. The scoped Work preview compiled successfully.

Desktop 1440×1000, sidebar width 1280×960, and mobile 430×1000 all rendered. Mobile composer width was 390px, from x=20 to x=410, with no horizontal overflow. Browser assertions passed for inline question creation without a dialog, actual folder/defaults, Escape draft retention, unchanged real editor state and window scroll, literal calendar words, offline durable handoff, lost reply/reload using one operation and no duplicate record. Zero page errors.

Artifacts remain in `tmp/inline-open/`: mockup HTML, mockup desktop/mobile PNGs, final desktop/1280/mobile/added PNGs, browser-result.json, scripts and logs. Mockup and final PNGs are also uploaded to Library. This preview excludes the unrelated application shell; it renders the production Work components directly.

## Independent review and fixes

A fresh read-only reviewer examined initial commit `7e78aaab` and found three important issues: mutable cross-tab drafts, blank-parent orphaning, and omitted Open text in recovery. All three were reproduced with failing tests and fixed; the complete Work suite passed after the fix pass. The additional blank-note unsubmitted-draft reload and competing-draft selector cases are covered too. No deferred minor findings.

## Limits and publication status

The full `CI=true npm run build` fails on the existing macOS filename-resolution collision: ArticleReader imports `./reader/ReturnGreeting`, which resolves `returnGreeting.js` before `ReturnGreeting.jsx`, causing “does not contain a default export”. Both files and that import are unchanged from the base commit. The independent Work preview compiles, but the full production build gate remains blocked. No unrelated reader repair was folded in.

Native physical mobile keyboard/IME, live server persistence/auth, and deployed behavior were not verified. Automated composition guards and synthetic browser persistence/retry paths passed.

PR publication is pending the separate approval request in the parent conversation. No composer push or PR creation was attempted. The local branch and a prepared PR description remain available for publication after explicit approval.
