# Think: alternatives beside the page

## Delivered

The notebook has four possible places: a collapsible notes shelf at the far left, a quiet wording strip immediately beside the prose, the existing editor, and a retractable right drawer. The drawer separates Scratchpad, Material, and Partner while preserving the existing thought-partner mounting and backend behavior.

Word, sentence, and paragraph alternatives share the existing notebook workbench records. A preview changes the rendered passage without mutating the document. Keeping wording changes only the exact selected range and retains the previous wording as an alternative. Changed or missing passages require review; a stale range cannot replace another passage. Scope offsets persist through the workbench API and Mongoose schema. Alternatives can be reopened from Material's “Wording to revisit.”

Opening the right drawer folds the alternatives strip away and returns the draft to its original wording. Desktop and tablet layouts reserve a grid column for the drawer so it cannot cover the editor. Reopening alternatives closes the drawer; saved alternatives remain available. On mobile the right drawer becomes a keyboard-contained dialog and alternatives become a scrollable bottom sheet, with room to bring the active passage above it. Notes collapse when opening secondary controls on narrower screens. Reduced-motion behavior and the existing arrangement shortcut remain intact.

The simplified scratchpad opens with one jot field and **Keep thought**. Compact saved thoughts have **+** to insert and **×** to discard, with descriptive accessible labels and hover titles. Clicking the thought returns to its passage. **Next time** is collapsed until requested; a saved line is indicated in its summary. Existing data and legacy editor capabilities are preserved.

The new alternatives component replaces the Think right-drawer trial form. The legacy editor keeps its existing form because other consumers still use it. Duplicate layout breakpoint blocks and the old text-overlay preview were removed. No Wiki behavior was changed.

## Verification

- Six focused UI suites, 113 passing tests: editor, arrangement rail, alternatives keyboard behavior, exact scoped replacement/stale guards, styling contract, and Think partner templates.
- Notebook workbench HTTP route test passes, including persisted sentence offsets.
- Optimized production UI build passes with CI warnings treated as errors.
- Rendered fixture checks at 1440px, 1320px, and 430px: no horizontal overflow; compact drawer, Escape return, mobile selected-passage positioning, scratchpad mode switching.
- Browser checks: paragraph adoption and reload; sentence preview preserving surrounding text; original retained after adoption; held scratchpad thought surviving reload; unsubmitted jot surviving drawer mode switches.

This is local evidence. The visual fixture uses the real workbench route with an isolated file-backed model adapter. It does not prove MongoDB persistence, production auth, or model generation. It does not read production data.

## Try it

From this worktree, build the UI and run `node scripts/serve_think_room_qa.js`. Open <http://127.0.0.1:3107/__qa>. The invented notebook state is stored under ignored `tmp/think-room-qa.json`.

1. Put the caret in a paragraph, select **Try wording**, and choose word, sentence, or paragraph.
2. Write an alternative and choose **Read in place**. Compare it with **original**. The draft remains unchanged.
3. Choose **Keep wording**, reload, then reopen **Try wording**. The adopted text is in the draft and the earlier wording is still available.
4. Hold a thought in **Scratchpad**. Switch to **Material** and back; reload after holding it. The thought remains separate from the draft until explicitly placed.
5. Change a passage with an existing alternative, reopen it through **Material → Wording to revisit**, and check the review warning. Stale wording cannot be kept without review.
6. At a narrow width, check the alternatives sheet and the right drawer; Escape closes the drawer and returns focus.

Local screenshots live in `output/think-alternatives/desktop.jpg` and `mobile.jpg` (not committed).

## Remaining

Follow-up refinement verified locally: 94 focused editor/template/style tests and the CI production build pass. At the actual 1296px browser width and at 900px, measured editor and drawer bounds do not overlap and the page has no horizontal overflow. Opening Scratchpad hides alternatives; returning to Try wording closes the drawer and preserves saved wording. Mobile retains the full-width drawer with Escape returning focus. Evidence: `output/think-alternatives/scratchpad-refined.jpg`.

- Physical touch-device acceptance, including virtual-keyboard positioning.
- Merge and deployment; this branch is not live.
- Broader cross-room applications and a dedicated “read tighter” transformation are outside this approved layout slice.

Branch: `codex/think-alternatives-room`, based on `origin/main` at `d55fe570`. Canonical checkout and its dirty files were preserved; implementation lives in the reused isolated worktree.

## Release acceptance, October 1

The full Express API ran against a separate Atlas MongoDB QA database, with scheduled workers disabled and an invented QA user/note. Browser acceptance verified sentence adoption and scratchpad reload. Direct Mongoose readback confirmed the exact scoped target, retained original, one scratchpad thought, and a partner-origin alternative at revision 3. An obsolete workbench revision returned HTTP 409 without replacing saved state.

One bounded live Partner request returned “An effective response guides us in selecting our next step.” The UI prepared the prompt without sending it, then explicitly sent it when asked. “Try as alternate wording” opened the proposal with visible partner provenance; it did not adopt it. The proposal persisted in MongoDB. No production notebook was used for these checks.

Native Safari loaded the Mongo-backed notebook and scratchpad correctly. Screenshot: `output/think-alternatives/safari-mongo.png`. Physical-device keyboard testing remains separate.

This pass found that the save status ignored workbench's debounced dirty state. It now says “Saving…” until the write completes. A before-unload guard protects pending workbench changes and attempts a flush; hiding the tab also flushes. A regression test verifies that navigation remains guarded until a real write resolves. The hook is not a general offline editor; an unsaved-change warning still requires the person to stay until saved.

Final local checks: eight UI suites / 136 tests, workbench route checks, production build, and diff whitespace checks pass.

## Comparison with the original Fried-inspired brief

Delivered: spare adjacent wording choices; manual word/sentence/paragraph alternatives; original and multiple editable possibilities; preview distinguished from acceptance; deliberate keep; stale-passage review; summonable Partner proposals with provenance; collapsible notes and right scratchpad; existing set-aside/restore and exact-place Next time capabilities retained. The later accepted layout refinement intentionally allows clean reflow and folds alternatives when the right drawer opens.

Still planned: **Read tighter**, including rescuing individual cut phrases; a dedicated agent interaction that offers a few distinct wording choices and explains their differences; quiet stored-alternative marks visible while the alternatives strip is closed. The current Partner is general conversation, with an explicit action to bring its response into alternatives.

Cross-room roadmap remains: Library passage comparison; evidence-backed Wiki claim alternatives; competing Judgment explanations; source-preserving Editions-to-Think responses. Optional sound and broader arrangement/opening/ending exploration were future craft directions, not requirements for this Think release.
