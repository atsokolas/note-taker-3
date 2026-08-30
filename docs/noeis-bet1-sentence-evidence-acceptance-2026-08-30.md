# Bet 1 — sentence evidence acceptance

This slice makes one held sentence the retrieval boundary in Judgment. The
deterministic and semantic implementation is merged and deployed. Human review
of real-account semantic ranking remains open below.

## Selection contract

- **Eligibility:** an owned, available Library article must contain a passage
  that answers terms in the exact current judgment sentence.
- **Quality bar:** a one-term sentence requires that term; a two- or three-term
  sentence requires two terms; a longer sentence requires at least two-thirds
  of its key terms in the exact visible passage. Empty passages, title-only or
  note-only matches, and evidence already filed on the judgment are suppressed.
- **Ordering:** eligible passages rank by sentence-term coverage before their
  retrieval score.
- **Silence fallback:** when no passage clears the quality bar, Judgment shows
  no evidence inbox. It does not pad the result with adjacent Library material.

## Proven locally

- An eligible passage names why it was selected against the held sentence.
- Exact saved Library passages arrive in the sentence evidence inbox. The person
  chooses Why or Against before filing; nothing writes before that acceptance.
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

## Production cleanup

PR #242 removed the two generic agent shortcut buttons beneath the case. They
duplicated the prefetched sentence evidence inbox, could time out, and could
return prose unrelated to the exact held sentence. The Skeptical Partner rail
remains the explicit conversational path. Authenticated production verification
confirmed the duplicate buttons are absent and the rail remains available.

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
receipt, Skeptical Partner rebinding, and zero-overflow mobile state now pass a
real routed browser, API, and disposable-Mongo round trip. The run filed an exact
owned Library highlight under Against, proposed and accepted a replacement held
sentence, reloaded, returned through the citation to the exact Library article,
and recovered the same sentence, receipt, decision, and provenance. The browser
used no API interception and made no language-model request. Evidence is under
`output/playwright/noeis-bet1-persisted-2026-08-30/`.

The accepted-write gesture now carries the Ariadne thread: after Accept returns
successfully, a one-shot warm-gold line travels from the reviewed replacement
sentence to the held sentence, settles into a quiet knot, and disappears. A
failed write draws nothing. Reduced motion removes the traveling line while
retaining the provenance knot and the durable receipt. Rendered local proof
covers 1440px, 1320px, and 430px with controlled API responses.

## Deterministic arbitrary-sentence gauntlet

- Eight hand-labelled domains now recover 16/16 exact support and counterpassages,
  reject every topic-only distractor, preserve exact provenance, and stay silent
  on an unrelated library. The harness makes zero model calls and is available
  as `npm run judgment:evidence-harness`.
- Passage selection now evaluates the exact quotation shown to the reader rather
  than scoring a whole document and clipping afterward. A note cannot qualify an
  unrelated highlight, a title cannot qualify unrelated body prose, and a weak
  highlight cannot hide a stronger complete passage in the article.
- This closes deterministic selection quality. It does not claim that lexical
  retrieval can infer whether a passage supports or challenges the sentence.
  Stance remains agent-assisted and human-decided, and no live-model evaluation
  was run.

## Semantic discovery contract

- **Eligibility:** the accepted held sentence has a current durable vector and
  an owned saved highlight clears a raw-cosine floor of 0.72. Article-level
  vectors are excluded because they cannot identify an exact quotation.
- **Quality bar:** semantic search discovers only the highlight identity. The
  UI receives the exact saved highlight text and provenance from Mongo; it
  receives no generated evidence and no inferred support/against stance.
- **Freshness:** the held-sentence content hash must match the stored vector.
  While a changed sentence is queued for indexing, semantic discovery stays
  silent rather than searching from the old belief.
- **Silence fallback:** a missing, sleeping, stale, or low-confidence vector
  path leaves deterministic lexical retrieval intact and adds nothing.

The offline semantic harness covers eight paraphrased domains, recovers the
eight labelled exact highlights, rejects all eight below-floor distractors,
and makes zero embedding or generative-model calls. Run it with
`npm run judgment:semantic-evidence-harness`.

## Remaining semantic proof

- The implementation contract is locally proven. Calling a result the
  *strongest available* still requires a human review against the real account
  after existing held sentences are backfilled and their background jobs have
  settled. A bounded live-model judge remains intentionally deferred.
