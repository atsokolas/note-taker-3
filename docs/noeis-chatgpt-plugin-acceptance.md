# NOEIS ChatGPT plugin implementation acceptance — 2026-10-03

Local review deliverable. No remote push/PR, merge, deployment, portal upload, production credential, persistent production grant, consent acceptance, or public publication was performed. No scheduled searches or topics were started.

## Checkout and repository state

Worktree: `/Users/athantsokolas/Documents/Codex/2026-10-02/task-3/noeis-chatgpt`; branch `codex/noeis-chatgpt-plugin`; base fetched `origin/main` commit `f466c9f6` (PR #469). The original `/Users/athantsokolas/note-taker-3` checkout remains on its original main commit with its pre-existing dirty `.DS_Store` preserved. No reset, stash, or overwrite was used. Its `.agents/` directory does not exist; root AGENTS.md was read. The main history contains scoped access #450, Editions #454/#459, wording #460–467 and theme #469. Read-only GitHub verification confirmed #468 remains OPEN and draft: “Restore CoreWeave Judgment chips and open citations in Library.”

## Architecture and changed behavior

Current official [plugin authentication](https://developers.openai.com/plugins/build/auth), [submission](https://developers.openai.com/plugins/deploy/submission), and [tool reference](https://developers.openai.com/plugins/reference) were checked. This is a portable Agent Plugins 1.0.0 package plus the existing Streamable HTTP MCP server, not the retired OpenAPI AI-plugin integration.

- OAuth code + S256 PKCE, exact predefined public-client callback allowlists, canonical issuer/resource discovery, explicit NOEIS user consent, one-hour opaque access and rotating refresh credentials. Mongo persists hashes and atomically consumes codes/rotations. Refresh replay fails closed and revokes its family. Refresh retains one existing Connected Agents identity/receipt stream. Existing revoke/delete also revokes the family.
- Reuses AgentToken scoped ownership and API boundaries; every request resolves its account from credentials. `get_profile` returns a stable opaque account ID. No tool accepts an account selector. New OAuth models store authorization state only; they do not replace the content, editions, source identity, or receipt infrastructure.
- Existing `/mcp` remains stateless. It now uses an explicit trusted own-service API origin rather than the standalone client's production fallback, passes grant scopes, exposes auth challenges, and closes transports in error paths.
- Tool metadata includes truthful read/write/destructive/open-world hints and OAuth scopes in both descriptor and compatibility metadata. Read-only grants stop writes before API dispatch; existing APIs enforce them again. Profile has an output schema and structured result.
- `get_source_thought_context` retrieves an exact saved highlight, source identity/anchor, private saved note, and an optional genuinely linked Notebook entry. It preserves whitespace and authorship distinctions and supplies authorized source deep links. Notebook reads retain provenance. Explicit thoughts use the existing private highlight note assignment, with reconciliation before retry; no parallel thought store was added.
- `get_research_candidate` inspects pending Wiki maintenance. Ingest results no longer suggest that an affected page means no review remains. Existing proposals and human-only research candidate acceptance stay authoritative.
- Edition additive filing reuses existing Power Through `file_edition_items`, canonical source/window deduplication and `added`/`alreadyHeld` receipts. The three package skills preserve sources, novelty, limitations, authorship, explicit saving, review policy and the distinction between invocation and scheduling. There is no continuous execution service.

The existing `agent-write` scope is broad: supported tools may create, overwrite, delete and share content or accept supported proposals. Consent discloses it. Skill instructions requiring explicit human intent are policy guidance, not an additional server-enforced approval mechanism. Human-only endpoints remain human-only. Read-only connection is available when that is the desired grant.

## Validation actually run

| Gate | Result and limit |
|---|---|
| `npm run chatgpt:test` | PASS: existing scoped-token and hosted HTTP MCP regressions, seven MCP suites, eight OAuth tests, canonical schema checks and package checks. OAuth suite includes real disposable MongoDB atomic exchange/refresh replay and reconnect persistence. Normal HTTP tests use synthetic account-session middleware; no production account login was exercised. |
| Frontend targeted tests | PASS: four suites, 18 tests (ChatGPT consent/API, existing Login and Connected Agents authorization). Tests cover explicit allow/deny, broad disclosure, expired/unknown scopes, lost-response no replay, and login return context. |
| `npm run build` in note-taker-ui | PASS: optimized production build compiled successfully, including the configured frontend lint/build checks. No separate repository typecheck or lint command exists for this JS change. |
| Existing Edition route suite | PASS: 49 tests, including window/source deduplication, concurrent additive filing, item bylines and human-only gates. Used installed Jest with Node's native fetch supplied through a temporary environment shim; the installed Jest environment otherwise omits fetch. This suite uses synthetic model adapters, not a live Edition database. |
| Server boot / parsing / diff | PASS: boot_check evaluates the server, changed OAuth modules parse, and git diff --check is clean. |
| Canonical package validation | PASS: both full portable 1.0.0 schemas validated with Ajv; reviewed six-file ZIP allowlist and ZIP integrity pass. OpenAI extension/portal requirements remain separate. |
| Browser visual smoke | PASS: built consent screen loaded with synthetic API/account fixtures at desktop 1440px, tablet 1280px, mobile 430px; screenshots inspected. External network was blocked; remote Google font requests therefore failed and fallback fonts rendered. The synthetic surrounding app also logged `Unexpected token '<'`; the consent screen remained rendered, but this fixture run is not a console-clean full-app e2e. No real OAuth approval was clicked. This is visual/route evidence, not a real ChatGPT account-link e2e. |
| Independent read-only code review | Completed; found and fixed the implicit API-origin issue and transport error cleanup. It did not substitute for hosted security testing. |

Early failed attempts were corrected: sandbox blocked loopback/npm access (permitted local reruns passed); first frontend fixture had empty query due the repository's global router mock (fixed tests passed); first Edition invocation used Node rather than Jest, then the installed Jest lacked native fetch (correct runner/shim passed). No unresolved failure remains in the listed final automated gates; browser fixture console limitations are documented separately.

Never run: real ChatGPT OAuth install/refresh/revoke, authenticated hosted five-positive/three-negative reviewer scenarios, portal metadata/skills/tool scans, domain verification, full unrelated wiki:qa/server test corpus, Safari engine visual testing, a live customer source/thought/Edition/Wiki workflow or production deployment. Reviewer scenarios in the package are proposed tests, not passed-test claims.

## Deliverables and next decisions

- Package source: `plugins/noeis/`; ZIP: `output/noeis-plugin/noeis-0.1.0.zip`.
- Auth configuration: `docs/noeis-chatgpt-oauth-runbook.md`.
- Exact publisher, metadata and portal gates: `docs/noeis-chatgpt-plugin-submission-checklist.md`.
- Test logs: `output/noeis-plugin/evidence/`; visual evidence: `output/playwright/noeis-consent-{desktop,tablet,mobile}.png`.
- Local patch: `output/noeis-plugin/noeis-chatgpt-plugin.patch` (generated from the final local commit; no production secrets).

Owner decisions needed: approve code; choose staging/deployment origin and canonical resource/issuer; confirm actual predefined public-client ID and exact portal callback; decide broad write versus read-only grant; approve publisher identity/organization, final branding and public support/privacy/terms URLs; approve a dedicated synthetic reviewer account/test grant and recording; separately approve deployment, portal upload/review submission and eventual public publication. The manifest intentionally lacks unapproved legal URLs and recording. Those are true submission blockers, not implementation placeholders.

A separate incoming review inferred that existing human Edition-thought conflict recovery may discard local drafts. This was not reproduced here; no unrelated Edition UI was changed. Research-item filing receipts must not promise preservation of those drafts. Assess that dependency before claiming draft safety in reviewer materials.
