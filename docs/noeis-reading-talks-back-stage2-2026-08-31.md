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

## Slice 2C — Keep follows the thought home

- A Library-derived notebook page reads Keep through a narrow, owner-scoped
  article projection. It does not fetch article content or introduce a second
  source-of-truth cache.
- The existing Ariadne thread owns the control: `Keep source` becomes `Kept in
  Library` after the human chooses it. The agent cannot make that choice.
- The mutation reuses Library's existing Keep contract and clears the same
  article, room, and relevance caches. Reload therefore reads durable server
  state rather than optimistic notebook state.
- Returning through the exact article and highlight shows the same kept state,
  and the source appears in Library's Kept shelf. Missing, foreign, or
  unreadable source identities stay quiet instead of inventing a status.
- The source-state hook lives with the notebook provenance surface that renders
  it. A redundant parent-shell handoff found during browser QA was removed.

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
- Slice 2C's route contract, 27 focused frontend tests, 84 adjacent Library,
  Think, and article-reader tests, and the optimized frontend build pass. The
  rendered flow issued no model request.
- An authenticated browser kept the exact source from its notebook thread,
  survived reload, returned to the exact article and highlighted passage, and
  found the source in Library's Kept shelf. Desktop, Safari-sidebar width, and
  mobile evidence is stored under
  `output/playwright/reading-talks-back-stage2-keep-2026-08-31/`.

Slices 2A–2C are merged. Slice 2C is deployed: Vercel reports success for merge
`44aa6c82`, and the Render owner-scoped Keep route returns the expected
authentication boundary in production. This does not substitute for an
authenticated real-account product test.

## Slice 2D — cumulative disposable loop

- `npm run reading:talks-back-acceptance` refuses any database whose name does
  not begin `noeis_rtba_accept_` and rejects names beyond Atlas's 38-byte cap.
- A real routed run created one thought, appended one exact owned highlight,
  reloaded the article/highlight identity chain, reconstructed the exact Library
  return door, kept the source, and read the durable Keep state back.
- Foreign-user thought and Keep reads returned no object state.
- The run made zero model calls, created no duplicate source or thought, dropped
  the disposable database, and verified zero collections remained.
- Evidence is stored under
  `output/reading-talks-back-stage2-cumulative-2026-08-31/`.

**Stage 2 exit: PASS locally.** Source → thought → source now works in both
directions without losing identity or state. The next roadmap bet is Bet 3: one
maintenance loop. Stage 2D itself remains local until its small harness and
ledger commit is reviewed and landed.
