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

The Parenting and Nomad wording here is illustrative. It is not the live page, and it does not use private ids.

## Craft in the first frames, not as extra plots

Three quiet details, because they teach the interaction:

1. **Marginalia** — a `!` on the Nomad passage. It is a human mark, not evidence.
2. **Placement** — preview where the passage will sit, Escape cancels, then it settles as a source-bound quotation.
3. **Colophon study** — a small “From the Library of” at the foot of the storyboard, not on the article.

Ink palettes, serendipity, and sharing wait.

## Persistence in this prototype

What you type in the pocket survives reload on this device for owned Wiki and Library walks (`localStorage`). The storyboard stays a tab-local study (`sessionStorage`). Neither is server-sync, an accepted Wiki revision, or a belief. A leftover tab draft is lifted onto the device so a mid-walk is not lost. Another tab’s save can become this tab’s restore.

Closing the pocket without a question, a return note, a placed passage, a proposed wording, or a named premise discards the experiment. Keeping any of those keeps a private draft. An empty “suppose” is not a kept walk. Put it back restores the original wording. The accepted article never receives the draft.

## What this is not yet

Not a live retrieval engine. Public shares stay closed. The workspace composer does not grow a second chat. The illustrated storyboard remains the Parenting journey; owned `/wiki/read/:id` pages now reuse the same pocket on real claims. Accepting a live proposal writes that claim through the existing body patch; it is not a generated rewrite.

## Live Wiki binding (2026-09-05)

Ordinary reading at `/wiki/read/:id` can open a claim in place. The article stays. The companion rebinds to that sentence. Drafts stay on the device as `noeis.open-sentence.{pageId}.{claimId}`. Restore cannot overwrite accepted claim text or invent a source.

**Eligibility:** a claim mark on a standard Wiki paragraph, with citation indexes or ledger `sourceRefIds` pointing at a sourceRef.
**Quality bar:** identity only. No similar-text repair. Missing surrounding lines stay missing. Empty quotes stay empty. A citation quote that no longer matches the source snippet is an older copy; the cited quote stays, and the newer line is not attached.
**Silence:** no attached source → “Nothing beside this sentence yet.” A cited slot with no sourceRef → unavailable, and a neighbor is not substituted. An older copy says so.

Repo dossiers, editions, investment/living-thesis pages, workspace mode, and public shares do not open. Closing the pocket without a question, a return note, a placed passage, a proposed wording, or a named premise discards the experiment.

## Library-to-pocket (2026-09-05)

The Wiki pocket’s Library door leaves a return ticket on the device (`noeis.open-sentence.return`), not in the URL. Library lands on the exact highlight. A quiet arrival remembers the sentence you were holding and offers a way back to `/wiki/read/:id?claimId=…`. The pocket does not open itself.

Opening that focused highlight uses the same pocket. The source is already this article, so “Open in Library” is gone. Surrounding lines come from saved prefix/suffix or an exact slice of the article. Place beside, when you arrived from a Wiki, writes `placed` onto the Wiki draft so the passage is waiting when you return. It is not an accepted revision.

The Library companion rebinds to the opened highlight, then back to the article title.

**Eligibility:** a focused saved highlight on an owned Library article.
**Quality bar:** surrounding only from saved prefix/suffix, or the exact highlight text in the article (offset only to disambiguate identical repeats). No similar-text repair.
**Silence:** missing surrounding → “The surrounding lines were not saved with this passage.” A missing line is not replaced by a neighbor. Filler is never the answer.

SelectionMenu, PassageDoor, and footnote jump stay themselves. This is not a second chat.

## Reuse inventory

What the pocket sits on. No new engines.

| Need | Already in the product | Do not do |
| --- | --- | --- |
| Ordinary Wiki reading with a companion | `/wiki/read/:id` mounts `WikiPageReadView` and the persistent `AgentRail`. | Do not start from `/wiki/workspace`. That surface already swapped the rail for an embedded composer. |
| Sentence identity on a Wiki | Claim nodes carry `data-claim-id`; citations are `.wiki-claim-citation`. | Do not invent a parallel sentence id. |
| Citation click today | Jumps to the footnote on the same page. The pocket opens the attached passage; the footnote jump remains. | Do not replace footnote jump with a similar-text search. |
| Exact Library passage | `buildCanonicalHighlightPath` → `/library?articleId=&highlightId=`. A return ticket remembers why you came. | Do not key a source by similar text. Do not put wiki text in the URL. |
| Companion rebind | `AgentRail` already shows “Now with” + subject and uses `useContextualAgentSurface`. One agent id: `agent.context-partner`. | Do not mount a second chat in the pocket. |
| Motion | `columnMotion.js` (220ms, the 0.16,1,0.3,1 curve) and `--noeis-motion-deliberate` (320ms). `usePrefersReducedMotion`. | Do not add a new motion language. |
| Draft vs accepted | Wiki review/accept is already the acceptance boundary. Working-memory drafts are already private. | Do not run a knowledge-acceptance ceremony on a private pocket save. |
| Return surfaces | Paper / Desk / Shelf, `SystemStatusContext`. | Do not invent a toast or a new notification channel. |
| Silence | Taste Pass: eligibility, quality bar, silence. An empty source slot is honest absence. | Do not generate a filler passage. |

Still later: how a selection stores revision + anchor in existing source documents; device-save vs server-sync retention; live retrieval beyond attached citations.

## Live companion (2026-09-06)

The picture is the ordinary reading gesture. Opening a sentence rebinds the steward to that claim without leaving the accepted page. Ask is conversation against the page, with the opened line as the focus. A generated reply is not a Wiki rewrite. Bound sources on the rail are the attached citation for that sentence, or none. Filler is never the answer.

## Proposed wording (2026-09-06)

Trying a narrower line is still an experiment. **Propose this wording** is a distinct act: it names the current claim and the current accepted line, and it does not write the article. If that line has moved on, the proposal is dropped rather than applied to a different sentence. Withdraw forgets the proposal. Library passages do not propose a Wiki revision.

**Accept this wording** is a later, separate act. It writes the named proposal onto that claim through the existing claim-body patch and `user_edit` revision. The person is the author. The article line changing is the receipt. If the live line has moved on, the write is refused and the pocket says so. Generated replies are still not Accept-to-rewrite.

## Under pressure (2026-09-06)

The same pocket can hold a temporary alternative beside the original. **Suppose this stops being true** opens three empty slots: the altered premise, what still holds, and what remains unknown. The person names them. Noeis does not invent a causal chain, fill the empty slots, or write the article.

Identity is the current accepted line. If that line has moved on, the experiment is dropped. Library may suppose; it still cannot propose or accept a Wiki revision. Accept remains a distinct later act.

The illustrated Pressure beat is Compute, not Parenting. It does not walk into Nomad.

## Coming home (2026-09-05)

Closing the pocket without a question, a return note, a placed passage, a proposed wording, or a named premise discards the experiment. Keeping any of those keeps a private draft. Closing still does not write the article. A `!` left alone is a gesture in the moment; closing forgets it too.

Coming back from Library, the sentence can say “You were in Nomad.” A return note sits under the closed line as the way back into the pocket. A proposed wording can sit there too, still not accepted. A named premise can sit there as “For this experiment: …”. A placed passage leaves a quiet gold thread even while closed. None of this opens the pocket by itself.

## Honest failures and long content (2026-09-05)

The storyboard Source control walks the same pocket through Nomad, silence, a gone source, a passage with no surrounding lines, an older copy, and a long passage that scrolls inside the pocket. Stillness is the open state with no drawing. A missing line is not replaced by a neighbor. Filler is never the answer.

## The real loop (S3, 2026-09-05)

Owned Wiki and Library walks persist on the device. Closing the tab, opening another tab, or coming back later can restore a kept question without accepting a revision. A leftover tab draft is lifted onto the device. If the page host drops and retries, the kept question returns with the page. If the accepted Wiki line moved on, the current line is what the article still reads, and the stored walk is rewritten to that line. If the citation quote no longer matches the source snippet, the cited quote stays as an older copy. If the claim is no longer on the page, the companion does not speak a stored draft; the private question can wait.

The companion rebinds to the opened claim’s accepted line. That does not invent or change an accepted revision.

Public shares, workspace, dossiers, and editions stay closed. A second ordinary Wiki (Compute, not Parenting) uses the same pocket. Server-sync is still later.

## Release gates (S4, 2026-09-05)

The host gate is `wikiAllowsOpenSentence`: an owned ordinary Wiki in read mode. Specialized projections and the workspace composer stay closed. Public shares do not restore a private draft. Selected Jest gates run as `npm run test:open-sentence` in `note-taker-ui/`, and the accept write as `npm run open-sentence:accept` at the repo root.

That is local, Playwright-rendered storyboard frames, and (when the PR check is green) preview-deployed evidence. It is not merged to `main`, not production, not dogfood, and not longitudinal value. See [S4 evidence](noeis-open-sentence-s4-2026-09-05.md).

## Exit for this stage

A person can complete the Parenting journey on the storyboard without coaching, at ~1440, ~1320, and ~430, with keyboard, and with reduced motion. Mocked retrieval stays labeled. Long content scrolls inside the pocket. Silence, a gone source, missing surrounding, and an older copy stay distinct. On an owned standard Wiki, opening a claim makes a pocket, rebinds the companion, and leaves the accepted line unchanged. Walking into Library from that pocket lands on the highlight, remembers the held sentence, and can open the same pocket there. Coming home, the Wiki remembers Nomad without opening, and a closed experiment without a question, a return note, a placed passage, a proposed wording, or a named premise does not linger. On Compute, the person can name a slower-demand premise beside the original line without a generated chain.

## S1 frames (2026-09-06)

Playwright captured the storyboard stage at the three study widths. These are rendered references, not founder approval.

| Frame | What it shows |
| --- | --- |
| [1440-read](open-sentence-s1-frames/1440-read.png) | Ordinary reading. Companion still with Parenting. |
| [1440-open](open-sentence-s1-frames/1440-open.png) | Pocket under the sentence. Illustrated Nomad. Article line unchanged. Companion rebound. |
| [1440-wording](open-sentence-s1-frames/1440-wording.png) | Recoverable mistakes. Small changed phrase. Article still reads the original. |
| [1440-leave-open](open-sentence-s1-frames/1440-leave-open.png) | Question and return note kept. |
| [1320-leave-open](open-sentence-s1-frames/1320-leave-open.png) | Same walk at sidebar width. |
| [430-leave-open](open-sentence-s1-frames/430-leave-open.png) | Pocket in the article. Companion is the drawer. |
| [1440-silence](open-sentence-s1-frames/1440-silence.png) | Nothing beside this sentence yet. |

Regenerate with `npm run frames:open-sentence` in `note-taker-ui/`.
