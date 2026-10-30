# Inline Open composer

Add a compact composer inside the existing note's Open margin. The authorized interaction is a title field, Follow-up/Open question selector, Add and Cancel. It works even when Open is empty. The note stays mounted, with its prose, selection and scroll untouched. This slice does not change bullet spacing.

Approaches: reusing the full item dialog keeps too much navigation; reusing the editor shortcut removes prose and parses calendar words. A dedicated inline form backed by the existing Work session preserves literal titles and reuses durable operations. This is the recommended, authorized direction.

Use existing Work serif type, ink/rule/paper tokens and 44px controls. At narrow widths the form fills the available note width. Escape collapses and keeps the draft; explicit Cancel discards an unsubmitted draft. No blur submission. Enter submits except during IME composition. Keep drafts per account and note in a separate device store, outside the auto-flushing session queue. Show storage failure truthfully and prevent leaving unsafe writing.

Submission snapshots the displayed note's actual folder and identity. Create task/question with no plan, due date, priority or calendar parsing. Persist a stable operation identity before enqueueing. A durable handoff clears the composer and lets the existing item status and retry path own sync; interrupted handoffs reuse the same identity after reload. An unsynced parent is saved before its linked item. No server schema or API changes, live data mutations, merge or deployment.

Synthetic visual mockup: `tmp/inline-open/mockup.html`. Verification covers both kinds, scope, literal titles, editor preservation, drafts/cancel/Escape/account isolation, IME, double submit, offline/retry/reload and storage errors. Desktop, 1280px and 430px browser evidence required.
