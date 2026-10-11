# Noeis ambitious knowledge system — implementation plan

**Status:** Proposed implementation plan  
**Date:** 2026-07-27  
**Owner:** Athan  
**Product frame:** One maintained knowledge and judgment system, not separate product modes

## 1. Objective

Build the smallest honest version of this user loop:

> Import existing knowledge → surface a consequential change → inspect its provenance → investigate it in Think → review a proposed Wiki revision → accept or preserve the current judgment → record a decision → observe an outcome → retain the lesson.

The system must preserve the same source, evidence, claim, Concept, Wiki revision, decision, and outcome throughout. It must not generate a disconnected document at each step.

## 2. Product decisions locked for implementation

1. **Do not add five permanent top-level product modes now.**
   - Keep the current `Library / Think / Wiki` architecture.
   - Implement the first Field experience as the editorial return surface on the existing Wiki front page.
   - Implement Decisions first as a cross-page read model over existing Wiki judgments, not as a new standalone product or database collection.

2. **Library remains source memory.**
   - Preserve original source text, author, date, URL, highlights, notes, import identity, and provider provenance.
   - Relevance and connections are views over sources; they do not replace or rewrite the source.

3. **Think remains the active workspace.**
   - Reuse the Concept/Idea Workbench chassis.
   - Add explicit governing question, working synthesis, evidence roles, strongest counterargument, unknowns, and a draft-revision action without turning every Concept into an investment dossier.

4. **Wiki remains accepted knowledge.**
   - Agent work produces candidate revisions.
   - Only an explicit human action can accept, reject, defer, or preserve a judgment.
   - `updatedAt` alone never means that knowledge materially changed.

5. **The Field is a read model, not a new source of truth.**
   - It is computed from receipts, revisions, source events, claims, questions, connections, visits, and decisions.
   - It may rank and summarize real events; it may not invent activity.

6. **Reuse MongoDB and the current models.**
   - Do not introduce a graph database.
   - Do not normalize the entire corpus in a big-bang migration.
   - Add new durable models only where existing embedded records cannot support a proven user loop.

7. **Public proof, dossiers, repo wikis, and weekly editions stay downstream applications.**
   - They consume accepted Wiki state and the same provenance contracts.
   - They do not fork the core product architecture.

## 3. Current primitives to reuse

| Ambitious-system need | Existing primitive |
|---|---|
| Source memory | `Article`, nested highlights, `importMeta`, PDFs, notes |
| Connected imports | `IntegrationConnection`, `ImportSession`, `NoeisReceipt` |
| Concepts and workspaces | `TagMeta.workspace`, `TagMeta.ideaWorkbench`, Concept material routes |
| Questions | `Question`, challenge support/counter evidence |
| Bidirectional links | `ReferenceEdge`, `Connection` |
| Accepted knowledge | `WikiPage`, sources, citations, claims |
| Candidate and accepted revisions | `WikiRevision`, `promotionStatus`, before/after snapshots |
| Source monitoring | `WikiSourceEvent`, external watches, maintenance runs |
| Claim evolution | `WikiPage.claims[].history`, support, contradictions, disposition |
| Human judgment | `WikiPage.judgment` |
| Decisions and outcomes | `WikiPage.judgment.decisions[].outcome` |
| Return behavior | Wiki briefing, receipts, return queue, page visits, item-view events |
| Live/recoverable status | `SystemStatusContext`, durable receipts |

The missing product is primarily a reliable read model and cross-surface workflow over these objects, not an entirely new storage layer.

## 4. Canonical object continuity

The user-facing chain is:

```text
Article/highlight/note
  → evidence reference
  → claim
  → Concept synthesis
  → candidate WikiRevision
  → accepted Wiki claim history
  → judgment decision
  → observed outcome
  → retained lesson
```

Every transition must carry stable references to the prior objects.

### 4.1 Initial shared reference contract

Reuse existing object IDs and add adapters before adding new persistence:

```ts
type KnowledgeRef = {
  type: 'article' | 'highlight' | 'note' | 'question' | 'concept' |
        'wiki_page' | 'wiki_claim' | 'wiki_revision' | 'decision';
  id: string;
  parentId?: string;
  title: string;
  href: string;
  sourceUrl?: string;
};
```

### 4.2 Material movement read model

The first new API contract should be read-only:

```ts
type KnowledgeMovement = {
  id: string;
  kind: 'claim_changed' | 'new_evidence' | 'contradiction' |
        'question_answerable' | 'connection_formed' |
        'decision_due' | 'outcome_due';
  occurredAt: string;
  title: string;
  whyItMatters: string;
  materiality: 'critical' | 'major' | 'supporting';
  subject: KnowledgeRef;
  evidence: KnowledgeRef[];
  affected: KnowledgeRef[];
  unresolved: KnowledgeRef[];
  nextAction: {
    label: string;
    href: string;
    intent: string;
  };
  provenance: {
    eventIds: string[];
    deterministicFacts: string[];
    synthesizedAt?: string;
  };
};
```

Ranking may be synthesized, but inclusion must be deterministic and traceable to durable events.

## 5. Delivery stages

## Stage 0 — Integration baseline and contract tests

**Purpose:** Begin from integrated truth and prevent parallel ownership collisions.

### Work

- Start the implementation branch from fresh `origin/main`.
- Preserve the current dirty design branch and untracked evidence.
- Record which unique design commits still need integration.
- Add fixtures covering:
  - one imported source;
  - one source event;
  - one affected claim;
  - one connected Concept;
  - one candidate Wiki revision;
  - one accepted revision;
  - one decision with a future review;
  - one observed outcome.
- Lock the `KnowledgeRef` and `KnowledgeMovement` API shapes with contract tests.

### Acceptance

- No current user data is mutated.
- Fixtures can replay the full chain deterministically.
- Branch ownership and file fences are written before parallel work begins.

## Stage 1 — Consequence engine and return surface

**Purpose:** Prove that Noeis can tell the user what materially changed.

### Backend

- Add a read-model service that composes candidate movements from:
  - `WikiRevision`;
  - `WikiSourceEvent`;
  - claim history and contradiction fields;
  - `NoeisReceipt`;
  - `Question`;
  - `ReferenceEdge` and `Connection`;
  - judgment review dates and decision outcomes.
- Add `GET /api/knowledge/movements?since=<timestamp>&limit=<n>`.
- Use deterministic eligibility and materiality rules.
- Permit an LLM to produce `whyItMatters` only from the bounded facts supplied by the read model.
- Cache the result without making the cache canonical.

### Frontend

- Evolve the existing Wiki front-page briefing into the first Field experience:
  - “What changed”
  - “Why it matters”
  - evidence count and affected objects
  - one next action
  - honest quiet state when nothing material changed
- Do not add a new top-level `Field` nav item yet.

### Acceptance

- A seeded source event produces exactly one reproducible movement.
- The movement links to the exact source, claim, Concept, and Wiki page.
- Refreshing the page does not change the underlying facts.
- No movement appears when only `updatedAt` changes.
- No fabricated “change” appears in the empty state.

## Stage 2 — Library as beautiful source memory

**Purpose:** Make the source, provenance, and relevance legible without turning Library into a dashboard.

### Backend

- Add or extend a Library relevance read model using existing links and movements.
- Support views:
  - recently added;
  - active in my thinking;
  - needs review;
  - unconnected.
- Return provenance and `KnowledgeRef` links to connected claims, Concepts, and Wiki pages.

### Frontend

- Preserve the current reader and highlighting behavior.
- Simplify the browse state into:
  - source index;
  - editorial source list;
  - reading/provenance pane.
- Add “active in my thinking” and “newly relevant” only when supported by real connections or movements.
- Apply the restrained Greek design language through proportion, typography, a small meander rule, inscriptions, and rosette markers.

### Acceptance

- A user can select a source, read it, verify where it came from, and see where it is used.
- “Relevant” and “connected” labels each resolve to durable objects.
- Existing highlighting, article reading, suppression, filing, and mobile behavior remain intact.
- Browser QA at desktop, 1280–1400px Safari-sidebar width, and approximately 430px.

## Stage 3 — Concept investigation workspace

**Purpose:** Turn a surfaced movement into serious work.

### Work

- Extend the current Concept/Idea Workbench model with a generalized investigation envelope:
  - governing question;
  - working synthesis;
  - evidence grouped as support, tension, and context;
  - strongest counterargument;
  - unknowns;
  - what would change my mind;
  - relevant causal model;
  - linked accepted Wiki claim, when present.
- Reuse current material retrieval and Idea Workbench events.
- Add bounded actions:
  - find contrary evidence;
  - compare historical cases;
  - trace citations backward;
  - draft a Wiki revision.
- Persist agent proposals separately from user-authored synthesis.

### Acceptance

- Opening a movement creates or opens one Concept without duplicating sources.
- Every displayed evidence item opens its original source.
- Agent-generated additions are visibly proposed and reviewable.
- The user can reject them without changing accepted Wiki state.

## Stage 4 — Candidate revision and human acceptance

**Purpose:** Connect active thinking to maintained knowledge.

### Work

- Use candidate `WikiRevision` records for proposed changes.
- Add a claim-level revision review contract:
  - current claim;
  - proposed claim;
  - added, removed, supporting, and contradicting evidence;
  - affected linked pages and Concepts;
  - unresolved counterarguments;
  - deterministic diff plus bounded explanation.
- Add dispositions:
  - accept;
  - reject;
  - defer;
  - preserve current judgment.
- On acceptance:
  - update the Wiki claim;
  - append claim history;
  - promote the candidate revision;
  - preserve the Concept and evidence references;
  - emit a durable receipt.

### Acceptance

- No agent or maintenance job can promote a candidate revision.
- Accepting once is idempotent.
- Reload shows the accepted version and complete provenance.
- Preserving the current judgment records the reviewed evidence without changing claim text.

## Stage 5 — Decisions, outcomes, and calibration

**Purpose:** Close the loop between knowledge and action.

### Work

- Build a read-only Decisions index over `WikiPage.judgment.decisions`.
- Add filters for upcoming review, awaiting outcome, and reviewed.
- Add focused decision and outcome forms using the existing embedded schema.
- Link each decision to:
  - accepted Wiki revision;
  - relevant claims;
  - source references;
  - expected outcome;
  - review date.
- When an outcome is reviewed:
  - preserve result, process score, calibration note, and lesson;
  - emit a movement and receipt;
  - make the lesson available as evidence to future Concepts.

### Acceptance

- A decision can be reconstructed from its sources and accepted judgment.
- A due review appears on the return surface.
- Recording an outcome does not retroactively rewrite the original rationale.
- The retained lesson links back to the decision and observed evidence.

## Stage 6 — Spatial Field

**Purpose:** Make the corpus explorable after the event and link density is real.

### Entry gate

Do not build this stage until the pilot corpus contains enough verified movements and bidirectional links to avoid a decorative graph.

### Work

- Build a Field read model from existing `Connection`, `ReferenceEdge`, Concepts, claims, and movements.
- Start with stable semantic territories and explicit filters.
- Show:
  - active territories;
  - new overlaps;
  - unresolved tensions;
  - questions;
  - background investigations;
  - judgment-ready changes.
- Treat Library, Think, Wiki, and Decisions as object zoom levels.
- Keep the editorial return list as the accessible and mobile fallback.

### Acceptance

- Every visible node and edge resolves to a durable object.
- The same corpus produces a stable map unless its data changes.
- Users can explain why a territory or overlap is shown.
- The map remains usable without relying on animation or hover.

## Stage 7 — Generalization and public projections

**Purpose:** Make existing applications inherit the core system.

- Investment dossiers use the generalized Concept investigation and acceptance contracts.
- Repo wikis use source watchers and claim-level revisions.
- Weekly AI editions compile accepted or explicitly draft material from watched Concepts.
- Public proof exposes only human-accepted Wiki objects and their public-safe provenance.
- Comparisons explain semantic claim changes, not merely before/after text.

## 6. Verification program

### Automated

- Contract tests for references, movement eligibility, materiality, and ranking.
- Idempotency tests for imports and accepted revisions.
- Privacy tests for user scoping and public serialization.
- Claim-level provenance tests.
- Existing focused suites plus `CI=true npm run build`.
- `npm run wiki:qa` for Wiki/graph changes.

### Browser

- Desktop.
- 1280–1400px Safari-sidebar widths.
- Approximately 430px mobile.
- Reduced motion.
- Keyboard-only movement review and acceptance.

### Cold-user gauntlet

1. Connect or seed a realistic corpus.
2. Produce one real grounded movement.
3. Follow it into a Concept.
4. Review a claim-level revision.
5. Accept or preserve it.
6. Record one decision and review condition.
7. Reload at every stage and confirm continuity.

The pilot is not complete until users return for a later evidence or decision-review event without being prompted by the builder.

## 7. Parallel ownership

### Codex

- Integrated-base and branch truth.
- Backend read models and routes.
- Persistence, migrations, idempotency, and privacy.
- Cross-surface object continuity.
- Production deployment and authenticated live verification.

### Cursor

- Isolated frontend slices against locked response contracts.
- Library visual composition and responsive behavior.
- Movement-card rendering and accessible empty/loading/error states.
- Focused component tests and screenshot evidence.

### File fences

- Cursor must not edit `server/`, schemas, routes, deployment configuration, or production data.
- Codex should avoid Cursor-owned component files while a slice is active.
- Each handoff names exact files, tests, and the commit or worktree containing the result.

## 8. Recommended first implementation pass

Build **Stage 1A: deterministic movement contract** before changing the Library or adding the Field map.

### Codex slice

1. Create fixtures for one source-event → claim-change → Concept/Wiki chain.
2. Implement the movement read-model service.
3. Add the authenticated read-only endpoint.
4. Add backend contract and honesty tests.
5. Provide the locked fixture payload to Cursor.

### Cursor slice

Build the frontend rendering for the locked movement payload inside the existing Wiki front page, without changing nav or backend behavior.

## 9. First Cursor prompt

```text
Work only this Noeis slice from:
docs/noeis-ambitious-knowledge-system-implementation-plan-2026-07-27.md

Slice: Stage 1 frontend — consequential movement return surface.

Goal:
Render a calm editorial “What changed” section inside the existing authenticated Wiki front page using a fixture adapter that matches the KnowledgeMovement contract in the plan.

Scope:
- note-taker-ui/src/components/wiki/WikiFrontPage.jsx
- new components under note-taker-ui/src/components/knowledge-movements/
- focused tests beside those components
- the smallest necessary styles in existing editorial/theme stylesheets

Behavior:
- Render up to three movements with title, why it matters, evidence count, affected objects, unresolved count, and one next action.
- Support claim_changed, new_evidence, contradiction, question_answerable, connection_formed, decision_due, and outcome_due.
- Include honest quiet, loading, malformed-item, and failed states.
- Clicking evidence or affected-object links must use the href supplied by the payload.
- Keep current Library / Think / Wiki navigation. Do not add Field or Decisions to top-level nav.
- Reuse existing Noeis editorial tokens and the calm Wiki front-page visual language.
- Treat generated copy as data; do not infer facts or synthesize replacement text in the component.

Do not touch:
- server/
- schemas or API routes
- note-taker-ui/src/pages/Library.jsx
- Concept/Idea Workbench files
- public proof/shared pages
- production data or deployment configuration

Acceptance:
- Focused component tests cover every kind plus quiet/loading/error/malformed states.
- Existing WikiFrontPage tests remain green.
- Browser screenshots at desktop, 1280px/Safari-sidebar width, and 430px.
- No horizontal overflow.
- CI=true npm run build passes.

Report back with:
- Files changed
- Tests/build run
- Screenshot/evidence paths
- Any response-contract ambiguity
- Any gap still open

Do not commit or merge unless Athan explicitly asks.
```

## 10. Estimated path

- **Coherent closed-loop alpha:** approximately 6–8 focused weeks with Codex and one bounded Cursor slice running in parallel.
- **Spatial Field backed by real event density:** approximately 10–14 weeks total.

These are implementation estimates, not commitments. The Field date should move later—not earlier—if the provenance and acceptance loop has not passed the cold-user gauntlet.
