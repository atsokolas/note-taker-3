# Work priority feedback — November 16, 2026

## Feedback and diagnosis

Owner email/screenshot requested simpler priority creation/language, draggable to-dos, and creation of to-dos inside a priority. No changes to source notes or existing task records were requested.

The weekly tray had native drag handlers, but the same tasks in Today/From earlier and Next did not. Weekly drop targets also only accepted drags when the tray's component-local dragging state was set. Inline task creation was absent. Duplicate “Priorities” headings and always-visible rollover controls obscured the simple priority/task relationship.

## Changes

- Priority creation sits at the top; simplified labels distinguish weekly priorities from today's to-dos. Review is shown only when last week's priorities need attention. Routine save prose was removed; errors and recovery remain explicit.
- A shared canonical task drag and explicit grab handle replaces tray-only wiring. Existing tasks remain single records; priority links do not copy or redate them. Native selection remains available for touch/keyboard assignment.
- Each priority has an inline Add to-do. This uses the existing capture/edit/flush persistence path before saving its canonical ID into the plan. Failed creation retries reuse the task identity; failed plan saves retain the existing proposal/revision recovery.
- Drafts survive opening a note and returning. Review cannot hide an active draft; if a target disappears remotely, the draft can be cancelled or saved into Open to-dos.

## Verification

Focused UI regression tests cover canonical creation/linking, retry without duplicate capture, draft recovery, removal of draft targets, external drag acceptance, and existing Work behavior. Production build is required.

Browser smoke uses a built local app with synthetic API fixtures only. It covers desktop 1440/1280 and phone 430, native drag from both tray and daily rows, inline creation, reload, previous-week read-only navigation, and mobile dark-theme creation/select assignment. No production account data is read or changed.

`node scripts/smoke_work_priority_feedback.cjs` runs after building `note-taker-ui`. Screenshots and logs are written under ignored `tmp/`.

Playwright's one-shot cross-scroll drag positioning is unreliable when source and target cannot be visible together; the daily-row drag assertion makes both visible. Browser QA does not claim a real-device touch-drag test. Touch and keyboard use the native assignment control.
