# Noeis product realignment — Pass 0 inventory

**Status:** Pass 0 complete locally
**Date:** 2026-08-10
**Parent plan:** `docs/noeis-product-realignment-imagen-implementation-plan-2026-08-10.md`
**Proof class:** repository inventory, exact committed baseline, focused backend tests, and served-runtime availability; not rendered acceptance, merge, deploy, or production proof

## 1. Exact execution baseline

- Worktree: `/Users/athantsokolas/.codex/worktrees/noeis-consequence-loop-release-2026-08-10`
- Branch: `codex/noeis-consequence-loop-release-2026-08-10`
- Committed baseline: `e583c18d42f97f73acfa2087992bd417e6f4fff8`
- Baseline tree: `af362c4f082142ef6998338829b2e99cd20233c3`
- Local `origin/main`: `828286c37a2361f85cb3882dab00f04271a6ecd0`
- Local ancestry: baseline is 51 commits ahead and 0 behind local `origin/main`.
- Active design overlay: 16 tracked files modified, plus this plan and the prior QA document untracked.
- The untracked root `node_modules` is a dependency symlink to the canonical checkout and is not product source.

The committed baseline is the release authority for Pass 1 ancestry. The current dirty overlay contains the latest Library, Think, Wiki, and performance refinements and must be preserved and reconciled, not reset or silently treated as committed truth.

## 2. Current served runtime

- API listener: port 5500, process working directory is this release worktree.
- UI listener: port 3100, process working directory is this release worktree's `note-taker-ui`.
- `GET /health`: 200 with warm-server response.
- `GET /think?tab=home` with browser HTML accept header: 200 HTML.

This proves local availability only. No authenticated browser journey was run in Pass 0.

## 3. Frontend reuse map

| Capability | Classification | Current implementation | Pass implication |
|---|---|---|---|
| Shared three-zone shell | Reuse and reshape | `ThreePaneLayout.jsx` and `RightDrawer.jsx` already own left/main/right composition and persisted open state | Extend rather than create a parallel page shell |
| Shared agent identity | Reuse | `AgentPresence.jsx`, `AgentTicker`, `AGENT_DISPLAY_NAME` | Keep one identity and status vocabulary |
| General working agent | Reuse and constrain | `ThoughtPartnerPanel.jsx` already accepts context metadata and queued work | Wrap/mount it; do not duplicate its transport or mutation behavior |
| Library rail | Reshape mount | Library already has an open controlled right rail; browse uses ambient status while reading mounts the full partner | Make the full open desktop context consistent in browse and reading |
| Think rail | Reuse and reshape | Most Think routes mount `ThoughtPartnerPanel`; Concept workbench has a separate evidence-stream rail | Keep Pass 1 on shared shell; defer workbench consolidation to Pass 3 |
| Wiki front-page rail | Missing | Front page has continuation and build controls but no shared agent/context mount | Add shared open desktop rail without disturbing the morning-paper hierarchy |
| Wiki article rail | Reshape | Article has bespoke maintenance ticker/actions and a separate collapsible page-context rail | Adapt into shared context presentation while preserving receipt/provenance behavior |
| Mobile context | Missing contract | Existing responsive CSS hides or stacks context; it is not an explicit modal drawer/sheet | Build a keyboard-safe drawer/sheet with trigger, focus, Escape, and return-focus behavior |

## 4. Backend and durable-object reuse map

| Capability | Classification | Existing contract |
|---|---|---|
| Investigation | Reuse | Exact owner-scoped Concept/Wiki/revision/claim identity, source visibility, and separated proposals |
| Claim review | Reuse | Human-only accept, reject, defer, and preserve with exact revision identity and idempotency |
| Decisions/outcomes | Reuse | Accepted-revision binding, immutable rationale hash, distinct review/outcome clocks, revision and receipt provenance |
| Retained lessons | Reuse | Explicit support/tension/context adoption role and exact decision/outcome provenance |
| Movements | Reuse | Deterministic fail-closed return read model with exact investigation targets |
| Connections | Reuse for Pass 4 | Generic typed, owner-scoped connections with inverse-edge and receipt checks |
| ReferenceEdge | Reshape for Pass 4 | Useful existing backlinks, but not yet a universal bidirectional reference authoring contract |
| Receipts | Reuse | User-scoped receipt identity and persisted idempotent write support |
| Working orientation endpoint | Missing but not blocking Pass 1 | Existing page, movement, investigation, judgment, and receipt reads can compose presentation context; do not add backend state until Pass 3 proves a reload gap |

## 5. Pass 1 file fence

### New shared presentation adapter

- `note-taker-ui/src/components/agent/AgentContextShell.jsx`
- `note-taker-ui/src/components/agent/AgentContextShell.test.jsx`

The adapter owns presentation mode and responsive semantics only. It does not own agent transport, accepted state, or persistence.

### Shared layout primitives

- `note-taker-ui/src/layout/RightDrawer.jsx`
- `note-taker-ui/src/layout/ThreePaneLayout.jsx`
- focused tests beside these layout components

### Surface mounts

- `note-taker-ui/src/pages/Library.jsx`
- `note-taker-ui/src/pages/Library.agent.test.jsx`
- `note-taker-ui/src/pages/ThinkMode.jsx`
- `note-taker-ui/src/pages/ThinkMode.templates.test.jsx`
- `note-taker-ui/src/components/wiki/WikiFrontPage.jsx`
- `note-taker-ui/src/components/wiki/WikiFrontPage.test.jsx`
- `note-taker-ui/src/components/wiki/WikiPageReadView.jsx`
- the existing focused Wiki article test covering maintenance/provenance behavior

### Styles

- `note-taker-ui/src/styles/stitch-editorial.css`
- `note-taker-ui/src/styles/stitchEditorialCss.test.js`
- the smallest Wiki article stylesheet change only if the article cannot consume the shared shell without it

### Explicit exclusions

- No `server/` changes.
- No schemas, routes, databases, deployment, or production data.
- No Concept workbench rail consolidation.
- No candidate-review, decision, outcome, lesson, public, dossier, repo, or weekly-edition changes.
- No top-level navigation changes.

## 6. Pass 1 behavior contract

### Desktop

- Library, Think, Wiki front page, and Wiki article show the agent/context rail open by default.
- User collapse preference may be preserved, but the first/default experience is open.
- The center reading or writing plane remains the dominant and readable surface.
- Library and Wiki do not replace their provenance or maintenance contracts with chat history.

### Mobile

- The rail is absent from normal document flow.
- One explicit, labeled trigger opens a modal drawer/sheet.
- Drawer has a meaningful heading, close control, Escape behavior, focus containment, and return focus.
- Closing or reopening the drawer does not mutate product data or lose current surface identity.

### Orientation

- Pass exact route/page/Concept identities already available on the surface.
- Show only supported source, accepted-state, proposal, tension, and next-action context.
- Missing orientation fields render an honest unavailable/quiet state.
- Do not infer accepted revision, belief, material movement, or allowed mutation from chat history or timestamps.

## 7. Pass 1 verification

### Automated

- Shared shell mode and accessibility tests.
- Library browse and reading mounts.
- Think home/blank/continuation mount and posture tests.
- Wiki front-page and article mounts without weakening receipt/provenance assertions.
- Existing focused backend regression suite remains green even though Pass 1 has no backend diff.
- `CI=true npm run build`.
- `git diff --check`.

### Browser

- Authenticated local Library browse and article at 1440, 1320, and 430px.
- Authenticated Think home, blank Think, and grounded continuation at all three widths.
- Authenticated Wiki front page and article at all three widths.
- Desktop rail open; center measure acceptable; no horizontal overflow.
- Mobile trigger opens/closes drawer; keyboard focus and Escape pass; reduced-motion behavior retains all information.
- No automatic API mutation caused by mounting, opening, or closing context.

## 8. Verification achieved in Pass 0

- Exact baseline commit/tree and local ancestry recorded.
- Worktree dirty ownership and current overlay recorded.
- Local API and UI listeners traced to the intended worktree and returned available responses.
- Read-only frontend inventory reconciled against source.
- Focused backend contract suite reported 10/10 passing across investigation, disposition, decision, lesson, movement, and schema/route contracts.
- Root inspection independently confirmed the principal route, model, and mount boundaries.
- `git diff --check` passed for the current overlay and planning documents.

## 9. Unproven after Pass 0

- Pass 1 implementation and tests.
- Rendered open-rail composition against Imagen.
- Mobile drawer behavior.
- One durable working-orientation contract across all three rooms.
- Clean candidate integration.
- Merge, deploy, and production.

## 10. Exact next action

Execute Pass 1 as a frontend-only shared-shell slice on top of committed baseline `e583c18d…` plus the preserved active overlay. Start with `AgentContextShell`, `RightDrawer`, and their tests, then mount Library and Wiki before touching Think. Stop and re-ground if the shared shell requires a new backend field or if the center reading measure cannot remain dominant with all desktop rails open.
