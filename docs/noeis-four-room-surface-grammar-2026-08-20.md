# Noeis four-room surface grammar

## Thesis

Noeis should feel like one warm editorial instrument, not four adjacent applications. The shell, typography, orientation, status, contextual agent, provenance, and action grammar stay familiar. The central plane changes character because each room does different work.

The unifying motif is a quiet thread: source material enters through Library, is worked in Think, settles in Wiki, and can become a consequential call in Judgment. The thread is an orientation device, not decoration and not a forced linear workflow.

## The fixed grammar

Every primary room inherits these rules:

1. The persistent top bar, command palette, system status, and contextual agent do not remount between rooms.
2. One central plane is visually dominant. Rails orient and assist; they do not compete with the work.
3. Object identity, provenance, status, and next action use the same language and ordering.
4. Proposals remain visibly separate from accepted material until the human accepts them.
5. Loading, empty, failure, and saved states are written in plain language and preserve the user's place.
6. Desktop may keep context open. Mobile protects reading and writing, with context in a deliberate drawer.

## What each room is allowed to specialize

| Room | User job | Dominant plane | Context should answer | Character |
| --- | --- | --- | --- | --- |
| Library | Recover and inspect source material | Source list or reading room | Where did this come from, how is it connected, where can it go? | Browsing, provenance-rich, quick to scan |
| Think | Develop an unfinished idea | Note, question, or concept workspace | What evidence or tension would move this thought? | Writable, spacious, permissive |
| Wiki | Read and maintain accepted knowledge | Article | What changed, why is it trusted, what needs review? | Article-first, calm, reference-like |
| Judgment | Make and revisit a consequential call | Claim and its rationale | What evidence bears on this, what was decided, what happened? | Deliberate, sparse, high-accountability |

The shared frame must never turn these into the same three-column template. It provides vocabulary and behavior; each room chooses the appropriate composition.

## Surface contract

Each room may declare:

- `identity`: room, object type, stable object id, and human title.
- `orientation`: one sentence explaining where the user is and why it matters.
- `status`: honest current state, including loading or failure.
- `actions`: one primary next move and a small number of secondary moves.
- `context`: provenance, connections, tensions, or history appropriate to the room.
- `agent`: what the contextual agent may inspect and what requires acceptance.

Route defaults provide a safe identity before page data arrives. A page can refine that identity when its exact object loads. Missing exact identity must remain visibly unresolved rather than binding to a similarly named object.

## Joy without noise

Joy should come from the system remembering, responding, and making progress legible.

- The active room carries a fine gold thread that settles into place on navigation.
- Hover and focus responses use a small ink shift or two-pixel movement, not floating cards.
- Saving or accepting should resolve with a short tactile state change and a durable receipt, not confetti.
- Returning to earlier work should feel like recognition: restore the exact object, selection, and context.
- Greek references may appear as restrained structural details or language, never as unexplained controls.
- `prefers-reduced-motion` removes travel and scaling while retaining color, underline, and status changes.

Avoid points, streak pressure, generic badges, gradients across ordinary content, decorative constellations, and motion without information.

## Migration order

1. Shared shell identity and active-room thread.
2. Library: normalize source identity, provenance, and mobile context drawer without weakening browsing.
3. Think: normalize orientation and proposal separation without constraining the writing plane.
4. Wiki: normalize article identity and maintenance status without importing dossier structure into ordinary pages.
5. Judgment: normalize accepted basis, decision, outcome, and lesson chronology without turning the claim into a dashboard.
6. Prove the cross-room return loop: Library source -> Think work -> accepted Wiki -> Judgment -> exact return.

## Acceptance

- The same person can identify the current room, current object, provenance, status, and next move without relearning the interface.
- Library, Think, Wiki, and Judgment remain visibly different in service of their jobs.
- Desktop rails are open where context improves the task; mobile drawers do not cover or compress the primary work by default.
- Navigation and state changes are pleasant at 1440px, 1320px, and 430px, with reduced motion honored.
- No shared component invents persistence, readiness, acceptance, or provenance that the underlying contract does not provide.
