# Ambitious flow design QA — 2026-08-10

## Outcome

Local implementation and rendered QA pass for the Library, Think home, Wiki
return surface, and repo dossier corrections in this slice. This is not commit,
merge, deploy, or production proof.

## Product-flow changes

- Library's default mixed-source landing request now uses a bounded recent scan
  and defers full knowledge-movement classification until a connection-oriented
  view is requested. The UI labels the result as a partial scan.
- Library's first load coalesces duplicate in-flight requests and uses an honest
  loading message. At 430px, the page title and three actions no longer overlap.
- Think home removes templated rebuild prompts from return surfaces without
  deleting them or removing them from explicit search.
- At 1120px and below, Think home leads with the active thread and primary next
  move. The corpus shelf and thought-partner context follow it.
- Think home's inline shelf is capped at twelve entries and reports the hidden
  remainder; the complete corpus remains available through the shelf index.
- Wiki movement summaries group semantic claim effects first and put raw
  claim-level transitions behind an explicit disclosure.
- Repo dossier table-of-contents keys include block identity, removing duplicate
  React keys without changing page content.

## Rendered checks

- Library real corpus, signed-in local account: cold reload completed in about
  0.85 seconds after the server-side repair; the earlier request took more than
  10 seconds and was still loading.
- Library: no horizontal overflow at 1440px, 1320px, or 430px.
- Think home: at 430px the primary move precedes the shelf, generic rebuild
  prompts are absent, the inline shelf is bounded, and horizontal overflow is
  zero.
- Think home: at 1320px the 260 / 640 / 320 three-column composition remains
  intact with no horizontal overflow.
- Repo dossier: loaded from the real local API with no duplicate-key warning or
  console error.
- Wiki return surface: quiet-state rendering is honest when there is no movement
  in the current window. Grouped movement content is covered by focused tests;
  the live account had no current movement with which to exercise that branch.

## Automated checks

- Mixed-source service and route tests: pass.
- Focused frontend suite: 9 suites, 134 tests pass.
- Production frontend build: pass.
- `git diff --check`: pass.

## Status against the ambitious plan

- Stage 1 — Wiki return surface: implemented; hierarchy improved, but a full
  Imagen side-by-side visual approval remains.
- Stage 2 — Library as source memory: implemented and materially faster; the
  bounded scan is an honest local scale fix, not the final indexed-query
  architecture for very large corpora.
- Stage 3 — Concept investigation: implemented in the release line; not changed
  by this slice.
- Stages 4–5 — human disposition, decisions, outcomes, retained lessons:
  implemented in the release line; not re-proven end to end by this visual slice.
- Stage 6 — spatial Field: still gated on real owned-corpus readiness. Do not
  enable it from fixture density or visual readiness.
- Stage 7 — downstream dossier, repo, weekly edition, and public proof surfaces:
  implemented as bounded surfaces; production acceptance remains separate.

## Remaining design closure

1. Run a human Imagen comparison across Library, Wiki, Think home, Concept, and
   decision/outcome surfaces at 1440px, 1320px, and 430px.
2. Decide whether the persistent thought-partner rail should remain visible by
   default or become contextual to the user's current consequential move.
3. Replace bounded in-process Library scans with an indexed relevance/read model
   before treating multi-thousand-item performance as architecturally complete.
4. Re-run the full consequence loop from a clean release candidate, then keep
   commit, merge, deploy, and production proof as distinct gates.
