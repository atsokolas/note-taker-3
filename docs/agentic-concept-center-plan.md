# Agentic Concept Center Plan

Status: Draft
Branch: main
Context: Review and reshape the current Note Taker / Noeis product toward a concept-centered, calm knowledge workspace with a general agentic layer attached to the user's archive.

## Plan Summary

The product already has strong foundations: article and highlight capture, notebook entries, concept workspaces, semantic retrieval, Thought Partner chat, handoffs, working memory, and evidence / contradiction framing. The problem is not missing infrastructure. The problem is product center of gravity.

Today the app reads as a broad knowledge workspace with many co-equal surfaces: Home, Notebook, Concepts, Questions, Threads, Handoffs, Paths, and Insights. The target product is sharper: a calm concept-centered workspace where the user starts from an empty concept page, writes or asks the agent to draft into that page, and uses the archive to surface support, contradiction, and related prior learning.

This plan keeps the current architecture where it already works, reduces visible product sprawl, makes the concept page the canonical maintained knowledge object, keeps notebook as a freer downstream output studio, and collapses the agent experience into one coherent conversational shell over typed actions.

## Problem Statement

The target user has a large archive of reading, highlights, PDFs, and notes. They are actively working on an essay, research thread, memo, or argument. They know they have already read useful material, but cannot recover it quickly enough, connect it to what they are making now, or trust that they have found the strongest support and contradiction in their own library.

The current product partially solves this through semantic search, concept workspaces, and agent suggestions. It does not yet make the concept page feel like the natural center of thinking, and the agent layer is fragmented enough that the product can feel like a suite of tools rather than one coherent system.

## Product Goal

Turn the user's archive into a maintained concept workspace that can:

- recover relevant prior sources
- surface supporting evidence
- surface contradiction and unresolved tension
- draft or revise conceptual synthesis on request
- preserve calm, writer-first space for human thinking
- feed freer downstream notebooks and output templates

## Non-Goals

This plan does not attempt to:

- rewrite the data model away from MongoDB
- replace the current app with a markdown-native system
- remove semantic search, handoffs, or agent infrastructure entirely
- design every visual detail of the final interface
- implement a full multi-agent platform redesign in one step

## User and Core Job

### First user

A knowledge-heavy solo thinker working on a live output, essay, research piece, argument, or memo, who has already read a lot but cannot reliably retrieve and connect the right material from their own archive.

### Core job

Help the user turn their past reading into a usable concept workspace for the thing they are trying to make right now.

## Premises

1. The concept page should become the canonical maintained knowledge object.
2. The default concept page should be calm and mostly empty, not over-structured.
3. The user should be able to write directly on the concept page or ask the agent to draft into it.
4. The agent should feel general in conversation, but most meaningful actions should resolve into typed operations on a concept and its related materials.
5. Notebook should remain freer-form and downstream from concepts rather than becoming the primary maintained knowledge object.
6. Retrieval exists to improve a concept page, not merely to show search results.
7. Low-risk archive maintenance can happen automatically, but structural concept changes require user approval.

## What Already Exists

### Existing code and product leverage map

- Concept as object: `TagMeta`, concept meta routes, concept workspaces, concept export, public concept routes.
- Archive primitives: `Article`, highlight embeddings, notebook entries, PDFs, markdown import, semantic related results.
- Agent layer: Thought Partner, agent artifact drafts, handoffs, protocol approvals, upkeep cycles, personal agents.
- Evidence framing: contradiction scans, supports / contradictions language, concept evidence stream workbench.
- Calm visual direction work: redesign implementation map, think-home polish, editorial workbench direction.

### Specific repo leverage

- `server/models/index.js`
- `server/routes/conceptWorkspaceRoutes.js`
- `server/routes/exportPublicRoutes.js`
- `server/routes/importRoutes.js`
- `server/routes/semanticSearchRoutes.js`
- `server/services/conceptAgentService.js`
- `server/services/collaborativeAgentService.js`
- `note-taker-ui/src/pages/ThinkMode.jsx`
- `note-taker-ui/src/components/think/concepts/*`
- `docs/redesign-implementation-map.md`

## Current Product Diagnosis

### Strengths

- Rich archive ingestion already exists.
- Concepts already exist as a first-class object.
- Evidence, contradiction, and support language are already in the product.
- The agent layer already performs more than pure chat.
- The redesign work already points toward a central draft surface with attached evidence and tension.

### Weaknesses

- Too many co-equal navigation centers dilute the product's main promise.
- The concept page is still modeled and experienced more like a managed workspace than a calm thinking surface.
- The agent experience is fragmented across chat, handoffs, drafts, approvals, and other surfaces.
- Notebook and concept roles are not sufficiently differentiated in product meaning.
- Retrieval often terminates in lists and panels instead of visibly improving the active concept.

## Dream State Diagram

CURRENT
Archive capture + retrieval + concept workspace + multiple agent surfaces + multiple product centers

THIS PLAN
Concept-centered calm workspace + coherent general agent shell + archive retrieval in service of concept maintenance + notebook as downstream output studio

12-MONTH IDEAL
A personal research and synthesis environment where every important idea lives as a maintained concept, the archive continuously strengthens or challenges those concepts, notebooks and templates turn concepts into finished outputs, and the agent feels like one trusted collaborator rather than a toolbox.

## Implementation Alternatives

### Approach A: Concept-Centered Refactor In Place

Summary: Keep the current architecture, reframe navigation and the concept experience so concepts become the clear center while reusing existing retrieval and agent systems.
Effort: Medium
Risk: Medium
Pros:

- Reuses most of the current codebase.
- Preserves shipped ingestion, retrieval, and agent infrastructure.
- Fastest route to product clarity without a rewrite.
Cons:
- Requires discipline not to retain too many old centers.
- Some legacy surfaces will remain under the hood.

### Approach B: New Concept Workspace Shell Over Existing Services

Summary: Build a new concept-first shell and route flow while leaving current services and older screens intact behind the scenes.
Effort: Medium-High
Risk: Medium
Pros:

- Cleaner user-facing reset.
- Lets older product surfaces coexist temporarily without blocking progress.
Cons:
- Higher UI duplication during migration.
- Risk of divergence between old and new shells.

### Approach C: Agent-First Unification Before UX Refactor

Summary: Unify the agent layer first, then reshape the concept UI after the agent becomes coherent.
Effort: Medium
Risk: High
Pros:

- Could simplify product language around one agent.
Cons:
- Delays the user-visible product center change.
- Risks back-end cleanup without enough front-end payoff.

### Recommendation

Choose Approach A. It gets the product center right fastest while preserving the real value already built.

## Product Changes

### 1. Make concept the explicit center

- Reposition Concepts as the primary maintained knowledge surface.
- De-emphasize or nest secondary areas that are not the main object of thinking.
- Change product copy and page framing so retrieval, chat, and agent actions read as services to the active concept.

### 2. Make new concept pages sparse and calm

- Default new concept pages to an intentionally open writing surface.
- Avoid preloading heavy template chrome, dashboards, or too many mandatory slots.
- Keep agent invitations present but quiet.
- Preserve visible support, contradiction, and source provenance when the user or agent adds them.

### 3. Collapse the agent experience into one coherent shell

- Keep a single primary conversational entry point for concept work.
- Under the hood, route to typed actions: retrieve evidence, scan contradiction, draft synthesis, create open question, link concept, create notebook draft, create handoff when needed.
- Keep specialized mechanisms, but reduce how many agent surfaces feel first-class in the UI.

### 4. Clarify notebook's role

- Notebook becomes a freer-form studio for essays, memos, research drafts, and template-driven outputs.
- Notebook can pull from concept pages but does not compete with concept as the maintained knowledge object.
- Preserve user freedom in notebook without forcing concept structure into it.

### 5. Make retrieval visibly concept-serving

- Retrieval actions should default to "improve this concept" rather than just "show me results."
- Add flows like: add as support, add as contradiction, attach as related source, create open question from this source.
- Surface surprising support and contradiction as agent outputs tied back to the concept.

## Information Architecture Changes

### Navigation intent

- Concepts should become the dominant route inside Think.
- Notebook remains close, but clearly downstream.
- Questions may remain, but concept-scoped questions should attach naturally to concepts.
- Handoffs, Threads, Paths, and Insights should be reduced as primary destinations unless they are essential to a current task.

### Proposed IA direction

- Primary: Concepts, Notebook, Library
- Secondary / contextual: Questions, Search, Working Memory
- Advanced / collapsed: Handoffs, Threads, Protocol / BYO agent settings, Insights, Paths

### Home strategy

- Home should point users back into active concepts and active drafts, not act like a product center equal to concept.

## Concept Page Behavior

### Default state

- Empty, calm, writable.
- Title present.
- Body ready for writing.
- Quiet affordance to ask the agent for help.
- No aggressive prefilled section scaffolding.

### Progressive enrichment

As material is added, the concept can reveal light structured regions:

- draft / body
- supporting evidence
- contradiction / tension
- open questions
- related concepts
- sources / provenance
- recent agent changes

These should appear as needed, not all at once.

### Agent interaction model

Users can:

- ask questions conversationally
- request drafts or revisions
- ask for supporting evidence
- ask for contradiction scans
- ask what they may have missed in the archive
- ask to create a notebook draft from the concept

The agent can:

- auto-suggest related material
- mark a concept stale when new relevant material arrives
- prepare draft updates for approval
- create question or source attachments automatically when low-risk

The agent cannot silently:

- rewrite the concept's core summary
- merge concepts
- remove major sections
- change major claims without approval

## Maintenance Loop

### On new source import

1. Index source and embeddings.
2. Detect likely affected concepts.
3. Mark affected concepts as stale or changed.
4. Generate concept-specific suggestions:
  - possible support
  - possible contradiction
  - possible related concept link
  - possible summary delta
  - new open questions
5. Present draft changes in a quiet approval flow.

### On demand while inside a concept

The user can ask:

- what in my archive supports this?
- what contradicts this?
- what did I read before that I forgot?
- what is the strongest related concept?
- draft a clearer summary
- turn this into a notebook draft

## Typed Agent Actions

The conversational shell should map most useful requests to typed operations:

- `retrieve_support`
- `retrieve_contradiction`
- `retrieve_related_sources`
- `draft_concept_summary`
- `draft_concept_body`
- `suggest_open_questions`
- `link_related_concepts`
- `mark_concept_stale`
- `prepare_concept_update`
- `spawn_notebook_from_concept`
- `delegate_handoff`

These are not exposed as a rigid menu first. They are execution primitives behind the conversation.

## Data and Architecture Plan

### Keep

- MongoDB models for articles, notebook entries, concepts, questions, handoffs, drafts.
- Current semantic search pipeline.
- Concept export and markdown interoperability.
- Existing concept agent and collaborative agent service foundations.

### Change

- Rework concept workspace representation so writing surface behavior is the first concern and outline management is secondary.
- Add explicit concept activity / staleness / change suggestion metadata if missing.
- Define a stronger boundary between agent conversation state and durable concept state.
- Simplify how agent UI surfaces are exposed in Think.

### Avoid for now

- Full storage-model rewrite.
- Simultaneous multi-agent orchestration redesign.
- Markdown-native pivot.
- Broad new object types unless concept behavior truly requires them.

## ASCII Dependency Diagram

[Library Sources]
  |  
  | +--> [Article / Highlight / PDF / Note ingestion]
  |         |
  |         +--> [Embeddings / semantic retrieval]
  |
  +--> [Concept detection / related concept suggestions]
              |
              v
        [Concept Page]
          |   |   |
          |   |   +--> [Agent conversational shell]
          |   |           |
          |   |           +--> [Typed concept actions]
          |   |
          |   +--> [Support / contradiction / questions / provenance]
          |
          +--> [Notebook draft generation]
                      |
                      v
                 [Free-form output studio]

## UX / Design Guardrails

- Calm first.
- One dominant content plane.
- Agent present, but never louder than the active thought.
- Retrieval panels should not overpower the writing surface.
- Contradiction should remain visible when relevant, but not become dashboard noise.
- Preserve writer space.
- Reduce visible chrome and equal-weight cards.

## DX / Implementation Considerations

### Developer-facing goals

- Clear ownership boundaries between concept UI, retrieval services, and agent action execution.
- Fewer overlapping agent entry points.
- Explicit typed action contracts for the conversational shell.
- Easier testing around concept mutations and approval boundaries.

### TTHW target for contributors

- A new contributor should understand the concept-centered product intent from README and plan docs in under 10 minutes.
- A new contributor should be able to trace concept loading, concept mutation, retrieval hookup, and notebook spawning without jumping through many unrelated agent modules.

## Error and Rescue Registry


| Risk                                    | Failure mode                                       | Rescue                                                                           |
| --------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Concept remains one tab among many      | Product center still feels diluted                 | Change nav prominence, home routing, and product copy together                   |
| Sparse concept page becomes too empty   | Users do not know what to do                       | Add quiet prompts and agent starter suggestions without hard scaffolding         |
| Agent simplification removes real power | Advanced workflows become inaccessible             | Keep advanced actions behind contextual drawers and settings, not primary chrome |
| Retrieval remains list-oriented         | Users still do manual triage outside the concept   | Add one-click concept-serving actions for retrieved items                        |
| Notebook / concept roles blur           | Users do not know where to think vs where to draft | Explicit role language, clearer creation flows, template usage only in notebook  |


## Failure Modes Registry


| Area         | Failure mode                                                  | Severity | Mitigation                                                              |
| ------------ | ------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| Navigation   | Home, Concepts, Notebook all still feel like co-equal centers | High     | Reweight IA and route defaults                                          |
| Concept UX   | Workspace mechanics crowd out writing calm                    | High     | Make empty concept sparse and progressive                               |
| Agent UX     | Many overlapping agent surfaces remain visible                | High     | Collapse to one main shell, hide advanced modes                         |
| Retrieval    | Semantic search still ends in result lists                    | Medium   | Tie results directly to concept actions                                 |
| Architecture | Typed actions remain implicit and scattered                   | High     | Define action contract and central dispatch                             |
| Testing      | Concept mutation and approval boundaries regress              | High     | Add focused tests around mutations, approvals, and notebook spawn flows |


## Scope Plan

### Phase 1: Product center shift

- Update product language and README.
- Reweight Think IA and route prominence.
- Define concept as canonical maintained object.

### Phase 2: Calm concept page

- Rework concept default state.
- Reduce exposed workspace chrome.
- Introduce progressive reveal for support / contradiction / questions.

### Phase 3: Agent unification

- Identify primary conversational shell.
- Map core requests to typed actions.
- Hide or demote fragmented agent surfaces where possible.

### Phase 4: Concept-serving retrieval

- Add direct retrieval-to-concept actions.
- Improve support / contradiction / surprising related material flows.
- Add staleness and change-draft loops.

### Phase 5: Notebook downstream clarity

- Make notebook creation from concept explicit.
- Add a small template set for essays, memos, research notes.
- Preserve freer-form writing away from concept.

## NOT in Scope

- replacing MongoDB with a filesystem knowledge store
- replatforming the entire frontend
- removing advanced agent systems from the backend immediately
- implementing every possible notebook template
- solving multi-user collaboration or team knowledge workflows in this pass
- designing public marketing site positioning in full

## Test Plan

### Product / UX flows

1. Create new concept by typing a concept name.
2. Confirm initial page is sparse and calm.
3. Ask agent to draft a concept starter summary.
4. Retrieve support from prior archive and attach to concept.
5. Retrieve contradiction and keep it visible in context.
6. Create notebook from concept and confirm freer-form editing flow.
7. Import new source, detect affected concept, show draft changes for approval.

### Technical flows

1. Concept load and save with empty-body default.
2. Typed action dispatch for support / contradiction / draft summary.
3. Approval gating for structural concept changes.
4. Semantic retrieval result hydration into concept-serving actions.
5. Notebook spawn from concept with template selection.
6. Regression around older handoff / thread / draft systems not breaking.

### Coverage targets

- route tests for concept load, mutate, and notebook spawn
- UI tests for empty concept, progressive reveal, and notebook-from-concept flows
- service tests for typed action routing and approval boundaries

## CEO Review

Mode: Selective expansion
Initial score: 6/10
Post-review score: 8/10

### Premise Challenge

1. Keep `concept page as the canonical object`. This premise is correct and already has repo support in concepts, evidence streams, suggestion drafts, and concept-scoped retrieval.
2. Adjust `empty by default` to `calm by default`. A truly blank page is too brittle for recovery-oriented work. The plan should preserve a sparse body-first surface plus one quiet prompt row for drafting, support scan, contradiction scan, and archive recall.
3. Keep `general agent shell`, but do not flatten all advanced systems into one backend rewrite. The right move is a UX collapse, not an infrastructure purge.
4. Treat `notebook as freer downstream space` as a product rule, not just copy. Notebook should stop competing with concept for product meaning.
5. Reject any premise that implies a storage rewrite. The repo already has the right primitives in Mongo, semantic retrieval, approvals, and concept suggestion flows.

### Scope Decisions


| #   | Proposal                                                      | Effort | Decision       | Reasoning                                                                                              |
| --- | ------------------------------------------------------------- | ------ | -------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Promote concept to the dominant Think center                  | M      | Accept         | Highest leverage product correction. Matches the user's stated goal and the repo's existing strengths. |
| 2   | Build a new shell over existing services                      | M-H    | Reject for now | Duplicates UI and delays clarity. Refactor in place gets the center of gravity right faster.           |
| 3   | Unify the agent backend before touching UX                    | M      | Reject         | Wrong order. The user sees too many surfaces now; UX simplification should come first.                 |
| 4   | Preserve advanced surfaces behind contextual drawers/settings | S-M    | Accept         | Keeps power users whole while restoring calm in the default flow.                                      |
| 5   | Keep concept page fully blank with no prompts                 | S      | Reject         | Recovery work needs minimal orientation. Sparse is right; silent is not.                               |
| 6   | Add concept staleness and change-draft metadata               | S-M    | Accept         | Necessary to make new imports visibly improve concepts instead of ending in passive search results.    |


### CEO Findings

#### Strengths

- The repo already contains the right primitives: concept objects, semantic retrieval, evidence/contradiction framing, approvals, and agent suggestion drafts.
- The redesign work already points toward the desired emotional center: active thought loudest on page, evidence and contradiction beside the draft.
- The product has enough depth to support a serious refactor in place rather than a reset.

#### Gaps

- `ThinkMode` still treats Home, Notebook, Concepts, Questions, Threads, Handoffs, Paths, and Insights as co-equal centers.
- The current concept model still reads as a workspace organizer first and a thinking surface second.
- Retrieval is too often list-oriented; the product promise should end in concept improvement, not detached browsing.
- The agent story is fragmented across Thought Partner, skill dock, artifact drafts, approvals, upkeep, threads, and handoffs.
- The plan needed a firmer decision on what stays visible versus what gets demoted behind advanced affordances.

### CEO Consensus


| Voice               | Status      | Notes                                                                                                                                                                |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main review         | Available   | Reviewed the plan against repo evidence in `README.md`, `note-taker-ui/src/pages/ThinkMode.jsx`, `docs/redesign-implementation-map.md`, and concept services/routes. |
| Codex outside voice | Unavailable | `codex exec` panicked locally on 2026-04-10 during OTEL/system configuration init, so no reliable external verdict was produced.                                     |
| Claude subagent     | Unavailable | This session did not have explicit user permission for delegation, so no subagent review was run.                                                                    |


Conclusion: strong single-voice confidence, but no dual-model consensus for this phase.

## Design Review

Classifier: App UI
Initial overall score: 5/10
Post-review overall score: 8/10

### Design Scorecard


| Dimension                             | Initial | Post-review | What moved it                                                                                                            |
| ------------------------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Information architecture              | 6       | 8           | Made Concepts the dominant route, reduced co-equal centers, and clarified Home as a redirector not a peer center.        |
| Interaction state coverage            | 4       | 8           | Added explicit loading/empty/error/success/partial states for concept, retrieval, approvals, and notebook spawn flows.   |
| User journey and emotional arc        | 5       | 8           | Added calm-recovery-synthesis journey so the UI serves the user's actual stress state while writing.                     |
| AI slop risk                          | 8       | 9           | Existing redesign thesis is already specific and editorial. Preserved the "one dominant content plane" rule.             |
| Design system alignment               | 5       | 7           | No root `DESIGN.md` exists; reused the redesign implementation map as the temporary source of truth instead of blocking. |
| Responsive and accessibility coverage | 3       | 7           | Added explicit mobile/right-rail collapse and keyboard/screen-reader requirements.                                       |
| Unresolved decision pressure          | 4       | 8           | Named the decisions that would otherwise leak into implementation guesses.                                               |


### Information Architecture

```
THINK
├── Concepts (default)
│   ├── concept body
│   ├── support / contradiction / sources
│   └── one agent shell
├── Notebook
│   └── free-form output studio
├── Library
│   └── source capture and reading
└── Advanced / contextual
    ├── Questions
    ├── Search
    ├── Threads
    ├── Handoffs
    ├── Insights
    └── Agent / protocol settings
```

### Interaction State Table


| Feature                           | Loading                                | Empty                                                  | Error                                                  | Success                                          | Partial                                                 |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------- |
| New concept creation              | Quiet inline progress in composer      | Blank title/body with one prompt row                   | Inline composer error with retry                       | Opens concept body immediately                   | Concept created but retrieval still warming             |
| Concept page                      | Paper-toned body skeleton, rails muted | Sparse writable body, no dashboard cards               | Inline save/load banner, body remains readable         | Body active, support rail available              | Concept text loaded before support/contradiction finish |
| Support / contradiction retrieval | Rail shows "searching your archive"    | "Nothing strong yet" plus sharpen-query prompt         | Show retrieval failure with retry, never collapse body | Attachables appear with one-click actions        | Some support found, contradiction still pending         |
| Agent draft suggestions           | Quiet assistant pulse in margin        | "Ask for a draft, support scan, or contradiction scan" | Keep conversation history, show failed action chip     | Draft inserts into concept after approval        | Draft returned but some actions need approval           |
| Pending approvals                 | Placeholder rows in approval stack     | Approval stack hidden                                  | Approval rejection or apply failure inline on item     | Applied or rejected with changelog note          | Batch partially applied; unresolved items remain        |
| Notebook spawn from concept       | Small modal/progress footer            | No template selected yet                               | Modal error with retry                                 | Notebook opens with concept-linked starter draft | Notebook created but concept links still syncing        |


### User Journey Storyboard


| Step | User does                                   | User feels                                   | Plan specifies                                                             |
| ---- | ------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| 1    | Creates or opens a concept                  | Overloaded, trying to recover prior learning | Start on a calm writable surface, not a dashboard                          |
| 2    | Asks for recall or scans the archive        | Hopeful but skeptical                        | Retrieval is tied to support, contradiction, and source attachment actions |
| 3    | Sees evidence/tension land beside the draft | Relief and traction                          | Draft remains central, rail stays secondary                                |
| 4    | Revises the concept with agent help         | Collaborative, still in control              | Structural rewrites require approval                                       |
| 5    | Spins work into notebook                    | Ready to make something                      | Notebook is freer and downstream, not another concept workspace            |


### Design Litmus Scorecard


| Check                                                        | Verdict           | Notes                                                                     |
| ------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------- |
| Brand/product unmistakable in first screen?                  | Yes               | The redesign thesis is specific to a warm editorial thinking workspace.   |
| One strong visual anchor present?                            | Yes               | The active draft/body remains the anchor.                                 |
| Page understandable by scanning headlines only?              | Mostly            | Needs cleaner naming after nav demotion, but direction is solid.          |
| Each section has one job?                                    | Mostly            | Home and advanced surfaces still needed stronger scoping.                 |
| Are cards actually necessary?                                | Yes, selectively  | Concept support/approval blocks earn existence; dashboard mosaics do not. |
| Does motion improve hierarchy or atmosphere?                 | N/A for this plan | Motion is not yet specified; should stay restrained.                      |
| Would it still feel premium with decorative shadows removed? | Yes               | The redesign direction depends on hierarchy and tone more than ornament.  |


### Responsive and Accessibility Requirements

- Mobile: collapse the right rail into a bottom sheet or segmented drawer; never shrink the draft into a narrow center column with two cramped sidebars.
- Tablet: preserve draft dominance; secondary context should become one toggled panel, not two visible rails.
- Keyboard: concept body, prompt row, support attach actions, and approval actions must all be reachable in a logical tab order.
- Screen readers: landmarks for primary draft region, secondary evidence region, and agent conversation region; approval items need explicit action labels.
- Touch targets: 44px minimum for concept creation, support attach, approval, and notebook spawn actions.

### Unresolved Decisions


| Decision needed                                                       | If deferred, what happens                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| What exactly appears on a fresh concept page besides title/body?      | Engineers will either ship a dead-empty page or reintroduce clutter ad hoc. |
| What is the one primary agent entry point on concept pages?           | Multiple agent panels will remain visible and the UX will stay fragmented.  |
| Where do Threads/Handoffs live after demotion?                        | They will continue to compete with concept and notebook as equal centers.   |
| How is contradiction shown without turning the page into a dashboard? | The UI will oscillate between invisible tension and noisy metadata.         |


### Design Consensus


| Voice               | Status      | Notes                                                                                    |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Main review         | Available   | Applied the redesign implementation map and current Think surface structure to the plan. |
| Codex outside voice | Unavailable | Same local `codex exec` failure as CEO phase.                                            |
| Claude subagent     | Unavailable | No delegation approval in this session.                                                  |


Conclusion: design direction is materially better after review, but dual-voice confirmation was not available.

## Engineering Review

Initial overall score: 6/10
Post-review overall score: 8/10

### Scope Challenge

The architecture does not need a storage rewrite. The repo already has:

- persistent concept state in Mongo
- retrieval and suggestion services
- approval policy infrastructure
- concept-specific UI and E2E tests

The engineering work is narrower and more important:

- separate durable concept state from workspace mechanics
- define a single typed action boundary for concept-serving agent actions
- simplify visible UI composition in `ThinkMode` without deleting advanced systems
- add tests for the new calm-concept and concept-serving retrieval flows

### Target Architecture

```
LIBRARY SOURCES
  ├── articles / highlights / PDFs / notes
  ├── semantic search + related retrieval
  └── import sessions / source metadata
          │
          v
CONCEPT DOMAIN
  ├── concept durable state
  │   ├── title
  │   ├── body / draft
  │   ├── support / contradiction / sources
  │   ├── open questions
  │   └── staleness / change suggestions
  └── concept workspace mechanics
      ├── sections / ordering / attachments
      └── approvals for destructive actions
          │
          v
AGENT ACTION DISPATCH
  ├── retrieve_support
  ├── retrieve_contradiction
  ├── retrieve_related_sources
  ├── draft_concept_body
  ├── prepare_concept_update
  └── spawn_notebook_from_concept
          │
          v
THINK UI
  ├── concept page as dominant plane
  ├── one conversational shell
  ├── quiet evidence / approval rail
  └── notebook as downstream studio
```

### Code Path Coverage

```
CODE PATH COVERAGE
===========================
[+] server/services/conceptAgentService.js
    │
    ├── create/get/mutate suggestion drafts
    │   ├── [★   TESTED] Guard clauses and required params — conceptAgentService.test.js
    │   ├── [★★  TESTED] Fallback planning, keyword scoring, diversification — conceptAgentService.agentFlows.test.js
    │   └── [GAP] [→EVAL] Draft quality for concept summary/body prompts after workflow changes
    │
    └── suggestion acceptance into concept workspace
        ├── [★★  TESTED] Accept/discard suggestion interactions via UI mock path — ConceptNotebook.test.jsx
        └── [GAP]         Real service + route integration for concept update drafts

[+] server/routes/conceptWorkspaceRoutes.js
    │
    ├── GET/PUT/PATCH workspace
    │   ├── [GAP]         Direct route coverage for normalize/save/replace flows
    │   ├── [★★★ TESTED] Delete approval policy logic indirectly covered — agentActionService.test.js
    │   └── [GAP]         Approval-required response path at route boundary
    │
    └── attach block / create section
        ├── [★★  TESTED] Attach highlight through mocked end-to-end flow — concept-add-material.smoke.spec.js
        └── [GAP]         Section creation/edit flows at route boundary

[+] note-taker-ui/src/pages/ThinkMode.jsx
    │
    ├── quick create / duplicate handling
    │   ├── [★★  TESTED] Header, sidebar, empty-state, search-enter create flows — think-concept-quick-create.smoke.spec.js
    │   └── [GAP] [→E2E] Calm default concept surface after creation once nav/rails are simplified
    │
    └── template integration
        └── [★★  TESTED] Template create wiring — ThinkMode.templates.test.jsx

[+] note-taker-ui/src/components/think/concepts/ConceptNotebook.jsx
    │
    ├── add material / build from library / AI scout
    │   ├── [★★  TESTED] Attach, build, suggestion accept/discard, approvals, undo — ConceptNotebook.test.jsx
    │   └── [GAP] [→E2E] Support vs contradiction vs open-question flows as visible concept-serving actions
    │
    └── pending approvals and deletion controls
        ├── [★★★ TESTED] Approval policy logic — agentActionService.test.js
        └── [GAP]         End-to-end approval UX after concept simplification

USER FLOW COVERAGE
===========================
[+] Create and open concept
    ├── [★★  TESTED] quick create and duplicate handling — think-concept-quick-create.smoke.spec.js
    └── [GAP] [→E2E] post-create calm empty concept with one agent entry point

[+] Add prior material into concept
    ├── [★★  TESTED] attach highlight through add-material drawer — concept-add-material.smoke.spec.js
    └── [GAP] [→E2E] support / contradiction attachment choices on the active concept page

[+] Agent-assisted concept improvement
    ├── [★★  TESTED] suggestion and approval panels through mocked component tests — ConceptNotebook.test.jsx
    ├── [GAP] [→E2E] concept-serving retrieval that updates the page rather than showing detached lists
    └── [GAP] [→EVAL] concept drafting quality after prompt and action-contract changes

[+] Notebook from concept
    └── [GAP] [→E2E] create notebook from concept and preserve looser downstream editing

─────────────────────────────────
COVERAGE: 8/16 paths tested (50%)
  Code paths: 5/10
  User flows: 3/6
QUALITY:  ★★★: 2  ★★: 6  ★: 1
GAPS: 8 paths need tests (4 need E2E, 2 need route/integration tests, 2 need evals)
─────────────────────────────────
```

### Required Test Additions

1. `note-taker-ui/e2e/think-concept-calm-surface.spec.js`
  Assert that creating a concept lands on a sparse body-first page, with no dashboard-card overload, one primary agent entry point, and the right rail collapsed or quiet by default.
2. `note-taker-ui/e2e/concept-retrieval-actions.spec.js`
  Assert that support, contradiction, and related-source retrieval end in concept-attached actions, not detached result lists.
3. `note-taker-ui/e2e/concept-to-notebook.spec.js`
  Assert that a notebook can be spawned from a concept, carries concept context forward, and then remains freer-form than the source concept.
4. `server/routes/__tests__/conceptWorkspaceRoutes.test.js`
  Add direct route coverage for GET/PUT/PATCH workspace flows, section creation, and the `approval_required` branch for destructive actions.
5. `server/services/__tests__/conceptActionDispatch.test.js`
  Add a service-level contract test for typed action dispatch so concept mutations, approvals, and notebook spawning stay explicit.
6. `ai_service/tests/test_plan_concept_parsing.py` or a new eval fixture
  Extend prompt-shape coverage so changes to concept drafting or contradiction sorting are tested for structure and minimum quality.

### Engineering Consensus


| Voice               | Status      | Notes                                                                                |
| ------------------- | ----------- | ------------------------------------------------------------------------------------ |
| Main review         | Available   | Reviewed the plan against routes, services, UI composition, and existing test files. |
| Codex outside voice | Unavailable | Same local `codex exec` failure as prior phases.                                     |
| Claude subagent     | Unavailable | No delegation approval in this session.                                              |


Conclusion: engineering confidence is high because the blast radius is clear and reuse is strong, but there is no second-model confirmation in this run.

## DX Review

Status: Skipped
Reason: this plan is not for a developer-facing product. Contributor DX concerns were folded into the engineering pass instead of forcing a full developer-product scorecard.

## Deferred to TODOS.md

- deeper public concept publishing rethink
- full advanced-agent settings cleanup
- long-term archive maintenance automation tuning
- team / collaborative concept workflows
- expanded notebook template library
- root-level design system document once the concept-centered shell is stable

## Cross-Phase Themes

- Concept must become the clear product center.
- Calm is a product requirement, not just styling.
- The agent must feel singular at the UX layer even if it remains plural internally.
- Retrieval should terminate in concept improvement, not in detached result browsing.
- The right move is refactor-in-place reuse, not a storage rewrite or a new shell detour.

## Decision Audit Trail


| #   | Phase  | Decision                                                                             | Classification | Principle               | Rationale                                                                    | Rejected                                   |
| --- | ------ | ------------------------------------------------------------------------------------ | -------------- | ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | CEO    | Keep concept as canonical maintained object                                          | Mechanical     | P1 Choose completeness  | Best matches the user's goal and the repo's strongest existing asset.        | Notebook-first center                      |
| 2   | CEO    | Refactor in place instead of building a new shell                                    | Taste          | P3 Pragmatic            | Avoids UI duplication and uses current services/routes.                      | New shell over old services                |
| 3   | CEO    | Do UX simplification before backend agent unification                                | Mechanical     | P3 Pragmatic            | The visible product problem is too many centers, not missing orchestration.  | Agent-first unification                    |
| 4   | CEO    | Treat "empty" as calm with one quiet prompt row                                      | Taste          | P5 Explicit over clever | Prevents a dead-empty recovery screen while preserving writer-first space.   | Totally blank concept page                 |
| 5   | CEO    | Keep advanced surfaces behind contextual affordances                                 | Taste          | P2 Boil lakes           | Preserves shipped power without keeping them all first-class.                | Delete advanced systems now                |
| 6   | Design | Classify this as App UI, not marketing UI                                            | Mechanical     | P5 Explicit over clever | The dominant problem is workspace hierarchy and task flow.                   | Landing-page rule set                      |
| 7   | Design | Use progressive reveal instead of fixed full scaffolding                             | Mechanical     | P1 Choose completeness  | Supports both empty-state calm and later concept richness.                   | Permanent visible sections from first load |
| 8   | Design | Reuse redesign map as temporary design source of truth                               | Mechanical     | P4 DRY                  | There is already a strong visual thesis; do not block on a new root doc.     | Pause for a new design-system artifact now |
| 9   | Eng    | Do not rewrite storage; add action/state boundaries                                  | Mechanical     | P4 DRY                  | Mongo, retrieval, and approvals already solve the hard persistence problems. | Markdown-native or storage-model rewrite   |
| 10  | Eng    | Add explicit typed action dispatch for concept-serving operations                    | Mechanical     | P5 Explicit over clever | Makes the general chat shell testable and durable.                           | Implicit scattered side effects            |
| 11  | Eng    | Require new E2E coverage for calm concept, retrieval attach, and concept-to-notebook | Mechanical     | P1 Choose completeness  | These are the new core user flows and need integration-level proof.          | Unit-only coverage                         |
| 12  | Eng    | Add eval coverage for concept drafting and contradiction sorting                     | Mechanical     | P1 Choose completeness  | Prompt and action-contract changes can silently degrade without evals.       | Manual spot-checks only                    |


## Completion Summary

`/autoplan` outcome: keep the existing product, but shift its center of gravity hard toward calm concept work. The review did not find a need for a rewrite. It found a need for stronger product hierarchy, a thinner visible agent surface, and a clearer engineering boundary between durable concept state and agent-driven actions.

The plan is now in a shape that can drive implementation: product direction is explicit, design states are named, the main unresolved UX choices are surfaced, and the engineering pass names the exact test gaps that should ship with the refactor.