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

Do not read a green script as longitudinal value. Do not read a preview deploy as production.

## What stays closed

Public shares. Workspace composer. Repo dossiers, company dossiers, investment dossiers, living theses, research editions. Accepted Wiki write. Server-sync. Horizons (exhibits, rehearsal, instruments, two Libraries, sharing).

## Taste pass (unchanged)

**Wiki claim → source**
- Eligibility: claim mark with citation indexes or ledger `sourceRefIds` pointing at a `sourceRef`, on an owned ordinary Wiki in read mode.
- Quality bar: identity only. The line on the page wins over ledger text and over a stored draft. A citation quote that no longer matches the source snippet is an older copy.
- Silence: no source, a gone source, a vanished claim, a specialized page, a workspace, or a public share. Filler is never the answer.

**Library surrounding**
- Eligibility: a focused saved highlight on an owned Library article.
- Quality bar: saved prefix/suffix, or an exact unique slice (offset only to disambiguate repeats).
- Silence: missing surrounding stays missing.

## Separately authorized

User dogfood and production release are not this PR. They need a person on an owned account, then a distinct authorization to merge and ship.
