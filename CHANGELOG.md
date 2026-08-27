# Changelog

## 1.2.0.0 — 2026-08-27

### Added

- A durable, cross-room agent conversation that follows the active Library, Think, Wiki, or Judgment context.
- An explicit intent kernel, capability broker, and task-aware model router for answer, retrieval, planning, drafting, and reviewable actions.
- Schema-bound Library organization plans that are ownership-validated, staged for human review, and reversible after application.

### Changed

- OpenRouter is preferred when configured, with bounded model routes and automatic Hugging Face fallback for eligible non-streaming failures.
- Agent replies now carry inspectable intent, capability, model-route, and upstream-attempt metadata.

### Fixed

- Model output is validated before any streaming text is released to the interface, preventing malformed plans or hidden reasoning from leaking through partial responses.
- Agent threads preserve exact room identities across navigation without carrying pending page-bound writes to a different surface.

## 1.1.0.1 — 2026-08-13

### Changed

- Real Judgment dossiers now open in the account-backed Board posture by default, with Case one click away for canonical editing.
- Board evidence selection now retargets the persistent agent to the exact Library source identity.

### Fixed

- The Judgment board is no longer restricted to the artificial preview route.
- Four board lanes remain visible at Safari-sidebar widths without colliding with the agent rail.

## 1.1.0.0 — 2026-08-13

### Added

- Move through Library, Think, Wiki, and Judgment as one coherent product without losing context.
- Work a living Judgment case through its dossier, decisions, reviews, outcomes, lessons, and spatial board.
- Insert grounded Library, Wiki, question, concept, and note objects directly into the Think notebook.
- Carry an exact highlighted passage from Library into Think with its provenance intact.

### Changed

- Library now foregrounds the reading surface with a persistent Librarian posture.
- Wiki keeps ordinary pages article-first and Library-grounded while exposing the thought partner on desktop and mobile.
- Judgment navigation, retrieval, chapter editing, evidence trace, and preview interactions now operate as one living case workflow.

### Fixed

- Workspace references are authorized and canonicalized against the current owner before read or persistence.
- Concept switching cannot merge an outgoing notebook into the incoming concept during hydration.
- Repeated passages fail closed unless the selected occurrence matches the stored highlight anchor.
- Decision-history failures and truncated coverage no longer imply missing outcomes or lessons.
