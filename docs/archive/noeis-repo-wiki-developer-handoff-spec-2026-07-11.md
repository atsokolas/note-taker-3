# Noeis repo wiki developer handoff quality

Date: 2026-07-11

Status: implementation in progress

## Problem

The publication architecture now protects trusted content and records repository source versions, but the latest `atsokolas/note-taker-3` page still falls short as a cold-start developer handoff. It has 1,099 words, 48 references, and 37 claims, yet it promotes stale QA/planning documents as key paths, says central runtime services were not attached, truncates proof commands, and does not give a complete architecture, data, authentication, or local-environment map.

Counts are not the quality bar. A passing repo wiki must let a developer install, run, trace ownership, make a bounded change, prove it locally, and understand what remains unknown.

## Product contract

A repo wiki is a maintained Wiki page with a source monitor attached. It remains inside the existing Noeis Library -> Think -> Wiki -> Share system. It is not a separate documentation product.

The visible page must answer these jobs within five minutes:

1. What does the product or package do, and who uses it?
2. How do I install and run each process, from which working directory?
3. Which environment variables and local URLs are required?
4. Which commands prove backend, frontend, and repo-specific changes?
5. Which files own the primary product surfaces and data boundaries?
6. How does a user action travel through UI, API, service, persistence, and render state?
7. Where should a developer make a specific class of change?
8. Which invariants and failure modes must not regress?
9. How are frontend and API deployed and independently verified?
10. Which claims remain unknown because evidence is absent?

## Evidence policy

Evidence is grouped by job, not selected as one flat relevance list.

1. Runtime and configuration: package files, environment examples, server/client entrypoints, routes, services, models, API clients, and owning UI components.
2. Current documentation: README, architecture, setup, runbook, contributing, ADR, and deploy documentation.
3. Structural inventory: generated directory and key-path inventory.
4. Current activity: attached commit and release evidence.
5. Planning and QA documents: context only. They may appear in an explicitly labelled planned or historical section, never in Quickstart, Key paths, System map, or current behavior claims.
6. Agent/editor instruction files: retain as policy evidence, per product decision. They may explain repository conventions only and cannot support product, architecture, deployment, or user-experience claims.

## Canonical quality failures

The candidate must be rejected when any of these are true:

- A central attached runtime path is described as not attached or unavailable.
- Planned, spike, sweep, or QA-report documents appear as current key paths.
- A command is truncated, lacks its working directory, or is not supported by package/config evidence.
- The page omits install/run/test/build steps when package evidence exists.
- The page omits local process boundaries and URLs when server/client evidence exists.
- The page lacks an architecture/data ownership map supported by exact paths.
- The page lacks at least two concrete end-to-end flows for a multi-surface application.
- Policy text is narrated as product truth.
- Observed, candidate, and published repository states are described inconsistently.
- The public summary describes the generation process instead of the repository's actual domain.

## Pushes

### Push 1: Evidence routing and gate hardening

- Rank runtime/config/current docs ahead of planned and QA documents.
- Keep policy files in a separate policy evidence class.
- Exclude planned documents from generated Key paths and current architecture bullets.
- Reject missing-core escape language and planned-doc promotion in the canonical evaluator.
- Add focused watcher, fallback, and quality tests using the exact July 11 failure shape.

Acceptance:

- `docs/deep-dive-qa-report-2026-06-04.md`, OAuth spikes, and sweep reports do not appear under Key paths.
- `wikiMaintenanceService.js`, `githubRepoWatcherService.js`, `wikiMaintenancePublicationService.js`, `server/models/index.js`, `note-taker-ui/src/App.js`, `note-taker-ui/src/api/wiki.js`, and `WikiPageReadView.jsx` win when attached.
- A candidate containing “service was not attached” fails publication.

### Push 2: Runnable five-minute setup

- Generate copyable install, API run, UI run, test, and build command blocks with explicit working directories.
- Include required environment variable names from `.env.example` without exposing values.
- Include expected local URLs and success signals only when supported by code/config.
- Never render a truncated package-script expansion; prefer the named command and link to its package source.

Acceptance:

- A cold-start developer can start API and UI from a fresh checkout using only the page.
- The quickstart card and article agree exactly, including `server/server.js`.

### Push 3: Operational architecture and change routing

- Add product/user-experience map, process boundaries, data objects, authentication boundary, background-worker path, and publication transaction.
- Add symptom -> owning file -> closest proof command routing.
- Require at least two end-to-end flow traces for application repos.

Acceptance:

- A developer can locate the first correct file for UI layout, API behavior, retrieval, generation, source selection, persistence, publication races, integrations, and public sharing.

### Push 4: Live two-repository acceptance

- Rebuild `atsokolas/note-taker-3` through the normal watcher/publication path.
- Build one external OSS repository with a materially different shape.
- Run the canonical verifier and browser QA at desktop, 1280-1400px, and 430px.
- Paste literal summaries, command blocks, key paths, quality metrics, publication heads, and screenshots.

Acceptance:

- Both pages pass the same contract but do not share a canned section skeleton.
- The Noeis page is more useful to a new contributor than its README alone.
- A failed candidate leaves the last trusted page visible with an honest needs-review state.

## Non-goals

- Do not redesign the Wiki reader or create a separate repo product.
- Do not infer CI, deployment health, issue state, package publication, or roadmap status without direct evidence.
- Do not archive historical duplicate pages without explicit owner approval.
- Do not remove AGENTS, Claude, or Cursor files from collection; classify and constrain their use instead.
