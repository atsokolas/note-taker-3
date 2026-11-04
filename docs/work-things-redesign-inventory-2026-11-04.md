# Work redesign: implementation handoff inventory

Base: c0328bcfc51dcb7d6c4819b726e5d6d835410474 (merged dated entries, PR619). Isolated worktree: noeis-work-redesign, branch codex/work-things-layout. Implementation follows the approved reference, preserving the contracts below.

Approved scope supplied by parent: full revised Things-inspired concept, reorganized Today page/navigation, NOEIS typography/themes, more colored rail icons, preserving existing data/capabilities and nested navigation. Merge is authorized after review and verification; PR approval is not authorized without action-time confirmation.

## Required reference

The approved image is Library file `libfile_90947c4f8ebc819196f6196f223f4e7f`, retrieved and visually inspected at local ignored `output/reference/work-approved-concept.png`. The image shows light Today and Tokyo Midnight customer-note panels. This implementation uses the production NOEIS top bar and existing theme tokens, moves primary Work navigation above expandable Projects/Notes, adds theme-aware Feather icon colors, separates chronological appointments from priorities, and puts earlier work in a native collapsed disclosure. Existing calendar navigation remains available through Choose a day.

Upcoming is a projection of real future planned/due dates, with the same task and appointment row actions used by the day plan. No new persisted statuses, record moves or migration. Parent-folder trees derive from existing `parentFolderId`; orphan/cyclic records remain reachable.

## Preserve through the layout change

- WorkNotes owns URL/view/note/folder/day navigation and session binding. Keep the same session, drafts, autosave, revision conflicts, account-switch lock, authentication recovery, unsaved-departure guard, copy/download recovery, receipts and undo.
- WorkShelf exposes Today, Inbox, folders, projects, Outstanding, Waiting on, Someday, Weekly review, All notes, Archive and timezone. Folder/project memberships are independent. Preserve nested child lists, accessible disclosures, note current-page state, search and drop-to-file behavior. Do not repurpose folder drops as project membership.
- WorkCalendar is the daily plan and seven-day navigation. Preserve day/week selection, arrow-key navigation, day marking on notes, appointments/start-note, priorities, completion/reopening, overdue labels, carried items/move-to-day, natural-language planning, notes written on the selected day and day margin.
- WorkOutstanding and WorkDayClose retain unsorted note follow-ups, Next, Waiting on, Someday, nudges, one thing, completion/undo, ledger, weekly review and close-day replanning. A new navigation label must map to real existing data rather than inventing new persisted statuses.
- WorkProjects retains derived project state, brief editing, active/paused/archive, decisions, cross-room links and linked task/note behavior. Folder management/reorder/archive/restore stays available.
- WorkNoteEditor and workNoteEntries retain newly merged dated headings, date navigation, same-date continuation, opt-in dating of old writing, rich text, safe links, slash commands, Make Open, block IDs and original content. Creation date and editable note-level meeting date remain distinct.
- WorkItemForm, WorkOpenComposer, WorkFollowups and WorkMargin retain forms, semantic sorting, pending durability, linked identities and conflicts. Layout changes must not write or migrate user records.

## Theme and responsive contracts

Use the existing semantic theme package as the palette/type authority: --noeis-canvas/chrome/paper, ink roles, rule/action/success/warning/danger, font-ui/font-reading, density/control/motion tokens. Existing themes include light/dark, Solarized variants, Tokyo variants, Catppuccin, Dracula, Nord, Gruvbox, Rose Pine, Everforest, Monokai and Omarchy. New navigation icons should derive semantic colors from theme roles and preserve visible text labels.

Verify 1440 desktop, 1280 sidebar/tablet and approximately 430 mobile; keyboard order/disclosure/current-page semantics; 44px mobile targets; reduced motion; theme contrast; and no horizontal overflow. Use fixture-only visual previews and isolated test databases; do not mutate production data.

## Verification targets

Relevant existing tests: src/work/WorkNotes*, WorkWeekfold, WorkProjects, WorkOutstanding, WorkShelf, WorkNoteEditor, WorkNoteEntries, WorkBoundary, workSession/workSessions/workPlanner*; API workNoteRoutes and workPlannerRoutes. Full UI production build remains a gate. Independent review and exact-head remote CI are required before merge. Report actual merge SHA and automatic Production deployment separately.
