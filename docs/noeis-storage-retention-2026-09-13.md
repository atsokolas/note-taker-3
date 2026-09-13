# Storage recovery and bounded history — September 13, 2026

## What happened

The September 8 cleanup was real. Its independent receipt records 990 snapshot
payloads backed up and pruned, with cluster usage reduced from 512.33 to 341.01
MiB. Current content and durable proof were preserved. That operation did not
install automatic deletion. A fresh September 13 query checked every one of those
990 IDs: all are present and all still have their payloads pruned.

Fresh September 13 read-only measurements:

| Collection | Documents | Data MiB, excluding indexes |
| --- | ---: | ---: |
| Wiki revisions | 3,122 | 330.80 |
| Wiki maintenance runs | 5,803 | 55.40 |
| Wiki source events | 6,936 | 31.00 |
| Current Wiki pages | 279 | 15.72 |
| Vectors | 4,748 | 9.50 |
| Notebook entries | 693 | 8.84 |
| Articles | 424 | 8.60 |

Revisions dated September 9–11 occupy 176.93 MiB. Using the exact previous
verification cutoff (September 9, 01:44:19 UTC), new revisions occupy 169.12 MiB.
The daily total includes versions created before that cleanup finished. Of the growth since the
previous final cleanup, roughly 74.87 MiB belongs to the repo Wiki, 37.96 MiB to
CoreWeave candidates, and 21.07 MiB to Margin of Safety candidates. The two latest
sampled repo revisions have different body and claim content; the existing no-op
suppression correctly does not classify them as unchanged. This is not evidence
that every new version is redundant or safe to drop.

A second field-level aggregation found about 53.6 MiB in maintenance-run
`metadata.comparisons`, almost all of it `deltas` (about 53.0 MiB). Source-event
`text` contributes about 20.3 MiB. These are approximate BSON field sizes, not
additional collections to add to the table. Comparison consumers include
`wikiRepoComparisonService` and `wikiRepoPublicProofAcceptanceService`; their
presence prevents treating completed runs as disposable logs. No operational
records were deleted in this recovery. `serializeDeltaClaim` already limits these
to claim text, support and evidence identities; they are not raw model transcripts
or nested claim histories. Evaluate lossless comparison compression or expiry of
unreferenced comparison detail, rather than stripping evidence fields blindly.

Three mechanisms are distinct:

1. New-history compression is already installed. All 50 recent repo revisions
   inspected by aggregation use it; together they still occupy about 75 MiB.
2. Lossless migration of older claim histories runs under pressure, at most three
   revisions per six-hour worker pass by default. It does not expire versions.
3. Snapshot deletion in the server governor is deliberately `dryRun: true`.
   Its backup requirement has no durable destination in the ephemeral Render
   container. `WIKI_STORAGE_GOVERNOR_APPLY=true` is ignored there. The CLI can
   reclaim space from a machine with verified durable backups.

Revision creation also attempted default pruning without a backup handler. That
attempt scanned history and then failed once snapshots became eligible. The local
code change removes that redundant implicit call; an explicitly supplied retention
callback still works, and transaction boundaries remain unchanged.

The shared retention planner now also keeps the requested number of full payloads
when recent rows are metadata-only or already pruned. It protects explicit
dossier candidate pointers and every pending claim-review cohort member, even
when another candidate is newer. The production collection had no active pending
or deferred claim-review cohorts during the fresh recovery check. Protected unchanged versions
keep their earlier payload base, and compaction skips rows that never stored a
payload. Both the governor service and the legacy manual CLI now read the required
snapshot flags; the CLI also reads human-review metadata. Regression tests resolve
an older referenced unchanged version after a simulated prune and confirm that
metadata-only rows are excluded from backup/compaction. These are local protection
fixes, not automatic retention or a claim that recurrence is solved. Code is
committed locally as `a3173b91`, based on `79dd7edf`; it has not been released.

Production API version was independently rechecked at `5bb94784` (September 13).
The storage branch began on that main. During recovery the served API advanced
to `79dd7edf` (C7 shared-question work); that unrelated change does not alter the
revision retention path; the branch was fast-forwarded to match it. Health and
vector readiness returned HTTP 200 at 11:40 UTC. The earlier Notebook controls branch
`f8af7fdf` remains separate and unreleased.

## Recovery operation

A fresh owner/reference scan selected 329 surplus snapshots, about 140 MiB of
full documents. This is narrower than the generic governor's 474-row estimate.
It uses the previously approved operator's owner fence: Athan plus the two
ID-and-username-verified QA seed accounts. It protects recent copies, every
snapshot under 24 hours, human review, current published heads, active reviews,
and durable incoming references. Original/monthly snapshots with no other
protection can move to private backup. Current pages, articles, notes, decisions,
receipts and vectors are outside the mutation scope. The dossier review API selects
the exact first-head or maintenance candidate named by the current page's `aiState`
pointer. The reference scan protects that pointer; superseded automatic candidate
payloads are a different category from the currently reviewable proposal.

Each payload requires a private gzip EJSON backup, ID/count/hash verification,
unchanged source readback, guarded update and exact retained-metadata readback.
A backup is prepared before any temporary covered performance-index bridge.
Such indexes must be restored and their original definitions verified. No
uniqueness, TTL, partial index or access-control constraint may be dropped.

The implementation uses a server-side reference projection rather than copying
whole current content into the operator. Metadata is loaded once per owner and
partitioned by page. Native backups use the already-read BSON document and then
recheck its unchanged database value; they do not trigger Mongoose decompression.

## Verified production result

Independent verification completed September 13 at 12:24:44 UTC:

| Measurement | Result |
| --- | ---: |
| Cluster before recovery | 512.19 MiB |
| Cluster after recovery | 374.92 MiB |
| Net reclaimed, including concurrent growth | 137.27 MiB |
| Free capacity | 137.08 MiB |
| Snapshot payloads backed up and pruned | 329 |
| Gross payload bytes reclaimed | 138.80 MiB |
| Private compressed backups | 27.49 MiB |

Every one of the 329 backup files passed manifest, ID and SHA verification; every
retained Mongo revision matched its backed-up original in BSON form apart from the
explicit payload removal and pruning marker. Revision identities and metadata
remain online. All four covered, non-unique performance indexes used for quota
recovery were restored to their original definitions and independently verified.
The first snapshot was compacted atomically after quota accounting settled; no
delete-and-reinsert fallback was used.

A fresh post-cleanup scan of 82 collections found no live/durable reference
conflicts under the approved scan policy, and no published-head conflict. None of
the affected pages currently had a pending dossier candidate under the research
candidate API's state contract. No active pending/deferred claim-review cohort
existed in the fresh production check. These are data checks, not rendered review
acceptance.

Protected counts stayed at 424 articles, 693 Notebook entries, 279 Wiki pages,
1,080 receipts, two repo baselines and 4,748 vectors. No protected document disappeared. Three Wiki pages changed timestamps concurrently with recovery;
the operator issued no current-page mutations. Storage reduction is net of that
concurrent activity. All eligible snapshots were processed; reaching the 350 MiB
operator target would require a separately justified scope, not weaker protection.

A fresh Notebook database insert/read/delete passed, with zero probe records left.
Production health and vector readiness returned HTTP 200 at 12:26 UTC after one
health timeout during a concurrent deployment. The served API is `ecac703f`; this
task did not release that code. Its changes since `79dd7edf` were inspected and
are confined to shared-question work, with no overlap in the edited storage files.
Authenticated Notebook autosave/reload remains a
user test, and no automatic expiry job has been enabled.

Private audit ledgers:

- `recovery-1789298198940-apply.json` records the quota unlock, atomic first
  compaction and index restoration; its first verification is linked inside it.
- `recovery-1789298902283-apply.json` records the remaining 328 snapshots and
  protected-record reconciliation.
- `recovery-1789298902283-verification.json` independently verifies **both** ledgers,
  all 329 backups/stubs, restored indexes, current references and the final write.

All three files are in the private recovery directory documented below. The prior
September cleanup was also independently rechecked: all 990 IDs remain present
with pruned bodies. No current article, note, Wiki, receipt or vector was deleted.


## Accepted daily retention — September 13

Athan approved automatic expiry of obsolete automatic snapshot bodies and specified
**one cleanup per day**. Old automatic bodies expire; they do not accumulate in an
unlimited external archive. Earlier private recovery backups remain untouched.

The policy keeps the latest three full snapshots and everything from the last
24 hours, plus human or unknown-origin versions, human review, active candidates,
published heads, proof, decisions, authored references and unchanged-version bases.
Calendar-only original/monthly copies no longer keep automatic bodies forever.
Revision IDs, summaries, source-event links and review metadata remain online.
Expired rows retain `snapshotPrunedAt` and record `snapshotExpiryPolicy`; the existing
snapshot resolver returns no body for expired content instead of guessing a version.

The server replaces its report-only governor with `runDailyWikiRetention`.
A single MongoDB state document stores next-run time, lease, last completion,
actual expired count, payload bytes reclaimed and measured net cluster change.
The timer checks every 15 minutes, but the atomic due-time claim allows only one
cleanup every 24 hours across deployments and server instances. Failed/interrupted
runs retain their partial receipt and are visible; their next daily slot remains
scheduled. Native compare-and-swap updates preserve all other revision fields and
remove the compressed payload archive as well as before/after bodies.

The scan checks every application collection for incoming references, excluding
old snapshot bodies themselves and terminal operational links. It deduplicates
references inside MongoDB and aborts on excessive nesting or failed measurement.
It scans references again after planning, rereads each affected page and its
revision policy, and checks page/revision timestamps and review metadata before
mutation. A shared renewable lease serializes background Wiki growth with cleanup.
This is not a general database-wide lock on human activity; human edits/reviews
remain available and changed records are skipped.

Background source-event and scheduled maintenance work measures cluster usage
before starting, leaving an 8 MiB allowance below the 400 MiB ceiling. When space
is tight or measurement is incomplete, source events remain pending and pages stay
due. After a pause, work resumes below **380 MiB**, the revised target from the
measured roughly 376 MiB baseline. The 112 MiB beyond the ceiling is working
headroom, not permission to delete protected material. This guard covers automatic
Wiki maintenance; it cannot guarantee unlimited capacity for imports or human work.
Operational comparisons and source-event documents are not deleted by this policy.

An authenticated `/api/system/storage` endpoint supplies aggregate status without
private page or revision identities. Cleanup failure or a storage pause appears in
the existing System Status control. Healthy storage stays silent. A failed status
poll alone does not claim that saves are broken.

## Implementation and verification

New production files replace the old server report-only path:
- `wikiAutomaticRetentionService.js`: durable daily execution, shared write guard,
  compact receipt and status projection.
- `wikiRetentionReferences.js`: reusable reference-only BSON traversal, replacing
  reliance on the private recovery operator for automatic reference checks.
- `useStorageStatus.js`: server-backed failure producer for the existing status UI.

The legacy manual governor remains available with its verified-backup contract.
Ordinary revision creation no longer attempts implicit pruning without a backup.
No current Notebook, article, Wiki, receipt or vector deletion is introduced.

Local verification:
- `npm run wiki:storage:test`: codec/archive/native backup, old planner/governor,
  automatic eligibility, dependencies, and six simulated weeks of changes.
- `WIKI_STORAGE_TEST_URI=mongodb://127.0.0.1:27029/test node scripts/test_wiki_daily_retention.js`:
  isolated real MongoDB, actual byte reclamation, exact retained metadata, new proof
  and review references, daily cadence, concurrent workers, failure receipts,
  pressure/recovery, source-event requeue and scheduled-page deferral. Temporary
  database removed. No model calls.
- `npm run proof:alphabet:test`: acceptance, revision readers and public leakage.
- Scheduled maintenance, maintenance serialization and source-event worker tests.
- Authenticated storage-route success, unauthorized access and sanitized failure.
- 17 frontend status tests and production frontend build passed.
- Chromium preview against the isolated Notebook QA API at 1440, 1320 and 430px,
  with reduced motion: failure message opens in System Status and clears on recovery.
  Screenshots: `output/daily-storage-qa/`. This is a controlled status fixture,
  separate from production server verification.

The pre-existing `systemRoutes.health.test.js` expects health without the vector
index added on main; it fails against current main's response and remains untouched.
The new storage-route test is independent of that stale health fixture.

Production read-only policy review and release verification are in progress.
Do not treat local tests as deployed or authenticated production proof.

## User test and remaining boundaries

Copy any unsaved text safely first. In production Think, edit a Notebook paragraph,
wait for Saved, then reload and confirm the words remain. Existing Wiki reading,
source links and pending reviews should continue to open normally. When healthy,
there is no new storage badge or toast to dismiss.

A production daily-worker receipt and live write/readback are still required to
claim the new policy is operating. A later daily cycle is longitudinal evidence,
not something a first deployment can prove. Protected/current content can still
outgrow a 512 MiB cluster; in that case the policy must keep background work queued
and make the capacity problem visible rather than deleting knowledge.

Private recovery receipts and backups from the earlier completed cleanup remain at
`/Users/athantsokolas/.codex/backups/noeis/wiki-storage/2026-09-13/`.
The separate Notebook shortcut/blue-bracket/explicit-retry branch remains unreleased
and is not bundled into this retention change.
