# Noeis repo-wiki publication architecture

Date: 2026-07-10

Status: implementation in progress, grounded in the production `atsokolas/note-taker-3` output and the current server path.

## Implementation status

- Push 1 publication shield: implemented locally. Failed repo candidates preserve the trusted page and remain inspectable as rejected revisions.
- Push 2 one head, one build: implemented locally. Repository evidence events are attached/ignored, one snapshot event is buildable, and repo-create, snapshot-worker, direct draft, streamed draft, and scheduled refresh all share the durable page/head lease.
- Push 3 source-version truth: implemented locally. Backend watch fields, four-state repo-panel UI, bounded startup checks, and a two-request head-only page-open freshness probe are complete. The probe is capped at 1.8 seconds, fails open to the trusted page, and persists with an atomic update rather than a versioned document save.
- Push 4 canonical quality and migration: code complete locally. The production evaluator is exported and the live verifier now uses it and requires observed/published head agreement. Real-account and external-repo rebuild acceptance remain deploy-time work.

## Decision

A repo-wiki update must become a staged publication transaction:

1. observe one repository snapshot,
2. collect one evidence bundle,
3. build one candidate,
4. evaluate one canonical quality contract,
5. atomically promote only a passing candidate,
6. otherwise keep showing the last known-good page.

The visible `WikiPage` must no longer double as the mutable build scratchpad.

## What actually happened

The reviewed real-account output was stale. It exactly matches the earlier saved artifact whose page header reported:

- repository head `ca5e9c3`,
- 48 references,
- 37 claims,
- 1,099 article words.

The post-deploy QA rebuild used head `4cbdac0`, 60 references, 18 used substantive sources, zero dangling citations, and passed the strengthened gate. The user was therefore comparing the current code with a page built from an older repository snapshot.

That stale page is not merely a user refresh mistake. The current product can label a GitHub watch as active while the article remains built from an older head, and it does not record which head produced the visible body.

## Proven root causes

### 1. Observed repository state and published article state are conflated

`externalWatches.githubRepo.lastHeadSha` records the most recently observed GitHub head. There is no separate `publishedHeadSha` or `candidateHeadSha`. The UI can say the watcher is current without proving that the visible article was generated from that head.

The GitHub worker checks active watches on a six-hour cadence by default and does not run on service start unless `GITHUB_REPO_WATCH_RUN_ON_START=true`. A page opened between checks can be stale with no explicit stale state.

### 2. One repository snapshot fans out into many independent rebuild triggers

`createMissingRepoEvents()` creates one pending `WikiSourceEvent` per selected document, plus commit and release events. A normal repo snapshot can therefore create roughly 50 pending events for one page and one head.

The synchronous `/api/wiki/pages/from-github` route already performs a full maintenance build after attaching those events, but it does not mark the events consumed. The minute source-event worker can later process those same events one by one. Each event independently calls `maintainWikiPage()` for the same page.

This is the structural cause of:

- repeated model spend for one logical repository update,
- uneven intermediate drafts,
- duplicate maintenance runs,
- Mongoose `VersionError` races,
- worker retry noise,
- stale or lower-quality content winning the final save.

### 3. The quality gate is advisory, not a publication barrier

`maintainWikiPage()` mutates `page.body`, `plainText`, `sourceRefs`, `claims`, and citations before the final persisted quality result is known. If the model and deterministic fallback both fail, the function still returns the mutated page with `quality.ok=false`.

Both the repo-create route and source-event orchestrator subsequently save that page. The source-event orchestrator then marks freshness `fresh` based only on contradictions, not on `quality.ok`.

The result is logically invalid: a page can fail quality, replace the previous article, and then be labelled fresh.

### 4. Quality rules are split between production and the verifier

The production evaluator checks evidence depth, core paths, path use, commands, product signals, flow signals, and template leakage. The live verifier adds further checks, including the explicit missing-core escape phrases. A candidate can therefore pass or fail differently depending on which gate is consulted.

### 5. Source attachment is append-first and head-agnostic

`attachSourceEventsToPageRefs()` appends refs to existing refs and truncates the combined array. It does not replace the prior GitHub snapshot as an atomic evidence set. Old-head and new-head refs can coexist, and a fixed limit can retain stale items while excluding a current mandatory path.

## Target data contract

Extend the GitHub watch state while preserving existing fields:

```js
externalWatches.githubRepo = {
  owner,
  repo,
  status,
  lastCheckedAt,
  lastHeadSha,          // latest observed GitHub head; compatibility field
  publishedHeadSha,     // head backing the visible article
  candidateHeadSha,     // head currently building or awaiting review
  lastPublishedAt,
  lastBuildAttemptAt,
  lastBuildError,
  buildStatus           // idle | queued | building | ready | needs_review | error
}
```

Each logical GitHub refresh gets a stable snapshot key:

```text
github-snapshot:<owner>/<repo>:<headSha>
```

Individual document events may remain as durable evidence records, but only one snapshot event is pending for maintenance. It references the selected document-event ids and affected page id. Document events are marked attached/batched, not independently queued for page generation.

Use `WikiRevision` to retain candidate output by adding candidate/promotion metadata rather than introducing a parallel page product:

```js
WikiRevision = {
  ...,
  reason: 'agent_candidate' | existing reasons,
  promotionStatus: 'candidate' | 'promoted' | 'rejected',
  sourceVersion: { provider: 'github', headSha, snapshotKey },
  quality: { ok, failures, metrics }
}
```

The current `after` snapshot is sufficient to hold the candidate body. The visible `WikiPage` remains the maintained object; revisions are its build ledger.

## Target execution path

### Observe

1. Fetch the repository head first.
2. If it equals `publishedHeadSha` and no forced rebuild was requested, update `lastCheckedAt` and stop without model work.
3. If it differs, fetch and rank evidence once, persist the snapshot/document records, and enqueue one snapshot event.

### Lease

Acquire a durable Mongo lease keyed by page id and head, not an in-memory map. A conditional `findOneAndUpdate` should succeed only when there is no unexpired build lease. The lease includes token, head, acquiredAt, and expiresAt.

This protects manual update, synchronous create, source-event worker, and scheduled maintenance across process restarts or multiple Render instances.

### Build candidate

Refactor the generation core into a non-persisting seam:

```js
buildWikiCandidate({ pageSnapshot, evidenceBundle, trigger })
  -> { pageSnapshot, quality, modelInfo, sourceVersion }
```

It may reuse the existing model, fallback, materialization, and claim code, but it must not mutate the live Mongoose document.

### Evaluate

Create one exported `evaluateRepoWikiCandidate()` contract used by:

- candidate generation,
- route/worker promotion,
- live verifier,
- focused tests.

The repo contract includes:

- sufficient substantive evidence,
- minimum distinct used sources,
- claims-per-used-source ceiling,
- no dangling citations,
- mandatory core paths attached and used for the Noeis repo,
- exact path citation support,
- concrete install/run/test/build evidence,
- product and user-experience orientation,
- critical end-to-end flow ownership,
- no template/gate language,
- no missing-core escape phrases,
- no stale QA/planning documents presented as current key paths.

### Promote

1. Save the candidate as a `WikiRevision`.
2. If quality fails, mark the revision rejected, release the lease, preserve the current page body and citations, and set `buildStatus=needs_review` plus the failure summary.
3. If quality passes, atomically update the page only when:
   - the page id/user match,
   - the lease token matches,
   - `lastHeadSha` still equals the candidate head.
4. Set article fields, `publishedHeadSha`, `lastPublishedAt`, freshness, and quality together.
5. Mark the candidate revision promoted and release the lease.

If a newer head arrived during generation, keep the candidate revision but do not promote it; enqueue the newer head.

## User-facing state

The repo panel should distinguish three facts:

- `Repository checked`: latest observed head and time.
- `Page current through`: head that produced the visible article.
- `Build state`: queued, rebuilding, current, or needs review.

Required messages:

- Current: `Page current through 4cbdac0 · checked 8m ago`.
- New head: `New commits detected at 91ab3f2 · rebuilding from 50 repository sources`.
- Failed candidate: `The latest update did not pass the evidence bar. Showing the last trusted version from 4cbdac0.`
- Superseded candidate: `A newer commit arrived while this page was rebuilding. Continuing with the latest head.`

Never replace trusted prose with a failed candidate. Never label a failed candidate fresh.

## Implementation pushes

### Push 1: Publication shield

Goal: failed generation cannot overwrite trusted content.

- Add a candidate build seam or snapshot/restore wrapper around current maintenance.
- Add backend rejection for missing-core escape phrases.
- Preserve last-known-good body/sourceRefs/claims/citations when final quality fails.
- Set freshness `needs_review`, not `fresh`, on failure.
- Store the rejected candidate and quality result in a revision/run.
- Cover manual, repo-create, source-event, and scheduled callers.

Acceptance:

- Seed a trusted page, force a failing candidate, and prove the visible body is byte-identical afterward.
- Failed candidate is inspectable in revision/run history.
- No route returns a failed candidate as a completed current page.

### Push 2: One head, one build

Goal: one GitHub head causes at most one maintenance run per page.

- Add snapshot event/coalescing keyed by owner/repo/head.
- Mark document events attached/batched.
- Mark synchronous-create events consumed after a successful build.
- Add a durable page/head lease.
- Make duplicate queue deliveries idempotent.

Acceptance:

- A 50-document snapshot creates one maintenance run.
- Replaying the same snapshot creates zero additional model calls.
- Concurrent manual and worker requests produce one winner and no `VersionError`.

### Push 3: Source-version truth and UX

Goal: users can tell whether the visible article is current.

- Add observed/published/candidate head fields.
- Add the repo-panel status copy and progress states.
- On page open, perform a cheap freshness check when `lastCheckedAt` is old; do not fetch the full corpus unless the head changed.
- Run the watcher worker on service start with a bounded batch, then continue the existing interval.

Acceptance:

- A page built at head A and repository advanced to B visibly says it is rebuilding/stale.
- Successful promotion changes `publishedHeadSha` to B.
- Failed promotion continues showing A with an honest failure state.

### Push 4: Canonical quality and migration

Goal: production and QA enforce the same developer-handoff bar.

- Export and reuse the canonical candidate evaluator.
- Make the live verifier compare observed and published heads.
- Rebuild the real `atsokolas/note-taker-3` page after explicit approval.
- Rebuild one external OSS repo to prove the output is repo-shaped rather than Noeis-template-shaped.
- Identify/archive obsolete duplicate repo pages only through the owner path and explicit approval.

Acceptance:

- Real Noeis page is current to the tested head and clears the canonical contract.
- External repo has a materially different structure.
- Both pages preserve their last-known-good version under an injected failed rebuild.

## What not to do

- Do not loosen the current quality thresholds to make existing output pass.
- Do not add more prompt instructions before fixing publication and event fan-out.
- Do not use an in-memory lock as the only concurrency guard.
- Do not mutate or delete the user's real page during implementation; use QA seed accounts until the final approved rebuild.
- Do not create a separate repo product. Repo monitoring remains a source monitor attached to a maintained wiki page.

## Immediate next slice

Start with Push 1. It is the highest-leverage safety boundary and can be implemented without changing the frontend or the watcher schedule. Once a failing candidate can no longer replace trusted content, Push 2 can safely simplify the event topology without risking additional page corruption.
