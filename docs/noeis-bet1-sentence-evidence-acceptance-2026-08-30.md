# Bet 1 — sentence evidence acceptance

This slice makes one held sentence the retrieval boundary in Judgment. It is
local implementation proof, not merge, deployment, or production proof.

## Selection contract

- **Eligibility:** an owned, available Library article must contain a passage
  that answers terms in the exact current judgment sentence.
- **Quality bar:** a one-term sentence requires that term; a two- or three-term
  sentence requires two terms; a longer sentence requires at least two terms
  and 40% term coverage. Empty passages and evidence already filed on the
  judgment are suppressed.
- **Ordering:** eligible passages rank by sentence-term coverage before their
  retrieval score.
- **Silence fallback:** when no passage clears the quality bar, Judgment shows
  no evidence inbox. It does not pad the result with adjacent Library material.

## Proven locally

- An eligible passage names why it was selected against the held sentence.
- The case offers symmetric doors for the strongest saved support and the
  strongest saved counterpassage. Both run through the durable contextual agent;
  neither writes until the person accepts the quoted Library passage.
- Filing the passage as support persists the exact article and passage identity.
- Reload restores the filed line and its provenance link.
- The citation returns to the exact Library article.
- The sentence, explanation, and filing actions render without clipping at
  1440px, 1320px, and 430px widths.
- Reduced-motion behavior retains every action without the handoff animation.
- The durable cross-room agent may explain its answer freely, but Judgment only
  offers an exact saved article excerpt as an actionable evidence proposal.
- Accepting that proposal stores `article:<id>` rather than the ephemeral agent
  reply id, so the filed line can return to its Library source.
- A reply without a saved article excerpt remains conversation only. It cannot
  create a Judgment write action.
- Wiki keeps the same durable thread, exact page identity, and no-write surface
  behavior; this slice does not change ordinary Wiki generation or reading.

## Human change-disposition contract

- **Eligibility:** an owned Judgment page must already hold a non-empty sentence,
  and the proposed replacement must be non-empty and different.
- **Quality bar:** the receipt binds the page id and exact normalized before and
  after sentences. Stale, corrupt, cross-page, and conflicting replays fail
  closed. An agent token may retrieve and converse, but may not propose or
  resolve a change to accepted knowledge.
- **Disposition:** Accept changes the held sentence and records the human change;
  Preserve, Reject, and Defer leave accepted knowledge untouched. Identical
  replay is idempotent.
- **Silence fallback:** with no eligible pending or settled receipt, no change
  review renders. The interface never invents a comparison or default action.

The four actions, exact before/after correction, accepted sentence, settled
receipt, Skeptical Partner rebinding, and zero-overflow mobile state are rendered
locally. Service and routed tests cover receipt persistence behavior. A real
browser write could not be completed because the configured Atlas free-tier
cluster is at its 512 MB storage quota and rejects writes; no data was deleted
and no upgrade was attempted.

The accepted-write gesture now carries the Ariadne thread: after Accept returns
successfully, a one-shot warm-gold line travels from the reviewed replacement
sentence to the held sentence, settles into a quiet knot, and disappears. A
failed write draws nothing. Reduced motion removes the traveling line while
retaining the provenance knot and the durable receipt. Rendered local proof
covers 1440px, 1320px, and 430px with controlled API responses.

## Not yet Bet 1 complete

- Counterevidence is source-bound and fail-closed locally. Its semantic claim to
  be the *strongest* passage still needs the final arbitrary-sentence gauntlet;
  no live-model quality evaluation was run in this slice.
- The full exit gauntlet must begin from arbitrary sentences, verify the
  semantic quality of both evidence directions, accept one change, reload, and
  recover the same result. The two directional doors are implemented locally;
  semantic quality remains unclaimed without a model evaluation or human read.
- The persisted browser round trip must be rerun after storage is restored or a
  disposable Mongo is supplied.
