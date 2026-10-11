# Lossless revision-history archival

## Contract

Old revision claim histories are stored once as a checksummed, gzip-compressed
BSON payload within the same revision document. Revision IDs, receipt links,
review state, article text, sources and citations do not move. History keys stay
in their original positions so legacy JSON-based receipt hashes remain valid.
Normal model reads reconstruct the original data. Narrow projections are applied
after reconstruction; metadata-only queries do not fetch the archive.

This is not history deletion. It replaces the redundant uncompressed
representation with a checksummed, lossless compressed representation in one
atomic document write. No new infrastructure or paid model calls are required.

## Safety and limitations

- New revisions saving at least 100 KiB are packed before their first database
  write, while the returned model still exposes the ordinary decoded snapshot.
- Under cluster pressure, the governor migrates at most three existing rows per
  run. It preserves the newest five revisions per page and ignores rows newer
  than one hour. The operator remains available for backed-up recovery batches.
- Preserve the newest five revisions per page and anything newer than 14 days.
- Only archive records saving at least 100,000 BSON bytes, at most ten per run.
- Require an explicitly verified production reader commit before apply.
- Operator migrations back up and reread/hash before compare-and-set. Automatic
  batches preflight exact decoding, compare-and-set, and perform native readback
  before continuing; they never delete the row or its compressed history.
- Corrupt payloads fail closed. Archived snapshots are immutable; metadata
  review updates remain supported. Retention pruning removes the archive too.
- Direct native reads see compressed storage. Server snapshot consumers use the
  model; size-only aggregation and backup/operator code use native storage.
- Restore native backup payloads before rolling back to a pre-reader deployment.
- Do not change the codec version without retaining a decoder for old versions.

## Local proof

Codec tests cover exact types, JSON byte ordering, corruption, claim identity and
compression. Disposable Mongo tests cover full and lean reads, nested inclusion,
exclusion, metadata-only and ID-only projections, unchanged unarchived behavior,
metadata save without reinflation, snapshot mutation rejection, query filtering,
find-and-update return hydration and pruning. Existing revision, claim disposition,
repo comparison, publication and Judgment audit suites pass.

## Operator

`scripts/archive_wiki_revision_histories.js` is dry-run by default. Set
`NOEIS_ENV_FILE` to the private application env file; never copy secrets into docs.
`ARCHIVE_LIMIT` defaults to one. Apply additionally requires
`ARCHIVE_READER_COMMIT` to match the live API version and `--apply`.
`ARCHIVE_CONCURRENCY` defaults to one and permits at most two. Every in-flight
readback finishes before stopping on a failure; a batch never exceeds ten rows.
Reports and verified backups live in the private Codex backups directory, not git.

The automatic policy is locally tested here. Merge, deployment and an observed
production governor run remain separate acceptance gates.

## Quota recovery bridge

Atlas rejected the backed-up canary's shrinking update while over 512 MiB.
`scripts/unlock_revision_archive.js` is a one-shot, dry-run-default bridge:

- Finished, unlocked, non-replay embedding jobs qualify only when their exact
  text hash matches an existing owner/type/object/sub-ID vector. The vector is
  retained; queued, running, failed and abandoned jobs are untouched.
- Briefing caches are rebuildable, not accepted knowledge. Both queue rows and
  cache rows require verified backups and version-matched deletion.
- Only nonunique, non-TTL, nonpartial, nonsparse indexes covered by a longer
  same-order index may be temporarily removed. Definitions are checkpointed and
  restored after the three-revision archive batch. No unique constraint moves.
- If index accounting settles above the initial estimate, `--resume <report>`
  permits the same class of nonconstraint indexes on verified-empty collections
  as temporary headroom. These definitions must also be restored. It never
  drops collections, constraints, or content to make an archive fit.
- Quota is cluster-wide, not just the application's database: include the
  nearly empty legacy `note-taker` database's indexes. Recovery may temporarily
  remove the named nonunique Connections from-object performance index while
  other owner-leading indexes continue serving queries. Restore it after the
  archive. There are no index hints depending on its name.
- The operator checks estimated headroom before any mutation, verifies the live
  reader commit, records private recovery reports, and restores indexes in a
  finally block. Interrupted runs require inspecting that report and restoring
  any dropped indexes before declaring closure.

This is not automatic retention. The scheduled policy changes representation,
never revision identity or availability; destructive retention remains dry-run
unless its existing verified-backup apply path is explicitly enabled.

## Production result — 2026-09-04

- Reader/citation fixes merged in PRs #306–308; `/api/version` confirmed
  `6ef09f3a7b675d67b14429952bbd2679fef824c4`. Local verification's reader and
  model files have no diff against that deployed commit.
- Backed up and removed 1,329 completed embedding jobs whose exact text matched
  retained owner/type/object/sub-ID vectors; cleared 24 rebuildable briefing
  caches. Active queue work and vectors were not deleted.
- Archived 13 old revision histories (initial three, then ten). Each passed
  backup verification, concurrent-change checks, native decoding, full model
  readback and exact JSON ordering. No revision row was deleted.
- Restored all 94 temporary index definitions, then independently compared their
  names, key order, uniqueness, sparsity, partial filters, collation, TTL and
  hidden options with the saved originals. The unique constraints never moved.
- Cluster baseline: 540,188,370 bytes (application database plus legacy database).
  Final observed usage: 524,056,681 bytes, or 499.78 MiB / 512 MiB. Net reduction
  **15.38 MiB**, with **12.22 MiB** of headroom. Index allocation may fluctuate.
- Protected counts: 271 Wiki pages, 418 articles, 693 notes, two repo baselines,
  4,748 vectors. Revisions increased 2,297 → 2,299 and receipts 1,037 → 1,038:
  background maintenance promoted two new revisions during recovery. This is why
  net headroom is smaller than the archive savings alone suggest.
- `/health` returned OK and the vector index remained ready. Codec, real local
  Mongo reader/update/projection, eligibility, retention and governor checks
  passed. No paid model evaluation was used. This is production-data readback,
  not a new authenticated browser or longitudinal maintenance acceptance.

Private backups and full reports are under
`~/.codex/backups/noeis/wiki-storage/2026-09-04/`, including
`archive-unlock-1788542536654.json` and the two successful history-archive reports.
The successful write batches prove writes recovered; the earlier quota-blocked
attempts left their original revisions intact.

### Remaining versus plan

The deployed citation identity repair and first lossless archival cleanup are
complete. The prevention slice now packs large new histories before their first
write, migrates at most three eligible old histories per pressured governor run,
and measures every non-system database visible to the Atlas credential. If
cluster-wide measurement is unavailable, it reports an incomplete scope and
assumes pressure instead of claiming false headroom. This prevention slice is
local until merged and deployed. Repeated production maintenance stability is
still required. Accepted history, receipts and revision identities remain intact.
