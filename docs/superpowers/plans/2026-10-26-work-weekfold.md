# Work Weekfold Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, inline implementation with one whole-branch independent review. Preserve existing task artifacts rather than deleting requested deliverables.

**Goal:** Ship the approved Weekfold: real folders, automatic written days, planner and same-item dated follow-ups, beautiful responsive writing and safe persistence.

**Architecture:** Reuse Work's scoped NotebookEntry/NotebookFolder records, revision checks and durable owner-isolated session. A Work-only item shape on NotebookEntry represents task/question/appointment/jot; event history projects completion/planned day and is separate from authored note prose. UI derives all counts/lists from canonical records and pending edits; no parallel task/history store.

**Tech Stack:** Existing Node22.23.4/Mongoose/Express, React/Tiptap and semantic theme infrastructure. No dependency additions.

**Spec:** taskroot/deliverables/NOEIS-Work-Daily-Planner-Mockup-Brief.md, approved version1. Target pixels: taskroot/research/weekfold-build/references/approved-weekfold-compact.png, Library libfile_6c3a50ebef1881919e7597aa0d3abc4b version1,1487×1058. Owner authorized build/test/ship26Oct18:54UTC.

## Global constraints
- No employer data, model/provider calls, new grants/costs or unrelated settings. Fictional fixtures only.
- All new records/queries remain Work human-only and excluded from Personal retrieval/agents/jobs/export/share. Preserve original notes, old records, auth recovery and PR601's editor/history safeguards.
- Same note in folder/date views; stable captured day/timezone, separate editable meeting date. No empty persisted day pages, date folders, silent redating or midnight splitting.
- Same follow-up identity in note/planner; explicit plan/carry, due date separate; completion/reopen/undo immutable event history with action/receipt times and captured timezone. Offline is pending until ack, no fake durability.
- Week/Compact/Hide;260msfold/140mscheck/120msreceipt/160msreopen; interruptible, anchored layout, reduced-motion alternative,44px controls, keyboard/caret/scroll preservation.
- Existing theme catalog/global personal preference, meaningful folder create/rename/file/reorder/archive/restore; creation never silently refiles. Archive preserves planned work/day links.
- Lean affected-file TDD, compact receipts; broad privacy/storage/auth regressions at final integration, one appropriate independent review, scoped checks for fixes. Native CI and actual browser/reference comparison required before release.

## Review focus
1. Lost operation receipts, duplicate clicks, concurrent revision writes and Undo after another device changed an item: no duplicate or stale overwrite.
2. Offline/memory-only multi-tab/account switch and reauth: pending planner actions and prose remain owner-isolated/recoverable.
3. Midnight/travel/backdating/refiling/legacy note: captured day never silently changes; late action sync retains intended completion day.
4. Archive/reorder concurrent edits: no hidden planned tasks, lost folders or cascading deletion; current scope navigable/reloadable.
5. Collapse/reopen/complete during selection/IME: no editor remount or caret/scroll jump; top completed record doesn't rewrite prose.

### Task1: Durable Work domain and human-only APIs
Files: server/models/index.js; server/routes/workNoteRoutes.js; new server/services/workPlanner.js (validation/actions, replacing duplicated route-level date/reference decisions where touched); server/routes/workPlannerRoutes.test.js; existing Work/privacy tests.
Interfaces: existing GET /api/work-notes returns entries,folders plus items. New entries keep capturedAt/takenOn/timeZone; legacy display derived without migration. Work item lives on a scoped NotebookEntry (`workItem`:kind,noteId,plannedOn,dueOn,priority,startTime,endTime,history). Existing create/PUT reuse revision/operation identity; `workActions` is a request-only ordered operation list. Events carry operationId,actionAt,recordedAt,timeZone,type,plannedOn/undoOf; server owns history. Folder operations guarded by revision; create stable operation identity; reorder scoped atomic order, archive reversible.
- [x] Write route regressions for written-day immutability, cross-owner/Personal references, all Work item kinds, same-item complete/reopen/plan/undo + idempotency/concurrency, folder create/rename/order/archive and exclusion. Run affected server tests; expected RED for missing behavior.
- [x] Implement smallest scoped model/router/service path; no extra collection or Personal access path. Preserve exact source/date/line Continue, and original generic Work note behavior.
- [x] Run affected route/model/privacy tests via npm run test:server selectors; expected PASS; commit atomic domain deliverable with compact receipt.

### Task2: Owner-isolated session and projections
Files: src/work/workSession.js, new src/work/workPlannerModel.js, existing workDrafts.js only if necessary; tests workPlannerModel.test.js, workPlannerSession.test.js and existing Work session/reconciliation tests.
Interfaces: `session.entries()` notes; `session.items()` item records in the same saved/draft machinery; `session.action(id,action)` durable queued operation, existing flush sends metadata/actions together and merges acknowledged history without clobbering in-flight edits. `session.updateFolder`/`reorderFolders` return acknowledged records; errors remain explicit. Model helpers compute day/week, legacy written day, projected item status/planned date/history and scoped selectors. Client clock/TZ captured once; server verifies; no pending operation time is silently changed.
- [x] RED tests for offline action+reload, lost ack replay after remote edits, in-flight newer action, account switch/memory failure, same note/item linkage and timezone/midnight behavior.
- [x] Extend existing session, reuse immutable per-writer drafts and receipt protections. Derive UI snapshots, never persist duplicate completed lists/counts. Preserve old draft readability and recovery.
- [x] Run focused Work session/model/auth/real-editor tests with compact npm run test:ui; expected PASS; commit.

### Task3: Approved Weekfold UI and appearance
Files: src/work/WorkNotes.jsx + work-notes.css; focused child components WorkCalendar.jsx, WorkFollowups.jsx, WorkShelf.jsx to replace old inline shelf/page markup; existing WorkNoteEditor.jsx only necessary integration, preserve its reconciliation/history; App.js and api/uiSettings.js for safe shared cosmetic theme bridge; existing ThemePicker and icon assets reused.
Interfaces: root Work retains existing auth/recovery/Continue dialogs and state owner; children receive session/canonical selection/callbacks, not independent persisted stores. URL carries date/folder/note scope; view mode owner/device preference. Calendar tasks/appointments/jots bind session items; follow-up section and top Completed project same items. Theme callback opens existing shared picker without mounting Personal runtime; cosmetic requests use explicit human owner/skipAuthHandling and guard stale-account responses.
- [x] RED behavior tests for scoped capture, empty folder creation, folder/day navigation, folder archive/order, calendar modes/no remount, global theme save/cancel/failure, note follow-up complete/planner cross-view/undo/history and keyboard/mobile semantics.
- [x] Build reference's masthead/shelf/calendar/note typography/rules/spacing; supported interactions fully wired. Include manual appointments, daily jot, explicit carry review, optional planning/linking, due date and top3 choice. Keep advanced editing in purposeful dialogs, not inert chrome.
- [x] Run directly related UI tests and build; expected PASS. Actual isolated browser QA at1487×1058 plus1320/430 and matched Compact/Week/Hide states. Compare screenshot against approved pixels, fix substantial drift. Prove interrupted save/conflict/offline/owner switch and calendar anchor behavior in browser; commit.

### Task4: Review and authorized release
- [ ] Trace every accepted behavior to implemented file and test/browser receipt; record decisions/costs in task ledger. Full applicable privacy/auth/persistence/Personal regression gates once after integrated changes; inspect failures/new warnings only. No skipped critical gates hidden.
- [ ] One fresh most-capable reviewer receives spec, plan, diff, review focus and concise receipts; correct real findings with RED→GREEN and delta checks. Draft PR first; native final-head checks all applicable green; merge only reviewed exact head.
- [ ] Verify merged tree and exact Vercel/www alias + Render API revisions, safe fictional live folder/capture/theme/planning/complete/reopen flow, close test account, report exact links/count semantics/limits. Preserve requested reference/evidence artifacts and unrelated work.
