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
- `64d5be73` — freeze all save attempts, invalidate repeat-review choices, preserve chosen quotes, and fence clipboard/account recovery.
- `8e0ea9ca` — suppress both editor focus observers, stabilize omitted sources, and normalize read-only labels.
- `fc6ee56c` — consume citation Escape before leaving Wiki edit mode.
- This review document is committed separately after those code slices. Local QA artifacts remain untracked under `output/playwright/` so the code review contains no tarballs or generated snapshots.

## Reviewable implementation slices

1. **Retain tighter intent.** `NotebookEditor.jsx` now carries tighter intent into every manually added alternative. The editor regression exercises two alternatives, Rescue controls, unchanged canonical prose, and Escape retention through the mocked persistence boundary. Existing alignment tests cover multiple cuts, rescue order, repeated words/phrases, punctuation and inserted wording.
2. **Truthful Edition recovery.** `ThoughtComposer.jsx` retains local words while fetching an incoming version. Both versions appear before an explicit choice. Keeping the local draft adopts only the fetched revision for a subsequent deliberate save; another conflict still preserves words. Failed/missing/stale reloads offer no discard action. Storage and clipboard failures are honest; copy and text download provide recovery. Failed device-draft clearing is reported. Account/issue/finding boundaries reset editors and reject late async replies; the thoughts hook returns successful rows and fences overlapping loads. Existing server revision contracts and account-scoped device storage are reused. No backend or ordinary Edition data changes.
3. **Reachable, truthful citation popovers.** `ClaimCitationPopover.jsx`, its reader/editor callers and existing CSS now constrain width/height to the viewport, handle resize and internal scrolling, expose Close, enter evidence from keyboard focus and restore the exact connected marker without reopening. Pointer hover keeps focus still; outside scroll dismisses safely even when the event target is Window. Missing/invalid support stays unknown in read-only document rendering and the popover; the editable/server/shared serialization contract remains open below. Partial wording states no invented source count. The new component test fills a missing boundary-test gap; the existing reader suite adds the focus-return regression. This does not replace #468 or alter source identities, accepted Wiki bodies, or provenance contracts.

## Verification and practical limits

- **Final focused checks:** 275/275 tests, 14/14 suites. Command:
  `CI=1 npm test --prefix note-taker-ui -- --watchAll=false --runInBand src/components/editions src/pages/Editions.test.jsx src/components/think/notebook/NotebookEditor.test.jsx src/components/think/notebook/NotebookAlternativesRail.test.jsx src/utils/notebookReadTighter.test.js src/components/wiki/ClaimCitationPopover.test.jsx src/components/wiki/WikiPageReadView.test.jsx src/components/wiki/WikiPageEditor.test.jsx src/components/wiki/extensions/Claim.test.js src/components/wiki/renderTiptapDoc.test.jsx`.
- **Build/lint:** `CI=1 npm run build` in `note-taker-ui` succeeds with the built-in lint checks; `git diff --check` passes. No separate type checker is configured for these JavaScript files.
- **Broader UI rerun after adversarial fixes, before the final enclosing-shell Escape fix:** 3,646 passed, three failed, 430 suites (428 passed, two failed). Failures are four banned-copy offences in untouched Connections/Appearance/ChatGPT authorization copy, and two JudgmentFields missing-mock assertions. The same three failures reproduce on pristine `82cdf318` (16 other tests passed in those two suites). The full suite is not claimed green. Final focused checks, build and browser replay cover the last Escape event-boundary change; that small follow-up was not followed by another full-suite run. Existing #472 covers this workstream.
- **Local production-build Chromium, synthetic APIs only:** Edition conflict → failed reload preserves words → successful read shows both versions → explicit keep-local → save/reload retains chosen words. With actual browser device-draft writes denied, the composer displays the memory-only warning and downloads exactly “Memory-only synthetic words — download me.” Think Rescue restores “carefully” at the intended position; second and third alternatives retain tighter intent; previews leave canonical prose unchanged. Escape retains typed wording. Immediate reload activates the existing pending-save guard; a later reload restores saved wording controls. Wiki keyboard entry, Tab and Escape restore the exact marker and close without reopening. Tall evidence lists remain bounded at 320/375/430px and tablet/sidebar/desktop widths; geometry-only zoom-equivalent checks use preventScroll focus, not native browser zoom.
- Browser failures during development were repaired: Escape initially reopened the popover; a new reader regression and repeated browser replay cover the correction. An early geometry loop timed out at the 160px zoom-equivalent fixture when ordinary automation focus caused outside scroll/dismissal. Native 200% zoom keyboard behavior remains an open gate; geometry-only checks do not close it. The initial theme fixture returned an empty settings receipt and reset the selected theme; it was corrected before theme evidence was accepted.
- Local dev server startup encountered the existing CRA allowedHosts configuration failure. No security/network configuration was changed. The optimized build was served using a task-owned localhost static server instead.
- External fonts were deliberately blocked with all nonlocal browser requests. Fixture-only system-status/SEO parse warnings and forced 409/503 responses are not hosted app findings. No backend server suite, paid/configured model, Atlas vector path, native IME, assistive technology, real iPhone/iPad/Mac Safari, authenticated production, hosted sharing, OAuth revocation, live Wiki generation, or voluntary return/usefulness trial was run.

The final 375px Tokyo Midnight screenshots were visually inspected, using the actual theme picker with truthful synthetic settings receipts. They show reachable citation controls and the honest storage warning/export controls; they do not establish a global theme or contrast pass. Detailed logs, JSON results, reproducible synthetic fixture setup, snapshots, and screenshots are under `output/playwright/`. Those are local review artifacts, not production acceptance evidence. Installed dependencies were reused read-only through links; this checkout owns its build/cache. No tests seeded user accounts or wrote hosted data.

## Remaining owner and release gates

Prioritize independent review of these local slices and the existing #468/#457 seams. After separately authorized release, run authenticated exact-source navigation/Back/return, save/reload, privacy/revocation and real physical-device/IME/assistive-technology acceptance. Native 200% zoom needs an actual keyboard replay. Choose the thesis and manually label 30 passages before classifier work; agree quality, time, cost and review burden before model evaluation. Choose one first-use route and a real work thread for a voluntary return trial before broader cross-room or optional physical craft. Marketplace readiness, paid generation, publishing and deployment remain separately gated.

## Adversarial review and final readiness

An independent read-only reviewer inspected the actual `82cdf318..8e7c812a` diff and replayed the actual composer and focus handlers with synthetic React/jsdom fixtures. Supported findings were fixed in two follow-up code commits, with six new regression cases first observed failing against the reviewed code: unchanged-save conflict reload replacing local words, failed/missing repeat review retaining a stale discard choice, late clipboard completion hiding a newer memory-only warning, recovery actions starting after account switch, and editor focus-return reopening through native TipTap focusin plus React focus. Two further regressions cover adopting a saved version's full quote (including empty quote) until a newly selected passage, and omitted-source render-loop robustness. Read-only renderer tests cover absent/invalid/unknown support without changing stored mark attributes.

The actual optimized-build editor replay then exposed the enclosing edit shell reacting to the same Escape. The citation now consumes Escape in capture phase before the shell's bubble handler; the editor regression includes `onDoneEditing` and proves it is not invoked. This additional final correction was independently reviewed. Final Chromium replay passed three consecutive citation opens/Escape closes with exact marker focus and edit mode retained; a later ordinary Escape exited edit mode. An earlier automation waited for the read-route “Edit” button after exiting into the workspace, whose correct control is “Edit article”; inspection confirmed the successful exit and the corrected replay passed. Local browser replay uses the real TipTap editor, whereas component tests mock TipTap and wire both focus paths explicitly.

**Remaining bounded P1 code contract:** `extensions/Claim.js` still defaults missing/invalid editable support to supported, server claim derivation maps unknown to unsupported, the claim/history schema enums omit unknown, and public Wiki serialization defaults absent support to supported. Extending the editable mark alone would introduce a persistence mismatch, so its contract was left unchanged. The current repair improves reading presentation and known partial wording; it does not close unknown support across editing, persistence or sharing. A separate coherent contract slice should preserve existing assessed labels and citation bindings while adding honest unassessed round trips, using synthetic save/reload/public-projection tests. No migration of accepted content is authorized or needed for those tests.

Exact independently reproduced baseline failures:

1. `src/system/bannedWords.test.js` — “the words this product does not say / names the reader’s things, never the plumbing.” Four unchanged offences: ConnectionsAgents.jsx:135, AppearanceSection.jsx:279 and :294, ChatGPTConnectAuthorize.jsx:8.
2. `src/pages/JudgmentFields.test.jsx` — “a line that does not land / says so, instead of quietly dropping it.”
3. Same suite — “a line that does not land / keeps the words in the field when the save fails.” Both Judgment assertions expect `/was not saved/` but receive “The accepted-research review could not be loaded. Your judgment was not changed.”

Pristine baseline reproduction and full/focused test JSON/logs are preserved under `output/playwright/results/`. Focused review reproduction receipts are there too. Existing #472 should be reconciled before changing those unrelated mocks/copy. No global-server or hosted acceptance claim follows from these UI checks. The bounded slices are ready for local code review; they are not a release acceptance certificate.

## Ranked next steps

1. **Local trust work:** review these commits alongside existing #468 (owned citation identity) and #457 (Library annotation), without duplicating them. Complete the editable/server/public unknown-support contract above as the next small P1 code slice. Reconcile #472 to restore the existing full UI gate.
2. **Hosted acceptance, following separate release authorization:** replay exact citation → retained Library passage → Back/return, conflict/reload and stale-target behavior with matching backend/frontend. Recheck explicit approval and account/scope/revocation boundaries. Existing draft PR and preview evidence alone does not close this.
3. **Physical-device gate:** real iPhone/iPad and Mac Safari with keyboard resize, touch selection, IME, background/foreground saves, native 200% zoom, reduced motion and assistive technology. Synthetic Chromium width checks are preparation only.
4. **Private plugin trial:** use the existing connection on an owner-chosen real workflow; collect visible per-call Edition retry receipts and remaining isolation/revocation evidence. Successful paid Wiki generation, reviewer recording and marketplace material remain separately gated. No unspecified recurring research or submission.
5. **Smallest product decisions:** choose one first-use source-to-Think route and one work thread for a voluntary return trial. For classification, choose one thesis and manually label the preserved 30 passages, then agree quality/time/cost/review-burden thresholds. These human choices precede classifier integration and optional craft expansion.
