# Bet 3 — weekend receipt continuity

## Production observation

On September 3, authenticated production `/week` rendered Not Found. Commit
`29e8b283` intentionally consolidated that page into Wiki's `WeeklyDigest`.
However, the replacement did not request or render the server-selected
`consequentialReturn`. This dropped the receipt-bound return from PR #282.
The production account's Wiki loaded successfully; no account content was changed.

## Repair

In an isolated branch based on `edaec7c8`, the existing weekend section requests
the seven-day briefing and renders its accepted consequence using existing
weekend styling. No new page, selector, model invocation, or backend mutation.
The obsolete movement-failure state is removed. Receipt and movement requests
fail independently: a quiet/failed movement feed cannot hide an accepted return.
The generic quiet sentence is suppressed when a consequence exists.

Eligibility and quality remain server-owned: completed owner-bound maintenance
or Judgment receipts, with exact page identity and a meaningful summary. No
eligible receipt and no movement means no section. A request failure never
creates a consequence.

## Acceptance and remaining work

- Focused WeeklyDigest and weekly model tests: 20/20 passed.
- Added coverage for quiet/failed movement feeds with a real-shaped receipt,
  exact decision destination, no contradictory silence copy, and failed lookup.
- Production account writes and live model evaluations: none.
- Wiki front-page regression suites: 42/42 passed (existing unmocked request
  errors remain test-harness noise). Optimized production build passed.
- Actual WeeklyDigest rendered in the in-app browser with isolated deterministic
  API fixtures: accepted receipt survives a quiet feed; decision link retains
  exact page identity; no contradictory quiet sentence. This is component
  browser proof, not an authenticated production receipt.
- This repair is ready for release, not yet production-proven.
- Next: rendered repair acceptance, release, then source arrival → human review
  → receipt-bound knowledge change → Judgment decision → Wiki weekend return.
- Bet 3 production exit remains open. Bet 4's Costco/Parenting partner sessions
  remain downstream; ordinary Wiki and agent architecture are untouched.

The old `/week` acceptance URL is superseded by the integrated Wiki weekend
section. Do not restore the separate page merely to satisfy an old test script.
