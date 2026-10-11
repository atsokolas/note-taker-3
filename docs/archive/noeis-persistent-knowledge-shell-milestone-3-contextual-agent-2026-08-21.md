# Milestone 3 — Contextual Agent Contract

Status: locally implemented and rendered
Plan: `docs/noeis-persistent-knowledge-shell-registry-spec-2026-08-20.md`
Candidate branch: `codex/noeis-persistent-knowledge-shell-2026-08-20`
Base: `3652d2e5da022198bd4630fff4eb5809ef497796`

## Outcome

Library, Think, Wiki, and Judgment now declare their contextual-agent contract through one versioned registry. The persistent rail no longer infers room capabilities from routes or page-specific rail logic. Wiki's full workspace uses the same semantic agent, `agent.context-partner`, through an embedded workbench projection with the wider Wiki action set.

The agent still retrieves and proposes. A human still accepts. Existing page handlers remain the only route to durable domain writes, and an acceptance action absent from the active contract fails closed before the handler runs.

## Contract

| Surface | Projection | Registered actions |
| --- | --- | --- |
| Library | persistent rail | `retrieve`, `accept.keep` |
| Think | persistent rail | `retrieve`, `accept.append` |
| Wiki | persistent rail | `retrieve`, `accept.edit` |
| Judgment | persistent rail | `retrieve`, `accept.why`, `accept.against` |
| Wiki workspace | embedded workbench | `retrieve`, `reference`, `build`, `ingest`, `lint`, `maintain` |

Each contract declares a stable ID, room, semantic agent ID, presentation, capabilities, actions, and `human_acceptance` proposal policy. Pages supply only exact runtime object context and existing transport handlers.

## Cleanup included

- Deleted the duplicate `agentRailRoutes.js` route-policy list.
- Removed the public low-level surface-registration hook; room code now uses `useContextualAgentSurface`.
- Kept one semantic agent identity instead of inventing a second Wiki-workspace agent.
- Moved unfinished rail draft state into the provider above the router, so changing projections does not discard it.
- Updated the Think template test to own its asynchronous Connections dependency, removing unrelated passing-but-noisy React `act(...)` warnings from this gate.

## Verification

- Contract and rail tests cover deterministic resolution, the embedded Wiki projection, all four room routes, exact descriptor data, and fail-closed unsupported handlers.
- Focused cumulative frontend matrix: 11 suites / 199 tests passed.
- Final production frontend build passed.
- `git diff --check` passed and no consumer of the deleted route helper or old public hook remains.
- Authenticated local browser acceptance passed at 1440px, 1320px, and 430px.
- Library → Think → Wiki preserved the same shell, TopBar, and rail DOM identities while changing exact room context.
- An unfinished Agent draft survived room changes, the embedded Wiki workspace projection, and Back.
- The Wiki workspace mounted no second global rail and exposed the same agent under `agent-surface.wiki-workspace`.
- At 430px the rail used a deliberate drawer, Escape returned focus to its trigger, reduced motion was active, and neither Wiki surface overflowed horizontally.

Evidence: `output/playwright/noeis-contextual-agent-milestone-3-2026-08-21/`.

## Proof boundary

This is local code, focused automated verification, a production build, and authenticated rendered browser evidence against the seeded QA account. The cumulative Milestones 1–3 worktree remains uncommitted. It is not independent review, merge, deployment, production proof, or proof that connector and loop readiness are live.

The local API also continued to show pre-existing Mongo/read-model instability for movement and health requests. That is a separate reliability slice and is not treated as a contextual-agent failure.

## Next plan slice

Milestone 4: converge connector and capability availability so Connections, command actions, the registry inventory, and contextual-agent availability all answer from the same stable identities and explain why a capability is or is not ready. Preserve OAuth, ownership, approval, and receipts as the authoritative write boundary.
