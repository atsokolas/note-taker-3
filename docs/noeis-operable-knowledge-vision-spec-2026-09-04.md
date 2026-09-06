# Noeis — knowledge you can work with

**Consolidated product, interaction, and craft specification · v1 · 2026-09-05**

Owner: Athan. Prepared with Codex from the September 4–5 product-design discussion.

This document replaces the incremental brainstorming previously held at this same path. It is the consolidated reference for this design workstream, not a replacement for existing release gates or proof of current product behavior.

## 1. The product in one page

### The ambition

Make personal knowledge something you can operate—not merely read, organize, or ask questions about.

Library supplies the material. Wikis give it durable shape. Noeis lets a person open an idea, inspect what it rests on, change a premise, bring two sources together, revisit earlier thinking, and make something of their own. The document becomes a place where thinking happens, not merely the output of a chat.

The larger ambition is authorship: a person develops a distinctive way of understanding the world, turns it into reusable intellectual tools, and produces work with it.

**Desired feeling:** “The things I have learned are helping me see something I could not have planned.”

### The simple experience

Open an article. Write a note. Read a Wiki. Those everyday actions remain complete and excellent on their own. When something deserves attention, open the thought and work there. Do not require a journey through four rooms to connect a source to an idea.

The signature interaction is **Open a sentence**. Its depth can grow into comparisons, counterfactuals, exhibits, rehearsal, and original work. The ambition lives inside ordinary gestures, not additional mandatory screens.

### The tone

Serious thinking with life in the room. Calm does not mean solemn. The product can be beautiful, personal, amusing, and satisfying without badges, streaks, generated praise, or engagement pressure.

Care often means work the person does not have to repeat: keeping their place, preserving their exact words, showing a source's qualification, and letting an unfinished question remain unfinished.

### Decision status

| Status | Meaning |
| --- | --- |
| Endorsed direction | Athan explicitly liked and asked to preserve the four core experiences in section 4, the document-centered approach, and truthful delight. |
| Captured design scope | Athan requested continued ambition, small details, and consolidation of all ideas. Sections 6–8 preserve those proposals; inclusion is not item-by-item approval or a release commitment. |
| Recommended first slice | Open a sentence, exact source inspection, provisional writing, and reliable return. Sequence in section 11 is a recommendation. |
| Still unproven | Current architecture fit, visual form, implementation cost, retrieval quality, persistence design, product acceptance, deployment, and demand. |

No product implementation, merge, deployment, public sharing, or paid research is authorized by this specification-writing request. Example sentences are illustrative unless independently verified as exact user/source wording.

## 2. Principles and non-goals

1. **The person's work is central.** Agent interpretation supports it; it does not replace every sentence with a polished answer.
2. **Exploration is not commitment.** A question, a hypothetical, a saved note, an accepted Wiki revision, and a public artifact mean different things.
3. **Sources stay attached.** Quotations retain exact identities, context, provenance, and a way home.
4. **Generality is required.** Parenting, investment research, repositories, and ordinary reading must remain different kinds of work—not investment dossiers in disguise.
5. **The agent can converse.** It can answer a general question, ask a useful clarification, or pursue an authorized line of inquiry without forcing every request into a fixed menu.
6. **Silence is legitimate.** Automatic connections earn their place. Absence of evidence is not evidence of falsity; semantic similarity is not support or contradiction.
7. **Fun belongs to the work.** Personal expression, satisfying manipulation, curiosity, and aesthetic ownership are welcome. Metrics and rewards are not needed to justify beauty.
8. **One interaction language.** Extend existing primitives and remove superseded paths; do not create a different mini-app for each idea.

Not proposed: a mandatory graph canvas, a new top-level room for every capability, automatic conversion of all sentences into beliefs, a celebrity-agent debate simulator, a productivity guilt system, or an unbounded recommendation feed.

## 3. How this fits the existing product

| Existing surface | Role preserved | How the new direction enters |
| --- | --- | --- |
| Library | Owned/imported sources, nested folders, reading, highlights, and deliberate keeping. Clicking an article opens its contents. | Open a passage, inspect context, annotate, compare, or bring it into active work. |
| Think | Fluid writing, notes, Concepts, and questions. | Arrange material, test wording, rehearse, and preserve unfinished exploration. |
| Wiki | General-purpose, Library-grounded, article-first maintained knowledge. Repository wikis retain specialized rendering; dossiers remain explicitly grouped. | Open a sentence without changing the accepted article. A deliberate revision can use the existing review boundary. |
| Judgment | Consequential evaluation, personal positions, decisions, outcomes, and lessons. Dossiers retain their linked track. | Apply an instrument, inspect a dependency, or propose a position change without inventing the person's stance. |
| Paper / Desk / Shelf | Existing arrival, working-material, and kept-material organization. | Relevant returns use existing surfaces. No competing notification channel or filing taxonomy. |

Desktop Library and Wiki retain the user's preference for an open companion. Contextual exploration must coexist with it without duplicating the agent or squeezing the article into a narrow strip. Mobile may use drawers. Exact geometry requires a storyboard and responsive prototype.

This work extends [Close the loop](noeis-close-the-loop-roadmap-2026-08-29.md), [Paper / Desk / Shelf](noeis-paper-desk-shelf-design-2026-09-01.md), and [The Taste Pass](noeis-taste-pass-spec-2026-08-29.md). It does not declare any of their gates passed. Reconcile current code, Linear decisions, and parallel ownership before engineering.

## 4. The four core experiences

### 4.1 Open a sentence

**Scene:** A person reads a Parenting Wiki sentence: “Children need room to make mistakes.” They open it.

The article makes room for a focused workspace anchored to that sentence. It contains relevant exact passages, the person's related writing, limitations, and open questions—not a generic graph or a second chat window.

The person brings a saved Nomad passage beside it, adds an exception, and tries “recoverable mistakes” as a refinement. Noeis helps inspect whether that narrower wording is warranted. The accepted Wiki remains unchanged.

Close the exploration and return to the same line. Save the exploration if useful; a later accepted revision remains a distinct act.

**Success:** the person can inspect, write, undo, leave, reload, and resume with source identities and accepted text intact. Missing evidence is honestly absent. The experience works without an explanatory tour.

### 4.2 Put an idea under pressure

**Scene:** From “Compute will remain scarce,” ask: “Suppose this stops being true.”

A temporary alternative appears alongside the original. It distinguishes dependencies that can be supported from proposed interpretations and unknown consequences. The altered premise remains visible throughout: “For this experiment: demand grows more slowly.”

The person may refine the hypothetical, keep a question, propose a revision, or leave unchanged. Noeis must not fabricate a causal chain because a plausible story can be generated.

**Generalize:** a repository service becoming unavailable; a parenting strategy having different immediate and long-term effects; a personal plan with only two hours a week available. No invented behavioral probabilities or universal financial simulation.

**Success:** the person understands what changed in the experiment, what did not, and which consequences remain uncertain. The original survives untouched unless explicitly revised.

### 4.3 Revisit past thinking

**Scene:** “Take me back to what I was working out then.”

Reconstruct a small scene from recorded artifacts: saved sources, highlights, contemporaneous drafts, and recorded questions. Bring it beside today's work. An old sentence about a hardware constraint and a newer one about software efficiency can be inspected together: a changed position, or different conditions?

Historical quotations open the historical version when available. Missing versions remain missing. Import dates do not become reading dates, and saved material does not prove belief. Do not generate a psychological biography or nostalgia unsupported by the record.

**Success:** the person can inspect actual earlier work and compare it with today without confusing reconstructed interpretation with historical fact.

### 4.4 Make two pieces of knowledge meet

**Scene:** Bring an investment-letter passage beside a Parenting paragraph.

Expose the possible relationship and its limit before synthesizing prose. Both may favor learning through experience; tolerating capital losses is not interchangeable with a child's welfare.

The space between the sources is writable. It can become a note, an essay, a Wiki proposal, or an unfinished experiment. Relationships may be support, tension, analogy, exception, or unrelated.

**Success:** both ends are inspectable, the connection is specific, and the person can reject or reshape it. Weak automatic matches produce silence.

## 5. One complete journey and its state boundaries

### The first scene to design

1. Open a Parenting Wiki normally; read the article.
2. Select and open a sentence. Preserve its visual location and selection.
3. Inspect the exact saved Nomad passage, including surrounding paragraphs.
4. Place it beside the thought with a clear destination preview.
5. Try narrower wording. Show the small changed phrase, not an entire red/green paragraph.
6. Leave an unresolved question and optionally a return note: “Next: figure out which mistakes are recoverable.”
7. Get interrupted. Reload and resume the draft, source comparison, and question.
8. Keep only the question. The original Wiki has not changed. Leave a quiet, truthful route back to the exploration.

No chat wizard, required confidence score, or mandatory conclusion is needed.

### Logical state contract — not a database schema

| State | What it means | Boundary |
| --- | --- | --- |
| Reading / viewing | Inspect existing material; display preferences may change. | Does not create a belief, accepted revision, or public object. |
| Temporary exploration | A hypothetical, rearrangement, comparison, or provisional wording. | Original content remains identifiable and unmodified. |
| Saved private exploration | The person's draft and selected material persist for return. | Ordinary private saving should not require a knowledge-acceptance ceremony. Distinguish device-save from server-sync. |
| Proposed change | Explicit proposed wording or meaning for a maintained object. | Does not masquerade as accepted knowledge. |
| Accepted change | The authorized acceptance path records the change and its bound provenance. | Revalidate current identities/revision; do not apply to a stale or different object. |
| Shared snapshot | A deliberately selected, previewed artifact for recipients. | No automatic exposure of private context or later private edits. |

An unchanged experiment can close cleanly. A failed save preserves work and offers recovery. Explicit deletion is not secretly reinterpreted as “keep an offcut.” A missing or changed source has an unavailable/stale state rather than silently attaching a similar passage.

## 6. Expansion horizons

These preserve the full ambition. They are options for later selection, not a commitment to build them all.

### H1. Working exhibits

Make an explanation manipulable where a faithful model exists. In a compounding Wiki, compare the same returns in different orders: without cash flows, final wealth is equal; add periodic withdrawals and inspect the different outcomes under stated assumptions.

Text and model point to each other. Manipulate the exhibit and emphasize the clause explaining the mechanism. Save a chosen configuration as a labeled illustration, not empirical evidence.

Use tested deterministic primitives with visible formulas, units, assumptions, and limits—not arbitrary generated executable code. A repository exhibit could trace a verified request path. Parenting may call for qualitative contrasting examples, not a behavioral optimizer. Some ideas should remain prose.

### H2. Uncertainty that stays alive

Keep “I cannot tell whether this is patience or inertia” as written, without forcing a conclusion or task. The person can name the distinction that would help.

Later, genuinely relevant material may return beside the original question through existing return surfaces. State why it bears on the distinction without claiming resolution. This is relevance-triggered continuity, not a timer, overdue badge, or polished paraphrase that loses the difficulty.

### H3. Rehearse with your knowledge

“I need to explain this tomorrow. Let me try first.” The person speaks or writes. Noeis places a grounded question or source beside a specific gap: “You explained why it grows; what limits it?”

Their explanation remains central. Keep a sentence they discover with its source connection. Support friendly explanation, critical rehearsal, or ordinary conversation. No celebrity impersonation, automatic grades, invented expert opinions, or claims to predict another person's response.

### H4. Invent an intellectual instrument

Across investment, parenting, and repository material, the person develops a distinction between a mistake that teaches and a mistake that prevents continuing. They name an instrument **Room to be wrong**.

It holds definitions, examples, exceptions, questions, and sources—not just a prompt preset. Apply it to runway, rollback, or recoverability with domain-specific limits. An explicit correction such as “Whose downside?” can improve the instrument. Earlier applications retain their version; nothing silently changes the person's worldview.

The ambition: create reusable tools for thinking through ordinary writing. Use one shared interaction grammar, not a bespoke application for every instrument.

### H5. Discover the unwritten work

Ask what a person could make from their collection that no one source contains. Perhaps an essay about who gets to experiment and who pays for mistakes.

Present an organizing question, exact passages, their own relevant notes, and the gap that prevents the argument from working. The opening sentence may already be theirs. Do not claim unprecedented novelty, invent the original motivation, or ghostwrite a settled thesis before they choose one.

Let them rearrange material and see where support is lost or changes role. Outcomes include Wikis, essays, talks, decision briefs, exhibits, or unfinished arrangements. Generated word count is not success.

### H6. See the limits of the Library

“Take away the source I rely on most. What can I still defend?” Temporarily exclude a source family, preserving original text and one-action restoration. Show support that remains, is lost, or is uncertain. Lack of citation does not establish falsity.

Show shared underlying source dependence only when verifiable. Turn a real gap into a discriminating research question, not “read more.” Any external research must be authorized, with costs bounded.

### H7. Carry a small exploration out

Share one question, two passages, and a provisional conclusion rather than an entire Library or dossier. Preview exactly what recipients see. Selected private notes and sources require explicit inclusion and appropriate rights/access; no accidental hidden-highlight leakage.

Default to a read-only snapshot, not a live feed of subsequent private edits. Publication, retention, source access, and revocation require a dedicated contract before implementation.

### H8. Make two private Libraries meet

Two people explicitly contribute selected material to a shared question. Noeis helps distinguish disputed facts from different definitions, time horizons, values, or acceptable risks. These are inspectable interpretations, not judgments about motives.

The result need not be consensus: record what both accept, what each disputes, and what observation might help. Preserve attribution and each person's private position. No silent cross-account search, social feed, follower graph, or merged personal beliefs.

## 7. The craft contract

These are design requirements for relevant slices, not assertions that current software fails or already implements them. IDs provide stable acceptance references. Overlapping brainstorming details are consolidated below.

### Reading and evidence

| ID | Moment | Required detail |
| --- | --- | --- |
| R1 | Find the pencil mark | Open the exact cited passage with surrounding context. Arrival emphasis settles to an unobtrusive location mark; reduced motion uses the final state. Return names the originating work and restores place/focus. |
| R2 | Keep the selection | Agent input retains the visible selection and exact context binding. Toolbars never cover selected text or fall outside the viewport. Typing or scrolling does not silently rebind the question. |
| R3 | Read around this | Reveal adjacent paragraphs in place, with quotation boundaries intact. Source qualifications remain accessible. Selecting/copying within the expansion does not dismiss it. |
| R4 | Compare the useful parts | Initially align relevant passages, not document covers. Keep source identities visible; allow independent scrolling and restore both positions. |
| R5 | One book, several slips | Multiple citations from one source reuse its open reader and provide passage-level Back. Avoid long animated scrolls and silent approximate anchors. |
| R6 | Read it fresh | Temporarily hide personal annotations/suggestions, not the source's footnotes or content. Restore at the same position. A view toggle is not deletion or proof of rereading. |
| R7 | Tell the evidence truth | “Three passages from one essay,” not three independent sources. Existing exact passage uses are discoverable without duplicating them or erasing separate annotations. |
| R8 | Tell the date truth | Distinguish publication, import, annotation, acceptance, and observed reading. Exact dates work through focus/tap as well as hover. Never turn an import date into “you read this then.” |

### Writing, play, and conversation

| ID | Moment | Required detail |
| --- | --- | --- |
| W1 | Find the title | Select wording and Make this the title; retain body text. Writing need not wait for naming. Use a provisional first-line preview until a title is chosen; never silently replace an explicit title. |
| W2 | Human marginalia | Leave “!”, “?”, “Ha!”, or “Hang on…” beside a passage without a full comment form. Expand into a longer note at the same anchor. Expressions are not evidence roles, agreement, or acceptance. |
| W3 | Reply to your past self | Add a dated reply beside an older annotation. Keep both. Do not manufacture a worldview-change announcement or silently retire a belief. |
| W4 | Let the half-sentence remain | Preserve unfinished wording without completing it. Restore the editing place on deliberate resume; avoid unexpectedly opening a mobile keyboard during ordinary navigation. |
| W5 | The agent has manners | No unsolicited insertion above the caret, evidence reordering under the pointer, focus theft, or document jumps. Requested replies remain available. No fabricated progress stages or per-word animation. |
| W6 | One good line | A connection names its consequence: “This adds a timing condition to your scarcity argument.” The next layer exposes both passages and bounded reasoning. Weak automatic matches stay silent. |
| W7 | A provisional state you can see | Keep the altered assumption visible in ordinary language; color alone is insufficient. Put it back restores the original. Saving a question does not accept it as a belief. |
| W8 | A small edit, a small comparison | Emphasize changed words rather than painting a paragraph. Full old/new text stays available. Formatting-only changes are not presented as changed ideas. |
| W9 | Satisfying passage placement | Preview the exact destination; Escape cancels. Menu/keyboard alternatives equal dragging. After confirmed persistence, the clipping settles into a source-bound quotation. No success motion on failure. |
| W10 | Try the other way | Reversibly rearrange existing passages—for example, exception before rule. Preserve identities and Undo. Reordering is not synthesis, agreement, or a new model-generated argument. |
| W11 | Try without this paragraph | Remove it only inside an explicit temporary version; let prose close the gap. Restore by name or inspect the original. Do not confuse this with deletion or secretly retain deleted material. |

### Leaving, returning, and sharing

| ID | Moment | Required detail |
| --- | --- | --- |
| L1 | Save honestly | Device-save and server-sync differ. Failures preserve the draft and offer retry/recovery. No success claim before acknowledgment. |
| L2 | A note for your return | Optionally leave “Next: figure out who bears the downside.” Show it beside resumed work. It is not a deadline, notification, new task, or overdue count. |
| L3 | A quiet consequence | A successful placement says where it landed using the user's actual title, with a route there and Undo where supported. No blocking celebratory toast or raw internal IDs. |
| L4 | A graceful ending | A question, clearer sentence, or no change can finish an exploration. Do not append endless next-action cards. Leave a modest route to saved work and let the page become still. |
| L5 | Copy with source | Explicitly copy exact quotation plus concise attribution and an appropriate link in usable plain/rich text. Ordinary Copy is unchanged. No private annotations, tokens, invented public URL, or marketing footer. |
| L6 | Preview the real reading experience | Show actual recipient content at narrow/wide widths, including citations and ending—not just a hero. No authoring chrome or hidden private context. Use Preview rather than confusing it with evidence/proof grading. |
| L7 | A proper ending | Typeset colophon with real authorship, version/date, sources, and optional user closing note/bookplate. No fabricated effort or reading-time claims. Print pagination gets its own checks. |

### Mechanical finish — required throughout

- Use actual titles in context and receipts, never “Question 3” or object IDs. Compact lists expose full titles accessibly; full document headings and consequential claims remain complete.
- Closing/reopening a rail preserves the focal passage through reflow. Search restores query, scope, and meaningful result position after returning.
- Inline citations have comfortable touch targets without inflating prose line height. Selected text remains selectable/copyable.
- Folder renaming stays in place and restores keyboard navigation after save/cancel. Existing nested folders remain visible.
- Counts, time labels, and save indicators do not jitter neighboring controls. Loading, empty, failed, unavailable, and stale states are distinct.
- Empty search results name the query/scope and offer one relevant route back. No filler cards or decorative empty-state theater.
- Browser Back, Copy, selection, Undo, and Escape retain predictable behavior. Escape dismisses the topmost temporary layer rather than the whole work.
- Test desktop around 1440px, sidebar/tablet widths 1280–1400px, mobile around 430px, keyboard, touch, and reduced motion.
- No hover-only essentials, mandatory sounds, low-contrast provisional text, or decoration required to understand a state.

## 8. Personality and aesthetic ownership

These are proposed expressive options. Choose a small coherent set for the prototype; do not turn each into a new settings page or toolbar.

### A personal bookplate

“From the Library of Athan,” with a chosen emblem and ink. Illustration directions include owl, octopus, pomegranate, or geometric knot. These are not yet designed assets.

Place it at a Library threshold or a deliberately shared work's colophon, not over every source. No points, status, inferred symbolism, or fake handwriting. It may be beautiful simply because the person enjoys it. Include shared appearance in preview.

### One choice of ink, everywhere

Candidate palettes: Paper, Graphite, Aegean. Preview on the actual open work; cancel restores the previous choice without losing place. Cover the agent, pickers, empty states, and secondary controls as well as the reader. Preserve contrast, evidence meanings, and personal accessibility/typography preferences. Do not fork layouts per theme.

### Chosen serendipity

Open somewhere unexpected draws one accessible passage from material deliberately kept and opens its source with existing annotations. It does not claim relevance, newness, or rediscovery without evidence. One draw, not an infinite feed; no model call is needed for a bounded eligible selection. An empty kept collection has an honest fallback.

### Plain where it matters, playful where invited

Try the other way, Leave this open, Put it back. But use explicit language for Accept revision, Publish, Share, and Delete. Never hide a consequential action behind a charming metaphor. Avoid clever failure copy or humor at someone's expense in distress, grief, or loss.

Greek touches belong in restrained illustration, lettering, and a printer's ornament—not compulsory vocabulary for navigation.

### Taste budget

Most of the page remains ordinary reading and writing. Actions appear where their need occurs. A chosen expressive detail (marginalia), a tangible interaction (placement), and an aesthetic detail (bookplate/colophon) are a stronger first composition than thirty simultaneous affordances.

## 9. Reference lessons

These are documentation-based observations gathered September 4, not hands-on audits or claims of visual parity.

| Reference | Observed detail | Noeis interpretation |
| --- | --- | --- |
| [HEY Cover Art](https://help.hey.com/article/781-cover-art) | Personal artwork covers previously seen mail and can carry stickies. | Give personal beauty a real place, not a dashboard decoration. |
| [Basecamp Boosts](https://5.basecamp-help.com/article/1099-boosts) | Small typed/emoji expressions attach directly to work without a full reply. | Make room for the owner's voice in marginalia, without likes or reaction scoring. |
| [Fizzy Golden Ticket](https://help.fizzy.do/3/fizzy-help-guide/50/moving-prioritizing) | Priority changes appearance and position together. | A meaningful state change should have a legible, satisfying visual consequence; do not copy tickets or gamify knowledge. |
| [Omarchy Quattro](https://github.com/omacom/omarchy/releases/tag/v4.0.0) | Shared theming, live previews, and direct bar placement with preview. | Consistent secondary surfaces, preview before commitment, and a few complete aesthetic choices. |

Borrow the attention and coherence, not a new taxonomy of borrowed product names. Do not reintroduce previously rejected numbered-place navigation or piles as a default layout recommendation.

## 10. Architecture and safety requirements

These are constraints for an architecture inventory, not claims about existing code or a finalized schema.

### Reuse before expanding

- Locate existing source/passage identities, selection anchors, citations, agent context, draft persistence, revisions, receipts, annotations, Keep, themes, placement, and sharing.
- Specify what each new component replaces. Avoid parallel agent engines, reader variants, duplicated selectors, hidden state, or identical models under new names.
- Do not snapshot the whole Library or full claim corpus for every exploration. Prefer references plus bounded user-authored deltas, subject to verified historical/access requirements.
- Inventory → no-edit extraction plan → targeted fallback tests before a large refactor. Protect dirty checkouts and parallel ownership.

### Content and state boundaries

- A selection needs an owner, document/source identity, relevant revision/version, and an anchor with a defined stale/unavailable behavior. Similar text alone cannot repair a broken identity silently.
- Source facts, exact quotations, user words, agent interpretations, hypothetical assumptions, proposed revisions, accepted knowledge, and shared snapshots remain distinguishable.
- Concurrent edits, source deletion, permission changes, retry, cancellation, and reload must not create duplicate writes or apply a proposal to a different revision.
- Ordinary private draft saving stays fluid. Accepted-knowledge and public-share boundaries stay explicit without requiring review ceremony for every private note or agent reply.
- Do not redefine existing edition or private-maintenance policies implicitly through this spec; reconcile any policy conflict before implementation.

### Agent and cost

- One durable collaborator, explicitly bound to the active work, with room-appropriate behavior and ordinary conversation available.
- Grounded answers name their sources; general conversation need not manufacture citations. Clarification is useful when context is insufficient; refusal or a canned retrieval card is not the only alternative.
- No unsolicited accepted writes or public sharing. Source/quote identity does not itself establish relevance or truth.
- Every automatic surfacing path declares eligibility, quality/suppression, and silence behavior.
- No model call per hover/render, unbounded corpus fan-out, fabricated progress, or paid external research without authorization. Define cancellation, budgets, caching isolation, and lifecycle cleanup before enabling background intelligence.
- Keep deterministic behavior model-free where adequate. Live evaluation cost and scope need explicit agreement; earlier cost constraints remain in force.

### Sharing and history

Preview recipient-visible material and source-access limits. Private source content, personal annotations, credentials, and hidden metadata must not leak. Shared snapshots do not silently incorporate later private edits. Define access, revocation, retention, and derivative-content behavior before collaboration work.

Historical reconstruction uses recorded artifacts only. Missing data remains missing; dates and identity are not invented to make a compelling story.

## 11. Proposed sequence and exit criteria

This sequence is advisory and is not authorization to begin implementation. Preserve farther horizons even when the first slice is small.

| Stage | Deliverable | Exit before advancing |
| --- | --- | --- |
| S0 — Reconcile | Read-only inventory of current behavior, code seams, release gates, storage, and parallel ownership. | Name what exists, what changes, what is replaced, and the unresolved contract decisions. No architecture-by-assumption. |
| S1 — Make it visible | A continuous storyboard of section 5, including ordinary reading, open thought, exact source, provisional edit, interruption, and return. Include marginalia, placement, and a restrained bookplate/colophon study. | Athan approves the visual/interaction direction at desktop/sidebar/mobile; save those images as acceptance references. No imagery exists yet for this spec. |
| S2 — Prove the interaction | A narrow local prototype of Open a sentence with exact source inspection, private exploration, reversible wording, and restoration. | A person completes the journey without coaching; realistic long content, failure states, keyboard, touch, and reduced motion hold. Any mocked behavior is labeled. |
| S3 — Prove the real loop | Bind the prototype to owned persisted material and the existing agent/revision contracts. | Reload, interruption, retries, concurrent edits, stale/deleted sources, ownership, and accepted-text protection pass. Validate another domain. |
| S4 — Release deliberately | Clean integration, selected regression gates, user dogfood, then separately authorized release. | Distinguish local, rendered, persisted, merged, deployed, and authenticated-production evidence. Do not claim longitudinal value from a scripted pass. |
| S5 — Grow from use | Select one horizon that the observed workflow needs: uncertainty, exhibit, rehearsal, instrument, or original-work composition. | A person finds understanding or authorship value beyond a generated answer. No automatic commitment to all horizons. |
| Later — Shared work | Small publication and, eventually, two-person inquiry. | Explicit privacy/versioning contract and real participant acceptance, not simulated consensus. |

## 12. Acceptance and evaluation

### First complete-loop acceptance

1. Read a normal Wiki without activating the new layer; quality, citations, and article-first layout remain intact.
2. Open an exact sentence, inspect owned source material with its context, and return to the same place.
3. Type, annotate, arrange, and try wording without focus theft, scroll jumps, or accepted-content changes.
4. Save privately, interrupt, reload, and recover the draft, comparison, and return note. Save state is truthful.
5. Keep a question without creating a belief; a later deliberate revision uses the correct current identity and provenance.
6. Empty/weak retrieval, unavailable history, stale/deleted sources, foreign ownership, and network failures produce honest bounded states.
7. No duplicate sources/jobs/writes, unbounded background model use, or silent public exposure.
8. Desktop 1440px, 1280–1400px sidebar/tablet, mobile around 430px, keyboard, touch, and reduced motion pass as a continuous journey.
9. The companion remains one coherent agent, including plain chat and exact-context requests. No regression to canned unrelated rewrite proposals.
10. A second domain proves the layer is general-purpose; repo/dossier specializations and ordinary Wiki generation stay protected.

### Quality, not only correctness

- Can the person explain why the two passages belong together and where the relationship stops?
- Did a source, exception, or experiment change their understanding—or merely generate more prose?
- Can they leave without a forced conclusion and resume without reconstructing their intent?
- Does the page feel like their work, or like an AI output surrounded by controls?
- Does each detail make orientation, expression, manipulation, or closure better? Remove competing decoration.

Do not invent a success percentage or close an existing stage based on this spec. Agree evaluation participants and any longitudinal threshold before running them.

### Known fixture pointers — reverify before testing

| Fixture | Recorded identity | What it can test |
| --- | --- | --- |
| Parenting Wiki | 6a7b5c0743142565055490f3 | General-purpose article and cross-domain source exploration. |
| Nomad article / highlight | 6a260c89ca92a6102d4aaf61 / 6a260c89ca92a6102d4aaf87 | Exact saved passage and an analogy with limits. |
| Gavin Baker article | 6a6769be336fa3371a17a5fc | Timing/survival interpretation against a separate case. |
| AI Compute Bull case | 6a846a326ef026e2d88ac9a8 | A possible tension or missing condition, not a preclassified contradiction. |

These IDs come from the earlier signed-in walkthrough, not fresh verification in this consolidation pass. Do not use private IDs/content in public mockups. Verify ownership, current wording, revisions, source availability, and folder provenance before use.

Audit context: [second walkthrough](../output/noeis-cofounder-walkthrough-2026-09-04-r2/REVIEW.md) and [first assessment](../output/noeis-cofounder-walkthrough-2026-09-04/ASSESSMENT.md). Reports distinguish observed route/context failures from later successful retries; they are not root-cause diagnoses or current-release proof.

## 13. Open decisions and exact next step

Decided for the first scene (2026-09-05), recorded in [Open a sentence S1](noeis-open-sentence-s1-2026-09-05.md):

1. **Form:** the article stays the page; the sentence opens a pocket in place; the companion rebinds. Pocket reveal is 320ms on the existing sentence-motion curve; reduced motion is the open state with no drawing.
2. **Persistence in the prototype:** tab-local device-save of the private draft. Not server-sync, not an accepted revision.
3. Claim identity is `data-claim-id`. Attached sources are citation indexes / ledger `sourceRefIds` into `sourceRefs`. No similar-text repair.
4. **First craft texture:** marginalia, placement, restrained colophon study.
5. The next horizon is still chosen from demonstrated use.
6. The pocket picture is the ordinary reading gesture. Live ask is conversation against the accepted page, bound to the opened claim. A generated reply is not a Wiki rewrite.

Proposed wording is a distinct act. It names the current claim and the current accepted line. It does not write the article. If that line moved on, the proposal is dropped. Accepted change remains a later, separately authorized path.

**This stage:** the pocket on `/wiki/read/:id`, the Library walk, the way home, a companion that can be asked about the opened sentence, and a proposal that is not yet a belief. Not an accepted revision, not a public-share leak.

## Appendix — consolidation coverage

All substantive ideas from the incremental draft remain represented. Earlier labels map as follows so a later agent can trace the conversation without retaining a second competing spec.

| Earlier material | Consolidated home |
| --- | --- |
| Four opening experiences A–D | Sections 4.1–4.4 |
| E1 exhibit; E2 unresolved thought; E3 rehearsal; E4 portable exploration | H1, H2, H3, H7 |
| H1 instrument; H2 unwritten work; H3 Library limits; H4 two Libraries | H4, H5, H6, H8 |
| C1–C4 citation/selection/context/comparison | R1–R4 |
| C5 unfinished draft; C6 agent manners; C7 connection line; C8 provisional state; C9 small diff | W4/L1, W5, W6, W7, W8 |
| C10 source counts; C11 dates; C12 user titles | R7, R8, mechanical finish/L3 |
| C13 receipt; C14 sharing; C15 ending | L3, L6/section 10, L4 |
| P1 marginalia; P2 bookplate; P3 placement; P4 arrangement | W2, section 8, W9, W10 |
| P5 serendipity; P6 palettes; P7 colophon; P8 tone; P9 backstage | Section 8, section 8, L7, section 8, mechanical finish |
| D1 title; D2 fresh reading; D3 past-self reply; D4 paragraph experiment | W1, R6, W3, W11 |
| D5 same-source citations; D6 copy; D7 preview; D8 return note; D9 mechanics | R5, L5, L6–L7, L2, mechanical finish |

Saved locally as a specification. Product-code, implementation, and release status are not established by this document.
