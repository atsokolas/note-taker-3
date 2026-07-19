# Noeis Weekend Readings operator intake verification

Date: 2026-07-19 America/Chicago
Base: `origin/main` at `ece79e4cc8d35b5157a23b0ae98d17d17bfc7693`

## Scope

- Read-only fixed-path collector for the proposed OpenClaw Afternoon Research JSON handoff and existing Sunday/Friday automation memories.
- Human-only, non-mutating Noeis intake preview.
- Canonical URL dedupe across producers and digest-valid prior published editions.
- Private intake provenance retained into selected draft sources and excluded from public serialization.
- No automatic thesis mutation, draft creation, approval, publication, email, or distribution.

## Local source truth

Command:

```bash
node scripts/preview_weekend_readings_intake.js --window-start 2026-07-06 --window-end 2026-07-19
```

Observed:

- 49 URL-bearing private candidates recovered: 25 Sunday Reading Sweep and 24 Friday Research Curation.
- Friday Research Papers memory reported an honest warning because it does not preserve per-item URLs.
- The proposed `state/noeis-intake/afternoon-research` JSON directory was not yet present, so zero OpenClaw JSON candidates were claimed.

## Verification

Focused command:

```bash
node --test server/services/weekendReadingsIntakeService.test.js server/services/weekendReadingsService.test.js server/services/weekendReadingsApprovalService.test.js server/routes/weekendReadingsRoutes.test.js
```

Result: 36/36 passed after the first corrective pass; subsequent independent P0/P1 audit corrections were covered in the full gate.

Full command:

```bash
npm run wiki:qa
```

Result:

- Weekend Readings, intake, workflow, and operating-ledger Node suite: 51/51 passed.
- Backend Jest suites: 102/102 passed.
- Proposal harness: 3/3 passed.
- Intelligence harness: 20/20 passed.
- Maintenance harness: 5/5 passed.
- Wiki frontend: 41 suites, 402 tests passed.
- Production frontend build compiled successfully.

Independent corrective review: CLEAR, no remaining P0/P1 findings.

## Mutation boundary

No real Noeis page, draft, revision, receipt, thesis connection, approval, publication, email, or distribution action was created during this verification.
