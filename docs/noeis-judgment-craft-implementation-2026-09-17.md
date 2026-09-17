# Judgment craft implementation checkpoint

This checkpoint records the completed Judgment refinement and the evidence needed to continue it without reinterpreting the product contract.

## Shipped behavior in this branch

- The Casebook is one quiet, searchable collection. Opening a case preserves its stable place in the collection.
- A pending research observation opens beside the exact held view and criterion retained at acceptance. A newer criterion is shown separately.
- Response, action, and test verdict remain separate. Autosave writes only a private draft; Preview is inert; Record is the explicit boundary.
- A private return question restores the saved choices, words, valid field, and caret without resolving the observation.
- Decision replay reads the selected decision's historical basis and separates later material.
- Lessons move only through explicit transfer to a chosen case and remain context rather than evidence.
- Specialist tools use one URL-addressable context area. Deep links and browser Back work, Escape closes one level, and phone backgrounds become inert.
- Source lineage stores source-event identities rather than copied source bodies. Unknown lineage stays unknown. An agent may propose a family only from owner-scoped source events; only the human owner may accept or reject it with optimistic versioning. Accepted families expose each retained account and its explicit dates without changing the case.

## Main contracts

`JudgmentResponseDraft` remains private and is absent from public projections and decision exports. `JudgmentObservationLineage` stores only family state and references to `WikiSourceEvent`; the source event remains the canonical text and permission boundary. A proposed lineage is excluded from established document counts until the human owner accepts it.

Context routes use these query parameters:

- `context=judgment-observation&observation=...&contextView=response|lineage|account&sourceEvent=...`
- `context=judgment-tool&contextTool=lineage|stress|watch|public|portable`

The URL is durable for history and deep links. A small local mirror makes the transition immediate and restores focus even under the repository's virtualized router test harness.

## Verification on 2026-09-17

- Focused frontend: 6 suites, 109 tests passed before the final failure-state additions; the final focused run is recorded in the delivery report.
- Focused backend Node contracts: observation lineage, response thread, and routes passed.
- Jest backend contracts: 6 suites, 37 tests passed for ledger, mirror, public projection, and case lineage.
- Production frontend build compiled successfully.
- Rendered Chromium QA passed at 1440, 1024, 768, and 390 CSS pixels with no horizontal overflow.
- A direct tablet deep link opened exactly one context; browser Back returned to the case.
- At 390px, the active context was fixed, the body was scroll-locked, surrounding branches were inert/hidden, and Escape restored focus to its originating control.
- Missing source accounts and partial lineage are covered by owner-scoped service tests. Slow response loading and source failure remain visible without enabling an unresolved response or changing the case.

The broad frontend command also discovers two unrelated existing copy-policy failures in `EditionInbox.jsx`. That file is unchanged by this branch. Some backend tests use Jest and some use `node:test`; running every file through one runner produces false harness failures, so each group was rerun with its native runner.

## Acceptance still requiring real hardware or external state

Physical iPad behavior and VoiceOver or another real assistive-technology pass are unverified. The in-app browser did not expose text-zoom controls or a WebKit engine for the final context consolidation, so those two final rendered passes are also unverified here. The earlier Judgment slice had a 390px WebKit pass before this consolidation.

No production data migration is required. Mongoose creates the lineage collection and indexes when the release reaches the normal application startup. Existing observations return `unknown` lineage until an explicit proposal is accepted. No deployment has been performed; the governing specification requires approval before deployment.
