# Project auto-erasure: scope and verification

## Consent and rollout boundary

Only a newly confirmed project deletion that explicitly requests automatic erasure receives a server-stamped consent record. Existing deleted batches and older clients without that explicit flag remain recoverable and are never silently enrolled. Individual note deletion is unchanged.

The in-product second click discloses permanent erasure of the reviewed project notes/tasks after 14 days. Deleted shows the server-generated deadline, including time zone. Restore cancels that batch's pending erasure. A later deletion is a new batch and requires a fresh confirmation.

## What erasure means

The project and batch-owned records lose their content and retain minimal identity tombstones so retries, historical links and restored/out-of-project records cannot accidentally recreate or misidentify them. Independent notes, copied excerpts, exports, device-held unsaved drafts and provider backups are not a secure-erasure target. The product must not promise erasure of every copy.

Cross-project tasks and notes already deleted before the batch remain outside the destructive scope. Their usability and recovery must survive the batch erasure. Only exact account-owned batch members can be erased; anomalies fail closed, never partially erase a batch.

## Operational scheduling

The existing API process runs a bounded sweep on database connection and hourly thereafter. No external cron service, new account settings or deployment workspace selection is necessary. Multiple replicas are safe through database transactions and per-batch eligibility rechecks. A stopped service catches up on restart. Erasure is never before the server deadline; it normally happens in the following hourly sweep, not at an exact wall-clock instant. Restore can still win until erasure actually commits.

## Required synthetic checks

- Legacy/unconfirmed deletion remains untouched even after the deadline.
- One millisecond before deadline preserves data; at/after deadline is eligible.
- Restored or re-deleted batches cannot be erased by an older operation.
- Ownership, Work-context and complete membership mismatch fail closed.
- Restore/erase and two-worker races result in one atomic, coherent outcome.
- Cross-project task edits, prior Trash restore and historical weekly priority edits still work.
- Server responses clear pristine cached erased content; unsaved drafts do not silently recreate erased records.
- UI confirmation accurately separates legacy recovery, future erasure and completed erasure.
- Scheduling waits for a connection, skips local overlap, retries later after failure and catches up after restart.

No real user data is used in erasure tests. This change requires review and separate merge/deploy approval.

## Review and validation (2026-11-16)

Independent safety review found no remaining blockers after fixes for stale cache reconciliation, erased-source link creation, prior-Trash source membership, deadline corruption and queue starvation. Blocked batches display a restore/review explanation; failed and invalid rows rotate behind untouched due work rather than monopolizing the queue.

- Work UI: 287 tests in 28 files passed; no console/act errors, three existing Tippy environment warnings.
- Production UI build passed; all 14 themes plus custom Omarchy accent passed.
- Synthetic built-browser smoke passed at 1440, 1280 and 430px, including explicit consent payload, deadline text, cancellation, deletion/restoration, keyboard/focus and zero page errors/overflow.
- Scheduler unit coverage passes: delayed readiness, immediate catch-up, hourly cadence, overlap suppression, stop, exceptions and blocked/failed reporting.
- Work persistence regression covers exact boundary, empty batches, prior Trash, independent copies, foreign ownership, corrupted dates, restore race, duplicate workers, transactional rollback/history, canonical weekly references and retry fairness.

The full-server result is recorded in the PR. A passing UI smoke uses intercepted synthetic API data; it does not constitute a destructive live-account test.
