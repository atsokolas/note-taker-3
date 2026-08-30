# Mongo storage audit — 2026-08-30

This is a read-only measurement and backup rehearsal of the database selected
by the deployed `MONGODB_URI`. No documents, collections, or indexes were
changed.

## Capacity

- Database: `test`
- Logical document data: 497,635,412 bytes
- Indexes: 35,229,696 bytes
- Logical total: 532,865,108 bytes (508.18 MiB)
- Physical collection allocation plus indexes: about 247 MiB
- Collections: 66
- Documents: 87,282

The free-tier write failures are consistent with the logical data plus index
footprint reaching the 512 MiB quota. MongoDB is still the storage system;
Atlas is the managed MongoDB host.

## Where the space is

| Collection | Documents | Logical data | Indexes | Judgment |
| --- | ---: | ---: | ---: | --- |
| `wikirevisions` | 2,179 | 306.0 MiB | 0.6 MiB | Primary target: full before/after snapshots are retained too generously. |
| `wikisourceevents` | 12,346 | 60.7 MiB | 3.8 MiB | Operational history; old terminal rows can expire after reference checks. |
| `wikimaintenanceruns` | 36,676 | 54.1 MiB | 3.0 MiB | Operational history; old terminal rows can expire after reference checks. |
| `notebookentries` | 692 | 8.8 MiB | 6.0 MiB | User knowledge; do not target first. |
| `articles` | 413 | 8.5 MiB | 5.8 MiB | User Library; do not target first. |
| `wikipages` | 265 | 13.6 MiB | 0.5 MiB | Current accepted pages; do not target first. |
| `vectoritems` | 4,616 | 9.2 MiB | 0.8 MiB | Rebuildable, but smaller than history and useful to retrieval. |

The first three collections account for about 86% of logical document data.
Deleting Library articles, notebooks, or current Wiki pages would solve the
wrong problem.

## Recovery options

### 1. Compact old revision snapshots

The current retention plan protects the newest **20** full revisions per page,
plus the original, monthly checkpoints, reviewed revisions, accepted proof and
decision references, repo baselines, and the published repo head. On large repo
pages a single snapshot can exceed 2 MiB, so count-based retention leaves pages
with 22–24 unpruned revisions and 46–52 MiB of history each.

- Current 20-snapshot policy finds only 12 compactable snapshots, about 1.2 MiB.
- A five-full-snapshot pressure policy, while retaining every existing durable
  exception above, finds 592 compactable snapshots and an estimated 176,769,924
  bytes (168.6 MiB) of before/after payload.

The implemented governor's bounded dry-run targets the seven pages already over
its count/byte threshold. It returned 115 compactable snapshots totaling
109,507,829 bytes (104.4 MiB) in the first safe pass. The broader 168.6 MiB
estimate includes smaller pages that are not yet over that trigger.

Compaction should null only `before` and `after` on unprotected old revisions.
The revision identity, timestamp, reason, source event, maintenance run,
promotion status, claim-review receipt, source version, quality result, and
summary remain. This is the largest safe recovery lever.

### 2. Expire old terminal maintenance telemetry

At the pressure cutoff of 14 days, the unfiltered upper bound is:

- Maintenance runs: 33,822 terminal rows, 50,780,469 bytes (48.4 MiB).
- Source events: 9,710 terminal rows, 58,338,152 bytes (55.6 MiB).

The existing governor correctly protects rows referenced by retained revisions,
pages, receipts, accepted clocks, and surviving runs. Those reference checks
must run before deletion, so the figures above are upper bounds rather than an
authorization to delete all candidates. Cleanup should be batched and measured
after each batch.

### 3. Repair stale nonterminal lifecycle rows

- 2,655 maintenance runs remain `running` beyond 14 days (about 0.6 MiB).
- 2,545 source events remain `processing` beyond 14 days (about 3.1 MiB).
- The oldest examples date to June.

This is mainly a correctness issue, not a capacity lever. A lease-expiry repair
should first mark genuinely abandoned rows failed, then let normal terminal
retention expire them. They should not be blindly deleted while nonterminal.

### 4. Move QA churn out of the production database

Several of the largest revision groups belong to `qa_wiki_seed` and
`qa_editor_seed`, including repo evidence and hang probes. The largest QA groups
hold well over 100 MiB of revision data. They are potentially disposable only
after their acceptance role is inventoried; the durable fix is a separate QA
database with teardown, not repeated manual deletion from production.

## Recommended sequence

1. Change the pressure-mode full-snapshot limit from 20 to 5 and add tests that
   prove every durable exception survives. Implemented locally; not applied.
2. Run the governor in dry-run mode and save the exact IDs/counts/byte estimate.
   Completed locally: 115 snapshots / 109,507,829 bytes; first operational batch
   also found 2,386 reference-free maintenance runs and 1,280 reference-free
   source events. No writes were made.
3. Export every targeted revision to a private compressed backup and verify its
   document count, exact identity set, and SHA-256 digest before enabling any
   write mode. Completed locally: seven revision archives contain all 115
   targeted snapshots (109,507,829 bytes of compactable payload); separate
   archives contain all 2,386 candidate maintenance runs and 1,280 candidate
   source events. Every archive passed decompression and exact-ID readback, is
   stored outside the repository with mode `0600`, and the rehearsal left
   database metrics byte-for-byte unchanged. The governor now refuses every
   destructive path unless its matching verified receipt is present. Production
   apply still requires separate explicit authorization.
4. Apply snapshot compaction in small batches; verify accepted Wiki, repo,
   dossier, Judgment, and provenance routes after each batch.
5. Expire reference-free terminal telemetry older than 14 days in batches.
6. Repair abandoned leases and isolate QA fixtures in a disposable database.
7. Re-measure logical data plus indexes; target below 350 MiB, leaving at least
   150 MiB of free-tier headroom.

Do not drop collections, prune current pages, remove receipts, remove repo
baselines, or delete unverified duplicate Wikis as part of this operation.
