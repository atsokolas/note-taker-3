# Judgment audit — Stage 2 truth companion

The Stage 2 consequence route now has a matching accounting surface: one
authenticated, read-only audit of source events touching held judgments.

## Contract

- `GET /api/judgment/audit` is owner-scoped and read-only.
- Only source events admitted by the Stage 2 consequence contract are counted.
- A claim-changing event is assessed only when its retained source-event
  revision exists.
- A preserved or rejected consequence is accounted for by its retained receipt;
  accepted or narrowed wording without its required revision is an error.
- Impact is deterministic: `supports`, `cuts_against`, or `neutral`; missing
  evidence remains `unassessed`.
- A missing assessment becomes overdue after 24 hours.
- Failed events, expired processing leases, and overdue assessments are reported
  as `attention`; silence is represented as `quiet`, never filled with prose.

## Why this is first

The next-morning claim-impact SLA cannot be trusted until Noeis can name every
event that entered the queue, whether it drained, and which retained revision
accounted for its effect on a held claim. This slice creates that read model
without changing the Morning Paper selector during the Taste gauntlet.

## Proof boundary

This is deterministic local code and does not repair production backlog, apply
the birth-date backfill, requeue embeddings, or mutate founder data. Those are
separate authorized operations after live audit review.
