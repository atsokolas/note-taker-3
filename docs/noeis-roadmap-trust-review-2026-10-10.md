# Roadmap trust review — 10 October 2026

## Scope and baseline

Local implementation authorized by the roadmap handoff. No push, PR publication, merge, deployment, grant/credential change, paid model call, marketplace action, or hosted data write was performed. The canonical Space Page was not edited; the status changes below are proposals for its owner.

Repository: `https://github.com/atsokolas/note-taker-3.git`. Refreshed baseline: `82cdf318fe89ec516409fed5b3a79925bc63f700` (#495). Branch: `codex/noeis-roadmap-trust-2026-10-10`. Isolated checkout: `/Users/athantsokolas/Documents/Codex/2026-10-09/task/noeis-roadmap`.

The supplied checkout is on `codex/fizzy-68-69-2026-09-10`, HEAD `26db25df`, with two modified tracked files and extensive untracked documentation/QA files. It and all existing worktrees were left alone. Its cached origin/main was older than the actual remote. Remote refs were fetched in the isolated checkout, and open PR metadata was read using existing CLI authorization. Root AGENTS.md was read; current tracked main has no `.agents` or `.codex` skill directory or nested AGENTS.md under the changed UI paths. The Playwright skill was used for local browser verification.

## Evidence-backed roadmap reconciliation

| Roadmap item | Current repository evidence | Proposed status |
| --- | --- | --- |
| #464–467 Think render/Rescue/marks | All in baseline history. Existing retained-word alignment regression tests independently rerun. | Implementation merged; hosted and physical-device acceptance remains open. |
| Another tighter read loses intent | Still present at baseline's `addAlternative`. Repaired in this branch. | Locally implemented and tested; not released. |
| P0 Edition draft recovery | Baseline still promises “safe here” and discards words before reload. Repaired here. | Locally implemented and tested; not released. |
| #468 citation identity/source hygiene | Still open, head `9a1388cc`; not an ancestor of baseline. | Keep its existing review/deployment/authenticated acceptance gates open. No duplicate patch here. |
| #457 Library annotation | Still open. | Reconcile that branch separately; not recreated. |
| #469–471 theme/plugin/highlight reading place | Merged history retained. | Merge evidence only; existing attributed live checks remain separate. |
| #472 stale suite mocks/copy | Still open, head `4f72aeed`. | Current full UI run has three failures independently reproduced on pristine baseline; review the existing PR rather than duplicate it. |
| #473 sharing | Merged at `6eecdc4e`. | No duplicate sharing UI. Full owner rendering, privacy/persistence, actual devices and hosted acceptance remain open. |
| #474–478 Partner eval/approval/retrieval/tool loop/held views | Now all merged (#474 `3148ed10`, #475 `eb87f878`, #476 `5064ad1b`, #477 `4c216ca9`, #478 `4694be9b`). Later #479/480, #481, #483, #485–488 also present. | Replace the historical “open drafts” status with merged implementation. Do not carry forward old scores as current configured-model proof. |
| C2–C8 inventory | Main contains extensive C7/C8 implementation (#413–432 and earlier lineage), beyond historical C1. | Do not reschedule the whole series from the old snapshot. Per-flow acceptance inventory still needed. |
| Edition evidence hinge / room continuity | #495 includes checked supporting passages, the reader's finding layer, and follow-ups; #491–493/#497 contain zoom/shelf/byline work. Open #498 reviews these flows, without touching this branch's composer/popover files. | Reconcile shipped passage and placement contracts before extending them. No second store introduced. |
| P1 citation bounds/focus/labels | Baseline still hard-codes 360px, defaults unknown to Supported, and invents “one source” for partial support. Repaired here. | Bounded local repair tested; exact authenticated source-and-return acceptance remains open with #468. |
| Classifier / Decisions API | No thesis selection or human labels performed. | Preserve the manual 30-passage study, allowed labels, human review, and agreed thresholds. |
| First useful thought / meaningful return / optional craft | Broad product choices and voluntary usefulness proof remain unspecified. | Owner chooses a concrete path/work thread before broader implementation; correctness and physical acceptance precede optional character. |

Published package reconciliation, independently fetched from npm (read-only):

- `@noeis/noeis-cli@0.1.11`: published 2026-10-09 18:12:05.202 UTC; gitHead `0b1a5cbe976745ffea7312bd1b3501898b09e5c4`; all six tarball files exactly match that repository commit.
- `@noeis/wiki-mcp@0.4.4`: published 2026-10-09 19:35:03.033 UTC; gitHead `1597e64c3d77b95d92a3e23985d42eb6a1936ee4`; all 11 tarball files exactly match that repository commit.
- Baseline source declares CLI 0.1.11 and wiki-mcp 0.4.5. The 0.4.4 receipt does not establish installation, hosting, deployment, revocation/isolation acceptance, or the behavior of 0.4.5. Package metadata, tarballs, integrity receipts, and comparisons are under `output/playwright/packages/`.

## Local commit receipts

- `e304e66f` — preserve tighter intent (`NotebookEditor.jsx`, existing editor test).
- `6c520ed5` — truthful Edition conflict recovery (composer, existing tests, Edition reading CSS).
- `3ac28046` — citation bounds, truthful labels and focus (popover, reader/editor callers, component/reader tests, existing Wiki CSS).
- This review document is committed separately after those code slices. Local QA artifacts remain untracked under `output/playwright/` so the code review contains no tarballs or generated snapshots.

## Reviewable implementation slices

1. **Retain tighter intent.** `NotebookEditor.jsx` now carries tighter intent into every manually added alternative. The editor regression exercises two alternatives, Rescue controls, unchanged canonical prose, and Escape retention through the mocked persistence boundary. Existing alignment tests cover multiple cuts, rescue order, repeated words/phrases, punctuation and inserted wording.
2. **Truthful Edition recovery.** `ThoughtComposer.jsx` retains local words while fetching an incoming version. Both versions appear before an explicit choice. Keeping the local draft adopts only the fetched revision for a subsequent deliberate save; another conflict still preserves words. Failed/missing/stale reloads offer no discard action. Storage and clipboard failures are honest; copy and text download provide recovery. Failed device-draft clearing is reported. Account/issue/finding boundaries reset editors and reject late async replies; the thoughts hook returns successful rows and fences overlapping loads. Existing server revision contracts and account-scoped device storage are reused. No backend or ordinary Edition data changes.
3. **Reachable, truthful citation popovers.** `ClaimCitationPopover.jsx`, its reader/editor callers and existing CSS now constrain width/height to the viewport, handle resize and internal scrolling, expose Close, enter evidence from keyboard focus and restore the exact connected marker without reopening. Pointer hover keeps focus still; outside scroll dismisses safely even when the event target is Window. Unknown support remains unknown, and partial wording states no invented source count. The new component test fills a missing boundary-test gap; the existing reader suite adds the focus-return regression. This does not replace #468 or alter source identities, accepted Wiki bodies, or provenance contracts.

## Verification and practical limits

- **Final focused checks:** 244/244 tests, 12/12 suites. Command:
  `CI=1 npm test --prefix note-taker-ui -- --watchAll=false --runInBand src/components/editions src/pages/Editions.test.jsx src/components/think/notebook/NotebookEditor.test.jsx src/components/think/notebook/NotebookAlternativesRail.test.jsx src/utils/notebookReadTighter.test.js src/components/wiki/ClaimCitationPopover.test.jsx src/components/wiki/WikiPageReadView.test.jsx src/components/wiki/WikiPageEditor.test.jsx`.
- **Build/lint:** `CI=1 npm run build` in `note-taker-ui` succeeds with the built-in lint checks; `git diff --check` passes. No separate type checker is configured for these JavaScript files.
- **Broader UI run, before final focused follow-ups:** 3,630 passed, three failed, 430 suites (428 passed, two failed). Failures are four banned-copy offences in untouched Connections/Appearance/ChatGPT authorization copy, and two JudgmentFields missing-mock assertions. The same three failures reproduce on pristine `82cdf318` (16 other tests passed in those two suites). The full suite is not claimed green or rerun after the final bounded follow-ups. Existing #472 covers this workstream.
- **Local production-build Chromium, synthetic APIs only:** Edition conflict → failed reload preserves words → successful read shows both versions → explicit keep-local → save/reload retains chosen words. With actual browser device-draft writes denied, the composer displays the memory-only warning and downloads exactly “Memory-only synthetic words — download me.” Think Rescue restores “carefully” at the intended position; second and third alternatives retain tighter intent; previews leave canonical prose unchanged. Escape retains typed wording. Immediate reload activates the existing pending-save guard; a later reload restores saved wording controls. Wiki keyboard entry, Tab and Escape restore the exact marker and close without reopening. Tall evidence lists remain bounded at 320/375/430px and tablet/sidebar/desktop widths; geometry-only zoom-equivalent checks use preventScroll focus, not native browser zoom.
- Browser failures during development were repaired: Escape initially reopened the popover; a new reader regression and repeated browser replay cover the correction. An early geometry loop timed out at the 160px zoom-equivalent fixture when ordinary automation focus caused outside scroll/dismissal. Native 200% zoom keyboard behavior remains an open gate; geometry-only checks do not close it. The initial theme fixture returned an empty settings receipt and reset the selected theme; it was corrected before theme evidence was accepted.
- Local dev server startup encountered the existing CRA allowedHosts configuration failure. No security/network configuration was changed. The optimized build was served using a task-owned localhost static server instead.
- External fonts were deliberately blocked with all nonlocal browser requests. Fixture-only system-status/SEO parse warnings and forced 409/503 responses are not hosted app findings. No backend server suite, paid/configured model, Atlas vector path, native IME, assistive technology, real iPhone/iPad/Mac Safari, authenticated production, hosted sharing, OAuth revocation, live Wiki generation, or voluntary return/usefulness trial was run.

The final 375px Tokyo Midnight screenshots were visually inspected, using the actual theme picker with truthful synthetic settings receipts. They show reachable citation controls and the honest storage warning/export controls; they do not establish a global theme or contrast pass. Detailed logs, JSON results, reproducible synthetic fixture setup, snapshots, and screenshots are under `output/playwright/`. Those are local review artifacts, not production acceptance evidence. Installed dependencies were reused read-only through links; this checkout owns its build/cache. No tests seeded user accounts or wrote hosted data.

## Remaining owner and release gates

Prioritize independent review of these local slices and the existing #468/#457 seams. After separately authorized release, run authenticated exact-source navigation/Back/return, save/reload, privacy/revocation and real physical-device/IME/assistive-technology acceptance. Native 200% zoom needs an actual keyboard replay. Choose the thesis and manually label 30 passages before classifier work; agree quality, time, cost and review burden before model evaluation. Choose one first-use route and a real work thread for a voluntary return trial before broader cross-room or optional physical craft. Marketplace readiness, paid generation, publishing and deployment remain separately gated.
