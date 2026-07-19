# Noeis research and publication system — evidence checkpoint

**Captured:** 2026-07-19 America/Chicago
**Worktree:** `/Users/athantsokolas/.codex/worktrees/ad66/note-taker-3-1`
**Branch:** `codex/noeis-research-publication-system-2026-07-19`
**Original starting commit:** `2095a55accacf80970d052c74bd645492c66ab45`
**Integrated landed base:** `3de6adbfa0b755e983900d877abde6524d048c9a` (PR #47, Daily Loop and Judgment)
**Publication integration commit:** `fbbae0bf` before this evidence update

## Scope completed at this checkpoint

- Read the governing repository instructions, Noeis next-pass skill, Daily Loop spec, Judgment Institution spec, source conversation, and all three automation memories/configs.
- Verified the worktree was clean before edits and recorded the active Daily Loop ownership fence.
- Ran four bounded read-only investigations: ingestion/public path, automation continuity, privacy/approval boundaries, and independent Weekend Readings UX critique.
- Wrote the operating/implementation specification and operating runbook.
- Added an isolated backend Weekend Readings draft primitive and tests.
- Added a public page cache invalidation primitive and wired it to Wiki mutation, archive, and Weekend Readings publication paths.
- Added exact-revision review, approval, publication, public-serializer, hostile leak-fixture, workflow-orchestration, and operating-ledger contracts.
- Added a read-only responsive QA scaffold for 1440px Chrome, 1366px WebKit, and 430px WebKit.
- Rebased the owned commits cleanly onto the landed Daily/Judgment merge.
- Wired authenticated draft, status, review, approval, and publication routes; generic sharing cannot bypass them.
- Wired the existing Wiki reader to literal manual approval states and separate review/approve/publish actions.
- Wired the public Wiki route to the immutable approved snapshot, blocked generic adoption/collection leakage, and added the Athan/Noeis byline.
- Proved the synthetic public artifact at 1440px Chrome, 1366px WebKit, and 430px WebKit without creating any real Noeis artifact.
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
tests 32
pass 32
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
Backend Wiki QA/harnesses: pass
Maintenance/briefing Jest suites: 102 passed
Wiki frontend suites: 41 passed, 402 tests passed
Production frontend build: compiled successfully
```

The full gate was rerun after rebasing onto `3de6adbf`. Detached-worktree dependency symlinks were exact, temporary, removed after the run, and never staged.

## Release-critical contracts now closed locally

1. Generic sharing cannot expose a Weekend Readings draft; the route returns a conflict and requires the revision-bound controls.
2. Public output is reconstructed from a digested approved revision and remains unchanged when the private draft changes.
3. A new review/approval lifecycle correctly surfaces after an earlier edition revision remains public.
4. Page mutation, archive, and Weekend Readings publication invalidate public page cache keys.
5. The Weekend serializer is an allowlist and the hostile fixture proves private judgment-routing, claim, question, discussion, and agent-state fields are absent.
6. Dedicated draft creation preserves 8-15 source metadata records without relying on the generic eight-source page-creation cap.
7. Public rendering proves one H1, linked titles, Athan/Noeis identity, no generic adoption chrome, no overflow, and zero console errors at the required viewports.

## Browser evidence

`browser-qa/` contains screenshots, accessibility snapshots, readiness checks, contract results, and console-error reports for:

- Chrome at 1440x900;
- WebKit at 1366x860;
- WebKit at 430x932.

All three report `artifactMode: true`, one Weekend Readings H1, no horizontal scroll, at least one labeled direct source link, no private approval-state copy, and zero console errors. The fixture server is localhost-only, production-disabled, and serializes the hostile QA snapshot through the real approval contract.

## Ownership handoff

The Daily/Judgment task landed PR #47 at `3de6adbf`. This branch rebased onto that merge with no conflicts. Its shared-file changes are limited to Wiki route mounting/public selection/cache invalidation, authenticated Wiki API methods, the existing page reader's Weekend controls, and the public shared-page artifact mode. It does not modify the Judgment schema, serializer privacy contract, initial-revision retention, narrative causal model, or agent decision constraints.

## Honest completion statement

This checkpoint proves the inventory, operating contract, private-draft primitive, revision-bound manual publication lifecycle, fail-closed public serializer, private operating ledger, shared route/UI integration, full Wiki regression gate, production build, and responsive synthetic artifact. It does not claim a real-account draft, a real public edition, completed monthly/quarterly outcomes, or deployment until the branch lands. After deployment verification, the exact next user action is Athan's guided day-zero Thesis 001 session; substantive answers remain exclusively his.
