# Noeis agent structure runtime — local acceptance

Date: 2026-08-27

## Result

The Library structure workflow completed a real-model, persisted, reversible loop against a disposable Mongo database:

1. the model received a bounded owner-scoped Library inventory;
2. it returned one exact create-and-move plan;
3. the plan persisted as one pending `AgentStructureProposal` with zero Library mutation;
4. human apply created the folder and moved the exact articles;
5. the applied state survived a database reload;
6. rollback restored the original filing and removed the created folder;
7. a request to delete non-empty folders failed closed with zero mutation;
8. the disposable database was dropped.

Live PASS: `openai/gpt-oss-120b` through Hugging Face / Groq.

The upstream-selection gap is now closed locally. With both credentials present, OpenRouter remained the preferred upstream, exhausted without a usable contract-bound result, and the same request automatically continued on Hugging Face / Groq. The returned plan passed the strict JSON schema, persisted, applied, reloaded, rolled back, and cleaned up successfully.

The text boundary now separates model fallback from upstream fallback and records a sanitized attempt chain (`upstream`, success/failure, reason class, model, provider, and latency). JSON-shaped text is no longer sufficient when a caller supplied a JSON schema: required fields, object properties, arrays, item bounds, types, and enums are checked before a response may leave the model client.

## Product repair found by the acceptance loop

`rollbackAcceptedStructureProposal` previously discarded `Folder` and `Article` when reconstructing execution adapters. Library plans could apply but could not roll back. The service now carries both Library models through rollback, and the focused regression proves create + move + rollback restoration.

## Reusable acceptance runner

`scripts/run_agent_structure_acceptance.js` now provides the persistent workflow check.

Safety properties:

- refuses any Mongo URI whose database name does not begin with `noeis_agent_structure_acceptance_`;
- uses synthetic disposable user, folder, and article identities;
- tests exact identity binding, no pre-review writes, reload, rollback, and unsafe-request rejection;
- writes PASS or FAIL evidence;
- always drops the disposable database;
- never reads or mutates a real Noeis account.

Run deterministically:

```bash
AGENT_STRUCTURE_ACCEPTANCE_MONGODB_URI=mongodb://127.0.0.1:27017/noeis_agent_structure_acceptance_local \
  npm run agent:structure-acceptance
```

Add `-- --live-model` to use the configured model route.

## Evidence

- Hugging Face live PASS: `output/agent-structure-acceptance-2026-08-27-live-hf/`
- OpenRouter live FAIL: `output/agent-structure-acceptance-2026-08-27-live-openrouter/`
- Automatic OpenRouter → Hugging Face live PASS: `output/agent-structure-acceptance-2026-08-27-auto-fallback/`
- Deterministic persisted PASS: `output/agent-structure-acceptance-2026-08-27-deterministic/`
- Focused structure planning, execution, proposal, route, CLI, and text-client tests: passed.
- Agent regression harness: 22/22 passed.
- Server boot check: passed.
- `git diff --check`: passed.

## Proof level

This is live-model, disposable-Mongo service, and rendered local browser acceptance. Using the seeded QA account, the Library agent staged an exact create-folder plus move-item proposal without mutation; the proposal was reviewed in the resident rail, applied, verified after reload, rolled back, and verified after a second reload. Screenshots are retained under `output/playwright/noeis-agent-structure-*.png`. It is not real-account acceptance, committed, merged, deployed, or production-proven.

## Next bounded slice

Stage 6 continues with a recurring live-model contract suite and promotion threshold so a model or provider upgrade cannot silently weaken chat, tool routing, or structured actions. The next bounded repairs are broader cleanup-intent vocabulary (for phrases such as “filing plan”), an explicit cross-provider data policy, and optional progressive streaming that preserves the current validate-before-render safety boundary.
