# Bet 1 — sentence evidence acceptance

This work makes one held sentence the retrieval boundary in Judgment. The
deterministic sentence loop and exact-source compatibility path are deployed.
The passage-index extension below has its own proof boundary; real-account
passage coverage remains open until a bounded backfill is explicitly run.

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
  either an owned saved highlight clears the highlight floor or an owned saved
  article passage is the clear leading source above its passage floor. The old
  article-summary row remains a compatibility fallback while passage coverage
  is rolled out.
- **Quality bar:** semantic search discovers identities; it does not author
  evidence. Highlights rehydrate the exact saved highlight. Passage rows
  rehydrate the current owned article, regenerate the exact passage, and must
  match both the full-source hash and passage hash. Passage results also need a
  0.03 lead over the next distinct article. The UI receives exact source words
  and provenance, with no generated evidence or inferred Why/Against stance.
- **Freshness:** the held-sentence content hash must match the stored vector.
  A changed article invalidates its passage rows until re-indexing finishes.
  While either side is stale, semantic discovery stays silent rather than
  searching from an old belief or quoting old source text.
- **Silence fallback:** a missing, sleeping, stale, or low-confidence vector
  path leaves deterministic lexical retrieval intact and adds nothing.

The offline semantic harness covers eight paraphrased domains, recovers eight
labelled exact highlights plus eight exact article passages, rejects all 16
topic-only distractors, preserves human disposition, and makes zero embedding
or generative-model calls. Run it with
`npm run judgment:semantic-evidence-harness`.

Passage indexing is additive and storage-bounded: each long article receives at
most ten overlapping passages, source text is not duplicated in Atlas, and a
shrinking article removes stale passage identities only inside the exact owner,
article, and object-type fence. Existing backfill defaults do not include
passages; `--types article-passages` is an explicit opt-in.

Live saves and manual backfill share one summary/passage builder and one source
revision identity. Article deletion removes its durable jobs, Atlas summary,
passages, and embedded highlights; an in-flight worker must fail its pre-write
fence or erase its own late write.

## Remaining semantic proof

- The implementation contract is locally proven without model calls. Existing
  articles do not gain passage coverage until the opt-in backfill is dry-run,
  bounded, and explicitly authorized for the target account.
- Calling a result the *strongest available* still requires human review after
  passage jobs settle. A live-model judge remains intentionally deferred.
