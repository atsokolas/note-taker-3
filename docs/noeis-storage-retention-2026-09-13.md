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


## Proposed ongoing policy — awaiting the user's choice

The user authorized deleting unneeded production data and requested a lasting
retention approach. A separate question asks whether old automatic versions should
expire entirely or remain recoverable in external backups. No recurring job or
automatic deletion setting is enabled by this document.

Recommended product policy:

- Keep current content without an expiry, and protect human edits/reviews, active
  candidates and versions referenced by accepted proof, decisions or authored work.
- For other automatic snapshots, keep the latest three complete versions per Wiki
  and every version from the last 24 hours. Keep compact revision IDs, chronology,
  summaries and source-event links when older full payloads expire.
- Distinguish an expired automatic body from a recoverable external archive in
  metadata and reader copy. An unavailable historical body must not silently open
  a different version or promise a restore that does not exist.
- Do not retain an automatic original/monthly copy solely because it is a calendar
  checkpoint. Keep it if it has a real protected reference or human significance.
- Treat repeated review candidates as a bounded history of proposals; preserve the
  currently reviewable candidate and meaningful acceptance history.
- Run retention before pressure becomes an outage. Use a 400 MiB high-water mark
  on the 512 MiB cluster, reclaim toward 350 MiB, and retain an explicit headroom
  reserve for user saves. Counts are secondary to measured bytes.
- If protected content alone exceeds the budget, report that directly and defer
  expensive automatic rebuilds before generating another large snapshot. Never
  silently delete protected material to meet a quota.
- Expire only terminal, unreferenced operational detail under a separately tested
  policy. Maintenance comparisons and source-event links can support proof; their
  age alone does not establish that they are disposable.

Implementation acceptance:

1. Centralize one eligibility policy shared by dry run and application. Return a
   reason for both preservation and expiry; never weaken quality/publication gates.
2. Preserve payload dependencies of metadata-only unchanged revisions. Keep a
   referenced base payload until every retained dependent can still resolve exactly.
   This dependency guard is implemented and tested locally. The current production
   collection contains zero `snapshotUnchanged` revisions;
   this future requirement is not an unverified dependency in the manual recovery.
3. Recheck current review/reference/version guards immediately before mutation;
   fail closed on incomplete reference scans or changed data.
4. If external backup is selected, configure a durable destination independent of
   Atlas and the ephemeral application filesystem, verify it before expiry, and
   define a finite backup lifetime. A local laptop or an unconfigured env variable
   is not an always-on production retention service.
5. Test several simulated weeks of maintenance: unchanged passes, changed claims,
   accumulating candidates, active/human references, interrupted cleanup and a
   full cluster. Verify a bounded byte trend and retained readers, not just counts.
6. After deployment, prove a scheduled pass actually reclaimed eligible bytes and
   that a Notebook save/reload works. Logs saying 'would delete' are not completion.

## Implementation map for the next slice

Extend `server/services/wikiRevisionRetentionService.js` as the single policy
owner. Replace the private operator's lean-history override with that shared
policy when it is accepted. Count recent **full payloads**, not metadata-only
rows, and make automatic eligibility explicit from actor/reason metadata. Unknown
origin or incomplete reference data must preserve a version, with a diagnostic
reason. Avoid duplicating one-off retention rules in the writer and scheduler. The legacy
`scripts/prune_wiki_revisions.js` still has a different record-deletion contract;
it was not used for this recovery and must not become the unattended worker.

`server/services/wikiStorageGovernorService.js` should measure the complete
cluster budget and apply that same plan through an explicit expiry or verified
external-backup policy. `server/server.js` should schedule the working policy;
merely setting its current apply environment variable cannot activate deletion.
Keep retention failures separate from successful user writes. Reserve capacity
for Notebook saves and show an actionable storage failure through existing system
status rather than an endless "retry on your next change" message.

`server/services/mongoBackupService.js` already supplies local manifest/hash/ID
verification. If external retention is chosen, adapt that verification boundary
to the durable destination rather than adding a second backup format. Decide the
external recovery window explicitly; retaining every obsolete automatic copy
forever elsewhere just moves the accumulation.

An acceptance receipt must name: actual scheduled execution time, policy version,
bytes before/after, eligible/protected counts with reasons, backup verification
when required, unchanged current-content identities, and successful save/readback.
If protected data prevents the target budget, say so and defer costly automatic
work. Do not label an advisory dry run as a successful retention pass.

## Evidence and user test

Read-only inventory: `/tmp/noeis-storage-inventory.json` and
`/tmp/noeis-revision-detail.log`. Private recovery directory:
`~/.codex/backups/noeis/wiki-storage/2026-09-13/`.

The September 13 operator and reference projection live in ignored `tmp/` in
`/Users/athantsokolas/.codex/worktrees/noeis-storage-retention-2026-09-13`.
Recovery uses a per-process public DNS resolver because the machine's local DNS
proxy intermittently times out. No system DNS or Wi-Fi setting was changed.

Local validation: storage codec/archival/backup/retention/budget suites, the
revision/unchanged-revision tests and public-proof alphabet suites passed. No paid model calls or release occurred.

After write headroom is restored, keep the currently unsaved production Notebook
open. Copy unsaved words somewhere safe, make a small edit and wait for Saved;
reload only after saving and confirm the words remain. Also open the repo Wiki and
an active dossier review to confirm their current content and source links remain.
