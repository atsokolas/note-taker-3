# Noeis product realignment + Imagen implementation plan

**Status:** Active execution plan
**Date:** 2026-08-10
**Owner:** Athan
**Execution rule:** At the end of every pass, re-ground against this document and report what is complete, what is proven, what remains, and the exact next pass.

## 1. Product outcome

Build Noeis as a human-led system for compounding understanding and judgment:

> Noeis turns what a person reads into living, source-grounded knowledge that stays connected, can be challenged, and changes only when the person decides it should.

Over time, Noeis should remember why the user believed something, notice relevant evidence, help them investigate it, preserve the accepted judgment, and retrieve lessons from later outcomes when those lessons matter elsewhere.

This is not a notes application with an AI panel. It is not an investment-dossier factory. It is one maintained body of thought that can support investment theses, technical subjects, personal ideas, research questions, repository knowledge, and other serious work without creating separate product modes.

## 2. Locked product architecture

### Three rooms

- **Library — what I have taken in.** Original sources, highlights, notes, imports, and provenance.
- **Think — where I work.** A low-friction writing and investigation chassis with generative, challenging, and quiet postures.
- **Wiki — what I currently know.** Accepted, maintained, source-grounded knowledge and the default front door.

Do not add Field, Decisions, dossiers, editions, or proof as permanent top-level modes during this plan.

### Connected, not constrained

The system has a soft gravity from source material toward maintained knowledge, but no required entry point:

1. **Source-first:** a Library source or highlight starts or changes a thought.
2. **Thought-first:** the user begins on a blank Think canvas and pulls context toward it.
3. **Knowledge-first:** an existing Wiki page prompts continuation, challenge, or review.

All three paths use the same source, reference, investigation, proposal, acceptance, and history contracts.

### The agent

The agent has one identity, durable context, and consistent behavior across the product. Its visual presentation is contextual:

| Surface | Default presentation | Purpose |
|---|---|---|
| Library | Open desktop rail with provenance and reuse context | Retrieve, connect, reuse |
| Think | Open working rail when useful | Build, challenge, trace, propose |
| Wiki front page | Open desktop rail with quiet continuation context | Orient and invite reading |
| Wiki article | Open desktop rail subordinate to the reading column | Continue, challenge, update on request |
| Candidate review | Evidence and diff dominate | Explain proposal without deciding |
| Mobile | Explicit drawer or sheet, never a permanent rail | Preserve the central reading/writing plane |

On desktop, the rail remains open in Library, Think, and Wiki. “Persistent” means persistent identity, context, and availability, while the center reading or working plane remains visually dominant. On mobile, the rail becomes an explicit drawer or sheet.

The agent may retrieve, structure, challenge, explain, and propose. It may not silently mutate accepted knowledge, infer the user’s belief, manufacture a change, accept a revision, or record an outcome.

## 3. Imagen visual source of truth

### Reference artifacts

1. Full corpus-to-judgment workflow:
   `/Users/athantsokolas/.codex/generated_images/019f53b7-ef99-71d1-af5f-8e581c7a5ac4/call_LxjycLXRTVR2UPrOk1bspgxc.png`
2. Library composition:
   `/Users/athantsokolas/.codex/generated_images/019f53b7-ef99-71d1-af5f-8e581c7a5ac4/call_kpoJ7oUtXbJuh2T2hjRY3ML7.png`

### What is binding

- Warm editorial canvas, dark blue ink, restrained gold accent.
- Serif-led hierarchy for reading and thought; quiet sans/monospace for status and controls.
- One dominant center plane rather than a mosaic of equal cards.
- Left side reads as shelving or corpus navigation.
- Right side reads as provenance, tension, and next move, not a second application.
- Claims, sources, notes, and connections are legible as distinct objects.
- Hairlines, proportion, whitespace, small inscriptions, meander rules, and rosette markers provide the Greek character.
- Active work is visually louder than archives and machinery.
- Accepted knowledge is calmer than working state.
- Motion only communicates work, connection, or state change and must preserve meaning with reduced motion.

### What is not binding

- The five top-level labels shown in the storyboard.
- A permanent Field tab or graph view.
- A permanent Decisions tab.
- Exact generated copy, counts, company names, or fictional evidence.
- Desktop rails copied directly onto mobile.
- Decorative network diagrams without real owned-corpus density.

## 4. Canonical user experience

### Return journey

1. The user opens Noeis into the Wiki front page.
2. The page offers one honest continuation or one materially changed idea when supported by durable evidence.
3. The user can instead read a living Wiki, browse the index, or begin something new.
4. Opening a Wiki shows accepted knowledge first. Proposed changes and operational machinery remain subordinate.
5. Choosing **Continue in Think** opens the exact thought, governing question, evidence, unknowns, prior work, and accepted Wiki relationship.
6. The user can write, pull in a source, request counterevidence, compare cases, or ask for a candidate revision.
7. A proposed revision remains visibly separate until the user accepts, rejects, defers, or preserves the current judgment.
8. Later evidence, a review date, or an unresolved outcome may create a calm reason to return.

### Direct-entry journeys

- From Library: select a source or highlight, inspect provenance, then reference it into an existing or new Think/Wiki object without losing the original.
- From Think: start blank, then retrieve from the corpus only when requested or contextually accepted.
- From Wiki: continue, challenge, or review without first navigating through an activity dashboard.

## 5. Shared interaction contracts

### Reference

One visible `Reference…` gesture searches source, highlight, note, Think, question, and Wiki objects. Selecting an object:

- preserves the original object identity;
- adds the exact reference to the active work;
- creates or verifies the reverse relationship;
- exposes the original source and provenance;
- never copies generated prose as if it were source material.

### Referenced by

Every durable object can show where it is used. Presentation varies by register:

- calm footer or marginalia in Library and Wiki;
- active reference strip or rail item in Think;
- evidence binding in candidate review.

### Working orientation

The shared agent/context contract must carry only durable orientation needed to continue:

- current surface and exact object identity;
- governing question or current focus;
- accepted Wiki/revision relationship, if any;
- linked evidence references and roles;
- unresolved tensions and unknowns;
- open candidate proposal, decision review, or outcome review;
- last meaningful user action and last accepted material change;
- allowed next actions for the current surface.

Do not treat chat history, `updatedAt`, inferred dates, or a generated summary as canonical orientation.

## 6. Screen-level design contract

### Wiki front page

Hierarchy:

1. Masthead and specific, evidence-backed continuity sentence.
2. One lead living page or meaningful continuation.
3. Up to two secondary pages or changes.
4. Serif index of the user’s living knowledge.
5. Quiet `Ask, think, or build…` composer.
6. Activity, review, decisions, and system machinery behind one disclosure.

Quiet state: invite reading or beginning a thought. Never fabricate activity to avoid emptiness.

### Wiki article

- Accepted article and current thesis dominate.
- Provenance and `Referenced by` are available without interrupting reading.
- One restrained action cluster: continue, challenge, update, or review a real proposal.
- Candidate state is clearly separate from accepted state.
- Raw maintenance events, receipts, and claim transitions stay behind disclosures.

### Think

- Blank canvas is a real first-class state.
- Current thought or governing question is the first visual anchor.
- Reference strip and working synthesis remain near the work.
- Support, tension, context, unknowns, and strongest counterargument are available without forcing a dossier template onto every thought.
- The agent rail opens in the active register and can recede into quiet mode.
- Proposals remain distinct from user-authored or accepted content.

### Library

- Source index → editorial source list → selected source/provenance.
- Original content, import identity, author, date, URL, highlight, and user note remain clear.
- Connection labels resolve to durable objects.
- `Active in my thinking` is a supported lens over the canonical list, not a second stacked list.
- Source-first continuation is explicit: reference, open in Think, or inspect every connection.

### Candidate review

- Current accepted claim and proposed claim are visually distinct.
- Added, removed, supporting, contradicting, independent, and unresolved evidence are honest and traceable.
- The user can accept, reject, defer, or preserve.
- No default action implies acceptance.

### Decisions, outcomes, and lessons

- These remain a grounded layer on accepted Wiki judgments, not a top-level product mode.
- Preserve original rationale and expected outcome.
- Observed outcomes never rewrite earlier reasoning.
- Retained lessons must link back to the exact decision and evidence before appearing in later Think work.

## 7. Responsive and accessibility contract

### Required viewports

- Desktop: approximately 1440px.
- Narrow desktop / Safari sidebar: approximately 1280–1320px.
- Mobile: approximately 430px.

### Behavior

- Center reading or working plane remains first in DOM and visual priority.
- Desktop three-zone layouts may reduce rail width before reducing readable measure.
- At narrow desktop, context may collapse before the center plane becomes cramped.
- On mobile, left navigation becomes an explicit drawer and agent context becomes an explicit sheet/drawer after the central content.
- No horizontal overflow.
- No primary destination disappears without an accessible replacement.
- Touch targets are at least 44px where practical.
- All meaningful actions are keyboard reachable with visible focus.
- Status is not encoded by color alone.
- `prefers-reduced-motion` removes movement but preserves final state and ordering.
- Loading, empty, partial, error, success, stale, malformed, and unavailable states use plain language and honest next actions.

## 8. Current implementation baseline

Preserve and reconcile the existing consequence-loop work rather than rebuilding it.

Locally evidenced foundations include:

- knowledge-movement and return-surface contracts;
- mixed-source Library with exact provenance and history behavior;
- Concept investigation and contrary-evidence actions;
- candidate claim review and four dispositions;
- decisions, outcomes, and retained lessons;
- dossier, repo, weekly-edition, comparison, and public-proof projections;
- recent visual repairs to Library, Think home, Wiki movement summaries, and repo dossier rendering.

Proof boundary:

- These exist across exact-tree evidence and the active release worktree.
- The latest visual slice is local and dirty by design.
- Integration into a clean candidate, merge, deploy, and production acceptance remain unproven.
- Stage 6 Field remains blocked until real owned-corpus readiness passes. Fixture density and Imagen attractiveness do not clear that gate.

## 9. Execution passes

Each pass is independently bounded. Before editing, name the exact tree/worktree, file fence, served runtime, and acceptance artifact.

### Pass 0 — Integrated truth and product inventory

**Goal:** establish what can be preserved and prevent the realignment from duplicating accepted work.

Work:

- Reconcile the clean consequence-loop candidate, current release worktree, and canonical branch.
- Inventory shared shells, agent panels, Wiki front page/article, Think chassis, Library Source Memory, reference/backlink primitives, candidate review, and decision/outcome surfaces.
- Map current APIs and models to the working-orientation and reference contracts.
- Identify fragmented or duplicated frontend agent implementations.
- Produce exact file fences for Passes 1–7.

Acceptance:

- One release baseline is named by commit/tree.
- No user-owned dirty work is overwritten.
- Existing accepted tests and browser evidence are linked rather than restated.
- The plan records which behavior is reuse, reshape, missing, or intentionally deferred.

### Pass 1 — Shared shell and contextual agent presence

**Goal:** make Library, Think, and Wiki feel like one product without turning the agent into a second application.

Work:

- Create the smallest shared presentation contract for open Library, open Think, open Wiki, focused review, and mobile drawer states.
- Unify agent identity, orientation, loading, failure, and explicit-invocation behavior.
- Preserve surface-specific content components behind the shared shell.
- Ensure the central content plane remains dominant at every required viewport.

Acceptance:

- Same identity and orientation contract across all three rooms.
- Library, Think, and Wiki keep an open desktop rail without competing with the center plane; mobile uses an explicit drawer/sheet.
- No hidden agent work or automatic mutation.
- Keyboard, reduced-motion, overflow, and focus behavior pass at 1440/1320/430.

### Pass 2 — Wiki front door and living article

**Goal:** make the default home feel like a living body of knowledge, not an archive or dashboard.

Work:

- Recompose the Wiki front page to the defined hierarchy.
- Preserve the current movement read model but subordinate machinery.
- Recompose Wiki reading around accepted content, current thesis, provenance, references, and one restrained continuation cluster.
- Add honest first-run, quiet, changed, candidate, unavailable, and returning states.

Acceptance:

- A user reaches a meaningful page or begins a thought within ten seconds.
- No fabricated morning activity or maintenance claims.
- Current accepted state is always distinguishable from a proposal.
- Imagen comparison passes at all required viewports.

### Pass 3 — Think as the active continuation workspace

**Goal:** make a blank thought and a grounded continuation feel like the same calm workspace.

Work:

- Make the active thought or governing question the dominant surface.
- Bring exact prior orientation, evidence, tensions, unknowns, and accepted Wiki relationship into continuation.
- Preserve generative, challenging, and quiet postures without separate apps.
- Keep the agent active but subordinate to writing and evidence.
- Preserve exact ObjectId and reload behavior from the accepted investigation contract.

Acceptance:

- Blank Think works without a template or agent demand.
- Continuing from Wiki returns to one exact Concept/Think object without duplicate sources or POSTs.
- Evidence opens the original source.
- Suggestions and proposals can be dismissed without accepted-Wiki mutation.

### Pass 4 — Universal reference and backlink flow

**Goal:** make imported knowledge genuinely usable across the system.

Work:

- Implement or consolidate one `Reference…` interaction across Library, Think, and Wiki.
- Persist bidirectional relationships through existing `ReferenceEdge`/`Connection` primitives where sufficient.
- Add shared `Referenced by` rendering in calm and active registers.
- Preserve exact article/highlight/note parent identity and safe navigation history.

Acceptance:

- A Readwise/Notion/source highlight can be referenced into active work and reopened at the exact original.
- Reverse usage is visible from the original object.
- Reload preserves both directions.
- Cross-user, malformed, unsafe, or unsupported references fail closed.

### Pass 5 — Human review and consequence surfaces

**Goal:** visually and behaviorally integrate the already-built acceptance, decision, outcome, and lesson loop.

Work:

- Recompose claim review to match the Imagen current/proposed evidence hierarchy.
- Keep accept/reject/defer/preserve explicit and receipt-bound.
- Recompose decisions and outcome review as layers of the Wiki judgment, not modes.
- Ensure retained lessons appear in later Think work only with exact provenance and explicit adoption role.

Acceptance:

- Full accepted-revision identity survives reload.
- Four dispositions are explicit and idempotent.
- Outcome time is distinct from decision and acceptance time.
- Original rationale is immutable.
- Lesson adoption is exact, role-explicit, and reversible where the existing contract permits.

### Pass 6 — Three-scenario product acceptance

**Goal:** prove one generalized product rather than one polished dossier.

Required scenarios:

1. **NVIDIA:** continue a maintained investment thesis, inspect counterevidence and signals, propose a reviewable change, and preserve or revise explicitly.
2. **Circle of competence:** build or continue a general living idea grounded in saved reading without financial assumptions.
3. **Imported-source entry:** open an existing imported highlight and use it to continue an existing Wiki/Think object with exact forward and reverse provenance.

Acceptance:

- Real authenticated routes, no response interception or mock API proof.
- Run-unique disposable user/database for mutations.
- Reload at every durable transition.
- Desktop, narrow desktop, mobile, keyboard, and reduced-motion evidence.
- No hidden source, content, acceptance, or decision mutation.

### Pass 7 — Clean release candidate and human visual approval

**Goal:** move from locally coherent work to something Athan can judge as a product.

Work:

- Materialize a clean commit sequence from the accepted baseline.
- Run cumulative backend/frontend tests and production build.
- Run the three authenticated scenarios from the clean candidate.
- Produce an Imagen comparison board for Wiki front page/article, Think blank/continuation, Library source-first, candidate review, and decision/outcome at 1440/1320/430.
- Open the candidate in the in-app browser for Athan’s test.

Acceptance:

- Exact commit/tree and file fences are recorded.
- Human visual approval is explicit.
- Local acceptance is not called merged, deployed, or production.

### Pass 8 — Merge, deploy, and production proof

**Goal:** release only after the user-facing product is approved.

Work:

- Merge the accepted sequence.
- Deploy frontend and backend through their independent pipelines.
- Verify production authentication and all three scenarios without mutating personal corpus unless explicitly authorized.
- Record production screenshots, network behavior, identities, and cleanup where applicable.

Acceptance:

- Merged commit is identified.
- Vercel and Render deployments are each identified.
- Production behavior is independently verified.
- Remaining product gaps are reported without upgrading local proof into production proof.

## 10. End-of-pass re-grounding protocol

Every implementation pass ends with this exact status structure:

### Plan position

- Current pass and objective.
- Accepted baseline tree/commit and active worktree.

### Standout delivered

- The one user-visible improvement that defines the pass.

### Proof achieved

- Reported, local automated, exact-tree, persisted, rendered, merged, deployed, or production.
- Tests, browser journeys, viewports, and evidence paths.

### What remains versus this plan

- Passes complete.
- Passes partial.
- Passes not started.
- Cross-cutting gaps or deferred decisions.

### Exact next pass

- Objective.
- Proposed file fence.
- Acceptance bar.
- Any task suitable for a bounded parallel agent.

Do not call a pass complete when its stated proof class has not passed.

## 11. Product success gates

### Trust

- Every displayed claim and evidence object opens its durable source or product object.
- Zero hidden acceptance, belief inference, outcome inference, or fabricated change.
- Original sources and prior rationales remain unchanged by synthesis.

### Usefulness

- A cold user can continue existing work without reconstructing the context manually.
- A source can move into active work and retain exact forward/reverse provenance.
- The same interaction model works for NVIDIA, circle of competence, and imported-source entry.

### Return value

- The pilot bar remains at least three of five users voluntarily returning for a later evidence, review, or outcome event.
- Engagement prompts and fabricated activity do not count.

### Design

- The active thought or accepted knowledge is always the loudest object.
- The product remains calm without feeling static.
- The agent is available without becoming a second application.
- Human visual approval against the Imagen references is required before merge/deploy.

## 12. Explicitly deferred

- Spatial Field until real owned-corpus readiness passes.
- A new graph database or corpus-wide migration.
- Automated acceptance or autonomous edits to accepted knowledge.
- Public proof, repo tracking, weekly editions, and dossiers as primary product architecture.
- Paid evidence providers or transcripts.
- Decorative motion, speculative connections, or inferred maintenance facts.

## 13. First action

Begin with **Pass 0: Integrated truth and product inventory**. Do not start by building another rail, page, model, or route. First determine which exact accepted primitives already satisfy the realignment and where the user experience genuinely diverges from this plan and the Imagen references.

## 14. Execution status

### Pass 0 — complete locally

- Inventory: `docs/noeis-product-realignment-pass0-inventory-2026-08-10.md`
- Committed baseline: `e583c18d42f97f73acfa2087992bd417e6f4fff8`
- Baseline tree: `af362c4f082142ef6998338829b2e99cd20233c3`
- Result: existing consequence-loop backend contracts are reusable; Pass 1 is frontend-only.
- Locked correction from Athan: Library, Think, and Wiki keep the agent rail open on desktop; mobile uses a drawer/sheet.
- Next: Pass 1 — shared shell and contextual agent presence.

### Pass 1 — complete locally

- Acceptance: `docs/noeis-product-realignment-pass1-acceptance-2026-08-10.md`
- Result: Library, Think, the Wiki front page, and Wiki articles share one contextual agent frame. Desktop rails open by default; mobile uses an explicit closed sheet.
- Rendered proof: authenticated 1440/1320/430 browser checks, including no horizontal overflow, modal drawer behavior, Escape/focus return, and a separate reduced-motion Chromium run.
- Automated proof: 8 focused suites / 149 tests and the production frontend build passed.
- Proof boundary: local automated and rendered only; exact-tree, clean candidate, merge, deploy, and production remain unproven.
- Next: Pass 2 — Wiki front door and living article.

### Pass 2 — complete locally

- Acceptance: `docs/noeis-product-realignment-pass2-acceptance-2026-08-10.md`
- Result: the Wiki front door now leads with living knowledge; activity and system machinery recede behind one disclosure. Wiki articles lead with accepted content, keep candidate/research state separate, and require explicit maintenance.
- Rendered proof: authenticated 1440/1320/430 browser checks with no horizontal overflow, mobile drawer behavior, reduced-motion rendering, and zero maintenance/rebuild POSTs on passive article load.
- Automated proof: 7 focused suites / 183 tests and the production frontend build passed.
- Proof boundary: local automated and rendered only; exact-tree, clean candidate, merge, deploy, production, and independent ten-second cold-user measurement remain unproven.
- Next: Pass 3 — Think as the active continuation workspace.

### Pass 3 — complete locally

- Acceptance: `docs/noeis-product-realignment-pass3-acceptance-2026-08-10.md`
- Result: Think Home leads with the universal command; selected Concepts use the shared desktop rail/mobile drawer; fresh Concept creation is write-first with partner scan off; investigation detail recedes behind a disclosure; Wiki continuation appears only from a structurally accepted revision and uses the exact investigation route.
- Rendered proof: authenticated 1440/1320/430 Think Home and selected-Concept checks, mobile drawer/Escape, focused write-first creation, no horizontal overflow, and reduced-motion runs.
- Automated proof: 7 focused suites / 141 tests and the production frontend build passed.
- Persisted proof: a run-unique disposable-data authenticated journey passed Wiki accepted revision → exact Think Concept → cache-cold reload → original article/highlight → real `FIND_TENSION` → independent draft/suggestion dismissal. Exact page/revision/claim identities held, no duplicate investigation write or source/Concept binding appeared, accepted Wiki hashes remained byte-equivalent, and cleanup reached zero collections.
- Evidence: `output/noeis-product-realignment-pass3b-2026-08-10/`; acceptance ledger: `docs/noeis-product-realignment-pass3-acceptance-2026-08-10.md`.
- Proof boundary: local automated, persisted, and rendered against a manifest-bound dirty-worktree snapshot; exact-tree, clean candidate, merge, deploy, and production remain unproven.
- Next: Pass 4 — universal reference and backlink flow.

### Pass 4 — complete locally

- Acceptance: `docs/noeis-product-realignment-pass4-acceptance-2026-08-10.md`
- Result: Library, Think, and authenticated Wiki reading now share one `Reference…` interaction on the durable `Connection` graph. Library source mode records active work → exact source plus the reciprocal backlink and receipt; legacy notebook-block `ReferenceEdge` remains outside the universal mutation path.
- Persisted proof: a run-unique disposable-data authenticated journey passed exact highlight → Concept reference → reciprocal backlink → reload → exact Concept → one browser Back to the original article/highlight. Cross-user, malformed, unsupported, and self-reference attempts produced no extra connections or receipts; cleanup reached zero collections.
- Rendered proof: Library and Wiki reference surfaces passed at 1440/1320/430 with no horizontal overflow, including the explicit mobile Thought partner drawer.
- Automated proof: four focused backend schema/route suites, 7 frontend suites / 216 tests, and the production frontend build passed.
- Evidence: `output/noeis-product-realignment-pass4-2026-08-10/`.
- Proof boundary: local automated, persisted, and rendered against a manifest-bound dirty-worktree snapshot; exact-tree, clean candidate, merge, deploy, and production remain unproven.
- Next: Pass 5 — human review and consequence surfaces.

### Pass 5 — complete locally

- Acceptance: `docs/noeis-product-realignment-pass5-acceptance-2026-08-10.md`
- Result: candidate claim review now follows accepted judgment → candidate evidence → explicit human disposition. Decisions separate immutable basis, review clock, and later observed outcome. Retained lessons carry exact decision/outcome provenance and an explicit adoption role.
- Return-loop repair: a real consequential movement now replaces stale quiet copy and automatically opens the Wiki review surface while remaining user-collapsible.
- Persisted proof: the fresh authenticated disposable-data journey passed **17/17** across four dispositions, decision creation, distinct clocks, observed outcome, decision-due return, lesson adoption, reloads, privacy, and agent fail-close behavior; cleanup reached zero collections.
- Rendered proof: 1440/1320/430, keyboard focus, reduced motion, and no horizontal overflow passed.
- Automated proof: focused Pass 5 component suites and the production frontend build passed.
- Evidence: `output/noeis-product-realignment-pass5-2026-08-10/`.
- Proof boundary: local automated, persisted, and rendered against a manifest-bound dirty-worktree snapshot; exact-tree, clean candidate, merge, deploy, and production remain unproven.
- Next: Pass 6 — three-scenario product acceptance.

### Pass 6 — complete locally

- Acceptance: `docs/noeis-product-realignment-pass6-acceptance-2026-08-10.md`
- Result: the complete knowledge loop held across three materially different scenarios: an NVIDIA investment thesis, a general circle-of-competence idea, and an exact imported Readwise highlight.
- Persisted proof: **3/3 scenarios passed** with real authenticated routes, run-unique disposable users and databases, reloads at durable transitions, exact identities, reciprocal provenance, and zero collections after cleanup.
- Rendered proof: desktop, narrow desktop, mobile, keyboard, reduced motion, and horizontal-overflow checks passed across the scenario harnesses.
- NVIDIA boundary: the visible Wiki movement → exact Think investigation → counterevidence → explicit preserve path is real; the bounded candidate was seeded because the live “Draft a Wiki revision” action remains unavailable, so this does not prove live proposal generation.
- Evidence: `output/noeis-product-realignment-pass6-2026-08-10/`.
- Proof boundary: local authenticated, persisted, and rendered against a manifest-bound dirty-worktree snapshot; exact-tree, clean candidate, merge, deploy, and production remain unproven.
- Next: Pass 7 — clean release candidate and human visual approval against the Imagen specification.
