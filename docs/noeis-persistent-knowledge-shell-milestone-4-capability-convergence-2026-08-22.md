# Milestone 4 — Connector and Capability Convergence

Status: locally implemented, tested, built, and rendered
Plan: `docs/noeis-persistent-knowledge-shell-registry-spec-2026-08-20.md`
Candidate branch: `codex/noeis-persistent-knowledge-shell-2026-08-20`
Base: `3652d2e5da022198bd4630fff4eb5809ef497796`

## Outcome

Connections, Settings, command discovery, and the contextual agent now resolve connector and capability state from one stable contract. The shared authority distinguishes `connected`, `needs_setup`, `available`, `checking`, and `error`; an unavailable or failed readiness response never masquerades as a working connector.

The convergence is intentionally read-oriented. Existing OAuth, token, ownership, approval, and receipt paths remain the only authorities for connecting accounts and performing durable writes.

## Contract

- Stable connector identities cover Chrome capture, Readwise, Notion, Evernote, and file import.
- Readwise and Notion are `connected` only when the live connection envelope contains a stable connected row.
- Manual file, Chrome capture, and Evernote intake are represented as available product paths, not falsely described as connected accounts.
- Connector transport failure is represented as an honest unknown/error state.
- Room capabilities remain available over already stored Noeis knowledge; connectors expand the corpus but are not prerequisites for retrieval, linking, Wiki work, or Judgment.
- Capability resolution fails closed when a declared requirement is unavailable.

## Cleanup included

- Replaced the page-owned import-source catalog with the shared connector contract.
- Replaced production's duplicate initial Readwise/Notion readiness calls with one provider-owned connection snapshot.
- Added a short session cache and a shared in-flight request so simultaneous consumers do not create parallel readiness fetches.
- Kept explicit post-connect and OAuth refreshes uncached so the UI converges immediately after a real account change.
- Split the lightweight capability context from the network-owning provider, avoiding circular ownership and making the contract independently testable.
- Stopped mounting legacy standalone agent hooks inside the real embedded Connections route; the standalone fallback remains isolated for legacy/test rendering.
- Kept connector commands search-backed rather than adding five permanent rows to the default command palette.
- Deleted the earlier page-specific agent route authority during Milestone 3 and confirmed no stale consumer remains.

## Verification

- Focused Milestone 4 matrix: 8 suites / 96 tests passed.
- Final integration matrix: 20 suites / 381 tests passed.
- Production frontend build passed.
- `git diff --check` passed.
- Authenticated local browser acceptance passed at 1440px, 1320px, and 430px.
- Connections made one live `GET /api/import/connections` for the shared initial snapshot.
- Settings rendered the same connector states as Connections.
- Command search navigated to the exact connector setup surface while the default mobile palette remained uncluttered.
- Mobile Connections and Settings had no horizontal overflow; browser console errors were zero.

Evidence: `output/playwright/noeis-capability-registry-milestone-4-2026-08-22/`.

## Cumulative review

Milestones 1–3 remain coherent with this slice: the registry is declarative, the persistent shell owns room identity, agent proposals remain separate from accepted knowledge, and exact room/object context still flows through the existing guarded handlers. No critical auth, ownership, persistence, or cross-room continuity regression was found in the cumulative diff or test matrix.

## Proof boundary

This is local cumulative code, automated verification, a production build, and authenticated rendered browser evidence against a seeded local QA account. It is not an independent review, a commit, a merge, deployment, or production proof.

React development mode still duplicates some non-connector effect requests for import/agent status endpoints. Connector readiness itself is deduplicated. The remaining effect noise is cleanup debt for the loop/performance pass rather than a second connector authority.

## Next plan slice

Milestone 5: register maintenance, Morning Paper, weekly synthesis, and outcome review as stable loops; derive status from durable backend truth; unify their receipts through `SystemStatusContext`; and remove avoidable hidden-tab polling while retaining bounded recovery probes.
