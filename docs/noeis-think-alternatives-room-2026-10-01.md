# Think: alternatives beside the page

## Delivered

The notebook has four possible places: a collapsible notes shelf at the far left, a quiet wording strip immediately beside the prose, the existing editor, and a retractable right drawer. The drawer separates Scratchpad, Material, and Partner while preserving the existing thought-partner mounting and backend behavior.

Word, sentence, and paragraph alternatives share the existing notebook workbench records. A preview changes the rendered passage without mutating the document. Keeping wording changes only the exact selected range and retains the previous wording as an alternative. Changed or missing passages require review; a stale range cannot replace another passage. Scope offsets persist through the workbench API and Mongoose schema. Alternatives can be reopened from Material's “Wording to revisit.”

On compact screens the right drawer becomes a keyboard-contained dialog. On mobile the alternatives become a scrollable bottom sheet, with room to bring the active passage above it. Notes collapse when opening alternatives on narrower screens. Reduced-motion behavior and the existing arrangement shortcut remain intact.

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

- Authenticated acceptance against real MongoDB and the live Partner proposal flow. “ask” deliberately prepares a prompt in the existing Partner rather than silently sending it.
- Native Safari and physical touch-device acceptance, including virtual-keyboard positioning.
- Merge and deployment; this branch is not live.
- Broader cross-room applications and a dedicated “read tighter” transformation are outside this approved layout slice.

Branch: `codex/think-alternatives-room`, based on `origin/main` at `d55fe570`. Canonical checkout and its dirty files were preserved; implementation lives in the reused isolated worktree.
