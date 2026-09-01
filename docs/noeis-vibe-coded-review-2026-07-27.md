# Noeis “vibe coded” review

Date: 2026-07-27  
Review mode: investigation only  
Confidence: high

## Verdict

The criticism is substantially fair about the repository’s shape, but unfair if it means
“untested prototype” or “generic AI-generated product.”

A more accurate description is:

> Noeis is an AI-accelerated, architecturally accreted product with unusually strong
> tests around important trust boundaries, but without enough consolidation, repository-wide
> gates, or module ownership to keep its implementation legible.

The visible product is distinctive and often polished. The source looks “vibe coded”
because working vertical slices have accumulated faster than old seams, style layers,
and orchestration code have been retired.

## Evidence boundary

- Canonical remote reviewed: `origin/main` at `828286c3`.
- Current checkout: `codex/noeis-design-finish-2026-07-26` at `ec947bf1`.
- The checkout is 26 commits behind `origin/main`; main adds 7,359 lines and removes
  869 lines across 97 files relative to the checkout.
- Structural metrics were rechecked in an isolated `origin/main` snapshot.
- Executed verification applies to the current checkout, not the isolated main snapshot.
- Existing dirty and untracked user files were preserved.

## Why someone would say it

### 1. Core product areas have become god modules

On current `origin/main`:

- `server/routes/wikiRoutes.js`: 7,752 lines and 76 router declarations.
- `server/server.js`: 7,225 lines.
- `note-taker-ui/src/pages/ThinkMode.jsx`: 4,739 lines.
- `note-taker-ui/src/components/wiki/WikiWorkspace.jsx`: 3,515 lines.
- `server/models/index.js`: 2,364 lines.

The current checkout’s `buildWikiRouter` takes 42 injected dependencies
(`server/routes/wikiRoutes.js:1560-1604`). Dependency injection is a good testing seam,
but 42 dependencies mean the router is no longer one coherent module.

`ThinkMode` has 90 `useState` calls, 31 `useEffect` calls, 37 `useMemo` calls, and
64 `useCallback` calls. Its state block begins at `note-taker-ui/src/pages/ThinkMode.jsx:349`
and continues across multiple product modes. This is a clear “the next feature goes here”
shape.

### 2. The CSS is a sedimentary record of repeated polish passes

The UI contains about 51,000 tracked CSS lines. The three largest files are:

- `think-home-polish.css`: 13,470 lines on main.
- `stitch-editorial.css`: 10,487 lines.
- `theme.css`: 9,059 lines.

`note-taker-ui/src/App.js:27-39` globally imports 13 style layers with names such as
`dashboard-refresh`, `brand-energy`, `think-calm-d3a`, `calm-ui-system`,
`design-preview`, and `stitch-editorial`.

There are 575 `!important` declarations. `stitch-editorial.css` alone has 465.
Comments describe later layers repairing colors leaked by earlier layers, and
`think-home-polish.css` restyles the same surfaces in several later “polish systems.”

This is the strongest design-side evidence. The codebase reaches a good screenshot by
adding another override layer instead of resolving the cascade into one owned system.

### 3. Feature creation has greatly outpaced deletion and consolidation

Since 2026-06-01, the repository recorded:

- 332 commits.
- About 129,947 inserted lines.
- About 13,675 deleted lines.
- About 2,217 file touches.

That is roughly 9.5 inserted lines for every deleted line. Fast product development
can justify this temporarily, but the ratio matches the observed architecture: new
capability is continuously added while old structure is rarely removed.

Latest main has about 319,710 JS, JSX, and CSS lines, 103 JS/JSX files over 500 lines,
33 over 1,000 lines, and 17 over 2,000 lines.

### 4. CI does not gate the application

The sole checked-in GitHub workflow is path-filtered to the agent harness
(`.github/workflows/agent-harness-regression.yml:3-27`). Its deterministic job runs
`npm ci` and `npm run agent:harness:ci`; it does not run:

- the normal frontend build,
- the frontend unit suite,
- the Wiki QA suite,
- the backend test inventory,
- Playwright,
- lint,
- type checking, or
- coverage.

The root package has no default `test`, `lint`, `typecheck`, or general `build` script.
Instead, `wiki:qa` is one very long hand-curated shell chain
(`package.json:24-27`). Root dev dependencies contain only `nodemon`, although the QA
chain invokes Jest through `npx`.

The repository therefore has many tests but no reliable “every change proves the
product still works” gate. A green GitHub check is much narrower than it appears.

### 5. Test quantity overstates end-to-end confidence

Latest main contains 355 test files. The current tree includes approximately:

- 181 frontend unit test files,
- 135 backend test files,
- 16 script tests, and
- 11 Playwright specs.

The tests are not fake wholesale. Several route tests launch a real Express server,
and the suites cover authorization denial, privacy, idempotency, concurrency,
publication rollback, stale revisions, and malformed inputs.

But much backend coverage replaces MongoDB with hand-built in-memory query/model
implementations. Browser tests frequently intercept API routes. Those tests verify
application contracts, but they do not prove MongoDB indexes, schema behavior,
transactions, process restarts, deployment topology, or the full browser-to-database
path.

No repeatable real-Mongo/full-browser PR gate was found.

### 6. The web process owns too many operational responsibilities

`server/server.js` is both the HTTP composition root and an in-process scheduler for
Wiki source events, maintenance, SEC/EDGAR checks, transcript checks, GitHub checks,
reading checks, morning email, embeddings, and storage governance
(`server/server.js:165-182`).

Each worker has process-local timer and running state. This makes restarts and
multi-replica deployment behavior part of correctness, without expressing that
correctness through a durable queue/worker boundary.

### 7. Repository hygiene makes experiments look like product source

The repository tracks output screenshots/reports and compiled Python bytecode:

- 70 tracked `output/` files on latest main.
- Six tracked `.pyc` files in the current tree.
- Many more untracked dated QA-output directories.
- `.gitignore` excludes `tmp/` and `test-results/`, but not `output/` or `outputs/`.

The output evidence is useful, but mixing it into the application repository makes
the source tree look like an agent scratchpad and obscures which artifacts are
canonical.

The package identity is also stale: `package.json:4` still describes a
“Note-taking Chrome extension with web UI and MongoDB backend,” while the current
product is a much larger research and judgment system.

## What the criticism misses

### The sensitive paths have real safety engineering

The current checkout’s `npm run wiki:qa` passed. Among the executed results:

- 62 Node test-runner cases passed in the protected research and publication slice.
- 108 Jest cases passed for Wiki maintenance and briefing.
- 429 React Wiki cases passed across 44 suites.
- Proposal, intelligence, and maintenance quality harnesses all passed.
- The production React build completed successfully.

The suite explicitly exercises concurrent calls, receipt rollback, stale approval,
private-field exclusion, URL credential rejection, literal human confirmation, and
protected-artifact agent denial. That is not casual prototype behavior.

### The UI is not generic AI slop

The latest available Wiki and dossier screenshots use a restrained editorial palette,
asymmetric document layouts, serif-led hierarchy, and content-first density. They
avoid the standard centered purple hero and three-card template.

The base theme includes real spacing/type tokens, shared focus controls, mobile touch
targets, reduced-motion behavior, and coarse-pointer handling.

The visual problem is not lack of taste. It is that many good local decisions were
implemented as successive global override layers.

### There are meaningful seams

- Routers receive dependencies explicitly, which enables broad contract testing.
- Frontend routes are code-split.
- Service-level boundaries exist for many newer backend capabilities.
- Human acceptance, public serialization, and evidence-quality rules are encoded and
  tested rather than left as prompt instructions.

## Severity assessment

| Area | Assessment | Confidence |
| --- | --- | --- |
| Frontend/CSS architecture | Strongly vibe-coded | High |
| Module boundaries | Strongly accreted | High |
| CI/release confidence | Inadequate for repository size | High |
| Test intent and trust boundaries | Substantive, not superficial | High |
| Visible product design | Distinctive, not generic AI UI | High |
| Evidence of AI authorship | Unknown; code shape cannot prove authorship | High |
| Immediate rewrite need | No; a rewrite would add risk | High |

## Recommended response

Do not defend the current architecture. The critique identifies a real debt.
Also do not accept the lazy implication that the app is merely a demo.

The right response is:

> Yes, the repository shows AI-accelerated accretion. The product has real safety and
> test depth, but its architecture and CSS have not been consolidated at the same rate
> as features were added.

## Priority repair sequence

1. Add one required PR gate that installs both packages, runs a discovery-based backend
   suite, the frontend unit suite, a production build, and a small real vertical smoke.
2. Establish budgets: no new production module over 750 lines, no new global CSS layer,
   and no new `!important` without an explicit exception.
3. Extract by bounded domain, starting with `wikiRoutes.js`, `ThinkMode.jsx`, and
   `models/index.js`. Preserve behavior with characterization tests before moving code.
4. Collapse the global CSS imports into one token system and route-owned styles. Delete
   superseded rules after visual acceptance at 1440, 1280–1400, and 430 pixels.
5. Move scheduled work out of the web process or prove single-worker leases and
   multi-replica behavior through durable integration tests.
6. Separate retained QA evidence from repository scratch output, and stop tracking
   generated bytecode.
7. Run a deletion/consolidation milestone before adding another major product surface.

## Verification performed

- Fetched and inspected `origin/main`.
- Rechecked structural metrics in an isolated archive of latest main.
- Ran `CI=true npm run build` in `note-taker-ui`: passed.
- Ran `npm run wiki:qa` in the current checkout: passed.
- Inspected recent GitHub workflow runs: latest main had a successful pages deployment;
  the agent harness workflow remains the only application-authored CI workflow and is
  path-scoped.
- Reviewed available current-ish desktop/mobile QA screenshots separately from source
  evidence.

## Unproven

- Full test/build status of `origin/main` itself was not executed in a dependency-hydrated
  checkout.
- Production authenticated journeys were not rerun during this review.
- No claim is made about who or what authored particular code.
