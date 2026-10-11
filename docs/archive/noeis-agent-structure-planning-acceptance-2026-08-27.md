# Noeis agent structure planning — local acceptance

Date: 2026-08-27

## Result

The resident agent can now turn a Library-organization request into a concrete, schema-validated `AgentStructureProposal`. The proposal is persisted against the conversation and returned through the existing review surface. It does not mutate Library state until the human applies it.

This replaces the earlier generic organization bundle for this capability. The user sees one proposal, not two competing representations of the same intended work.

## Boundary

- The planner sees only the authenticated owner's visible folders and articles.
- Model output is constrained to create, rename, move, merge, and delete-folder operations.
- Every referenced article and folder must resolve against the loaded owner-scoped inventory.
- Folder deletion is permitted only for an empty owned folder.
- Invalid, empty, over-broad, duplicate, foreign-identity, or no-op plans fail closed.
- BYO agents without `proposeChanges` permission cannot stage a proposal.
- The planner creates a pending review object; application and rollback remain separate human-controlled actions.
- Planning retries reuse the source bundle identity rather than creating duplicate proposals.

## Implementation

- `server/services/agentStructurePlanningService.js`
  - loads a bounded owner-scoped Library inventory;
  - requests strict JSON through the `structure_planner` model route;
  - validates identities and operation semantics;
  - builds and idempotently persists the canonical proposal.
- `server/routes/agentChatRoutes.js`
  - invokes planning for `capability.workspace.organize` across native, streaming, and authorized BYO chat;
  - forces conversation persistence when a concrete proposal is ready;
  - returns the proposal to the existing review UI;
  - removes the redundant generic proposal bundle;
  - reports validation failure without exposing internal model or provider errors.
- `server/server.js`
  - injects the planner and proposal sanitizer into the chat router.

The resident `AgentRail` and `ThoughtPartnerPanel` now hydrate the same canonical `StructureProposalReview`. A staged plan therefore follows the conversation across rooms without falling back to a generic reply card, while review, apply, reject, and rollback remain one shared implementation.

## Verification

- Focused server architecture and route tests: passed.
- Focused proposal/review frontend tests: 28/28 passed.
- Agent regression harness: 22/22 passed (`includeLive=false`).
- `npm run wiki:qa`: passed.
  - Wiki frontend: 53 suites, 519 tests passed.
  - Optimized frontend build: passed.
- `git diff --check`: passed.

The broad frontend suite continues to print existing asynchronous `act(...)` and jsdom network warnings while passing. They are not introduced by the structure-planning path, but remain test-harness debt.

## Proof level

This is locally implemented, tested, and rendered-browser accepted. The follow-on disposable-Mongo runtime pass is recorded in `docs/noeis-agent-structure-runtime-acceptance-2026-08-27.md`. The rendered QA journey showed the exact two-operation proposal before mutation, applied it, survived reload, rolled it back, and restored the prior Library state. Evidence is retained under `output/playwright/noeis-agent-structure-*.png`. It is not yet committed, merged, deployed, or production-proven.

## Next bounded slice

Run a disposable-account, real-model acceptance of the complete loop:

1. ask the agent to organize a representative Library;
2. verify the proposed moves are grounded in exact owned article and folder identities;
3. review and apply only selected operations;
4. reload and verify persistence;
5. rollback and verify restoration;
6. exercise an unsafe or ambiguous request and confirm zero mutation.

After that runtime proof, add the recurring live-model evaluation suite that compares route choice, schema validity, citation grounding, proposal precision, and safe refusal across model upgrades.
