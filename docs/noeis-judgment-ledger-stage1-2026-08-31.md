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
- Birth-date backfill is dry-run by default.
- `npm run judgment:ledger-acceptance` verifies that the birth clock, criteria,
  retained revisions, receipts, evidence-bound verdict, and Mirror count agree.
  Pass `--input=<snapshot.json>` to audit a captured journey.

Rendered artifacts live in
`output/playwright/judgment-stage1-2026-08-31/`.

## Production acceptance

Stage 1 closed on August 31, 2026 after the authorized release and a real
owner-held Industrial Electrification claim traveled through the complete
production loop:

- the owner set an exact resolution criterion;
- the verdict selected three named, persisted sources (DOE, NREL, and Sandvik);
- the owner recorded `unresolvable` with an explicit evidence-gap observation;
- the live Mirror rendered the verdict and exact observation;
- direct persistence verification matched both mutations to the held-sentence
  hash, retained Wiki revisions, completed Noeis receipts, and the same page
  and owner identities.

The legacy Judgment birth-date migration ran separately after a dry-run. Eight
account-held judgments received dates from retained history (three from
`startedAt`, five from their first retained revision); the verification dry-run
then returned zero remaining rows.

Release chain: PR #254 (ledger and Mirror), PR #255 (evidence-bound verdicts),
PR #257 (durable evidence names), and PR #258 (stable first-paint source
identity). Local, merged, deployed, rendered-production, and persisted-production
proof are recorded as separate gates; no live model evaluation was used.
