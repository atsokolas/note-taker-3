# Reading talks back — Stage 2

Stage 2 makes the sentence loop reversible. Its first slice closes the weakest
source-to-judgment seam without changing ordinary Wiki generation, dossier
structure, or agent authority.

## Slice 2A — exact evidence deposit

- A saved Library highlight may appear as Why or Against only when the existing
  sentence matcher says it covers a held judgment.
- Filing resolves the article and highlight again on the server. Client text,
  titles, ownership, and timestamps are never trusted.
- Only the human owner may file the passage.
- The write binds the exact held-sentence hash, article, highlight, response
  field, Wiki revision, Noeis receipt, and request id in one transaction.
- Identical replay is idempotent. A second request cannot file the same passage
  twice, and a changed held sentence fails closed.
- A missing highlight-arrival clock does not block useful evidence, but it does
  keep the response-time metric blank.
- The Mirror's visible counter-evidence number reads only complete, post-birth,
  receipt-bound arrival-to-response clocks. The older conflict-to-revision
  approximation has been removed.
- After a successful receipt, the shared Ariadne thread briefly traces Why or
  Against to the held sentence. Failed writes draw nothing; reduced motion keeps
  only the quiet provenance knot.
- The direct article reader mounts the same passage door used by Library's
  supporting views and reuses its already-loaded Judgment index. There is no
  second write path and no second Wiki-list request.

## Slice 2B — the notebook remembers where reading began

- Sending a saved highlight to Notebook preserves the exact article and
  highlight in the Library URL, then opens the resulting notebook page instead
  of leaving the user in a closed modal.
- The notebook entry persists article id, article title, and highlight id on the
  embedded block. Older entries reconstruct the same return from their linked
  identities.
- A single source resolver now serves both concept-derived and Library-derived
  notebook pages. The prior duplicated provenance branches were removed.
- Library-derived pages show an Ariadne thread directly beneath the title. It
  returns to the exact saved passage after reload, Back, and Forward without
  crowding the writing surface or duplicating the link.
- The thread arrives with one restrained gold stroke. Reduced-motion users get
  the static provenance mark with no animation.

## Local proof

- Focused service and route tests cover ownership, exact identities, duplicate
  suppression, idempotent replay, revision and receipt binding, generic-edit
  preservation, and honest Mirror calculation.
- Focused Library, highlight, passage-door, Judgment, shared Ariadne, and CSS
  suites cover the source-side interaction and failure state.
- The optimized frontend build passes with no model request.
- An authenticated local browser filed an Against passage, survived reload,
  opened the exact held judgment, and returned through its citation to the exact
  article and highlight. The Mirror then showed the receipt-bound response as
  less than a day.
- Rendered source-return evidence at 1440px, 1320px, and 430px is stored under
  `output/playwright/reading-talks-back-stage2-2026-08-31/`.
- The exact QA article, page, revision, receipt, embedding job, and vector row
  used for the rendered proof were removed after acceptance.
- The Slice 2B focused backend and frontend suites pass, including the notebook
  editor, context, modal, Library agent, and Think shell (69 frontend tests).
- An authenticated browser sent an exact saved passage into a new notebook
  page, reloaded it by exact entry id, returned to the exact Library article and
  highlight, then came Back to the same notebook page. The named recent note
  remained first in the rail.
- The Slice 2B note, two ignored source events, and its queued embedding job
  were removed after acceptance; it produced no vector or Wiki revision.

This is local implementation evidence. It is not merge, deployment, production,
or full Stage 2 exit evidence.

## Remaining Stage 2 work

1. Repeat the persisted evidence round trip on disposable Mongo so the browser
   proof can be replayed without leaving QA records in the configured database.
2. Verify Keep survives reload and appears at the expected Library and Think
   return surfaces.
3. Run the complete source → thought → source acceptance loop before declaring
   Stage 2 closed.
