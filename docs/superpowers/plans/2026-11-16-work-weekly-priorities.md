# Work weekly priorities implementation plan

> For agentic workers: use the executing-plans workflow, with independent final review.

**Goal:** Implement Athan’s approved Weekly Page concept as a durable Work dashboard.

**Architecture:** Store one private, revision-checked weekly plan per Monday in the existing Work store. Each priority holds references to canonical tasks; task completion, provenance and dates remain owned by those records. Derive rollover from the previous saved plan without mutating it.

**Tech stack:** Existing React Work components, Express/Mongoose Work API and session.

**Spec:** Approved image `01-weekly-page.png`, supplied in this task; user explicitly requested implementation, Elegant Code, testing, merge and deployment.

## Constraints
- All priority groups expanded; existing open to-dos can be dragged or assigned without dragging.
- Preserve original task identity, source, capture date and completion history.
- Carry incomplete priorities forward visibly; historical weekly plans are not rewritten.
- Keep existing daily planning, notes, appointments and Needs you below the weekly overview.
- Reuse theme, icons, private Work ownership and revision mechanisms; no dependencies.
- Desktop 1440/1280 and phone 430; keyboard alternative for drag.

## Review focus
- Concurrent weekly saves must conflict, never silently replace a newer plan.
- Missing/cross-owner/personal task references must not be exposed or accepted.
- Rollover must be idempotent across reloads/tabs and preserve old weeks.
- Failed save keeps inputs and a retry path; no false saved notice.
- Completion changes only the canonical task and appears consistently.

## Tasks
- [x] Add tested private week persistence and session methods with bounded inputs, ownership and revision validation.
- [x] Add tested weekly projection/rollover model (including year boundaries, completion cutoffs, skipped weeks, empty groups and defer/drop).
- [x] Build faithful Weekly Page UI, existing-task source tray and accessible assignment; preserve daily functionality below.
- [x] Test create/link/move/unlink/complete/review/history, failures, keyboard and responsive layouts.
- [ ] Independent code and design review, scoped tests, build, PR, hosted checks, normal merge and production verification.

## Deliberate boundaries
- Weekly navigation covers this week and immutable history, not editable future plans; this avoids preplanned weeks silently bypassing rollover.
- Priority completion is explicit. An outcome can carry forward even when its previous checklist is finished.
- Unacknowledged weekly edits are retained in the account session across internal navigation, with retry/conflict review and unload warning. They are not advertised as offline-durable storage.
