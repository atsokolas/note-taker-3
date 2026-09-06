# Open a sentence — S4 evidence

**Date:** 2026-09-05
**Sits under:** [Operable knowledge](noeis-operable-knowledge-vision-spec-2026-09-04.md) §11 S4
**Status:** Selected regression gates and an honest evidence record. Not a production release. Not dogfood.

S4 asked for clean integration, selected regression gates, user dogfood, then a separately authorized release. This document names what each kind of evidence is, and what it is not.

## What this slice did

The pocket already lives on owned ordinary Wiki reading and on a focused Library highlight. S4 names the host gate (`wikiAllowsOpenSentence`: ordinary projection, not workspace) and runs it beside the existing `standardWikiPage` flags so a specialized page cannot open by accident.

Selected gates:

- Pocket, journey, store, binding, and storyboard unit tests
- Surface projection / host eligibility
- Ordinary Wiki read shows Open without opening; workspace, living thesis, investment dossier, and repo dossier do not
- Public shares do not restore a private draft

Those gates run locally as `npm run test:open-sentence` in `note-taker-ui/`, and on pull requests that touch the pocket via `.github/workflows/open-sentence-regression.yml`.

## Evidence, distinguished

| Kind | What it is here | What it is not |
| --- | --- | --- |
| **Local** | Jest in jsdom, including the storyboard journey and the host/share gates. | A person at a real width. |
| **Rendered** | Storyboard stages at 1440 / 1320 / 430, captured by Playwright into `docs/open-sentence-s1-frames/`. Mocked retrieval stays labeled. | Founder approval. A person on an owned account. |
| **Persisted** | Device-save (`localStorage`) and storyboard tab-save (`sessionStorage`) covered by tests. Leftover tab drafts lift onto the device. | Server-sync. Cross-device recovery. |
| **Merged** | This branch / PR only. | `main`. |
| **Deployed** | Vercel preview of the PR, when that check is green. | https://www.noeis.io. |
| **Authenticated-production** | Not run. | Founder account on production, seeded Wiki/Library, or live deleted-source against signed-in data. |

Opening a sentence rebinds the steward to that claim. Ask stays conversation against the accepted page. A generated reply is not offered as a Wiki rewrite.

Proposed wording is a distinct act. It names the current claim and the current accepted line. It does not write the article. If that line moved on, the proposal is dropped.

Accepting that proposal is a later, separate act. It patches only that claim’s body text and ledger text, keeps marks and citations, and records a `user_edit` revision. The article line changing is the receipt. A stale, vanished, split, or specialized claim is not applied.

A named premise can sit beside the original line in the same pocket. Empty slots stay empty. The original survives. If the live line moved on, the experiment is dropped. Library may suppose; it still cannot propose or accept.

An earlier recorded wording can sit beside today in the same pocket. Identity is that claim's prior revision (or history fallback). A draft cannot forge Then. Library stays silent.

A second recorded passage can sit beside the first in the same pocket. Identity is that claim's attached sources. The person names how they meet and where that stops. The space between is theirs to write, and stays empty until they do. A draft cannot forge the second source. Library stays silent.

Do not read a green script as longitudinal value. Do not read a preview deploy as production.

## What stays closed

Public shares. Workspace composer. Repo dossiers, company dossiers, investment dossiers, living theses, research editions. Server-sync of private drafts. Generated inspection of whether a wording is warranted. Generated matches between sources. Turning the space between into a note, an essay, or a Wiki proposal. Historical source versions and contemporaneous drafts as a reconstructed scene. Horizons (exhibits, rehearsal, instruments, two Libraries, sharing).

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
- Eligibility: a changed provisional line on an opened owned Wiki claim, against the current accepted text.
- Quality bar: identity only (that claim and that accepted line).
- Silence: unchanged wording cannot propose; the live line moved on → drop; Library does not propose.

**Accepted wording**
- Eligibility: a live proposal on an opened owned ordinary Wiki claim; `against` is the current accepted line; the claim is a single marked text node.
- Quality bar: identity only. That claim, that against-line, exact body-text replace. Marks and citations stay. The person is the author.
- Silence: no live proposal; unchanged wording; the live line moved on → 409 `stale_claim`, do not apply; vanished claim; split or ambiguous mark; specialized/workspace/share; Library does not accept; agent tokens 403. Filler is never the answer.

**Under pressure**
- Eligibility: an opened sentence (Wiki pocket or Library passage).
- Quality bar: the person names premise / still-holds / unknown. Identity `against` is the current accepted line. No generated causal chain.
- Silence: empty slots stay empty; still-holds or unknown without a named premise do not keep the walk; the live line moved on → drop the experiment; do not invent consequences. Filler is never the answer.

**Then / Now**
- Eligibility: an opened Wiki claim with a prior recorded wording in revisions (or history fallback) that differs from the live marked line.
- Quality bar: identity only. That claim, exact recorded text. No similar-text repair. No generated biography.
- Silence: no earlier different wording; a pruned snapshot; Library. Filler is never the answer.

**Two pieces meet**
- Eligibility: an opened Wiki claim with a second attached sourceRef of a different identity and a different passage than the live source.
- Quality bar: identity only. Those two recorded passages. The person names the relation and the limit. The space between is theirs. No similar-text repair. No generated match. No synthesized paragraph.
- Silence: one source; a duplicate identity; the same passage twice; a neighboring unattached source; recorded work (question / notebook); Library; relation empty (limit-only or writing-only do not keep the walk); the live line moved on → drop the naming. Filler is never the answer.

## Separately authorized

User dogfood and production release are not this PR. They need a person on an owned account, then a distinct authorization to merge and ship.
