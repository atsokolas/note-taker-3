# Noeis agent capability broker acceptance

Date: 2026-08-25

## Architectural result

The persistent contextual agent now resolves each chat turn through one server-side capability broker after intent and retrieval. The broker reuses the existing planner, proposal-bundle, artifact-draft, and retrieval services; it does not create a parallel agent stack.

| Capability | Effect | Boundary |
| --- | --- | --- |
| Answer from selected context | Read | Automatic |
| Search the workspace or Wiki graph | Read | Automatic |
| Compose a plan | Reason | Automatic |
| Attach related material | Write | Review required |
| Revise content | Write | Review required |
| Organize the workspace | Write | Review required |
| Stage an artifact draft | Draft | Review required |
| Import external material from chat | Write | Blocked until a reviewable import flow exists |

Capability decisions persist with the assistant turn, so a reloaded conversation retains the boundary that governed the response. Artifact drafts no longer also create a redundant proposal bundle; the pending artifact is itself the review layer.

## Acceptance evidence

- Capability matrix: `server/services/__tests__/agentCapabilityBroker.test.js` — pass.
- Intent, proposals, collaborative reply, execution-intent route, and Wiki graph route — pass.
- Shared frontend conversation mapping and Thought Partner — 21/21 tests pass. Existing asynchronous React `act(...)` warnings remain unrelated.
- Agent regression harness — synthetic 10/10, realistic 10/10, integration dry-run 2/2.
- `npm run prewiki:qa` — pass.
- Frontend optimized production build — pass.
- `git diff --check` — pass.

Proof level: isolated-worktree implementation and local automated acceptance. This is not committed, merged, deployed, or production-proven.

## Next slice

Add the task-aware model router and typed output validation behind the broker. Chat, critique, artifact drafting, tool routing, and structure planning should choose explicit model profiles and validated output contracts. The broker remains the authority for whether a validated result may run automatically, become a proposal, or fail closed.
