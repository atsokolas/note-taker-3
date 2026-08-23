# Milestone 5 — Background-loop Inventory and Events

Status: locally implemented, tested, built, and rendered
Plan: `docs/noeis-persistent-knowledge-shell-registry-spec-2026-08-20.md`
Candidate branch: `codex/noeis-persistent-knowledge-shell-2026-08-20`
Base: `3652d2e5da022198bd4630fff4eb5809ef497796`

## Outcome

Morning Paper, Wiki maintenance, weekly AI synthesis, and outcome review now have stable identities and one authenticated status envelope. The envelope is reconstructed from existing durable stores; it does not add a second scheduler, database, or client-owned version of truth.

Settings renders the same loop identities and statuses that the persistent shell uses. `SystemStatusContext` receives real running work, recoverable loop failures, and the newest bound durable receipt without replacing a newer receipt or failure produced by the user's current action.

## Durable contract

| Loop | Stable identity | Durable inputs |
| --- | --- | --- |
| Morning Paper | `loop.morning-paper` | `WikiBriefingCache`, `MorningPaperDelivery`, and a stored Morning Paper receipt |
| Wiki maintenance | `loop.wiki-maintenance` | `WikiMaintenanceRun` and its exact `maintenanceRunId`-bound receipt |
| Weekly synthesis | `loop.weekly-ai` | the latest This Week in AI `WikiPage` and its exact page-bound edition receipt |
| Outcome review | `loop.outcome-review` | persisted Wiki decisions/outcomes and the latest outcome receipt |

The authenticated `GET /api/system/loops` response reports a generated timestamp and, for every loop, its identity, current status, plain-language reason, updated time, recovery destination, metrics, and optional durable receipt. Missing or malformed state fails closed instead of being inferred as success.

## Events and recovery

- The provider performs one initial status read and shares an in-flight request plus a short cache across consumers and remounts.
- Successful weekly-edition, maintenance, decision, and outcome mutations emit one explicit in-app loop-change event, which forces a fresh durable read.
- Focus, reconnect, and visibility recovery use the cache and only run while visible.
- There is no loop `setInterval` and no hidden-tab loop polling.
- The existing asynchronous Wiki build keeps its bounded terminal-status probe and emits a loop event when the durable build status settles.
- A status-read failure becomes a visible retryable error; it never leaves a misleading `checking` placeholder.

This is intentionally not a new server-sent-event transport. The milestone uses mutation events for work initiated in the current app and bounded foreground recovery for changes initiated elsewhere.

## Cleanup included

- Removed the registry's hard-coded loop `inspect` placeholder and replaced it with live durable state.
- Made the loop definitions the single frontend identity/name/description authority used by both the provider and registry.
- Reused existing receipt serialization and stores instead of adding parallel loop documents.
- Bound maintenance and weekly receipts to the exact run/page identity so an unrelated receipt cannot make a loop look complete.
- Prevented background-loop projection from clearing status entries it does not own.
- Prevented an older background receipt from replacing a newer user-action receipt.
- Kept all existing authentication, ownership, approval, scheduler, and durable write paths intact.

## Verification

- Backend loop-service, route, receipt, movement, daily-loop, and decision tests passed.
- Focused loop/status frontend regression tests passed.
- The cumulative persistent-shell frontend matrix passed.
- Every constituent of the complete Wiki QA gate passed. Its first frontend run exposed two trace-typing timing failures (516/518 passed); the shared trace default was shortened, then the full Wiki-plus-trace matrix passed 55 suites / 522 tests and the production frontend build passed.
- `git diff --check` passed.
- Authenticated local browser acceptance passed at 1440px, 1320px, and 430px.
- Settings rendered all four stable identities from the durable loop envelope.
- With the page left open, no additional `/api/system/loops` request appeared after eight seconds.
- Mobile width was 430px with 430px document width; horizontal overflow was false.
- Browser console errors were zero after the acceptance log was cleared before the no-poll observation.

Evidence: `output/playwright/noeis-background-loops-milestone-5-2026-08-22/`.

## Proof boundary

This is cumulative local code, automated verification, a production build, and authenticated rendered browser evidence against a seeded local QA account. It is not an independent review, a commit, a merge, deployment, or production proof.

## Next plan slice

Milestone 6: consolidate the persistent shell's typography, spacing, surfaces, controls, and motion into semantic theme roles; preserve room-specific article and dossier presentation; apply theme changes atomically; and prove reduced-motion behavior across the required room journey.

Milestone 7 remains the final deletion pass. It removes superseded navigation, route, connector, capability, loop, and theme authority only after cumulative parity and browser acceptance are green.
