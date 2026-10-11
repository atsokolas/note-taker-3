# Noeis Persistent Knowledge Shell and System Registry

Status: implementation plan
Accepted direction: apply the PersonalOS/Quattro architectural lessons to Noeis without copying its plugin model
Baseline: `origin/main` at `3652d2e5da022198bd4630fff4eb5809ef497796`

## Product outcome

Noeis should feel like one continuous knowledge-working environment:

> One persistent shell holds the global experience. Library, Think, Wiki, and Judgment are distinct rooms inside it. Wiki's front page is the Morning Paper, not a fifth competing room. One declarative registry explains every room, agent, capability, connector, loop, and theme. Durable knowledge and decisions remain in their existing stores.

This is not a generic plugin platform. It is an architectural discipline for making the knowledge loop coherent, inspectable, and resilient.

## What already exists

Noeis already has the correct shell seed:

- `AppShell` owns stable authenticated chrome around routed content.
- `SystemStatusProvider` keeps background work, receipts, and recoverable failure above the route.
- `AgentRailProvider` keeps the contextual agent above the route.
- `appNavigation.js` names the four rooms and deliberately folds Paper into Wiki.
- Library, Think, Wiki, and Judgment retain distinct product jobs.

The next step is not another visual shell. It is to remove distributed authority and make the existing shell explainable.

## Noeis-specific principles

### One persistent knowledge shell

The authenticated React root owns:

- global navigation and search;
- contextual agent rail;
- command palette and keyboard navigation;
- session status and receipts;
- UI preferences and theme application;
- route-to-room context;
- later, bounded warm-state for expensive room surfaces.

Changing rooms must not discard the global agent/session state. Object-specific context may change, and proposals from the previous object must not leak into the next one.

### One declarative system contract

Initial registry kinds:

- `surface`: Library, Think, Wiki, Judgment, Connections, Settings;
- `agent`: the contextual knowledge partner and explicitly registered specialist agents;
- `capability`: retrieve, connect, synthesize, maintain, challenge, decide;
- `connector`: Chrome capture, Readwise, Notion, and other supported intake paths;
- `loop`: Morning Paper, Wiki maintenance, weekly synthesis, outcome review;
- `theme`: the semantic editorial appearance choices.

The registry is metadata and resolution—not permission. Existing auth, ownership, approval, receipts, and backend validation remain authoritative.

### Stable semantic identities

Consumers should use identities such as:

- `surface.library`
- `surface.wiki`
- `agent.context-partner`
- `capability.library.retrieve`
- `capability.wiki.maintain`
- `connector.readwise`
- `loop.morning-paper`

The registry resolves those identities to current implementations. Routes, labels, and provider names must not become hidden identities.

### One registry, specialized projections

The registry may be assembled from domain adapters, but registration and validation happen once. It should eventually project:

- primary and utility navigation;
- routes and room ownership;
- contextual-agent availability;
- connector requirements and readiness;
- background-loop status;
- command-palette actions;
- system inventory.

No projection becomes a second mutable truth.

### Configuration is not knowledge

Account configuration may choose theme, enabled loops, connectors, and preferences. It must not absorb articles, highlights, concepts, Wiki revisions, claims, decisions, outcomes, receipts, or agent proposals.

### Failure preserves the shell

- Invalid registry item: item is unavailable with an inspectable reason.
- Connector unavailable: dependent capability says what is missing.
- Agent failure: room and accepted knowledge remain usable.
- Background-loop failure: durable state remains authoritative and the shell exposes recovery.
- Invalid theme: preserve the last known-good semantic theme.

## Target runtime shape

```text
NoeisShell
├── TopBar / search / command palette
├── SystemStatus and receipts
├── ContextAgent rail
├── Routed room outlet
│   ├── Library
│   ├── Think
│   ├── Wiki
│   └── Judgment
└── NoeisSystemRegistry
    ├── validated manifests
    ├── stable identity bindings
    ├── room and capability projections
    └── read-only system inventory

Existing APIs, Mongo models, receipts, and object identity remain authoritative.
```

## Milestones

### Milestone 0 — reconcile and baseline

- Map current shell, navigation, routes, contextual agent, capabilities, connectors, loops, and preferences.
- Record drift and baseline tests.
- Make no behavior change.

Exit: source map and honest baseline.

### Milestone 1 — compatibility registry and “What’s active”

- Add a versioned manifest validator and deterministic registry.
- Adapt current navigation, rail eligibility, preferences, connectors, capabilities, and loops without replacing them.
- Derive a read-only system inventory.
- Add a calm “What’s active” card in Settings.
- Explicitly label readiness that is not yet available from a unified runtime endpoint.

Do not change routing, persistence, connector behavior, or agent execution.

Exit:

- Duplicate, invalid, and missing-dependency fixtures fail closed.
- Navigation projection matches current navigation.
- Current room, contextual agent, and theme are correctly explained.
- Connector/loop registration never masquerades as live readiness.
- Focused tests and production build pass.

### Milestone 2 — make shell identity explicit

- Name the authenticated shell contract in code without remounting working providers.
- Move route metadata behind the registry while preserving URLs and redirects.
- Replace full-page keyboard navigation with router-owned navigation.
- Prove TopBar, command palette, system status, and contextual-agent DOM identity survive room changes.
- Establish a measured, bounded warm-state policy only where state restoration is expensive.

Exit: Library → Think → Wiki → Judgment → Back preserves global shell state and exact object navigation.

### Milestone 3 — contextual-agent contract

- Register surface context and supported agent actions declaratively.
- Keep retrieval proposals separate from accepted knowledge.
- Preserve exact object identities, approval, reload, and Back behavior.
- Remove page-specific rail capability inference only after parity tests.

Exit: a room declares its contextual-agent contract without editing the rail implementation.

### Milestone 4 — connector and capability convergence

- Register connector metadata and capability requirements through one contract.
- Project Connections UI, readiness, command actions, and agent availability from the same identities.
- Preserve current OAuth, token, ownership, and write-approval paths.

Exit: every consumer agrees whether a capability is available and why.

### Milestone 5 — background-loop inventory and events

- Give maintenance, Morning Paper, weekly synthesis, and outcome review stable loop identities.
- Project status from durable backend truth.
- Prefer pushed events for ongoing work; retain bounded recovery probes.
- Unify receipts in `SystemStatusContext` without creating client-only truth.

Exit: loop state converges after reload and produces no avoidable hidden-tab polling.

### Milestone 6 — semantic theme package

- Consolidate shell typography, spacing, surfaces, controls, and motion into semantic roles.
- Preserve the accepted warm editorial/Greek-inflected visual direction.
- Apply theme changes atomically and honor reduced motion.
- Keep domain-specific article and dossier presentation contained inside their rooms.

Exit: shell-owned surfaces update consistently without reload or component theme branching.

### Milestone 7 — remove legacy authority paths

Delete duplicate navigation, route, connector, capability, loop, and theme lists only after every consumer has migrated and parity tests pass.

## Required acceptance

### Contract

- Schema version, kind, namespace, dependency, duplicate, and deterministic-order tests.
- Existing navigation and rail-route parity.
- No registry item can bypass auth, ownership, approval, or receipts.

### Browser

- Desktop around 1440px.
- Safari-sidebar/tablet range around 1280–1400px.
- Mobile around 430px.
- Reduced motion.
- Navigate Library → Think → Wiki → Judgment → Back.
- Confirm shell, draft, agent rail, status, and command palette continuity.
- Confirm exact source/object links and reload behavior.

### Proof boundaries

Report local tests, rendered browser behavior, merge, deploy, and production separately. A static inventory is not live connector or loop readiness. A mounted rail is not proof that its actions persist.

## Non-goals

- Rewriting Mongo, auth, Wiki maintenance, or Judgment.
- Turning ordinary Wiki into a dossier.
- Loading arbitrary third-party React code.
- Creating a second client-side state authority.
- Replacing the existing contextual-agent approval contract.
- Redesigning all four rooms before the compatibility registry proves parity.

## Exact first slice

Implement Milestone 1 from a fresh isolated worktree. The registry must be read-only and adapter-based. Render “What’s active” in Settings, with technical detail behind disclosure. Do not migrate routes or durable state in the same slice.
