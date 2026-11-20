# Work and Think craft pass

## Behavior

| Screen | Change |
| --- | --- |
| Work weekly review | Keep each reviewed row in place through saving, acknowledgement, and retry. The acknowledged action reads “Planned for …”, “Waiting on …”, or “Closed”. Planning and closing offer the existing Undo operation. Monday still derives from acknowledged plan events. If focus is still on the decision, move it to the next row on success or the same row’s Retry on failure. |
| Notebook return | Put the saved sentence directly below the title. Place its question and quote in one disclosure, with one source link when the same saved passage is also the Notebook origin. Continue writing restores the caret. A matching passage gets a small static word mark that clears on the first edit. |
| Partner comparison | Show the original and the proposal together once, with a small local change marked inside the full paragraph. Preserve other alternatives, the shorter-reading rescue actions, and existing revision history. |
| Other craft details | Reserve one Notebook save slot beside the menu. Keep shortcut help collapsed behind one Search disclosure. Leave space above focused reader citations for preceding text. Style affected passages in source correction as text links with a full-height target. |

## Regression checks

1. Open Work’s weekly review with three tasks due by Friday. Use Enter to plan the first, confirm that the next row stays in place and receives focus, and undo the plan from its original row. Repeat while moving focus elsewhere during the request. Inject a failed first acknowledgement and retry from the same row. Verify the operation ID is reused and Monday stays empty until acknowledgement. Reload the review and visit Work on Monday.
2. Open a Notebook with a two-line title and a saved next sentence, question, and source. Confirm that opening the note leaves the editor unfocused and the next sentence is visible on a 430px screen. Expand the source, then use Continue writing. Check the exact caret offset and shade, type a character, and confirm that the shade disappears and the menu keeps its position while the save label changes.
3. Open a saved Partner proposal. For a one-phrase edit, check both full sentences and the highlighted phrase. Keep the proposal and use History to restore the previous wording. An exact target and successful save are required for applying and retaining the revision.
4. Search for an article, expand and collapse the keyboard guide, open the result, and go back. Check the query and focus. Open a source from Judgment and from Editions, then verify that focus lands on the exact words below the sticky header, preceding text is visible above the quote, and Back returns focus to the original control.
5. Run the production web build and focused UI checks. Run the Work route and Notebook revision suites against isolated fixtures. Repeat the browser flows at 1440px, 1320px, and 430px.

## Local evidence

The production web build compiled successfully. The focused UI run passed 342 tests across 14 files, and both server test files passed. The UI runner recorded React act and mocked-browser diagnostics. Local Node was 22.22.3.

Fixture-backed Chrome checks exercised the stable Work row, keyboard focus, Undo, and Monday reload at all three widths. The 430px run injected a failed response and verified retry with the same operation ID. The Notebook checks verified the exact caret offset, clear-on-type, stable menu position, one visible Partner proposal, and restoring the pre-edit version. The Search and reader checks covered the collapsed shortcut guide, query and result focus through Back, and exact citation focus with room above the quote. The browser checks stand alongside the server tests for Work actions and Notebook history. Native-device and hosted behavior remain unverified.
