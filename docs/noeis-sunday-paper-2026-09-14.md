# Editions — Sunday Paper

Scope: private Editions only. Reference: the supplied `sunday-paper-v2.html`.
Baseline: main `16d8b5c5`; isolated branch `codex/editions-sunday-paper-2026-09-14`.

## Architecture decisions

- Replace `Editions`' nested FrontPage/Column/Story and `EditionRead`'s duplicate
  finding implementation with one private issue reader. Keep the intentionally
  separate public `EditionPaper` and frozen `EditionShare` contract.
- Keep `byPaper`, `standLayout`, section ordering, required boundaries, empty
  sections, provenance and saved/Later semantics. A section is not a column.
- Global New arrivals lives in an explicitly opened Editions utility panel.
- Source inspection uses the owner-authorized existing article detail API.
  Show plain readable text, never unsanitized source HTML or invented excerpts.
- Existing Article highlights require an article and imply source text; Notebook
  creates a separate authored work. Existing `Note` is the minimal private text
  store. Reuse it with a scoped Edition context for thoughts/reflections rather
  than creating another notes model. Human-only routes and explicit projection
  keep these notes out of agent filings and public snapshots.
- Local reading position and recoverable thought drafts are isolated by account
  and issue. Resume has no completion metric. Background updates wait for Show.
- No demonstrated high-confidence grounded connection contract was found in
  Editions; omit the prototype's sample connection.

## Slices

1. Structure and common private reader.
2. Source peek, Keep/Later, honest source receipts.
3. Stable arrivals, resume and Just read.
4. Private thoughts and reflection using existing notes storage.
5. Responsive, keyboard, motion, public-share and rendered regression checks.

Verification and deliberate prototype differences will be recorded here.

## Implemented

The stand and direct issue routes now share `EditionReading`. Publication identity
stays above the dated issue selector. The lead follows configured ordering;
findings and boundaries are open, including meaningful empty named sections.
Global arrivals and archive open independently of any publication. Existing
source lists, multi-agent item provenance, Keep, Later and snapshot sharing remain.

Source inspection is a nonmodal right-side dialog on wide screens and a native
modal sheet below 1200px, with no dark scrim. Escape returns to the source control.
Saved Library text is rendered as plain paragraphs; unavailable text is explicit.
Keep leaves the reading in place, links to the saved article, and offers an optional
reason. Saved-but-unreadable feedback survives reload.

Issue refresh runs once a minute while visible and filling. Updates wait for Show;
accepting them preserves the current finding's viewport position. A concurrent
refresh cannot erase a just-completed Keep in the UI. Account-scoped device state
remembers the issue and finding, and offers a return door without progress scores.
Just read hides Editions utilities without changing paper width or vertical layout.

Thoughts retain a selected quote and remain independent of agent filings. A closing
reflection gives the paper an ending. Writes compare saved revisions; conflicting
or failed saves keep the draft and offer explicit recovery. Unsubmitted drafts and
reading position stay on this device. Saved thoughts are account-persistent.

## API and model

- `GET /api/editions/:id/thoughts`: owner/human-only projection of private thoughts.
- `PUT /api/editions/:id/thoughts`: `{itemId, content, quote, revision}`; empty itemId
  means issue reflection. Text is bounded to 6000 characters, quote to 1000.
- Existing `Note` gains optional `editionContext` (editionId, itemId, quote, revision)
  and a partial unique index on owner/edition/item. No new collection. Deployment
  must verify this index before accepting first writes; local integration creates
  and exercises the actual index. Existing notes require no backfill.
- Article detail, Keep/Later and public snapshot APIs are reused. No public snapshot
  fields or public renderer were changed. Share copy explicitly excludes thoughts.

## Replacement and cleanup

- `EditionReading`, `EditionFinding`, and `useEditionIssue` replace FrontPage,
  Column, Story and the duplicate private EditionItem/save state in EditionRead.
- `EditionPanel` / `SourcePeek` own one reading's finding/source/thought inspection.
- `ThoughtComposer` reuses Note persistence; `editionReadingState` isolates device
  state using the existing account-scoping utility.
- `edition-reading.css` replaces the obsolete folded-story/multi-column CSS.
  Shared/public styling remains in `editions.css`. Removed the unused grid-count
  helper and its obsolete implementation test; other domain helpers are unchanged.
- `editionThoughtRoutes` provides the bounded human-owned note interface;
  `verify_edition_reading.js` replaces ad-hoc persistence checks with a reusable,
  loopback-only real-Mongo verification and optional local fixture preview.

## Verification

- 109 frontend tests across 10 suites: private reader, domain helpers, arrival
  races, source list, thought drafts/conflicts/account scope, HTML text extraction,
  public sharing, public paper and responsive/motion style contracts.
- 82 existing backend tests: Edition routes, shapes and cadence.
- Real local Mongo/Express integration: unique concurrent first write, stale-version
  refusal, owner isolation, agent denial, quote and reflection readback, bounded
  input, missing findings, public-note exclusion, frozen shares/revoke, Keep and
  unreadable Later placement. All pass; no production data or model calls.
- Optimized production build (including lint) and diff check pass.
- Chromium and WebKit at 1440, 1024, 768 and 390px, reduced motion: no overflow;
  first finding in the initial viewport; unchanged reading width in source/focus;
  no tablet focus reflow; keyboard Escape/focus return; named empty sections.
  Chromium additionally verifies real Keep/source content, selection/quote note
  save/reload, reflection/reload, Later/unreadable/reload, resume and publication
  switching. Zero page errors. WebKit is not physical iPhone/native Safari proof.
- Screenshots and machine receipt: local `output/sunday-paper/`; test/build logs:
  ignored `tmp/`. Fixtures are labelled and stored only in `noeis_sunday_paper_qa`.

## Intentional differences and limits

- Keep existing NOEIS global navigation and type tokens; no prototype header or
  sample connections. Publication selectors use accessible native controls.
- Keep configured section order and real provenance; no client importance ranking,
  invented standfirst, attendance claims, fake excerpts or generated reflections.
- Source text is safe plain text rather than embedded publisher HTML/images.
- Resume and unsubmitted drafts do not sync across devices. If browser storage is
  unavailable, the composer says to save before closing. Explicit Save is deliberate;
  there is no silent autosave success claim.
- Archive lists up to 500 issues; direct links resolve older issues. Native touch,
  IME and longer-term voluntary return behavior remain user acceptance checks.
- Production deployment and index verification remain separate from local proof.

## User test

Use the isolated preview's `/__qa` entry at http://127.0.0.1:3105/__qa. This logs
into the local fixture only. Nothing here edits your production Library.

1. Read the lead without opening it. Switch publication, then dated issue; check
   that Counterevidence remains even when empty. Open New arrivals: both papers
   belong to the global utility, not the current masthead.
2. Open Source. On desktop the paper keeps its measure; on phone close the focused
   sheet and return to the same passage. Tab through it and use Escape.
3. Keep a reading. It stays in the issue. Open its source again to see the real
   stored fixture text; use Later on the last reading to see the unreadable-link
   distinction. Reload and check both states.
4. Select a few words and Leave a thought. Save, close and reopen/reload. Check the
   selected quotation and your words. Leave a closing reflection and revisit it.
5. Scroll to another finding and return to Editions. Use Back to where you stopped.
   Toggle Just read and check that the lines stay exactly where they were.
