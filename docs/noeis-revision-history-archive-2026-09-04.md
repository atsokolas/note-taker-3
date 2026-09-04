# Lossless revision-history archival

## Contract

Old revision claim histories are stored once as a checksummed, gzip-compressed
BSON payload within the same revision document. Revision IDs, receipt links,
review state, article text, sources and citations do not move. History keys stay
in their original positions so legacy JSON-based receipt hashes remain valid.
Normal model reads reconstruct the original data. Narrow projections are applied
after reconstruction; metadata-only queries do not fetch the archive.

This is not history deletion. It deletes the redundant uncompressed representation
only after retaining a lossless compressed representation and verified backup.
No new infrastructure or paid model calls are required.

## Safety and limitations

- Opt-in operator migration only; new revisions remain unchanged.
- Preserve the newest five revisions per page and anything newer than 14 days.
- Only archive records saving at least 100,000 BSON bytes, at most ten per run.
- Require an explicitly verified production reader commit before apply.
- Back up, reread/hash, compare-and-set, then check native decode and model reads.
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
Reports and verified backups live in the private Codex backups directory, not git.

Production migration is a separate acceptance gate from these local checks.
