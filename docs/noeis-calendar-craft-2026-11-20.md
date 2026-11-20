# Work calendar and the next details

## Calendar

Today rings its date number. The selected date gets a filled cell and a bottom rule. Both can appear on the same day. The task dot stays separate, and the three states come from the current date, selected date, and existing plan.

The week range lives between fixed arrow slots. It names both months when a week crosses the boundary. The dates get their own row so the arrows never take width away from the tap targets. The planner and the picker in Work notes use the same layout rules.

Tab enters the dates at the selected day. Left and Right move one day, Up and Down move one week, and Home and End go to the ends of the displayed week. The week buttons keep focus when used with the keyboard. Opening another date from the picker keeps it open through the Today-to-dated-page transition.

## Verification

- On Monday November 30, open the picker. Confirm Today has both treatments. Move right to December 1, then confirm its fill and November 30’s ring. Move back and forward using the week buttons and compare their positions on each side of the month boundary.
- Use End, Right, and Up to cross the week boundary and return to Today. Check that the newly selected button has focus and that only one date is in the Tab sequence.
- At 430px, increase the root text size to 125%. Tap another date and check usability, target size, and horizontal overflow. Open the same picker from a Work note and verify that writing stays intact when expanding the week.
- Local fixture runs covered Chrome at 1440px and 430px and WebKit at 1320px and 430px. The Work suite also exercised the note and week fold.

## Next details across the project

| Surface | Change worth trying | Proof |
| --- | --- | --- |
| Home and navigation | Keep the return action and its article or notebook title on the same baseline. Move supplemental dates below the title only when the line wraps. | A long title preserves the action and mouse and keyboard focus at sidebar width. |
| Library and Books | Align source, elapsed time, and reading position in one stable metadata line. When a value is missing, leave it out gracefully. | Scan a shelf with long and short titles and open a book without the rows shifting when progress loads. |
| Reader | Make the bottom Back label fit on one line on a phone. Let the supporting reading status yield first if it needs the space. | “Back to the finding” and Partner each keep their full tap area at 430px and increased text size. |
| Think and Concepts | Move Notebook’s standalone Hand off action into the utility row or its menu. Preserve the same handoff preview and return focus to the trigger. | The heading and saved next sentence move higher on mobile. A user can still reach the action by keyboard. |
| Wiki and Editions | Use one source line for title, date, and locator. Give already-saved findings a stable receipt beside the action. | A long filing title wraps cleanly and reopening the receipt lands at the captured quote. |
| Judgment | Set the record’s dates in tabular figures and distinguish two entries on the same day with their saved times. | Two changes on the same day remain easy to scan and their evidence starts at the same indent. |
| Search | Preserve the same focus outline while results refresh. Keep the exact matched words in view when the match is inside a quotation. | Back restores the selected result and its line through a slow search response. |
| Connections | Use the same space on a provider row for the latest completed check and its immediate recovery action. | A timeout offers Retry beside the previous success and leaves the account name steady. |
| Public shares and capture | Use the quote or article title as the label on the receipt’s Open action. Give the receipt and app the same words when something has been saved. | A recipient or a reader returning from capture can predict where the link opens. |
