# Noeis Four-Room Product Implementation Plan

Updated: 2026-08-13 (release candidate v1.1.0.0; PR #133 open)

## Outcome

Recompose Noeis into four unmistakable product rooms that share one calm shell, one persistent context-aware agent, and one provenance contract:

1. **Library** is the evidentiary ground: folders left, reading center, Librarian right.
2. **Think** is the native private notebook: concepts, questions, and notes with grounded material inserted directly into the writing flow.
3. **Wiki** is the agent-maintained persistent layer: ordinary and developer Wikis grounded in owned sources, with material changes reviewed by the human.
4. **Judgment** is the living casebook: dossiers, decisions, outcomes, and lessons with historical belief state preserved.

The implementation must reuse existing behavior and APIs before adding new backend contracts. It must not weaken exact-ID, provenance, acceptance, or receipt-integrity gates.

## Visual authority

These Imagen references are the visual acceptance targets:

- `docs/assets/noeis-four-room-imagen-2026-08-11/library.png`
- `docs/assets/noeis-four-room-imagen-2026-08-11/think.png`
- `docs/assets/noeis-four-room-imagen-2026-08-11/wiki.png`
- `docs/assets/noeis-four-room-imagen-2026-08-11/judgment.png`

The images control composition, hierarchy, density, rail posture, palette, and interaction emphasis. Their illustrative labels and records are not product data and must never be hard-coded as factual account state.

## Frontend thesis

**Visual thesis:** a warm editorial casebook with strong reading typography, cardless structure, restrained brass action, and rails that change posture without changing identity.

**Content plan:** persistent four-room navigation; room-specific left rail; dominant central work surface; persistent contextual agent; provenance adjacent to the object it grounds.

**Interaction thesis:** short shared-layout transitions between rooms; selection actions reveal in place; agent results can be dragged to an exact notebook position without creating a separate canvas or drop basin; drawers preserve focus and return it on close; motion is disabled under `prefers-reduced-motion`.

## Existing foundations to preserve

- `getPrimaryNavItems`, `TopBar`, `ThreePaneLayout`, and shared editorial tokens.
- Library's real article/folder data, `ThoughtPartnerPanel`, and Concept/Question creation modals.
- Think's `CalmIndexView`, `ThinkShelfRail`, concept/question/notebook routes, and exact reference handoffs.
- Wiki's `WikiFrontPage`, `WikiProductIndex`, `WikiWorkspace`, repo Wiki composer, protected claim review, and existing grounded build APIs.
- Decisions, outcomes, lessons, investment dossiers, and exact accepted revision/source identities.
- `SystemStatusContext` for durable work receipts and recoverable failures.

## Stage plan and weight

### Stage 0 — Architecture, ownership, and visual baseline (15%)

- Isolate from dirty/current worktrees on a branch based on `origin/main`.
- Preserve Imagen references in-repo with checksums.
- Map current routes, components, APIs, and tests to the four rooms.
- Lock the no-invention and exact-identity acceptance contract.

Acceptance: clean isolated worktree; source/visual plan on disk; no production or user-data mutation.

### Stage 1 — Persistent four-room shell (15%)

- Add Judgment as a primary room and route.
- Normalize active navigation semantics and responsive overflow.
- Establish a shared room/posture model for Library, Think, Wiki, and Judgment.
- Preserve existing route and public-surface behavior.

Acceptance: focused navigation/route tests, keyboard focus, 1440/1320/430 shell screenshots, reduced-motion check.

### Stage 2 — Library is ground (20%)

- Make folders the left rail in reading and browse postures.
- Keep editorial reading dominant.
- Present the agent as Librarian with active source/selection context.
- Expose Highlight, Create Concept, Create Question, and Ask Librarian from passage selection.
- Preserve exact article/highlight provenance into Think.

Acceptance: real persisted highlight-to-Concept and highlight-to-Question round trips; reload; one Back restores source selection/provenance; Imagen comparison at 1440/1320/430.

### Stage 3 — Calm Think workshop (20%)

- Normalize Concepts, Questions, and Notebook left navigation.
- Keep one native document central and agent output visually separate in the right rail.
- Present Library highlight, article, Wiki page/claim, Concept, Question, and note as grounded retrievable material in the agent rail, never as a second workspace in the manuscript.
- Let pointer drops resolve to the exact prose position, with button/keyboard insertion at the current cursor; provenance survives persistence and reload.
- Use a quiet insertion hairline and short settled arrival motion; keep toolbar magnetism subtle and disable nonessential motion under reduced-motion preferences.

Acceptance: focused tests plus routed authenticated browser flow; no separate drop area; no duplicate attachment on reload; exact ObjectIds retained; exact-position insertion persists; Imagen comparison at 1440/1320/430 with reduced motion.

### Stage 4 — Persistent Wiki layer (15%)

- Recompose the Wiki return surface as a calm living table of contents.
- Keep ordinary Wiki build, repo Wiki creation, and maintenance proposals on existing APIs.
- Show honest unavailable/review states; never fabricate source counts or maintenance facts.
- Keep consequential updates human-reviewed and receipt-bound.

Acceptance: ordinary Wiki and developer Wiki entry flows remain green; pending claim review uses exact identities; `npm run wiki:qa`; Imagen comparison.

### Stage 5 — Judgment casebook (10%)

- Add the Judgment room using existing dossiers, decisions, outcomes, and lessons.
- Preserve immutable decision-time grounds beside current understanding.
- Add the inspectable Source → Claim → Decision → Outcome → Lesson trace.
- Reground through existing Think/Wiki confirmation paths; never infer outcomes or lessons.

Acceptance: decision/outcome/lesson tests, persisted reload, exact accepted revision/source bindings, no inference from `updatedAt`, Imagen comparison.

### Stage 6 — Integrated acceptance and handoff (5%)

- Run focused suites, `CI=true npm run build`, and `npm run wiki:qa`.
- Run authenticated browser acceptance at 1440px, 1320px, and 430px with reduced motion.
- Compare rendered captures to the four Imagen references.
- Report local, persisted, rendered, merged, deployed, and production evidence separately.

Acceptance: no protected preview, release, or production claim without its corresponding proof.

## Acceptance invariants

- Library material is the ground; agent output is never presented as a source.
- Agent proposals are visually and structurally distinct from human-authored and accepted state.
- Meaningful cross-surface objects retain exact type, id, parent id, source id, and backlink.
- Foreign or mismatched ObjectIds fail closed.
- Wiki material changes and lessons require explicit human confirmation.
- No invented maintenance facts, source counts, dates, competitors, market data, outcomes, or acceptance states.
- Public/shared surfaces remain outside this shell pass unless a shared component requires a proven compatibility edit.
- Desktop, Safari-sidebar width, mobile, keyboard, and reduced-motion behavior are required proof layers.

## Progress protocol

Every checkpoint reports:

- stage and total percentage complete;
- exact deliverable produced in the stage;
- files and behavior changed;
- local, persisted, rendered, merged, deployed, and production proof separately;
- strongest remaining risk;
- exact next action.

Each implementation run also adds one small, useful moment of delight that supports comprehension or continuity and remains quiet under reduced motion.

## Current checkpoint

- Stage 0 — complete (15%).
- Stage 1 — complete (15%).
- Stage 2 — complete (20%). Library now holds the folder rail, dominant reading measure, and default-open contextual Librarian. Passage actions persist a highlight before creating a Concept, creating a Question, or drafting a Librarian prompt; exact article/highlight identities survive routed Think handoff, reload, and one browser Back.
- Stage 3 — complete (20%). Think is now a native notebook rather than a canvas: mixed grounded material lives with the thought partner in the right rail and drops directly at the resolved prose position. The document shows a quiet insertion hairline, then settles the source-aware block into the writing flow with its canonical type/ID return path intact. Persistence happens before editor mutation, reload keeps one exact attachment and one inserted block, click/keyboard insertion uses the cursor, name-based Concept attachment still fails closed, motion reduces to none, and caret magnetism is capped at a calm 10px.
- Stage 4 — complete (15%). The Wiki return surface is now a calm three-posture living index: real filters and counts on the left, accepted pages and honest grounding/review state in the center, and the persistent Curator with ordinary and developer-Wiki entry points on the right. Agent candidates remain outside accepted article state. Ordinary article generation and reading, repo-specialized rendering, claim review, and receipt-bound maintenance contracts were left intact. A faint provenance thread appears only beside rows actually changed by Library material and disappears under reduced motion.
- Stage 5 — complete (10%). Judgment is now the living consequential casebook from the approved reference: grounded dossiers and cases on the left; a frozen decision-time versus current-understanding fold; thesis, falsifiers, exact decision record, and outcome/lesson chapters in the center; a persistent calibration partner; and an inspectable Source → Claim → Decision → Outcome → Lesson trace. The surface consumes the receipt-verified Decisions index, exact accepted revision/claim/source identities, and honest outcome states. Older synthetic decisions without continuity receipts remain cases but are not shown as accepted decisions. The recent private Wiki page snapshot carries case selection across reload while exact decision continuity refreshes independently.
- Stage 6 — complete (5%). The authenticated integrated loop now proves Library passage → exact saved highlight → canonical Concept → grounded source prepared by the thought partner → native cursor insertion → persisted reload → one Back to the exact Library source. The workbench now protects edits made during a slow first hydration, serializes Concept event receipts, reuses an existing exact highlight instead of duplicating it, and lets a real Concept name replace only the untouched `Untitled idea` default. Wiki and Judgment remain separate but continuous: the exact dossier opens as accepted Wiki knowledge and the top-level Judgment room regrounds the same case as a historical evaluation surface without inferring decisions, outcomes, or lessons. All four rooms were rendered at 1440px, 1320px, and 430px; the final 1320/430 matrix has zero document overflow and clean browser consoles. Reduced-motion behavior is code- and focused-test-backed in this final pass; the available browser helper could not switch media emulation for a fresh rendered recheck.
- Automated acceptance — final `npm run wiki:qa` passed with `QA_EXIT=0`, including the workspace authorization harness, dossier and maintenance gates, 52 Wiki suites / 494 tests, and a successful optimized production build. Focused passage-identity and concept-hydration regressions also pass. Known pre-existing React `act(...)` warnings remain in coordinated `WikiPageReadView` tests.
- Overall — 100% locally implemented, reconciled with `origin/main` at `1370692b`, committed as release candidate `3be04a32`, and published for review in PR #133.
- Ordinary-Wiki integration boundary — current `main` is `1370692b` through PR #131. Ordinary Wiki remains account-Library-grounded, article-first, subject-specific, and citation/source-led; Judgment consumes accepted identities without reintroducing dossier structure or styling into ordinary Wiki.
- Next — merge PR #133, verify the exact deployed frontend and API revisions independently, then run authenticated production acceptance. Local tests, rendered dev acceptance, merge, deploy, and production proof remain separate evidence layers.
