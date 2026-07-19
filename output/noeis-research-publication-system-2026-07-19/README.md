# Noeis research and publication system — evidence checkpoint

**Captured:** 2026-07-19 America/Chicago
**Worktree:** `/Users/athantsokolas/.codex/worktrees/ad66/note-taker-3-1`
**Branch:** `codex/noeis-research-publication-system-2026-07-19`
**Original starting commit:** `2095a55accacf80970d052c74bd645492c66ab45`
**Integrated Daily Loop base:** `d10b824b` (`Ship the Noeis Daily Loop`)

## Scope completed at this checkpoint

- Read the governing repository instructions, Noeis next-pass skill, Daily Loop spec, Judgment Institution spec, source conversation, and all three automation memories/configs.
- Verified the worktree was clean before edits and recorded the active Daily Loop ownership fence.
- Ran four bounded read-only investigations: ingestion/public path, automation continuity, privacy/approval boundaries, and independent Weekend Readings UX critique.
- Wrote the operating/implementation specification and operating runbook.
- Added an isolated backend Weekend Readings draft primitive and tests.
- Added a public comparison cache invalidation primitive and tests; route wiring remains ownership-gated.
- Added exact-revision review, approval, publication, public-serializer, hostile leak-fixture, workflow-orchestration, and operating-ledger contracts.
- Added a read-only responsive QA scaffold for 1440px Chrome, 1366px WebKit, and 430px WebKit.
- Rebased the owned commits onto the Daily Loop task's declared stable integration point.
- Did not modify production data, send email, create a real-account draft, or publish.

## Live availability preflight

On 2026-07-19:

```text
https://www.noeis.io/                         HTTP 200
https://www.noeis.io/wiki                     HTTP 200
https://www.noeis.io/proof                    HTTP 200
https://note-taker-3-unrg.onrender.com/health HTTP 200
{"status":"ok","message":"Server is warm."}
```

Availability does not establish authenticated Weekend Readings or Thesis 001 acceptance.

## Focused test evidence

Command:

```bash
node --test server/services/weekendReadingsService.test.js
```

Result:

```text
tests 8
pass 8
fail 0
```

Covered:

- HTTPS URL enforcement and explicit HTTP override;
- tracking/fragment removal and deterministic query ordering;
- visible duplicate-URL rejection;
- rationale, classification, and source-quality validation;
- context boundary requirement;
- required editorial note and explicit unassigned/date empty states;
- linked-title TipTap structure without a repeated body-level page title;
- private/draft/log WikiPage construction;
- public-safe relationship copy separated from private affected-question metadata;
- source metadata persistence shape;
- revision and receipt creation;
- deterministic edition-level idempotency.

Regression commands:

```bash
node --test server/services/wikiRevisionService.test.js server/services/wikiGraphConnectionService.test.js
node -c server/services/weekendReadingsService.js
node -c server/services/weekendReadingsService.test.js
git diff --check
```

Result:

```text
wikiRevisionService: pass
wikiGraphConnectionService: pass
syntax checks: pass
diff check: pass
```

Publication/operator contract command:

```bash
node --test \
  server/services/weekendReadingsService.test.js \
  server/services/weekendReadingsApprovalService.test.js \
  server/services/weekendReadingsWorkflowService.test.js \
  server/services/researchOperatingLedgerService.test.js
```

Result:

```text
tests 27
pass 27
fail 0
```

These tests cover owner-scoped edition dedupe, exact-revision approval, literal confirmation gates, stale-draft refusal, digest validation, immutable public snapshots, hostile private-field leak checks, pruned-revision refusal, lifecycle receipt orchestration, private monthly ledgers, and ledger-entry idempotency.

Broader Wiki verification:

```bash
npm run wiki:qa
CI=1 npm test -- --watchAll=false --runInBand src/components/wiki
npm run build
```

Result:

```text
Backend Wiki QA/harnesses: pass through the frontend segment
Maintenance/briefing Jest suites: 102 passed
Wiki frontend suites: 39 passed, 392 tests passed
Production frontend build: compiled successfully
```

The first `wiki:qa` attempt reached the frontend segment and stopped because this detached worktree has no local `note-taker-ui/node_modules`. The frontend tests and build were then run against the canonical checkout's installed dependency tree through an exact temporary symlink. The symlink was removed automatically and the worktree remained clean.

## Release-critical findings still open

1. Current URL ingest mutates matched pages before the later accept/defer/reject review.
2. Generic Share can expose a draft and does not bind public output to an approved revision. The isolated approval-bound serializer is complete but not yet selected by the shared route.
3. Later edits to a shared page can change the public artifact without reapproval. The isolated workflow now binds output to a digested approved revision and blocks stale publication, but route wiring remains.
4. Unshare/archive can leave a cached public payload reachable until cache expiry. An invalidation primitive now exists, but mutation routes are not yet wired to it.
5. Public maintenance proof can derive visible summary text from private AI state.
6. The normal source API drops provider/classification metadata and caps initial sources at eight.
7. The public renderer does not yet prove linked item titles, artifact-specific hierarchy, approval-state UX, or responsive/accessibility acceptance.

## Ownership gate

The active Daily/Judgment task `019f7b94-690d-72e0-9c08-4b1bd0810220` supplied `d10b824b` as the Daily Loop integration point, and this branch is rebased onto it. Athan has since approved the narrative-first causal model, and that task is actively editing the shared Wiki model, main routes, revision services, and reader for Judgment WP-1 through WP-6. Route/model/public-reader integration remains fenced until that owner supplies its next stable commit.

## Honest completion statement

This checkpoint proves the inventory, operating contract, private-draft primitive, revision-bound manual publication lifecycle, fail-closed public serializer, private operating ledger, regression safety, and frontend buildability on the Daily Loop base. It does not yet prove shared-route enforcement, artifact UI, responsive rendering of the integrated artifact, live Noeis draft creation, deployment, or Thesis 001 day-zero readiness.
