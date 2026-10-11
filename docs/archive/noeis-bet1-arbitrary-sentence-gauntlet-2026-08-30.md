# Bet 1 — arbitrary-sentence retrieval gauntlet

## Outcome

The offline Judgment selector passes eight hand-labelled domains without a
model call or database write:

- parenting
- product onboarding
- hiring
- machine learning
- investing
- education
- software engineering
- health

Each case contains an exact saved support passage, an exact saved
counterpassage, and a topic-only distractor. The run recovered 16/16 relevant
passages, returned zero distractors, preserved article/highlight/source identity,
and stayed silent on a ninth unrelated claim.

Run it with:

```bash
npm run judgment:evidence-harness
```

## Quality contract

- A passage is scored from the exact words the reader will see.
- A longer sentence requires at least two-thirds key-term coverage.
- Phrase continuity and evidence density rank eligible passages; they do not
  rescue a loose topic match into eligibility.
- The reader's selected highlight is preferred when quality is equal, but a
  stronger article passage may outrank a thin highlight.
- Highlight notes and article titles help neither quotation pass unless the
  quoted highlight or body itself clears the bar.
- No result is better than an adjacent result. Empty and unrelated libraries
  stay silent.

## What this proves

This is deterministic retrieval proof across varied sentence shapes. It closes
the false-positive and clipped-quotation failures that can be proven without an
LLM. The model-call count is zero.

It does not prove stance inference or universal semantic recall. Noeis still
asks the agent to explain whether a retrieved passage supports or pressures the
claim, and the person chooses where to file it. A later real-corpus human review
or bounded live-model judge is required before marketing any result as the
globally strongest passage in a user's Library.
