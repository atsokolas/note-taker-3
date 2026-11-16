# Working Studio rail, menus and Deleted

## Approved scope

Concept 1 (original-faithful Today/Next rail) and concept 3 (compact anchored menus and inline project rename). Project Delete includes its notes and tasks, requires an in-app confirmation, and provides two-week recovery. No production account data was mutated during development.

## What replaces what

- One canonical task row replaces the separate repeated Open-to-dos tray and scattered rail actions. Existing drag, keyboard/native priority assignment, schedule and edit controls remain in each row.
- One Add to-do reveals the natural-language composer; More details carries its draft into the existing form.
- Shared icon-led project/note action menus replace oversized text menus. Rename edits the project title in place; description uses the existing revisioned form.
- Deleted replaces the visible Trash label while retaining existing deep links.

## Exact deletion semantics

1. Clicking Delete project fetches a read-only preview. Confirmation states counts and exclusions, defaults focus to Cancel, and performs no mutation until the second click.
2. Eligible notes have this project assigned directly. Eligible planner items have this project directly, or link to one of its notes and have no explicit other project. Weekly plans are not deleted. Explicit other-project tasks stay active, even when they link to a deleted note.
3. Already-deleted notes are not included again. Their prior deleted state is preserved. They can be restored separately after their project is restored.
4. The server checks account/Work ownership, project revision and an exact content-membership fingerprint. Transactions and shared membership-write fences prevent concurrent additions/edits from falling silently outside the reviewed batch.
5. Deletion is a recoverable tombstone, not a database removal. A stable operation ID makes retries safe. Restore only touches records marked by that deletion batch; original prose, IDs, links, history and prior project state are retained.
6. Server-generated recovery deadline is deletion time plus 14 days. **There is no TTL, scheduled purge or irreversible removal in this change.** Recovery remains possible after that deadline. The UI explicitly says “at least 14 days” and “Nothing is permanently erased automatically.” This intentionally does not claim automatic destruction after two weeks; that requires a separate permanent-delete decision/flow.
7. Individual note Delete also confirms first, keeps linked tasks, and remains recoverable through Deleted. No user account settings are changed.

## Selection rules

- Today includes planned active tasks for the selected day; Earlier contains carried active tasks, folded by default. Next excludes IDs already represented in those sections. Today and Next remain expanded and collapsible.
- Counts derive from canonical records. Empty sections render useful empty space/actions, not manufactured tasks. Existing waiting, quiet-project, someday and weekly check-in workflows remain available.

## Verification gates

- Focused persistence/server coverage: owner isolation; exact batch scope; prior Trash; explicit-other-project tasks; stale revisions/membership; concurrent create/delete; duplicate/lost acknowledgments; after-deadline restore; late delete replay after restore.
- Session coverage: pending local drafts block deletion; account changes before request dispatch send zero POSTs; responses for an old account are ignored.
- UI: confirmation cancel does not write, counts/exclusions, delete/restore batch, note restore, inline rename, description save, draft transfer, keyboard/native menu controls.
- Browser: desktop 1440, tablet 1280, mobile 430; real rendered build, synthetic intercepted APIs, screenshot comparison to approved references. No production writes.
- UI build and full server suite remain release gates. Record precise run results in the PR rather than claiming a full pass if an unrelated test times out.

## Validation record (2026-11-16)

- All Work UI suites: 281 tests in 27 files passed; no console/act warnings (three existing Tippy environment warnings).
- UI production build passed.
- Focused Work route/model persistence suites passed, including batch scope, transactional race and retry tests.
- Full server run: 327/328 node test files passed and all 817 Jest tests in 65 suites passed. `importRoutes.exportFiles.mongo.test.js` timed out waiting for an oversized chunked upload. Isolated retry and unchanged theme/main-baseline run reproduce that same timeout. This is not a passing full-server gate; hosted CI must independently pass before release.
- Browser smoke against the production build passed at 1440, 1280 and 430px. It preserves prior-week read-only navigation, source-linked drag IDs, keyboard assignment, inspector focus and back/forward, reload persistence, cancel-first delete, Deleted restoration and reduced-motion operation. All mutations use intercepted synthetic accounts, not the owner's account.
- Visual review: flat Today/Next rail, folded Earlier, compact anchored icon menus, inline project rename and separated destructive action match the selected concepts. Existing check-in/owed/quiet/someday functionality stays present rather than being removed to mimic static mockup content. The project's own header omits redundant Open project; sidebar retains it. Deleted adds explicit recovery wording not present in the original design illustration.
