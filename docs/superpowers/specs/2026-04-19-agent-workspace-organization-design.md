# Agent Workspace Organization Design

**Date:** 2026-04-19

## Goal

Add a human-in-the-loop agent capability that proposes folder and placement cleanup across the workspace, especially after imports, without applying structural mutations automatically.

## Product Behavior

The product gains a single capability called `Workspace organization proposal`.

The agent may analyze structure across:

- library articles and article folders
- notebook notes and notebook folders
- concepts
- questions
- import-created mirrored folder trees

The agent stages a proposed organization plan before any structural mutation happens. The staged plan may include:

- create folder
- rename folder
- move item to folder
- merge folder into folder
- delete obsolete empty folder

The user must always approve before execution. The review model is mixed approval:

- approve the whole plan
- reject the whole plan
- reject individual steps
- edit safe fields on individual steps before applying the approved remainder

The agent organizes structure only. It does not rewrite item content as part of cleanup.

## Entry Points

### Import Completion

After an import completes, the UI should show a prominent `Organize this import` action.

If the importer or agent detects likely structure problems, the product should also auto-offer cleanup with copy similar to:

`This import created mirrored or duplicate structure. Want me to stage a cleanup plan?`

The initial organization scope should be the imported batch first. The agent may propose workspace-wide follow-on cleanup if it detects duplicates or overlaps outside the batch, but those steps must be explicitly labeled as broader workspace cleanup.

### Page-Level Buttons

Each major workspace surface should include an explicit cleanup trigger:

- `Library` -> `Clean up structure`
- `Notebook` -> `Clean up structure`
- `Concepts` -> `Clean up structure`
- `Questions` -> `Clean up structure`

These buttons should stage a proposal scoped to the current surface.

## Review UX

The existing thread/review experience remains the top-level review surface.

A new review section called `Organization plan` should render:

- plan title
- plan rationale
- scope label
- counts for folders created, items moved, folders merged, folders deleted

Each operation row should show:

- operation type
- before -> after preview
- affected object count
- reason/rationale
- status chip

Per-row actions:

- `Keep`
- `Reject`
- `Edit`

Editable fields are restricted to safe plan-shaping controls such as:

- destination folder name
- destination folder choice for moves
- merge target choice

Plan-level actions:

- `Apply approved changes`
- `Reject plan`

Applied plans move into history and remain visible. If rollback is available, the history view should expose a plan-level `Roll back` action.

## Architecture

The capability should extend the existing proposal bundle / run / review system instead of introducing a second approval framework.

Existing orchestration remains:

- proposal bundles stage intent
- runs stage execution state
- thread review UI hosts approval

Structural organization proposals require a new review model rather than overloading content-change proposals, because structure cleanup is operation-based and can affect many folders and items in one plan.

## Data Model

Add a new model: `AgentStructureProposal`.

### Fields

- `userId`
- `sourceThreadId`
- `sourceRunId`
- `sourceBundleId`
- `status`
- `scope`
- `scopeRef`
- `title`
- `summary`
- `rationale`
- `operations[]`
- `createdBy`
- `acceptedBy`
- `rejectedBy`
- `rolledBackBy`
- `acceptedAt`
- `rejectedAt`
- `rolledBackAt`

### Status Values

- `pending`
- `applied`
- `rejected`
- `rolled_back`
- `invalidated`

### Scope Values

- `workspace`
- `import_session`
- `surface`

### Operation Fields

Each operation entry should include:

- `opId`
- `type`
- `targetDomain`
- `status`
- `payload`
- `preview`
- `risk`
- `undoPayload`

### Operation Types

- `create_folder`
- `rename_folder`
- `move_item`
- `merge_folder`
- `delete_folder`

### Target Domains

- `library`
- `notebook`
- `concepts`
- `questions`

### Operation Status Values

- `pending`
- `approved`
- `rejected`
- `applied`
- `skipped`

## Execution Flow

1. User clicks `Organize this import` or `Clean up structure`.
2. The agent stages a proposal bundle containing `organize_workspace` operations.
3. The run performs analysis and planning only. It does not mutate structure yet.
4. The system materializes one `AgentStructureProposal` record from the staged plan.
5. The UI renders the plan for mixed approval.
6. The user approves the whole plan or trims individual steps.
7. The system applies only remaining approved steps in dependency order.
8. Each applied step captures undo data.
9. The plan moves into history and can be rolled back if reverse preconditions still hold.

## Apply Ordering

Structure application must be dependency-aware:

1. create folder
2. rename folder
3. move item
4. merge folder
5. delete folder

Deletion may only happen if the target folder is empty at execution time.

If a step precondition fails, that step should be marked `skipped` or `failed-safe` and later dependent destructive steps must not force through.

## Safety Rules

Allowed to propose:

- create folders
- rename folders
- move items across folders
- merge duplicate or overlapping folders
- delete obsolete folders that become empty after approved moves
- collapse import-mirror trees into cleaner structure

Never allowed automatically:

- apply any structural mutation without user approval
- delete a non-empty folder directly without explicit prior moves in the same visible plan
- delete a folder if rejected steps make the delete unsafe
- delete content under the guise of cleanup
- rewrite content as part of structure cleanup

## Agent Heuristics

The agent should:

- prefer reusing strong existing folders before creating new ones
- create new folders only for clear clusters
- prefer merging obvious duplicates over preserving cosmetic variants
- treat import-owned mirrored folders as weaker than user-owned folders
- reduce scope when confidence is low and explain uncertainty instead of over-cleaning

## Import-Aware Rules

The current import system already records provenance such as:

- provider
- source path
- import ownership markers like `import_mirror`
- user-owned placement markers

The organization capability should use these signals to:

- detect imported mirror structures
- bias import cleanup toward imported batches first
- avoid undoing explicit user-owned placements without clear rationale

## Rollback

Rollback should operate at the plan level.

When a plan is applied:

- each step stores its inverse operation data in `undoPayload`
- rollback replays inverse operations in reverse order

Rollback should stop safely if reverse execution would now conflict with newer user changes. In that case the system should preserve partial rollback state transparently and report which reverse steps could not be applied.

## Observability

Extend harness metrics for structure proposals:

- structure plans staged
- structure plans applied
- structure operations rejected
- structure plans rolled back
- import cleanup offers surfaced
- import cleanup offers accepted

## Implementation Phases

### Phase 1: Structural Proposal Backend

- add `AgentStructureProposal`
- add executor service for folder create/rename/move/merge/delete
- add undo capture
- add service-level tests

### Phase 2: Agent Generation Path

- add `organize_workspace` proposal bundle support
- add scope-aware organization prompts
- materialize staged structure plans into `AgentStructureProposal`

### Phase 3: Review UI

- add review rendering for organization plans
- add per-step keep/reject/edit controls
- add apply and rollback actions

### Phase 4: Import + Surface Entry Points

- add `Organize this import` on import completion
- add `Clean up structure` buttons on Library, Notebook, Concepts, and Questions

### Phase 5: Metrics + Browser Verification

- extend harness metrics and analytics
- add browser verification for plan review, partial rejection, apply, and rollback

## Testing Strategy

Service tests:

- structural operation executor
- dependency ordering
- rollback behavior
- empty-folder delete safety

Route tests:

- list/apply/reject/edit/rollback structure proposals
- import-triggered organization offer behavior

UI tests:

- page-level cleanup buttons
- import-level organize button
- mixed-approval review controls
- plan history and rollback

Browser verification:

- stage a real plan
- reject one step
- apply approved steps
- confirm structural mutations
- roll back and confirm restoration
