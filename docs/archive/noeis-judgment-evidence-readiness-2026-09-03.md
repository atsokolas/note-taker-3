# Judgment evidence readiness

## Finding

The claim-only Library endpoint returns 409 when `judgment.currentJudgment` is
empty. Judgment previously requested it before loading the page and displayed
the governing question (or title) in the editable held-view field. Thus an
unwritten view could look like a held claim and surface a false Library outage.
This is a reproduced code contract defect; the exact historical production
response for Costco was not captured and must not be asserted as proven.

## Repair

- Wait for the exact page and a nonempty explicit held view before retrieval.
- Keep the governing question separate from the editable view; explain the
  next action without converting it into an accepted belief.
- Re-fetch on saved-view changes and remove the duplicate manual refresh.
- Preserve genuine failure/retry behavior and accepted-research review controls.
- Do not copy dossier sources into judgment evidence automatically. A zero
  bound-source count alone is not data-loss evidence.

## Proof and remaining gate

91 Judgment tests pass, including no-view/no-write regression and existing
accepted research keep/revise, claim disposition, reload, and retrieval tests.
Optimized build passed before the final removal of duplicate refresh calls;
the full 91-test suite passed again after cleanup. Diff check is clean.

The final optimized build also passed. In-app browser behavior proof used the
actual Judgment component with deterministic API fixtures: question-only state
made zero evidence reads and left the held-view field empty; accepted-view state
made one read and displayed the honest empty-result state. No console errors.
This was component behavior proof, not full-shell visual or persisted proof.

No model calls or account mutations. Release and production verification remain.
Next: rendered empty-view and accepted-view journeys, then release and replay
the same Costco identity. Confirm its first-head adoption and accepted-review
state before asking the owner to approve anything. Bet 3 remains open until a
real source/review/decision/return loop passes; Bet 4 remains downstream.
