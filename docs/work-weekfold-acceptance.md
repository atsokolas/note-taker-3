# Work Weekfold — acceptance and integration

Approved build: 26 October 2026. Reference: Library `libfile_6c3a50ebef1881919e7597aa0d3abc4b`, version 1, 1487×1058. Actual pixels were materialized and inspected before UI implementation. The historical expanded reference pin was unavailable; Week follows the same visual system and the approved written brief. This document records implementation, not a new approval request.

| Accepted behavior | Implementation | Verification |
| --- | --- | --- |
| Week / Compact / Hide, generous paper, responsive shelf | WorkCalendar, WorkShelf, work-notes.css | Real 1487,1320,430 browser captures; rapid fold/reverse retains editor identity/selection; reduced motion verified |
| Existing global persisted theme selector at top | App bridge, uiSettings request options, existing ThemePicker | WorkBoundary / uiSettings.work; browser Tokyo Midnight save, reload, Light restore; no Personal runtime mounted |
| Real folders: create, rename, move, reorder, archive, restore | Work router + existing NotebookFolder; WorkSession revision checks; WorkIndex | Mongo route regressions; browser lifecycle preserves note identity; new folder does not move existing writing |
| Folder and daily views use the same note | Immutable capturedAt/takenOn/timeZone; writtenDay projection | WorkPlanner model/session/routes; browser scoped capture and meeting-date distinction |
| No silent redating, date-folder creation, empty daily records or rollover | Captured written day immutable; meeting date separate; date view derived | UTC/Chicago boundary regression; legacy fallback; explicit navigation and carry |
| Tasks, questions, manual appointments, daily jots | Work-only NotebookEntry.workItem; no new collection | Route ownership/validation; browser appointment creates one linked dated meeting note; hidden-calendar day margin |
| Top three choices, due vs planned date, deliberate carry | Priority choice, projectItem event history, carry review | Browser explicit move retains one item, original planned date and due date; concurrent overflow remains visible outside top three |
| Note follow-up and planner share identity | noteId references same Work item; one projection | Route/session/UI plus browser complete→dated top record→Undo; prose unchanged |
| Completed near title, Undo / Reopen / action history | WorkFollowups; append-only server action history | Tests for lost receipt, remote edits, in-flight later action, pending device action, replay collision; history distinguishes action and receipt time |
| Same note identity before it has synced | Session flush resolves local linked note first | Explicit unsynced-note follow-up regression |
| Owner-only Work boundaries on every new kind | Existing model scope + human Work router retained | Work route/model privacy regressions, cross-owner/Personal note link rejection, agent rejection, Personal direct-ID exclusion |
| Save/offline/conflict/account safety | Existing immutable per-writer drafts and expectedRevision retained | Session storage/auth regressions; browser offline completion→reconnect→reload, conflict review→fresh typing, account lock and owner return |
| Keyboard and accessibility | Semantic controls, 44px targets, dialogs, CmdK/S/Enter, date arrow navigation | Real editor identity/selection and mobile overflow checks; ordinary editor Enter/Z preserved |
| Restrained motion and human feedback | 260ms interruptible fold;140mscheck/120msreceipt/160msreopen; reduced motion | Local browser and CSS; no flying rows, confetti, automatic scroll or task duplication |

## Deliberate boundaries

- Concurrent first day-margin edits are kept as separately identified versions, accessible through the margin chooser and the Work index; no saved writing is silently hidden or merged. Item conflicts of every kind open the same explicit review path.
- No external calendar, AI, CRM, provider calls or automatic task generation. Planning is explicit.
- Completion uses the author's captured device instant/timezone and keeps server recordedAt separately. It does not claim a trusted device clock. Original history remains visible on reopening/Undo.
- Filing a note and optionally its linked follow-ups is a set of independently revision-checked saves, not an atomic multi-record transaction. The UI waits for all acknowledgements; a partial result explicitly names sync/review, and Undo restores each previous folder through the same guards. Reordering folders itself is atomic.
- A separate device may concurrently choose the same priority position. The first three are emphasized; additional tasks stay visible, rather than disappearing or being silently demoted in stored data.
- Device drafts retain the pre-existing local-storage privacy limit. Work is a retrieval/access boundary, not encrypted local storage. Recovery/logout states say this plainly.
- The frontend verifies the new Work response shape before any Work write. During an independently rolling frontend/API deployment, unsupported server responses pause saves and keep device drafts; Retry resumes against the matching server.
- No dependency or hosting configuration changes. Official Feather icons replace handwritten icon chrome; one MIT asset source is retained.

## Code craft

The old flat shelf/page CSS and markup were replaced by focused shelf, calendar, index, item form and follow-up views. Completion lists, counts, dates, carried-from labels and save status are derived from the existing records and action history. The existing Tiptap reconciliation, revision fences and durable draft machinery remain the only paths for writing and recovery.

## Today, Actions and Review

- Today shows the selected day's to-dos, schedule, calendar and notes. Earlier and completed to-dos fold independently. Daily notes, appointment capture, and calendar keyboard navigation use their existing controls and save paths.
- Actions opens on Next. Switch between To sort, Waiting on, Someday and Upcoming. The existing list rules qualify tasks and questions, including items due back from Someday. Next folds dated tasks into Scheduled. Upcoming qualifies open appointments, tasks and questions with a future plan or deadline. Empty lists show a short empty state. Historic URLs land in their matching list.
- The dated This week link opens weekly priorities. Priority labels come from the weekly plan's task IDs. Opening a future date can preview carried priorities without writing a future plan. The actual rollover remains revision-checked.
- In Review, open Waiting on, choose **I have it**, edit the next action, and choose **Plan for Monday**. The title, list and plan event save on the same task. **Open Monday** appears only after acknowledgment and focuses that task. Check that the due date and exact source link survive the move, the date preview, and reload. The day shows when the plan was recorded. Undo restores the previous title, list and date.
- Confirm that the weekly ledger reopens a task at its canonical row and restores focus. Check draft retry, assignment by keyboard and drag, dated notes, and Deleted recovery at 1440px, 1320px and 430px. Use `npm run test:ui -- src/work --maxWorkers=2` and `node scripts/smoke_work_rail_deleted.cjs` after a CI-mode web build.
