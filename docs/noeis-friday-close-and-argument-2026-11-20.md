# Close the week and continue the argument

## Built

| Area | Behavior |
| --- | --- |
| Work · Close the week | From the current week on Today, review open to-dos and questions that have reached their planned day or have no date. Plan one for next Monday, record who it is waiting on, or close it. Existing Work actions and the Work store remain the source of truth. |
| Work · Monday starts here | The preview is derived from active tasks and questions with acknowledged plan events for next Monday recorded this week. Already-waiting, set-aside, completed, and future work stays out of the review. When there are no qualifying Monday plans, that section stays silent. |
| Think · Continue the argument | A saved next sentence opens with the passage and question attached to its paragraph when those references exist. Go to the writing returns to the saved block and caret. A missing block falls back to the end of the draft. |
| Work and Think · Source changes | Work task history pairs the original captured quote with the latest text of the same block when they differ. Think shows the draft paragraphs beside a corrected quotation. Keeping the original can record an optional reason on the existing source-correction receipt. |
| Work · Handoff | An existing task can be handed off from its inspector. Review its saved title, source line, and intended recipient before submitting. The server checks that the saved task still matches the preview. Work handoffs stay within Work access, with an explicitly addressed task snapshot available to the built-in agent. |
| Think · Partner edits | Inspect a Partner suggestion in the full affected paragraph before applying it. Save the previous draft and start a separate revision for the adopted wording. The receipt offers Undo and opens the saved revision history. |

## Next options

| Option | Prototype | Acceptance check |
| --- | --- | --- |
| **A. Bring the reply back** | Work shows a completed handoff in its originating task, with the initial request, source line, and suggested next line. Keep as Work draft makes a private draft beside the original note. | Review a reply, keep it beside the existing note, and reopen it from the same task after reload. The original line and the agent’s reply remain distinct. |
| **B. Give the argument a test** | In Think, place one falsifiable test alongside the draft sentence and a filed opposing passage. Carry all three into Judgment when the writer deliberately holds a view. | Edit the test and revisit it from Judgment. The original Notebook paragraph and contrary passage are still traceable. |
| **C. Show where a source is used** | From Library or Wiki, show the exact saved paragraphs that quote a changed source. Let the reader review those records one at a time. | A correction with three actual uses shows those three and no neighboring passages. Each review opens the corresponding record and gets a receipt. |

Start with A. It closes the loop created by the handoff preview and makes an agent’s reply useful in the same place the work began. B gives Think a clear path from writing to a claim the reader can test.

## Follow-through across surfaces

| Surface | Small next upgrade |
| --- | --- |
| Home and first run | Show one deliberate return point from the reader’s own activity. Name the sentence or Monday task that opens and keep the slot quiet when there is no saved place. |
| Library, reader and books | Put the book edition or article locator beside the recorded quote in the passage menu. Let copied evidence open at that quote. |
| Concept, Question and Judgment | Carry the open test, contrary passage, and date together. Keep the test from the time of the decision available during outcome review. |
| Wiki, Editions and public shares | Use the same version date in the source preview, copied reference, and public view. Open the existing saved copy from a repeat-save receipt. |
| Search and navigation | Show whether a hit matched a title, inside a note, or inside a saved passage. Keep that excerpt beside the selected result when going back. |
| Work calendar and Deleted | After rescheduling with the keyboard, focus the moved card on its destination day. Preview where a restored note and its task links will return. |
| Connections and settings | Put the last material arrival beside the last completed check. Add a copyable operation receipt with the provider and recovery action. |
| Chrome, Safari, iOS and Omarchy | Open the confirmed passage from the save receipt and put focus on its words. Verify the Safari toolbar and signed iOS share-sheet paths separately. |
| CLI, MCP and agent tools | Give completed writes a canonical link and the ID of the affected block or highlight. Reuse those identifiers when resuming an interrupted operation. |

## Verification plan

1. Set the browser to Friday, November 20, 2026 in America/Chicago. Plan a task for Monday, November 23, assign a second task to Waiting on, and close a third. Reload and verify the Monday preview lists the acknowledged plan.
2. Open the history of a completed task. Compare the original quote with the edited text of its source block. Delete the block in a fixture and verify the quote remains and the note can open at its dated entry.
3. Preview a Work task handoff. Confirm the page makes no request until submit. After submitting, open the receipt and inspect its source link. With live route tests against an isolated database, try reading or taking the handoff from a connection without Work access. Check that a stale snapshot is rejected.
4. Open a Notebook from its next-sentence link. Inspect the saved question and passage, then move to the exact block. Compare a corrected quotation with its affected draft paragraph and persist a review reason. Preview a saved Partner alternative, apply it, and open version history.
5. Run the affected UI and server tests, the production web build, and the browser flows at 1440px, 1320px, and 430px. Use fixture handoffs and verify the proposal controls in the clickable mockups separately.

## Local verification

Chrome exercised Friday decisions through reload and into Monday at 1440px, 1320px, and 430px with reduced motion. It also checked the Work comparison and handoff receipt, Think’s exact block return, source-correction reason through reload, and adopting and restoring Partner wording. The 1440px run additionally removed the Work source block and reopened the note at its dated entry. The three clickable proposals worked at 1320px and 430px.

The production web build, 202 focused UI tests across 13 files, and six server test files passed. The browser used fixture endpoints. The Mongo-backed route checks covered Work handoff scope and stale previews, and proved that a Partner revision preserves the immediately preceding draft within the usual ten-minute editing window. The UI tests emitted four React act diagnostics. Local Node was 22.22.3. Hosted and native-device behavior remain unverified.
