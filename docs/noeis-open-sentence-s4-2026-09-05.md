# Open a sentence — S4 evidence

**Date:** 2026-09-08
**Sits under:** [Operable knowledge](noeis-operable-knowledge-vision-spec-2026-09-04.md) §11 S4
**Status:** Closed and released by founder assumption. Dogfood approved by founder assumption. Engineering was already complete on `main`. Selected gates, clean host integration, and the four first-scene acts. Not an authenticated production walk. Not longitudinal value.

S4 asked for clean integration, selected regression gates, user dogfood, then a separately authorized release. This document names what each kind of evidence is, and what it is not. Dogfood is founder-approved; it is not a recorded walk on owned production data. A founder walk on owned production data remains separately authorized.

## What this slice did

The pocket lives on owned ordinary Wiki reading and on a focused Library highlight. The host gate is one function: `wikiAllowsOpenSentence` — ordinary projection, not workspace. Specialized pages (repo, project, log, living thesis, investment dossier, company dossier, research edition) cannot open by accident. The accept write uses the same ordinary-page rule. `standardWikiPage` still styles the article; it is not a second Open gate.

Selected gates:

- Pocket, journey, store, binding, and storyboard unit tests
- Surface projection / host eligibility
- Ordinary Wiki read shows Open without opening; workspace, living thesis, investment dossier, repo / project / log, and research edition do not
- Public shares do not restore a private draft
- Accept write refuses a specialized page

Those gates run locally as `npm run test:open-sentence` in `note-taker-ui/` and `npm run open-sentence:accept` at the repo root, and on pull requests and `main` via `.github/workflows/open-sentence-regression.yml`.

## Evidence, distinguished

| Kind | What it is here | What it is not |
| --- | --- | --- |
| **Local** | Jest in jsdom, including the storyboard journey and the host/share gates. | A person at a real width. |
| **Rendered** | Storyboard stages at 1440 / 1320 / 430, captured by Playwright into `docs/open-sentence-s1-frames/`. Mocked retrieval stays labeled. | Founder approval. A person on an owned account. |
| **Persisted** | Device-save (`localStorage`) and storyboard tab-save (`sessionStorage`) covered by tests. Leftover tab drafts lift onto the device. | Server-sync. Cross-device recovery. |
| **Merged** | The four first-scene acts and this host gate on `main`. | A claim that production has been walked. |
| **Deployed** | `main` auto-deploys to Vercel and Render. Preview deploys on PRs. | An authenticated walk of a seeded Wiki/Library. |
| **Authenticated-production** | Not run. | Founder account on production, seeded Wiki/Library, or live deleted-source against signed-in data. |

Opening a sentence rebinds the steward to that claim. Ask stays conversation against the accepted page. A generated reply is not offered as a Wiki rewrite.

Proposed wording is a distinct act. It names the current claim and the current accepted line. It does not write the article. If that line moved on, the proposal is dropped.

Accepting that proposal is a later, separate act. It patches only that claim’s body text and ledger text, keeps marks and citations, and records a `user_edit` revision. The article line changing is the receipt. A stale, vanished, split, or specialized claim is not applied.

A named premise can sit beside the original line in the same pocket. Empty slots stay empty. A recorded passage already beside the sentence — today's source, today's other, or a Then source that still differs — can be kept as what still holds, or as what remains unknown. A Then question or draft cannot. The original survives. If the live line moved on, the experiment is dropped. Library may suppose; it still cannot propose or accept.

An earlier recorded wording can sit beside today in the same pocket. Identity is that claim's prior revision (or history fallback). Recorded sources attached to that claim in the snapshot sit under Then when they still differ from today. A historical door opens only when the snapshot's own href or original URL is a different identity from today's live source or live other. If that snapshot bound a question or notebook draft to the claim, that recorded line sits under Then. A draft cannot forge Then. Library stays silent.

Copy with source takes the exact saved passage, its recorded title, and the existing door. Ordinary Copy is unchanged. A private mark is not copied. A missing door stays missing. A Then question or draft is not a source.

A second recorded passage can sit beside the first in the same pocket. Identity is that claim's attached sources. The person names how they meet and where that stops. The space between is theirs to write, and stays empty until they do. A note written there can stay a note, be kept as an unfinished experiment — the existing pressure act, their words as the premise — be proposed as the Wiki line — the existing proposal, their words, against the live line — or be kept as an essay — a snapshot of their words, not the Wiki line, able to remain after the meeting is left. A draft cannot forge the second source. Library stays silent.

Do not read a green script as longitudinal value. Do not read a preview deploy as production.

## What stays closed

Public shares. Workspace composer. Repo dossiers, company dossiers, investment dossiers, living theses, research editions. Server-sync of private drafts. Generated inspection of whether a wording is warranted. Generated matches between sources. A reconstructed biography of everything written then. Horizons (exhibits, rehearsal, instruments, two Libraries, sharing).

## Taste pass

**Wiki claim → source**
- Eligibility: claim mark with citation indexes or ledger `sourceRefIds` pointing at a `sourceRef`, on an owned ordinary Wiki in read mode.
- Quality bar: identity only. The line on the page wins over ledger text and over a stored draft. A citation quote that no longer matches the source snippet is an older copy.
- Silence: no source, a gone source, a vanished claim, a specialized page, a workspace, or a public share. Filler is never the answer.

**Library surrounding**
- Eligibility: a focused saved highlight on an owned Library article.
- Quality bar: saved prefix/suffix, or an exact unique slice (offset only to disambiguate repeats).
- Silence: missing surrounding stays missing.

**Companion bound sources**
- Eligibility: an opened claim on an owned ordinary Wiki in read mode.
- Quality bar: the same attached citation the pocket would show, title only on the rail.
- Silence: 0, or “Nothing beside this sentence yet.” A generated reply is never Accept-to-rewrite.

**Proposed wording**
- Eligibility: a changed provisional line on an opened owned Wiki claim, against the current accepted text; or a note written in the space between two bound passages, when that note is not the live line and not the current provisional wording.
- Quality bar: identity only (that claim and that accepted line). The words are the person's. The space between is not copied into the wording field just to propose.
- Silence: unchanged wording cannot propose; a between note that repeats the live line or the provisional line does not add a second Propose; the live line moved on → drop; Library does not propose.

**Accepted wording**
- Eligibility: a live proposal on an opened owned ordinary Wiki claim; `against` is the current accepted line; the claim is a single marked text node.
- Quality bar: identity only. That claim, that against-line, exact body-text replace. Marks and citations stay. The person is the author.
- Silence: no live proposal; unchanged wording; the live line moved on → 409 `stale_claim`, do not apply; vanished claim; split or ambiguous mark; specialized/workspace/share; Library does not accept; agent tokens 403. Filler is never the answer.

**Under pressure**
- Eligibility: an opened sentence (Wiki pocket or Library passage).
- Quality bar: the person names premise / still-holds / unknown. A still-holds or unknown slot may hold an exact recorded passage already bound in the pocket (live source, live other, or a Then source that still differs). Identity `against` is the current accepted line. No generated causal chain. No generated support.
- Silence: empty slots stay empty; still-holds or unknown without a named premise do not keep the walk; a named meeting does not fill a premise by itself; a Then question or draft cannot be kept as support; a neighboring unattached source cannot be kept; the same passage cannot occupy both slots; the live line moved on → drop the experiment; do not invent consequences. Filler is never the answer.

**Then / Now**
- Eligibility: an opened Wiki claim with a prior recorded wording in revisions (or history fallback) that differs from the live marked line.
- Quality bar: identity only. That claim, exact recorded text. No similar-text repair. No generated biography.
- Silence: no earlier different wording; a pruned snapshot; Library. Filler is never the answer.

**Two pieces meet**
- Eligibility: an opened Wiki claim with a second attached sourceRef of a different identity and a different passage than the live source.
- Quality bar: identity only. Those two recorded passages. The person names the relation and the limit. The space between is theirs. A note written there can stay a note. A note kept as an experiment is the existing pressure act, their words as the premise. A proposal from that note is that person's wording against the live line. An essay from that note is a snapshot of their words, not the Wiki line. No similar-text repair. No generated match. No synthesized paragraph. No invented chain.
- Silence: one source; a duplicate identity; the same passage twice; a neighboring unattached source; recorded work (question / notebook); Library; relation empty and the space between empty (limit-only does not keep the walk); the live line moved on → drop the naming. Filler is never the answer.

**Historical quotation**
- Eligibility: Then is showing from a revision whose `before` binds an attached source for that claim, with a recorded passage that differs from today's live source and live other.
- Quality bar: identity only. That sourceRef, exact recorded quote or snippet. No similar-text repair. No generated biography.
- Silence: history fallback (no snapshot); pruned snapshot; missing or unavailable historical source; passage already matches today or today's other. Filler is never the answer.

**Historical version**
- Eligibility: a Then source is showing, and the snapshot source has an owned or original door whose identity differs from today's live source and live other doors.
- Quality bar: identity only. That snapshot sourceRef's recorded href or url. Exact. No constructing a Library URL from today's highlight. No wayback invention. No today's Library door pretending to be Then.
- Silence: same door as today; no url on the snapshot; history fallback; Library host. Filler is never the answer.

**Contemporaneous scene**
- Eligibility: Then is showing from a revision whose `before` binds more than the live source — another attached passage, a question, or a notebook draft — still different from today.
- Quality bar: identity only. Those snapshot sourceRefs and recorded work. Exact. Assembled beside today. No similar-text repair. No generated biography. No filling from neighboring unattached sources.
- Silence: same passage as today or today's other; unattached neighbor; history-only Then with no snapshot work; Library host. Filler is never the answer.

**Recorded question / draft**
- Eligibility: Then is showing from a revision whose `before` binds a `question` or `notebook` sourceRef to that claim, or a user `history.note` whose text is the Then line.
- Quality bar: identity only. That claim, exact recorded snippet, title, or note. No similar-text repair. No generated biography. A question is not copied into today's "Leave this open."
- Silence: history-only Then with no user note; pruned snapshot; Library; a neighboring type; a note that already equals the live question or distinction. Filler is never the answer.

**Copy with source**
- Eligibility: a bound inspectable passage in the pocket — today's source, today's other, or a Then source.
- Quality bar: exact saved words, recorded title, existing href only. Ordinary Copy is unchanged.
- Silence: no passage; unavailable source; Then question or draft; a passage already here keeps the quote and title and does not invent a Library URL. Filler is never the answer.

## Separately authorized

Dogfood is founder-approved. An authenticated production walk is not this record. It needs a person on an owned account. Do not read a green script or an auto-deploy as that walk.
