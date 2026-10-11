# Noeis production UX recovery plan — 2026-08-10

## Outcome

Restore the product realignment in production so Library, Think, and Wiki feel like one calm knowledge workspace, recover from a sleeping API without a manual reload, and expose the user's real corpus instead of hiding it behind decorative or duplicated rails.

## Visual thesis

A warm editorial folio with one dominant reading or working plane, one useful shelving rail, and one quiet agent margin. Serif type carries titles and arguments; restrained sans and mono type carry controls, provenance, and state. Cards appear only when the object is genuinely actionable.

## Content plan

- **Library:** one shelving rail containing source views and folders; one editorial source list; selected-source provenance; a quiet thought-partner margin.
- **Think:** one clear continuation, followed by a linear list of work in motion; the thought partner names actual concepts, questions, notes, and Wikis; operational agent machinery is subordinate.
- **Wiki:** one lead living page, a short changed-pages list, and a searchable library of every Wiki page; creation and maintenance controls remain secondary.

## Interaction thesis

- Read-only requests survive a transient sleeping backend through one coalesced recovery cycle and replay once; writes are never retried automatically.
- Selecting a folder, source, thought, or Wiki changes the central plane without introducing another competing rail.
- Desktop keeps the useful shelving and context rails open. Mobile moves them into deliberate drawers with Escape and focus return.
- Motion is limited to short focus and disclosure transitions and is removed under `prefers-reduced-motion`.

## Passes

### R1 — Automatic service recovery

- Coalesce transient GET/HEAD failures into one health wake cycle.
- Retry each failed read once after recovery.
- Never retry auth failures, cancellations, or mutations.
- Keep the page in an honest loading/recovering state rather than settling into a false empty corpus.

Acceptance: focused retry tests, build, and a cold production-style run that reaches Library, Think, and Wiki without a manual reload.

### R2 — Library information architecture

- Remove the duplicated Cabinet + Source-index rail composition.
- Preserve All material, Unfiled, Highlights, all folders, saved views, and source-memory views in one shelving rail.
- Preserve selected-source provenance, exact Source Trace identity, reload, and one-Back return.
- Rebalance list typography and spacing for scanning rather than dashboard-card density.

Acceptance: folders visible, only one shelving rail, exact source selection survives reload/Back, 1440/1320/430 proof.

### R3 — Wiki library

- Keep the calm lead page and recent changes.
- Replace the inline Explore string with a searchable, complete Wiki-page index.
- Use honest page type/status metadata only; do not infer material change from `updatedAt`.

Acceptance: every eligible Wiki returned by the API is reachable from the front page, search works, and the page remains a traditional Wiki rather than a dashboard.

### R4 — Think grounding and hierarchy

- Pass exact question titles to the thought partner; prohibit ordinal-only references when titles are available.
- Ensure the primary continuation opens its exact concept/question/note/Wiki.
- Reduce the right rail to the thought partner plus one subordinate proposals summary; move output and maintenance machinery behind disclosure.
- Replace generic card-grid styling with a linear editorial hierarchy.

Acceptance: a real prompt asking what to resume returns actual titles, the recommended object opens, and reload preserves the exact context.

### R5 — Shared visual closure

- Align type scale, line length, spacing, borders, and labels across Library, Think, and Wiki.
- Verify no clipping, horizontal overflow, or competing visual planes at 1440, 1320, and 430 pixels.
- Compare the rendered result to the Imagen workflow and Library references as a design-direction test, not literal pixel matching.

## User-test script

1. Open cold Library and wait without manually reloading.
2. Confirm folders and all source views are in one rail; open an imported source and inspect provenance.
3. Follow a Wiki relationship, return once, and verify the source selection is restored.
4. Open Wiki and find one known page through the all-pages library.
5. Open Think and ask: “What should I resume first, and why?”
6. Fail if the answer says only “Question 1/2/3” or otherwise omits the real title of its recommendation.
7. Open the recommended item and confirm exact identity survives reload.

## Proof boundaries

Focused tests and a local build are local proof. Authenticated browser behavior is rendered proof. Neither implies merge, deployment, or production correctness until those steps are completed and re-tested independently.
