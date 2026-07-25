# Noeis company dossier — five-user activation test

**Purpose:** test whether the maintained investment dossier creates a repeatable decision loop for real investors. This is not a synthetic QA quota.

## Participant contract

- Five distinct human users.
- Each user chooses a company they genuinely follow.
- Noeis never supplies the starting judgment, confidence, hurdle, or horizon.
- Free public sources only.
- QA/demo accounts do not count.

## Activation funnel

A participant counts as activated only after all four durable events exist:

1. `company_dossier_created` receipt with ticker, CIK, owner hurdle, horizon, attached filings, and initial revision.
2. `company_dossier_first_head_accepted` receipt created by the human-only acceptance route.
3. `investment_valuation_refreshed` receipt with a dated market source and source-backed operating base.
4. A later `company_dossier_maintenance_accepted` receipt after a filing or manual rerun produced an exact candidate the owner reviewed.

The existing `wiki_page_created` and `wiki_draft_generated` analytics events provide aggregate funnel visibility. Receipts are the canonical product-value proof because they bind the page, revisions, sources, and owner decisions.

## Moderator script

1. Ask the participant to create a dossier from `/wiki` without coaching beyond the visible UI.
2. Record whether ticker resolution and SEC bootstrap complete.
3. Ask the participant to read the full candidate and accept or reject it honestly.
4. Ask them to enter a dated public price observation and explain every operating-base input.
5. Ask: “What performance does this price require, and what fact would most change your judgment?”
6. Trigger a later maintenance candidate only when new evidence exists. Ask the participant to explain the change before accepting or rejecting it.

## Pass criteria

- 5/5 create without manual scripting or duplicate pages.
- 5/5 recognize their own starting judgment verbatim.
- At least 4/5 correctly explain one implied-growth scenario without a spreadsheet.
- 5/5 can identify what changed, why it matters, and whether their judgment changed.
- 0 candidates replace a trusted head without explicit human acceptance.
- 0 private judgment or unpublished-candidate fields appear on public pages.
- At least 3/5 voluntarily return for the second evidence or price clock.

## Failure recording

For each participant, record:

- page id and ticker;
- completion or abandonment at each receipt;
- time to first trusted head;
- valuation-input confusion;
- candidate acceptance or rejection reason;
- whether the maintenance explanation taught them anything new;
- exact UI or research-quality failure.

Do not average away failures. One silent overwrite, duplicate active dossier, invented owner judgment, or public-data leak fails the pass.
