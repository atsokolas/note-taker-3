# Noeis wiki storage governor runbook

**Policy:** preserve proof and provenance first; compact or delete only redundant storage.

## Protected records

The governor never treats these records as disposable:

- The newest 20 revisions for each page.
- The original revision and monthly checkpoints.
- The newest candidate and rejected revisions.
- Revisions for the published repository head.
- Repository baseline revisions.
- Revision, source-event, and maintenance-run IDs referenced by accepted proof clocks, accepted-through state, or durable Noeis receipts.
- Non-terminal source events and maintenance runs.

## Automatic worker

The Render worker runs every six hours and on server start. It is report-only unless:

```bash
WIKI_STORAGE_GOVERNOR_APPLY=true
```

Normal retention is 45 days. When logical Atlas data plus indexes reaches 420 MiB, the operational retention window contracts to 14 days. Revision snapshot retention remains provenance-aware in both modes.

## Operator dry-run

```bash
npm run wiki:storage
```

Review:

- `underPressure`
- `revisionPages[].compactableSnapshots`
- `maintenanceRuns.deletable`
- `sourceEvents.deletable`
- `storage.before.logicalBytes`

## Explicit apply

```bash
export APPLY_WIKI_STORAGE_GOVERNOR=YES
npm run wiki:storage -- --apply
unset APPLY_WIKI_STORAGE_GOVERNOR
```

Re-run the dry-run after applying. The second report should show no remaining eligible work in the processed batches. Verify the public proof registry and direct shared pages after every production apply.

## Disable or tune

Set `WIKI_STORAGE_GOVERNOR_DISABLED=true` to stop the worker. Batch size, revision page limit, retention windows, high-water threshold, interval, and run-on-start behavior are separately configurable through the environment variables documented in `.env.example`.
