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

Opening a sentence is not highlighting, copying, or annotating. Those keep their ordinary meaning. **Copy with source** is a distinct act: the exact saved passage, its title, and the existing door. Ordinary Copy is unchanged. A private mark is not copied. A missing door stays missing. A `!` beside a source is a human mark, not agreement and not a citation.

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

Closing the pocket without a question, a named distinction, a placed passage, a proposed wording, or a named premise discards the experiment. Keeping any of those keeps a private draft. An empty “suppose” is not a kept walk. Filling only what still holds or what remains unknown is not a named premise. A named instrument keeps a walk even without a distinction. An unnamed instrument snapshot does not. Put it back restores the original wording. The accepted article never receives the draft.

## What this is not yet

Not a live retrieval engine. Public shares stay closed. The workspace composer does not grow a second chat. The illustrated storyboard remains the Parenting journey; owned `/wiki/read/:id` pages now reuse the same pocket on real claims. Accepting a live proposal writes that claim through the existing body patch; it is not a generated rewrite.

## Live Wiki binding (2026-09-05)

Ordinary reading at `/wiki/read/:id` can open a claim in place. The article stays. The companion rebinds to that sentence. Drafts stay on the device as `noeis.open-sentence.{pageId}.{claimId}`. Restore cannot overwrite accepted claim text or invent a source.

**Eligibility:** a claim mark on a standard Wiki paragraph, with citation indexes or ledger `sourceRefIds` pointing at a sourceRef.
**Quality bar:** identity only. No similar-text repair. Missing surrounding lines stay missing. Empty quotes stay empty. A citation quote that no longer matches the source snippet is an older copy; the cited quote stays, and the newer line is not attached.
**Silence:** no attached source → “Nothing beside this sentence yet.” A cited slot with no sourceRef → unavailable, and a neighbor is not substituted. An older copy says so.

Repo dossiers, editions, investment/living-thesis pages, workspace mode, and public shares do not open. Closing the pocket without a question, a named distinction, a placed passage, a proposed wording, or a named premise discards the experiment.

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

The same pocket can hold a temporary alternative beside the original. **Suppose this stops being true** opens three empty slots: the altered premise, what still holds, and what remains unknown. The person names them. A recorded passage already beside the sentence can be kept as what still holds, or as what remains unknown — today's source, today's other, or a Then source that still differs. The exact saved words, not a generated consequence. One passage cannot occupy both slots. A Then question or draft cannot be kept as support. Empty slots stay empty. Noeis does not invent a causal chain, fill the empty slots, or write the article.

Identity is the current accepted line. If that line has moved on, the experiment is dropped. Library may suppose; it still cannot propose or accept a Wiki revision. Accept remains a distinct later act.

The illustrated Pressure beat is Compute, not Parenting. It does not walk into Nomad.

## Then / Now (2026-09-06)

The same pocket can hold an earlier recorded wording beside today's line. **Then** is identity, not a generated biography: the newest unpruned Wiki revision whose `before` still has that claim, or a claim-history fallback when revisions do not record a prior line. The live marked sentence stays Now. Recorded sources attached to that claim in the snapshot sit under Then when their passages differ from today's live source and live other. A historical door opens only when that snapshot source's own door is still a different identity from today — a captured original URL, or a different saved highlight. Today's Library door is not offered as Then. If that same snapshot bound a question or a notebook draft to the claim, that recorded line sits under Then as well — "Then you left this open", "Then you wrote". A user history note on the Then line can stand in for a draft when the snapshot has none. Missing earlier wording, a missing recorded source, a missing historical door, or missing contemporaneous work stays missing. A private draft cannot forge Then. Then work is not copied into today's question or into the distinction that would help. Library has no claim revisions, so it stays silent.

The illustrated Then beat is Compute, not Parenting. It does not walk into Nomad. It is not a biography.

When Then holds a recorded question, **the distinction that would help** sits beside that question — a dated reply, the same field, not a second binder. Then’s question stays Then’s. Today’s words stay today’s. The date is stamped once when the distinction is first named; a lifted note without a date stays undated. Clearing the distinction forgets the date. No worldview-change announcement.

## Read it fresh (2026-09-08)

The same pocket can hide what you wrote and leave the sources. **Read it fresh** is a view, not deletion: wording, questions, the distinction, Then’s recorded question and draft, pressure, meeting names, and the mark recede. The attached passages, Then’s recorded line and sources, and the accepted sentence stay. **Show what I wrote** restores them in place. Escape leaves the fresh view before it closes the pocket. Closing still does not write the article. A pocket with only a source has no toggle. Filler is never the answer.

**Taste pass.** Eligibility: the opened pocket has personal work — a kept draft, a changed wording, an open experiment, a mark, or Then’s recorded question or draft. Quality bar: a session-local view. Restore in place. Not deletion, not proof of rereading, not stored on the exploration. Silence: only a source → no toggle; Escape leaves the view before it closes the pocket; closing still does not write the article. Filler is never the answer.

## Meet (2026-09-06)

The same pocket can hold a second recorded passage beside the first. **Also beside** is identity, not a generated match: another sourceRef bound to that claim, with a different identity and a different passage. The person names how they meet and where that stops. **The space between** is empty until they write. A note written there can stay a note, be kept as an unfinished experiment, be proposed as the Wiki line, or be kept as an essay. The experiment uses the existing pressure act: their words become the named premise; still-holds and unknown stay empty until they write. The proposal is the existing proposal act: their words, against the live line. The wording field stays the current claim. The essay is a snapshot of their words; it is not the Wiki line, and it can remain after they leave the meeting. Empty slots stay empty. Noeis does not synthesize a paragraph, fill the relation, invent a chain, or write the article.

Identity is the current accepted line and those two recorded passages. If the live line moved on, or the second passage is gone, the naming is dropped. A private draft cannot forge the second source. A neighboring unattached source is not brought in. Library has only the passage you are already in, so it stays silent. Library cannot propose.

The illustrated Meet beat is Parenting with Nomad and an investment letter. It does not walk into Compute. The space between stays empty until the person writes. A note written there can stay a note, be kept as an experiment, be proposed as the line, or be kept as an essay.

**Try the other way (2026-09-08)**

The same two recorded passages can be read in the other order. **Try the other way** puts the second passage first. Identities stay: Nomad is still Nomad; the letter is still the letter. **Put them back** restores the bound order. Reordering is not synthesis, agreement, or a generated argument. A swap alone is not a kept draft. If either recorded passage is gone or replaced, the swap is dropped. Filler is never the answer.

**Taste pass.** Eligibility: an opened sentence with two inspectable recorded passages — the bound source and a second. Quality bar: display order only. Source and other identities do not trade places. Undo is Put them back. Silence: empty or missing first passage → no toggle; one passage → no toggle; a vanished or replaced first or second passage drops the swap; a swap alone does not linger after close. Filler is never the answer.

**Try without this paragraph (2026-09-08)**

The opened paragraph can be read as if it were not on the page. **Try without this paragraph** hides it only in this temporary version. Surrounding prose closes the gap. The original stays inspectable in the pocket. **Bring “…” back** restores it by name. Closing the pocket puts the paragraph back. This is not deletion, and it is not a kept draft. A passage that is already here does not get the toggle. If the accepted line moved on, the set-aside is dropped. Filler is never the answer.

**Taste pass.** Eligibility: an opened Wiki sentence with an accepted line, not already-here Library source. Quality bar: temporary version only. The article is not rewritten. Restore names the paragraph. Silence: already here → no toggle; empty line → no toggle; close or a moved line drops the set-aside. Filler is never the answer.

**Bears on this distinction (2026-09-08)**

Later, a third recorded passage can sit beside the named distinction. **Bears on this distinction.** is identity, not a generated why: another sourceRef bound to that claim, with a different identity and a different passage from today's source and other, whose saved words share two content words with the distinction the person named. The caption is the reason. The question stays unfinished. This is not Meet, and it is not Then. A third source alone is not a kept draft. If the question, the distinction, or the third passage is gone, the return stays silent.

**Taste pass.** Eligibility: an opened sentence with an unfinished question, a live named distinction, and a third inspectable recorded passage. Quality bar: the exact saved passage. The caption states the bearing. No generated warrant, no "resolved," no timer. Silence: no question, no distinction, no third source, the same passage as source or other, or fewer than two overlapping content words → nothing. Leave-open without later material stays silent. Filler is never the answer.

**Find the title (2026-09-08)**

A page can be written before it is named. **Make this the title** is an explicit act: the selected wording becomes the title, and the sentence stays in the body. Until a title is chosen, the first sentence of the body is a preview, not a stored name. An explicit title is never replaced from the first line.

**Taste pass.** Eligibility: non-empty wording that is not already the named title, on a Wiki pocket or in the Wiki editor selection. Quality bar: identity only. `updateWikiPage({ title })` — no body patch. The preview is display-only. Silence: empty wording; wording already the title; Library has no title act; a failed save leaves the title. Filler is never the answer.

## Coming home (2026-09-05)

Closing the pocket without a question, a named distinction, a placed passage, a proposed wording, a named premise, a named meeting, or a note written between them discards the experiment. Keeping any of those keeps a private draft. Closing still does not write the article. A `!` left alone is a gesture in the moment; closing forgets it too.

Coming back from Library, the sentence can say “You were in Nomad.” A named distinction sits under the closed line as the way back into the pocket. A proposed wording can sit there too, still not accepted. A named premise can sit there as “For this experiment: …”. A named meeting can sit there as “They meet: …”. A note written between two passages can sit there as the first line of that note. A proposal from that note sits as “Proposed, not accepted.” until they accept or withdraw. An essay kept from that note sits as “An essay: …” after the meeting is left. A placed passage leaves a quiet gold thread even while closed. None of this opens the pocket by itself.

## Honest failures and long content (2026-09-05)

The storyboard Source control walks the same pocket through Nomad, silence, a gone source, a passage with no surrounding lines, an older copy, and a long passage that scrolls inside the pocket. Stillness is the open state with no drawing. A missing line is not replaced by a neighbor. Filler is never the answer.

## The real loop (S3, 2026-09-05)

Owned Wiki and Library walks persist on the device. Closing the tab, opening another tab, or coming back later can restore a kept question without accepting a revision. A leftover tab draft is lifted onto the device. If the page host drops and retries, the kept question returns with the page. If the accepted Wiki line moved on, the current line is what the article still reads, and the stored walk is rewritten to that line. If the citation quote no longer matches the source snippet, the cited quote stays as an older copy. If the claim is no longer on the page, the companion does not speak a stored draft; the private question can wait.

The companion rebinds to the opened claim’s accepted line. That does not invent or change an accepted revision.

Public shares, workspace, dossiers, and editions stay closed. A second ordinary Wiki (Compute, not Parenting) uses the same pocket. Server-sync is still later.

## Release gates (S4, 2026-09-05)

The host gate is `wikiAllowsOpenSentence`: an owned ordinary Wiki in read mode. Specialized projections and the workspace composer stay closed. Public shares do not restore a private draft. Selected Jest gates run as `npm run test:open-sentence` in `note-taker-ui/`, and the accept write as `npm run open-sentence:accept` at the repo root.

That is local, Playwright-rendered storyboard frames, device-persisted drafts, and merged-to-`main` evidence. `main` auto-deploys. It is not dogfood, not an authenticated production walk, and not longitudinal value. See [S4 evidence](noeis-open-sentence-s4-2026-09-05.md).

## Grow from use (S5)

The first horizon from demonstrated use is **uncertainty that stays alive**. The unfinished question stays unfinished. The old “Next:” return note is gone. In its place, the person can name the distinction that would help. Then’s question stays Then’s. Later, a recorded passage that actually bears on that distinction can sit beside it. The next unused horizon from that same walk is **an intellectual instrument**: a named distinction kept under a name, then applied beside another sentence without writing the article. The remaining S5 horizons use that same pocket: two named readings as an exhibit, a rehearsal of their own explanation, and unwritten work. Library limits are [S6](noeis-open-sentence-s6-2026-09-08.md). See [S5](noeis-open-sentence-s5-2026-09-08.md).

## Exit for this stage

A person can complete the Parenting journey on the storyboard without coaching, at ~1440, ~1320, and ~430, with keyboard, and with reduced motion. Mocked retrieval stays labeled. Long content scrolls inside the pocket. Silence, a gone source, missing surrounding, and an older copy stay distinct. On an owned standard Wiki, opening a claim makes a pocket, rebinds the companion, and leaves the accepted line unchanged. Walking into Library from that pocket lands on the highlight, remembers the held sentence, and can open the same pocket there. Coming home, the Wiki remembers Nomad without opening, and a closed experiment without a question, a named distinction, a placed passage, a proposed wording, a named premise, a named meeting, a note written between them, an essay kept from that note, a named instrument, a named exhibit, a rehearsal, or unwritten work does not linger. On Compute, the person can name a slower-demand premise beside the original line without a generated chain. A recorded passage can sit as what still holds, or as what remains unknown. A Then source that still differs can sit there too. On that same page, an earlier recorded wording can sit beside today when one exists. Recorded sources, a question, or a draft saved on that claim sit with Then. A historical door opens only when it is still a different identity from today. It is not a reconstructed biography. **Copy with source** takes the exact saved passage, its title, and that existing door. Ordinary Copy is unchanged. On Parenting, a second recorded passage can sit beside Nomad when one is bound to that claim. The person names how they meet and where that stops. Try the other way reads the second passage first. Put them back restores the bound order. Identities stay. Try without this paragraph hides that paragraph only while the pocket is the temporary version. Surrounding prose closes the gap. Bring it back by name. Closing restores it. It is not deletion. Try without this source hides the bound passage the same way. Support that remains is this sentence. Bring it back by name. Closing restores it. It is not deletion. The space between stays empty until they write. A note written there can stay a note, be kept as an experiment, be proposed as the line, or be kept as an essay. The experiment does not invent a chain. Propose does not write the article. The essay is not the Wiki line. Later, a third recorded passage can sit beside the named distinction when it actually bears on the fork. The question stays unfinished. Make this the title names the page from the wording. The sentence stays. An unnamed page previews its first sentence until a title is chosen. A named distinction can be kept as an instrument. Applied to another sentence, it sits beside that line. It does not write the article. Two named readings can be kept as an exhibit, not evidence. Try saying it keeps their explanation; a source they did not cover can sit beside it. Unwritten work names what the collection could become, and the gap. None of those write the article.

## S1 frames (2026-09-06)

Playwright captured the storyboard stage at the three study widths. These are rendered references, not founder approval.

| Frame | What it shows |
| --- | --- |
| [1440-read](open-sentence-s1-frames/1440-read.png) | Ordinary reading. Companion still with Parenting. |
| [1440-open](open-sentence-s1-frames/1440-open.png) | Pocket under the sentence. Illustrated Nomad. Article line unchanged. Companion rebound. |
| [1440-wording](open-sentence-s1-frames/1440-wording.png) | Recoverable mistakes. Small changed phrase. Article still reads the original. |
| [1440-leave-open](open-sentence-s1-frames/1440-leave-open.png) | Question kept. The distinction that would help is named, not a next step. |
| [1320-leave-open](open-sentence-s1-frames/1320-leave-open.png) | Same walk at sidebar width. |
| [430-leave-open](open-sentence-s1-frames/430-leave-open.png) | Pocket in the article. Companion is the drawer. |
| [1440-silence](open-sentence-s1-frames/1440-silence.png) | Nothing beside this sentence yet. |

Regenerate with `npm run frames:open-sentence` in `note-taker-ui/`.
