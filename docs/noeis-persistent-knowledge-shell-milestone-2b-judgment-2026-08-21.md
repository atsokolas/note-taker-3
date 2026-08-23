# Persistent knowledge shell — Milestone 2B Judgment

Date: 2026-08-21
Status: implemented, tested, and rendered locally; uncommitted

## Outcome

Judgment now declares its exact claim and related decision history to the shared Noeis surface contract without changing the room's claim-first design. The index remains a sparse list of beliefs. A case remains one dominant claim with its rationale, counterevidence, falsifiers, decision ledger, observed outcomes, dependencies, and lessons underneath it.

The persistent global agent remains the sole contextual collaborator. It retrieves against the active claim and cannot write into the case without explicit acceptance.

## Identity contract

The new `judgmentSurfaceModel.js` declares:

- the Judgment index as `judgment_index/all`;
- a case as `judgment_claim/<pageId>`;
- the exact claim/page identity;
- every durable decision id;
- every decision with an observed outcome;
- every durable lesson id;
- the latest decision, observed outcome, and lesson identities;
- the accepted and recorded Wiki revision bound to the latest decision when present;
- persisted monitoring/parked status and evergreen state.

An empty nested outcome is not treated as an observed result. A judgment without a separate claim id remains bound to its exact Wiki page rather than to title text.

## Cleanup

- Deleted the unused `judgment-room.css` stylesheet from the abandoned Board/workbench implementation. No runtime file imported it and no live selector referenced its class family.
- Removed the obsolete CSS test that preserved that dead implementation.
- Updated the shell-scroll regression test to name the active `.judgment` surface.
- Removed duplicated explanatory commentary from the live field autosave path.

## Verification

- Focused Judgment and shared-shell matrix: 18 suites / 171 tests passed.
- Final identity regression: 3 suites / 56 tests passed.
- Production frontend build passed.
- `git diff --check` passed.
- Authenticated local browser proof passed for:
  - Judgment index at 1440px;
  - claim page at 1440px, 1320px, and 430px;
  - one persistent desktop Agent rail and one mobile Agent drawer;
  - no horizontal overflow at all tested widths;
  - mobile document scrolling;
  - Escape dismissal and focus return;
  - zero-second transition and animation durations under reduced motion;
  - no application console errors during the index or claim journeys.
- Evidence: `output/playwright/noeis-judgment-surface-2026-08-21/`.

## Boundaries

- Browser QA used the seeded authenticated account and existing local database; it made no Judgment mutations.
- The QA case had a real claim but empty rationale fields, so accepted-basis, outcome, and lesson chronology are proven by contract tests rather than a populated rendered example.
- The previously recorded root `wiki:qa` backend summary-projection assertion remains a separate gate.
- This is local rendered proof. It is not a commit, push, merge, deploy, or production result.

## Next

Run the Milestone 2 cross-room acceptance on one exact object chain: Library source → Think work → accepted Wiki claim → Judgment → Back. Prove URL identity, reload, shell/agent DOM continuity, draft preservation, and exact return at 1440px, 1320px, 430px, and reduced motion. After that, begin Milestone 3 by moving room-specific contextual-agent capabilities behind the declarative contract.
