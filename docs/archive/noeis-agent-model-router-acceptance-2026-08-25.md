# Noeis agent model-router acceptance

Date: 2026-08-25

## Architectural result

The contextual agent now chooses one explicit model profile after intent and capability resolution. The router extends the existing provider-aware text client instead of adding a second model stack. Each profile owns its generation and output contract; the capability broker remains the authority for whether a valid result is automatic, reviewable, or blocked.

| Task | Profile | Output contract |
| --- | --- | --- |
| Conversation and retrieval | `partner_chat` | Concise user-facing prose |
| Pressure testing | `critique` | Grounded critique prose |
| Reviewable artifact drafting | `artifact_draft` | Longer draft prose |
| Integration selection | `tool_router` | Required typed tool call when tools are available |
| Workspace organization | `structure_planner` | Valid JSON object |
| Workspace hygiene | `hygiene_scan` | Valid JSON object |
| Explicit deep audit | `deep_audit` | Deliberate user-facing prose |

The client validates each result before returning it. Malformed JSON, missing required tool calls, and exposed meta-reasoning fail closed and advance to the next provider/model candidate. Normal recommendations remain valid prose. Callers may deliberately override a profile contract when an established flow requires another format.

Model-route metadata persists with the assistant turn so the selected task contract survives reload and remains inspectable. The collaborative service resolves intent, capability, and model profile once per turn rather than repeating those decisions in individual room components.

## Acceptance evidence

- Router decision matrix: `server/services/__tests__/agentModelRouter.test.js` — pass.
- Generation-contract, provider-route, structured-output, fallback, and reasoning-leak tests: `server/ai/hfTextClient.test.js` and `server/ai/hfTextClientOptionalFields.test.js` — pass.
- Collaborative reply plus execution-intent and Wiki graph routes — pass.
- Agent regression harness — synthetic 10/10, realistic 10/10, integration dry-run 2/2.
- `npm run wiki:qa` — pass, including Wiki quality harnesses, 53 frontend Wiki suites / 519 tests, and the optimized production build.
- `git diff --check` — pass.

Proof level: isolated-worktree implementation and local automated acceptance. This is not committed, merged, deployed, browser-proven against live models, or production-proven.

## Known non-blocking test debt

The broader `wikiAskService.test.js` file still has four graph-context mock cases that time out. The final slice does not modify `wikiAskService`; the shared `wiki:qa` graph routes and Wiki suites pass. Repairing that test harness remains separate cleanup work.

## Next slice

Make workspace organization the first complete structured-agent workflow: accept a generalized request such as “organize my library,” generate a schema-validated structure plan through `structure_planner`, translate it into the existing reviewable structure proposal, and preserve explicit apply/rollback and receipt boundaries. This will prove that the new router can drive useful action without giving the model silent mutation authority.
