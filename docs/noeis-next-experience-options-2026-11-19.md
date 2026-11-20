# Noeis experience options

## Built in this pass

| Moment | What happens |
| --- | --- |
| Follow a source from Judgment or Editions | A saved highlight or checked quotation opens at its location in Library. The reading rail goes back to the originating evidence link or finding’s source button. When the reader cannot locate the quote, it opens the available text and says that the exact words could not be found. |
| Explore a search result | Browser Back restores the query and the selected result in the palette. The result is keyboard-focused while search refreshes. The trail belongs to the current account and lives in memory for the current app session. |
| Recover a source sync | Readwise and Notion show the latest acknowledged import beside the current status. A failed import on a still-connected account offers a retry. Readwise records a successful check with zero additions while retaining its last receipt for material that arrived. |

## Three options for the next pass

| Option | Standout detail | What to verify |
| --- | --- | --- |
| **A. Reopen the desk** | Back from an article restores the shelf’s filter, selected title, and list position. Back from a reference restores the Notebook caret. | After three source visits, the reader picks up the same book or the same unfinished sentence with one action. |
| **B. Show the amendment** | Wiki opens a revised claim with the previous wording, the new wording, and the passage that prompted the edit. Judgment uses the same comparison for a changed call. | A reader can explain the change and inspect the reason from the comparison alone. |
| **C. Keep the save in hand** | An interrupted share-sheet or browser capture keeps the selected words and destination through sign-in. Its receipt opens the exact saved passage. | Expire a session midway through capture, resume it, and get one saved source and one highlight after reload. |

I’d start with **A**. Search and evidence now restore the reader’s place. Shelves and the writing desk are the two places where that same behavior would save the most repeated work.

## Details worth trying in each room

These are proposals. Each one names a concrete moment to improve and a way to tell whether it worked.

| Surface | Upgrade | Acceptance check |
| --- | --- | --- |
| Landing | Add a short caption to each specimen that identifies its real source, publication date, and who annotated it. | A guest can distinguish an authored note from a publisher’s words before opening either. |
| Examples, Guides, Proof | Add a “Try with this sample” action to one guide and an explicit way to remove that sample afterward. | A new reader can finish a real workflow without mixing example material into their archive permanently. |
| Auth and first run | Let someone skip the sample and arrive on an empty, usable Library with the same capture action available. | A new account can save its first source before opting into any tour. |
| Wiki home | Let the latest meaningful change name its reason and link to the revised sentence. Quiet the section on days with no revisions. | The change opens the actual diff, even when page titles stayed the same. |
| Wiki pages, dossiers and map | Add “Also cited in” beneath a source with one link for each page that relies on the same passage. | Updating a source reveals the claims that would need to be checked. |
| Library shelves | Preserve the last filter, selected result, and list position per shelf. Add a compact reason beside articles the Nightstand restores. | Filters and focus survive an article visit, a menu change, and the return on a phone. |
| Article and passage reader | If a cited passage moved, keep its recorded words visible in the margin and let the reader find nearby wording. | Editing the middle of a source leaves an honest receipt about the unavailable match and a manual way forward. |
| Books, lending and commonplace | Show when a commonplace entry is already attached to a book, and scroll to it from the save receipt. Put the edition in copied citations. | Resaving the same marked line sends the reader to the entry they already hold. |
| Think and Notebook | Keep the selection and caret when returning from a source. Show one understated save line for a committed edit. | A writer can visit a reference midway through a revision, return, and continue typing in the same place. |
| Concept and Question | Show the question’s open test and the passage that would change its answer. Give each evidence link a short role label. | The reader can tell what remains open without scanning a full list of references. |
| Judgment and Mirror | Add a dated comparison of the original call and the latest version. Link each amendment to the observation that warranted it. | A reader can reconstruct their earlier view after an outcome review. |
| Editions | When a finding was already saved, show its confirmed destination. Offer a one-click return to the paper when the original is only on the open web. | A reader can tell which saved source they will open before leaving the finding. |
| Work Today, Week and Day | On rollover, show which to-dos arrived from an earlier day. Give each one its original date and a single action to choose the next date. | The Monday view makes carried work distinct from newly scheduled work. |
| Work project notes and Deleted | Show the original task quote beside edited project text. In Deleted, say where an item will return and which references are still attached. | Restoring the item opens its old location and linked to-dos after reload. |
| Partner and recall | Make the active room, item, and scoped memory visible before asking. Keep this context while opening a citation. | A person can predict what the partner will inspect and retrace a specific answer. |
| Handoffs, Pencil and disagreements | Preview the exact line a proposal would add or replace. Place the two cited passages beside a disagreement. | A reader can choose Keep or Strike without opening a second screen. |
| Search and navigation | Show why the result matched in a short excerpt. Add a scope switch whose state returns with the query. | The reader can distinguish a title match from the same words in a highlight and resume either from Back. |
| Connections, permissions and imports | Show the last completed check beside the last material arrival. Explain read and write scope changes before reauthorization. | A quiet check, revoked grant, and new arrival each tell a different and accurate story. |
| Settings, Help and export | Use the same real sample paragraph for typography previews. Add a copyable support receipt with the failing operation and its identifier. | A user can describe an issue without sharing tokens or screenshots of private notes. |
| Public shares and adoption | Put the source version date on copied material and show whether the same version is already in the reader’s Wiki. | A second visit can reopen the existing copy and see when it diverged from the public edition. |
| Web, Chrome, Safari and share-sheet capture | Restore the pending selection after reauthentication. Add “Open at selection” to acknowledged saves when an anchor exists. | The selection and destination survive an expired session, and the saved receipt opens the quoted words. |
| iOS and Omarchy | Align focus on deep links and expose the current paragraph through native accessibility. Preserve the same reading anchor across device shells. | VoiceOver and keyboard users reach the same paragraph from a reading invitation. |
| CLI, MCP and agent setup | Put the canonical destination and operation identifier on a completed write receipt. Include the next recoverable operation when interrupted. | A terminal or agent can safely retry a partial write and reach the exact saved object. |

## Regression checks

Run the production web build at 1440px, 1320px, and 430px with reduced motion enabled. Use a signed-in fixture account with two articles, a settled Judgment citing one of them, an Edition finding with a checked quote from the same article, and two Readwise grants. Simulate a failed attempt on the browser-approved grant after a successful import.

1. Follow the settled Judgment citation and the Edition source panel into Library. Compare the focused passage to the recorded text. Use the in-reader return action and check that keyboard focus returns to each original control.
2. Search from the focused Edition finding and open the second result with Enter. Use browser Back while the result API is delayed. Check that the query and second result appear immediately, focus stays on the second result after refresh, and Escape closes the palette. Repeat with a 503 response to the refresh.
3. Load Connections with the failed session in recent history. Check that the previous success remains visible with its counts. Open the affected grant, retry, and verify the request targets that grant. Return a successful zero-addition result and verify the failure clears.
4. Check for horizontal overflow and uncaught browser errors. At phone width, confirm that the reading return tab and Partner have separate tap areas. Run the focused UI suites for the reader, Library, Judgment, Editions, search, and Connections and the server suites for the affected import routes. The browser fixture exercises the rendered app and controlled endpoint responses. The provider route tests exercise import logic with stubbed provider responses.

The local production build passed the browser checks at all three widths. The 1320px run preserved the selected result through an injected 503, and the 430px run confirmed separate tap areas for the reading return and Partner. All 223 focused UI tests and three server test files passed. The UI suite emitted console and React act diagnostics. The local checks used Node 22.22.3. Hosted and live-provider behavior remain unverified.
