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
- Filing the passage as support persists the exact article and passage identity.
- Reload restores the filed line and its provenance link.
- The citation returns to the exact Library article.
- The sentence, explanation, and filing actions render without clipping at
  1440px, 1320px, and 430px widths.
- Reduced-motion behavior retains every action without the handoff animation.

## Not yet Bet 1 complete

- Counterevidence needs the same exact-sentence selection contract.
- Preserve, reject, and defer need receipt-bound end-to-end disposition proof.
- The acceptance gesture still needs the brief Ariadne provenance line.
- The full exit gauntlet must begin from arbitrary sentences, inspect both
  evidence directions, accept one change, reload, and recover the same result.
