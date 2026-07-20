# Noeis research-ledger operator verification

**Date:** 2026-07-20
**Base:** `origin/main` at `c08f33c17fe58a8c470948ec6e93c2ebe41eeccf`
**Branch:** `codex/noeis-research-ledger-operator-2026-07-19`

## Scope

- Added authenticated, human-only `POST /api/wiki/research-ledger/entries`.
- Resolve the maintained living thesis and evidence pages from owner-scoped canonical WikiPages.
- Derive thesis identity and recording time server-side.
- Delegate persistence to the existing transaction-safe monthly ledger service.
- Preserve the boundary that a ledger entry cannot change thesis body, judgment, claims, confidence, visibility, or publication state.
- Treat research-ledger WikiPages as permanently private across direct and indirect agent writes, corpus-wide maintenance, model validation, public queries, serialization, collections, and adoption.
- Bind idempotency keys to semantic content: exact retries return the stored entry and conflicting retries fail with `409`.
- Correct the operating runbook so its phase/status/output vocabulary matches the implemented contract.

## Focused verification

Command:

```bash
node --test server/routes/researchOperatingLedgerRoutes.test.js server/services/researchOperatingLedgerService.test.js
```

Result: **20/20 focused route/service tests passed**, plus protected model, Daily Loop guard, public-route privacy, generic/indirect mutation, scheduled maintenance, and watcher suites.

The suite covers human persistence, agent-token rejection before lookup, canonical thesis-title derivation, server-owned timestamps, byte-identical thesis state, non-thesis rejection, cross-owner and archived evidence rejection, malformed IDs and collections, disposition vocabulary, evidence dedupe, transactional rollback, exact/conflicting idempotency, concurrency, permanent-private model validation, public `404`, and zero-write corpus exclusions.

## Full verification

Command:

```bash
npm run wiki:qa
```

Result: **passed**.

- Backend Weekend Readings and ledger Node test group: 61/61.
- Wiki maintenance/briefing Jest group: 102/102.
- Wiki frontend suites: 41/41, 407/407 tests.
- Wiki proposal, intelligence, and maintenance harnesses passed.
- Production frontend build compiled successfully.
- The pre-rebase privacy/approval review returned **CLEAR** after three adversarial passes.
- The 2026-07-20 rebase audit found and reproduced one P2 title-collision path where a published Weekend Readings page could occupy a curated public-proof slot. The registry now excludes both protected artifact prefixes in its database predicate and post-hydration filter, with a hostile shared/published Weekend fixture proving no sentinel output.
- The post-fix independent re-audit returned **CLEAR**, with no remaining P0/P1/P2 findings. The complete `wiki:qa` gate was rerun after the fix and passed.

## Mutation and deployment truth

- No real account, WikiPage, ledger, claim, draft, approval, publication, email, or distribution was created or changed during verification.
- This artifact proves local contract and regression gates only. The endpoint is not live until the branch is reviewed, merged, and Render deploys the resulting `main` commit.
- The first real ledger write remains blocked on Athan's guided Thesis 001 day-zero session and immutable initial snapshot.
