# Open a sentence — S1 decisions and reuse inventory

**For:** the Parenting Wiki storyboard at `/design-preview/open-sentence`
**Date:** 2026-09-05
**Sits under:** [Operable knowledge](noeis-operable-knowledge-vision-spec-2026-09-04.md)
**Status:** Direction for the first scene. Not a release, not a Wiki rewrite.

This is the walk-through of the choices that were still open. Plain language, then the seams we will reuse instead of rebuilding.

## What we are making first

A person is already reading a Wiki. They select a sentence and open it. The article stays the page. A pocket opens under that line: the exact saved passage, a place to try a narrower wording, a question they can leave unfinished. The companion on the right stays one partner and now talks about that sentence. Closing the pocket returns them to the same line. The Wiki itself has not changed.

That is the whole first slice. Not a new room. Not a second chat. Not the later horizons (exhibits, rehearsal, instruments, two Libraries).

## The layout

**The article stays. The sentence opens a pocket. The companion rebinds.**

Today a Wiki article already shares the screen with the companion. Adding a third full column would squeeze the article into a strip, which the spec forbids. Sending the person to a separate working view would mean they had left reading, which the spec is also trying not to do.

So the work happens in the page. The sentence does not fly away. The pocket uses vertical space under that paragraph. Sources scroll inside the pocket, not as another page column. On a phone the pocket is still in the article; the companion is the existing drawer.

## The animation

The pocket eases open in 320ms on the same curve the product already uses when a sentence moves (`cubic-bezier(0.16, 1, 0.3, 1)`). A small gold mark settles beside the held line in 220ms. The sentence itself does not travel.

If the person prefers reduced motion, the pocket is simply open. No height animation, no mark flight. Stillness is a legitimate end state.

The Open chip can follow a fine pointer. The pocket opening is not a hover trick; it works with keyboard and touch.

## How you open it

Select some of the sentence, then Open. Keyboard: focus the sentence and press Enter, or tab to Open. Touch: the Open control stays findable without hover.

We are not putting a mark on every sentence in the article. That would turn reading into a control surface.

Opening a sentence is not highlighting, copying, or annotating. Those keep their ordinary meaning. A `!` beside a source is a private expression, not agreement and not a citation.

## Why this scene, and only this scene

The first frames are the Parenting Wiki journey from the spec: read, open the sentence, inspect an illustrated Nomad passage, place it, try “recoverable mistakes,” leave a question, get interrupted, come back. The Wiki text is still the original sentence.

We are not also storyboarding Library-to-pocket in this pass. Same layer later; one continuous journey first.

The Parenting and Nomad wording here is illustrative. It is not the live page, and it does not use private ids.

## Craft in the first frames, not as extra plots

Three quiet details, because they teach the interaction:

1. **Marginalia** — a `!` on the Nomad passage. It is a human mark, not evidence.
2. **Placement** — preview where the passage will sit, Escape cancels, then it settles as a source-bound quotation.
3. **Colophon study** — a small “From the Library of” at the foot of the storyboard, not on the article.

Ink palettes, serendipity, and sharing wait.

## Persistence in this prototype

What you type in the pocket survives reload in this browser tab (`sessionStorage`). That is a device-save for the storyboard, labeled as such. It is not server-sync, not an accepted Wiki revision, and not a belief.

Closing the pocket without keeping the question discards the experiment. Keeping the question keeps the question only. Put it back restores the original wording. The accepted article never receives the draft.

## What this is not yet

Not a live retrieval engine. Not an accepted-revision flow. Public shares stay closed. The workspace composer does not grow a second chat. The illustrated storyboard remains the Parenting journey; owned `/wiki/read/:id` pages now reuse the same pocket on real claims.

## Live Wiki binding (2026-09-05)

Ordinary reading at `/wiki/read/:id` can open a claim in place. The article stays. The companion rebinds to that sentence. Drafts stay in `sessionStorage` as `noeis.open-sentence.{pageId}.{claimId}`. Restore cannot overwrite accepted claim text or invent a source.

**Eligibility:** a claim mark on a standard Wiki paragraph, with citation indexes or ledger `sourceRefIds` pointing at a sourceRef.
**Quality bar:** identity only. No similar-text repair. Missing surrounding lines stay missing. Empty quotes stay empty.
**Silence:** no attached source → “Nothing beside this sentence yet.” A cited slot with no sourceRef → unavailable, and a neighbor is not substituted.

Repo dossiers, editions, investment/living-thesis pages, workspace mode, and public shares do not open. Closing the pocket without a kept question discards the experiment; keeping the question keeps the question only.

## Reuse inventory

What the pocket sits on. No new engines.

| Need | Already in the product | Do not do |
| --- | --- | --- |
| Ordinary Wiki reading with a companion | `/wiki/read/:id` mounts `WikiPageReadView` and the persistent `AgentRail`. | Do not start from `/wiki/workspace`. That surface already swapped the rail for an embedded composer. |
| Sentence identity on a Wiki | Claim nodes carry `data-claim-id`; citations are `.wiki-claim-citation`. | Do not invent a parallel sentence id. |
| Citation click today | Jumps to the footnote on the same page. The pocket opens the attached passage; the footnote jump remains. | Do not replace footnote jump with a similar-text search. |
| Exact Library passage | `buildCanonicalHighlightPath` → `/library?articleId=&highlightId=`. | Do not key a source by similar text. |
| Companion rebind | `AgentRail` already shows “Now with” + subject and uses `useContextualAgentSurface`. One agent id: `agent.context-partner`. | Do not mount a second chat in the pocket. |
| Motion | `columnMotion.js` (220ms, the 0.16,1,0.3,1 curve) and `--noeis-motion-deliberate` (320ms). `usePrefersReducedMotion`. | Do not add a new motion language. |
| Draft vs accepted | Wiki review/accept is already the acceptance boundary. Working-memory drafts are already private. | Do not run a knowledge-acceptance ceremony on a private pocket save. |
| Return surfaces | Paper / Desk / Shelf, `SystemStatusContext`. | Do not invent a toast or a new notification channel. |
| Silence | Taste Pass: eligibility, quality bar, silence. An empty source slot is honest absence. | Do not generate a filler passage. |

Still later: how a selection stores revision + anchor in existing source documents; device-save vs server-sync retention; live retrieval beyond attached citations.

## Exit for this stage

A person can complete the Parenting journey on the storyboard without coaching, at ~1440, ~1320, and ~430, with keyboard, and with reduced motion. Mocked retrieval stays labeled. On an owned standard Wiki, opening a claim makes a pocket, rebinds the companion, and leaves the accepted line unchanged.
