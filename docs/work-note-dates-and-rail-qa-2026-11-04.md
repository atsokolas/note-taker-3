# Work dates and nested rail — local verification

Based on main `4c4c3dd49897158ad3b676f4d9b7374694ea55d5`, including merged PRs 616 and 617. Open PRs were inspected; none overlaps Work. Implementation is in the isolated checkout on `codex/work-note-dates-hierarchy`; the original checkout and its unrelated Finder change were preserved.

## Behavior

- The page and quick-capture dialog show a quiet, full written date above the writing. The existing `writtenDay` projection reads `takenOn`, then the original capture/server creation instant in the recorded timezone (UTC for legacy timestamps). The editable meeting date is deliberately excluded from this new creation-date display. Legacy notes with only a meeting date receive no invented creation date.
- The date is presentation metadata: no insertion into authored HTML/blocks, no date writes, migration or backfill. Existing API capture fields remain immutable. Edits, backdating, timezone preference changes and reload do not restamp the note.
- Folder and project rows now independently disclose semantic lists of indented notes. Their native buttons expose `aria-expanded` and `aria-controls`; selected children expose `aria-current`. Enter/Space work through native button behavior. The selected note's parents are revealed by default on reload; explicit disclosure choices last while Work is mounted. Search temporarily reveals matching children.
- Removed the four-note preview cutoff and replaced folder-only preview rendering with the same list renderer for folders and projects. Notes can appear under both their real folder and project, without moving or copying data. Paused projects remain navigable; archived entries remain available through existing archive/all-note flows. Folder drop-to-file behavior is retained; project rows do not silently refile notes.
- Mobile parent/child rows have 44px targets. Styling uses existing NOEIS ink, rule and font tokens; no new palette or motion.
- Explicit `.jsx` imports disambiguate the Work components from same-name lowercase `.js` models on case-insensitive macOS, including the existing day-close test import.

## Verification

- `cd note-taker-ui && CI=1 npm test -- --watchAll=false --runInBand src/work`: **14 suites, 163 tests passed**. Includes capture/timezone/midnight, continuation, edit/reload, legacy metadata, folders/projects, search beyond four notes, disclosures, ownership/account transitions and conflict/durability regressions.
- `node --test server/routes/workNoteRoutes.test.js server/routes/workPlannerRoutes.test.js`: **16 passed** against isolated MongoMemoryServer. No production server/database was used.
- Playwright Chromium: inspected screenshots at 1440×1000, 1280×900 and 430×932. Checked mobile rail, disclosure via Space/Enter, navigation to sixth child, new note creation, save, reload, body retention, edit/date stability and no horizontal overflow.
- `git diff --check`: passed.
- Full app `cd note-taker-ui && CI=1 npm run build`: **Compiled successfully**, using the original app entry and all routes.
- Affected reader/book tests: **6 suites, 155 passed** (`BookDesk`, its model, reader delights, ArticleReader, Books and LentBook). Existing diagnostics remain visible: 168 duplicate-key errors, two act warnings and one jsdom navigation limitation; no assertions were weakened.
- Fixture-only optimized production build: passed separately with `BUILD_PATH=../output/work-preview`. Temporary fixture entry was restored; it is not part of the source change.

## Preview and evidence

The fixture-only build is served at `http://127.0.0.1:3101/work?note=n0`. It uses the real Work components/editor and theme, a dummy account, and an Axios adapter that rejects all requests except fixture reads/writes stored in this preview's localStorage. No production access or real user data. Confirmed reachable from this Mac using loopback HTTP (200) and Playwright Chromium rendering the note, editor and date. Restart with `python3 output/playwright/serve-preview.py` if needed; it serves the retained `output/work-preview` fixture build. The separate full app build remains in `note-taker-ui/build`.

Screenshots: `output/playwright/work-desktop.png`, `work-tablet.png`, `work-mobile.png`, `work-mobile-rail.png`. Fixture entry and preview server are retained in that ignored output directory for review.

## Import collision follow-up

Current GitHub main was rechecked and is still `4c4c3dd49897158ad3b676f4d9b7374694ea55d5`. A separate clean detached checkout at `../noeis-main-baseline` reproduces the full build failure: `./reader/ReturnGreeting` has no default export. Its tracked tree remains unmodified. Two direct reader test suites also reproduce the collisions: 23 failed, 40 passed. On this case-insensitive macOS filesystem, Node resolves `BookDesk` to `BookDesk.js` (the lowercase `bookDesk.js` helper), and `ReturnGreeting` to `ReturnGreeting.js` (the lowercase `returnGreeting.js` helper), rather than the `.jsx` components.

Five imports now explicitly select `.jsx`: ArticleReader, Books, LentBook, BookDesk's test and readerDelights' test. No component/model rename, exports, logic, styles, storage or data behavior changed. The existing helper/component filename pairs remain; explicit extensions resolve the ambiguity with the smallest correction. An independent read-only review found no issues or missed component consumers.

Open reader PR457 touches ArticleReader but leaves this import unchanged, so the correction does not intersect its changed lines. Other inspected open PRs do not modify the affected files. No material scope expansion or parallel conflict was found.

Baseline failure and corrected full build logs are retained at `output/playwright/unmodified-main-build.log` and `output/playwright/full-app-build.log`. Test receipts and raw diagnostics are in `tmp/test-receipts/`.

## Remaining limits

Node available here is 22.22.3, below the repository's declared >=22.23.4 <23 range. The deployed environment and Safari have not been verified. No push, remote PR, merge, deployment, production mutation or credential change was performed.
