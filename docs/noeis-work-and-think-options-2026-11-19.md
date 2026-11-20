# Returning to your work in Noeis

## This pass

- Library returns to the same shelf, filter, and row after opening a source. Restoration waits for the matching collection to finish loading. If the row disappeared, the shelf’s search field takes focus.
- Think saves the draft and its place before following an internal reference. Browser Back restores the active paragraph and selection when the words still match. A changed paragraph falls back to its caret, without selecting different text.
- Work shows the original quote underneath a follow-up while you rewrite its title. Adding the follow-up returns focus to the selection in the note. The existing source remains attached to the saved task.
- Judgment records previous and revised wording beside the filed passage you select. Wiki shows the same comparison in Open Sentence and links passages added in the accepted revision. If the history cannot establish the source of a change, the wording can still be compared.
- Chrome keeps the pending URL, selection, folder, and placement for the same account after sign-in. The iOS share sheet hands a pending capture to the signed-in app. Both use the returned highlight ID for the receipt. Retrying the same capture reuses the highlight ID.

## Next pass options for Work and Think

| Option | Work | Think | Acceptance check |
| --- | --- | --- | --- |
| **A. Close with a decision** | At the end of Today or Week, show open items that need a date, a person, or closure. Offer a single next-step control beside the note that created each item. | Keep the passage and question beside the next sentence when you reopen a draft. A click returns to that exact block. | Close Friday. On Monday the follow-up has the date you chose and Think opens to the unfinished argument. |
| **B. Keep the record with the change** | When the source note changes after task capture, show the original quote in task history beside the current line if available. | In a draft, show the changed source and affected paragraphs together. Let the writer set aside the old quote with a reason. | Edit the underlying source. The task still opens its original quote, and the writer can see which paragraphs to review. |
| **C. Make a deliberate handoff** | Show the exact task title, source line, and destination before handing a follow-up to someone else. | Let an accepted Partner suggestion preview its target paragraph and show where the previous wording can be restored. | An intentional handoff survives reload, names who holds it, and points back to the unchanged source. |

Start with **A**. It shortens a daily loop in each room using the notes, dates, and drafts people already keep. Use **B** after that so returning to changed material remains trustworthy.

## Details across the product

| Surface | Next upgrade | What to try |
| --- | --- | --- |
| Work Today | Give rollover items their original day and a quick choice of today, later, or close. | Test a Monday with work from Friday and a new same-day task. |
| Work Week and Calendar | After a move, announce the destination day and focus the moved card. Match pointer and keyboard behavior. | Move a task past a busy day using keyboard only, then undo. |
| Work Notes, Projects and Deleted | Keep the accepted quote in task history, offer a source preview in place, and show restore destination before confirming. | Edit or remove the source line, reopen the task, then restore the note. |
| Work Waiting and Handoffs | Keep the named owner, last request, and next check-in together. Put the original note a tap away. | Follow the same item from Today to Waiting and back after it is answered. |
| Think desk | Show one reason a note is on the desk, using its actual next sentence or a question the writer left open. | The desk stays quiet when there is no deliberate return line. |
| Think Notebook | Add a short in-place source preview that keeps the active paragraph in view. Put the saved source’s date in the preview. | Inspect a reference while revising a paragraph without leaving the draft. |
| Think Concept and Question | Show a question’s strongest supporting and opposing excerpts side by side when both are filed. Attach a line explaining their relevance. | One missing side stays empty and the available excerpt opens at the quote. |
| Think Partner and recall | Before applying an edit, show its exact affected block. After applying it, offer restore through the same draft history. | Review, apply, and undo a suggestion without replacing unrelated words. |
| Library shelves | When an article moves behind the reader’s back, show its new shelf in the origin row’s quiet receipt. | File a selected source elsewhere and return to the same filter. |
| Article and passage reader | Offer one stable open-at-quote action from the mark menu. Keep the copy concise and include its source and locator. | Copy a receipt, reopen it in a new tab, and check the quote. |
| Wiki entrance and movement | Group changes that share a revision and list the actual affected claims. | One citation update appears as one event even when several claims rely on it. |
| Wiki pages, dossiers and Map | Let a source show the claims it supports, then return the reader to the same map node. | Follow a source to a claim and go back with zoom and selection intact. |
| Judgment and Mirror | Put the confidence and test from the time of the revised call beside the amendment when recorded. | Review a result without confusing today’s confidence with the original call. |
| Editions | Give a saved finding a receipt that names its destination and the passage that was kept. | A repeat save shows where the existing source lives. |
| Books, lending and commonplace | Show the marked page or location on the loan receipt, with a preview of exactly what is shared. | A recipient lands at the intended mark in the intended edition. |
| Handoffs, Pencil and disagreements | Give the same provenance line to cards, approval previews, and history. | A reviewer can identify the suggested change and its source after accepting it. |
| Search and global navigation | Use a matched sentence to explain a result’s position and highlight the matching terms. | Distinguish a title hit from a passage hit with the same words. |
| Connections, permissions and import | Put the newest material arrival and the latest completed check side by side. | A quiet day explains an unchanged Library while a failed check still offers recovery. |
| Settings, Help and export | Preview one representative passage in appearance settings and preserve the reader’s return location from Help. | Change typography and go back to the active paragraph. |
| Landing, Examples, Guides and Proof | Let visitors open a source from an example directly, with the origin claim visible alongside it. | A visitor can trace a claim back to its source before signing up. |
| Sign-in and first run | Describe the next action on the sign-in screen when a save or new note is waiting. | Sign in from a pending action without an extra tour or lost context. |
| Public shares and adoption | External evidence gets an explicit original-source link and a share timestamp. Say what copied versions include. | A recipient can predict the contents and identify the version they copied. |
| Desktop browser, share sheet and native | Bring saved-passage receipts to Safari’s toolbar capture and the native reader. | Share a selected passage, reopen the receipt with VoiceOver, and hear the selected words. |
| CLI, MCP and agents | Return the affected block or highlight identity and the owning record together. | A retry uses the same operation ID and produces a traceable link. |

## Regression checks

- In Chrome at 1440px, 1320px, and 430px, open an article from a scrolled filtered shelf, go Back, and compare focus and scroll position. From a Notebook draft, select words, open an internal reference, go Back, and type into the selection. Verify a pending edit has been saved before crossing rooms.
- Select a line in Work, choose Make Open, rename the task, and check the displayed and persisted source against the original. Confirm that Add returns focus to the selection. Open a Judgment record with a filed source and check the previous wording, revised wording, and link.
- Compare a promoted Wiki revision with a candidate. Only passages attached in the promoted wording change qualify for the new source line. Candidate, missing, unchanged, or unbound citations produce silence.
- Expire Chrome access after accepting the article but before accepting the highlight. Complete sign-in, revisit the tab, and resume. Verify the original folder, placement, and selection. Send the same anchored capture concurrently to the highlight route with an isolated Mongo instance and check that both receipts use one stored mark.
- Build the iOS app and both extensions. On a signed device, expire the session in the share sheet, reopen Noeis, sign in, finish the pending share, and open its exact passage. A second account should see only its own pending capture.

## Local verification

The built web app passed the shelf, Notebook, Work, and Judgment scenarios in Chrome at 1440px, 1320px, and 430px with reduced motion. The browser fixtures confirmed the draft save before navigation and checked the Work task’s acknowledged source quote. The actual highlight route, backed by an isolated Mongo replica set, returned the same mark for two concurrent captures and queued one embedding. The packed Chrome extension passed the sign-in interruption test with the original quote, context, folder, and placement. The iOS simulator build compiled the app and both extensions. Signed-device interaction, live provider calls, and hosted deployment are unverified.

The focused checks covered 416 UI tests across 13 files and six server test files. The UI runner emitted React act diagnostics. The local Node version was 22.22.3.
