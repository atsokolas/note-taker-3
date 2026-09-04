# Storage growth repair — 2026-09-04

## Observed, not inferred

Following the backed-up cleanup recorded in the storage recovery reports, three
new source-event revisions for repo page `6a4aa6d7f49a75d10668c08e` consumed
16,144,205 BSON bytes. The latest inspected revision had identical before/after
plainText (14,268 JSON bytes), but about 2.5 MB of claims on each side. The live
page had 65 claims; their history alone occupied 2,461,596 JSON bytes. These are
different measures (BSON and JSON), not additive storage estimates.

## This bounded repair

Maintenance recreated citation subdocuments without their existing IDs. Mongoose
then assigned fresh identities, and the claim ledger treated unchanged evidence
as a change. `wikiMaintenanceCitations.js` replaces three duplicated builders.
It reuses a citation ID and its creation time only when the source reference,
source type/object, title, quote, URL and confidence all match exactly. Changed
evidence retains the existing new-identity behavior. No historical records,
claim identities, receipts, source references or publication gates are removed.

This does not solve every source of growth. Unstable source-reference identities
can still cause churn, and a legitimate source-event revision still stores full
before/after snapshots, including accumulated history. Do not suppress revisions
at the common create helper: callers depend on their IDs for acceptance receipts.

## Verification and release boundary

- Citation identity and existing maintenance claim suites: 117/117 passed.
- Thirty identical ledger rebuilds: one original history event, stable citation.
- Changed evidence fields and source reorder identity tests passed.
- Retention and publication service tests passed; diff check clean.
- No model calls. No production writes in this repair pass.
- Citation repair merged in PR #306 (`5b590402`) and confirmed deployed via
  `/api/version`. Repeated live maintenance stability remains a separate gate.

## Next actions

1. Prove a real repeated maintenance cycle keeps IDs stable after deployment.
2. Lossless archive readers landed in PR #307, with narrow-projection optimization
   in PR #308 (`6ef09f3a`), confirmed live. Apply backed-up archival only after
   quota headroom permits shrinking updates; verify decoded content and hashes.
3. Wire a durable backup destination into the existing storage governor before
   enabling mutation. Its apply flag alone is insufficient.

Storage recovery remains incomplete. Existing protected history must not be
discarded merely to make the database fit its quota.
