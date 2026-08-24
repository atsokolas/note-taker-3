# Noeis four-room Imagen acceptance specification

Status: authoritative visual acceptance target
Date locked: 2026-08-24

## Authority

The four images below are the visual specification for the authenticated Noeis rooms. They are not mood boards. A room is not complete because it uses similar colors or has three columns; its rendered composition, hierarchy, density, rail behavior, typography, and interaction emphasis must be recognizably faithful to its reference.

The example titles, counts, names, dates, and evidence in the images are illustrative. Runtime data must remain truthful and account-grounded.

| Room | Authoritative image | SHA-256 |
| --- | --- | --- |
| Library | [library.png](assets/noeis-four-room-imagen-acceptance-2026-08-24/library.png) | `c3f06c23f95404ee691ffbdfa3da09a17780e21b8c0248fcdb5b02b4c9334435` |
| Think | [think.png](assets/noeis-four-room-imagen-acceptance-2026-08-24/think.png) | `df376af79f52ed3e21e84989e41755a304ac3a3cd374abcb0324717630b8da3d` |
| Wiki | [wiki.png](assets/noeis-four-room-imagen-acceptance-2026-08-24/wiki.png) | `f4ae9d51ea3d1b85dcc8c32fdd72fca370a2e6a92763c5279813eb74b7ad29e8` |
| Judgment | [judgment.png](assets/noeis-four-room-imagen-acceptance-2026-08-24/judgment.png) | `21282f52d802464fc4190357bbf4702a5125bb0f087bb3bcfe20553fc99fe08f` |

## Shared acceptance contract

Every room must satisfy all of these conditions:

1. A persistent, calm top navigation identifies the active room without oversized chrome.
2. The left collection shelf is open on desktop, searchable, count-aware, and visually continuous across rooms.
3. One central object dominates the screen. Secondary navigation never competes with the work.
4. One native contextual agent occupies the right margin. It uses the room's language and exact selected-object context; it must not look like a generic chat widget pasted onto the shell.
5. Warm paper, ink typography, restrained brass accents, fine rules, and sparse Greek details form one coherent visual system.
6. Saved objects use a recognizable cross-room grammar while each room remains specialized for its job.
7. Mobile protects the central reading or writing plane; shelves and agent context become deliberate drawers with focus return.
8. The rendered implementation is compared beside the corresponding reference at 1440px, 1320px, and approximately 430px. Tests or component existence do not substitute for this comparison.

## Library acceptance

- Left column: Library identity, total object count, search, primary source states, and real shelves/folders.
- Middle-left column: a calm, scannable source list with selection state, title, author/source, and date.
- Center: the selected article is the dominant reading object with title, metadata, readable body, provenance, highlights, and quiet object actions.
- Right: a Source Guide/Librarian explains the selected source, finds related evidence, and carries exact highlights into Think.
- The browse state and reading state must feel like postures of the same Library, not unrelated pages.

## Think acceptance

- Left: Notebook, Concepts, Questions, and Drafts share one shelf grammar with counts and selection.
- Center: one fluid, Notion-like document surface; the selected concept/question/note is editable in place and remains visually dominant.
- Grounded material appears inside the document flow or at an exact insertion point, not in a competing canvas.
- Right: the Thought Partner responds to the selected object, shows bounded evidence, and offers native challenge/develop actions.
- The page must not show both an embedded thought partner and a generic global agent rail.

## Wiki acceptance

- Left: searchable Wiki collection with truthful counts and explicit groups for General wikis, Repository wikis, and Investment dossiers.
- Every row/page carries a clear type flag. Filtering a group yields only that contract.
- Center: ordinary Wiki pages remain reference-like, article-first, structured, cited, and readable. Repository wikis and investment dossiers retain their specialized readers.
- A stable contents/navigation column supports long articles without squeezing the prose.
- Right: the Wiki steward shows review attention, contradictions, source proposals, and maintenance state without mixing proposals into accepted knowledge.

## Judgment acceptance

- Left: cases, claims, decisions, outcomes, and lessons use the same collection language as the other rooms.
- Center: an open case foregrounds the governing question, current judgment, confidence/posture, supporting evidence, counterargument, unknowns, chronology, and next observation.
- Right: the skeptical/calibration partner surfaces counterevidence and the next test with explicit accept/defer actions.
- Exact accepted source, claim, revision, decision, outcome, and lesson identities remain inspectable. Missing continuity stays visibly unresolved.

## Wiki type contract

The Wiki index and reader must expose one stable `wikiKind`:

- `general` — ordinary personal-library Wiki pages.
- `repository` — repository-tracking Wikis with the repository reader and watch behavior.
- `investment` — investment dossiers whose consequential evaluation belongs in Judgment while the accepted research remains readable as Wiki knowledge.

The UI may derive this flag from authoritative persisted fields at serialization time, but it must never infer a repository or investment contract from title wording alone.

## Release gate

Acceptance requires all of the following evidence, reported separately:

- focused component and contract tests;
- optimized production build;
- fresh rendered screenshots for all four rooms at 1440px, 1320px, and approximately 430px;
- side-by-side visual comparison against the four checksummed images;
- keyboard, focus-return, and reduced-motion checks;
- merge, deployment, and authenticated production acceptance when landing is authorized.

Any material mismatch in composition, hierarchy, room-native agent behavior, or central workbench capability keeps the visual specification open even when automated tests pass.
