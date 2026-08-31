# Judgment Ledger — Stage 1

Stage 1 gives a held sentence a clock, a test, and an honest outcome without
turning Judgment into a scorecard.

## Product contract

- `bornAt` is the first known moment the exact held sentence entered Judgment.
- The owner may optionally write what would change their mind and choose a date.
- Only the human owner may record `held up`, `broke`, `partly`, or
  `unresolvable`.
- Every criteria change and verdict is append-only and bound to the exact page,
  held-sentence hash, retained revision, receipt, and request id.
- Replays are idempotent only when all three persisted records still agree.
- Generic Wiki edits preserve these records but cannot manufacture or rewrite
  them.
- The Mirror is descriptive, not evaluative: it shows hold age, revision rate,
  verdict history, and due tests. A metric stays blank when its evidence clock
  is not exact.

## Local proof

- Focused service, route, Mirror, backfill, and UI tests pass.
- `npm run wiki:qa` passes ordinary Wiki, generalized Wiki, repo/dossier,
  Judgment evidence, and the production frontend build.
- Rendered QA passes at 1440px, 1320px, and a fresh-loaded 430px viewport.
- The mocked browser journey records a `partly` verdict and renders the Mirror.
- Birth-date backfill is dry-run by default. No user data was changed.

Rendered artifacts live in
`output/playwright/judgment-stage1-2026-08-31/`.

## Formal acceptance still required

Local and mocked-browser proof does not establish production truth. Stage 1
closes only after an authorized release and one real owner-held claim travels
through criteria, evidence, verdict, and the live Mirror with its persisted
revision and receipt verified. Applying the legacy birth-date backfill is a
separate, explicit data operation.
