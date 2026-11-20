# Noeis experience follow-through

The first return should feel like opening a book at the line you stopped on. Wiki now offers one article with a recent reading place. Its link opens the reader, finds the persisted paragraph, and puts focus on that paragraph. The reader shows “You stopped here” or “You stopped near here” according to what the anchor can prove. The reading rail keeps Back to Wiki within reach and returns focus to the invitation. Dismissal is browser-local and applies to that particular saved place. A later reading position can earn a new invitation.

## What changed

| Direction | Implemented |
| --- | --- |
| Finish the details | Web and Chrome name the acknowledged destination and link to the item. Web retries keep the original input or only the failed links in a batch. The iOS app, share sheet, and Safari extension expose an open-saved-article action. Handed off keeps loaded sections when another request fails, offers Retry, and keeps a strike reason on failure. Its global shortcuts step aside for focused controls. |
| Pick up where you left off | Wiki connects to the existing persisted article anchor. Books derives the starting page from marks until the reader deliberately turns a page. Think’s Write the next sentence action places the cursor at its saved target, with an end-of-note fallback. Work’s dated project log opens the corresponding entry through the editor’s existing outline navigation. |
| Make evidence visible | Public landing links to the First Principles Thinking entry in the real Mental Models collection. Public collection entries and single pages share one reference renderer. An opened citation offers a way back to the exact originating button. The private Wiki source rail has the same explicit return. A shared collection names how many pages will be copied and where their public material lands. |

### What earns a Wiki return

- **Eligibility.** An owned, visible article with reader-initiated saved progress past 5% and below 90%, visited within 21 days. The same account owns both the reading state and the article.
- **Quality.** The newest eligible record must have an anchor, title, and body. Suppress suppressed, deleted, set-aside, and finished sources. Filing an article into the stream after its last recorded visit retires that visit. The reader resolves the anchor against the current text and labels its ratio fallback as approximate.
- **Silence.** Render the Wiki index with no return block when the saved place is missing, ineligible, unavailable, or dismissed. No paragraph text travels in the homepage response or in the resume URL.

## Further upgrades by surface

These are proposals for the next pass. They build on the work above and the existing product.

| Surface | Next upgrade to try | What would prove it |
| --- | --- | --- |
| Landing | Let the specimen open the original public citation from inside the displayed sentence. Keep the “Inspect a real source” link for a direct route. | A first-time visitor can find and return from an original source before sign-up. |
| Examples, Guides, Proof | Put a starter issue next to starter wikis. Name the task each guide lets someone finish. Add a link on every proof receipt to the changed line and evidence considered. | A visitor enters by intent and finishes the same job without a second tour. |
| Auth and first run | Preserve the visitor’s intended example, import, or share through sign-in. Resume the first import at its last confirmed step. | A reload or expired session leaves the original intent and import receipts intact. |
| Wiki home | Let a changed page lead with the one revised sentence that mattered, linked to a diff. Show the reading invitation only when a meaningful place exists. | Each change has an inspectable revision and an authentic preceding claim. |
| Wiki page, dossiers and map | On hover or keyboard focus, name the section or filing locator behind a source. In Map, label the selected link with its actual relationship. Preserve the same zoom and node after reading. | A reader can describe why two items are connected and retrace the exact source. |
| Library shelves | Remember the scroll position and focused title per shelf. Let the Nightstand say how much reading remains when progress supports it. Hide empty shelf affordances until they become relevant. | Open the tenth item in a shelf, go back, and keep both its row and the filter. |
| Article and passage reader | Reserve the same reading measure when a source panel opens. Give every exact and approximate destination a distinct visible label. Include the paragraph in copy-as-citation without opening a private URL. | On phone and desktop, a source round trip leaves the text column and original sentence in place. |
| Books, lending and commonplace | Keep print page and Kindle location as distinct locators. Put current page and last line beside the entry field. A lent book opens at the chosen public mark. | Each locator round-trips to the right edition and jumps to the right mark. |
| Think and Notebook | When a next sentence opens the editor, show the line that set it up. Offer a compact “resume writing” locator in Working and preserve the cursor through reference tabs. | Keyboard-only writing resumes at the same block and keeps a draft through a source visit. |
| Concept and Question | Give each active question one unresolved test and a link to its strongest opposing passage. Let the evidence show how it bears on the question. | An unsupported relation stays absent and a real relationship opens to its evidence. |
| Judgment and Mirror | Show the original call, test, and confidence together when reviewing an outcome. Carry selected evidence context into the Mirror and back. | An outcome review keeps the original wording and the exact evidence that changed the reader’s mind. |
| Editions | Give each “Already saved” receipt an open action and the actual destination. Make “Back to finding” handle both browser and in-app navigation. | Opening an original and returning brings back the same issue, finding, and reader status. |
| Work Today, Week and Day | Make the originating note visible beside a to-do. Put one pointer-and-keyboard alternative in every row move menu. Align date and menu positions across the three surfaces. | From Today, the user reaches the right dated entry and can edit placement without dragging. |
| Work project notes and Deleted | A task that was created from a line should carry its locator. If the source changed, keep the original quote beside the updated note. Show restore destination and retained links before restoring. | Recovery restores the note and opens all linked follow-ups after reload. |
| Partner and recall | Preview which room and item the next question will use. Show the exact quote, locator, and missing evidence at the answer. Keep context attached while opening a citation. | The question and its evidence survive a round trip, and a weak answer identifies the gap. |
| Handoffs, Pencil and disagreements | In each proposal, show “adds one line,” “creates one note,” or “replaces this text.” Show who made it and what access they used. A single disagreement should point to both arguments. | The reader knows what Keep or Strike changes before pressing it. |
| Search and global navigation | Indicate why a result matched. Restore the query and focused result on Back. At phone width keep the active room visible next to the menu. | A reader can return to the same keyboard-selected search result without typing again. |
| Connections, permissions and import | Put last acknowledged sync, newly added counts, and the next recovery action on each provider. Show read and write scopes before authorization and on the connected row. | Stopping or restarting an import gives a trustworthy per-item receipt. |
| Settings, Help and export | Preview the actual reading paragraph in appearance. Make resets name the settings they affect. Offer a copyable support receipt with identifiers and no credentials. | A user can identify an issue or verify an export without exposing private tokens. |
| Public shares and adoption | Preview titles and unique public sources before copying large collections. Preserve the entry and focused cite across sign-in. Explain what happens when the owner updates the original. | A signed-out visitor can predict what will land in their account and return to the same cited claim. |
| Capture across web, Chrome, Safari and the share sheet | Show destination before capture and a server-confirmed open action afterward. Let a paused write keep its URL and selected text through reauthentication. | Retry completes one save with the original selection and no duplicate article. |
| iOS and Omarchy | Give the native reader a portable paragraph locator. Align reduced-motion behavior, VoiceOver focus, and Omarchy’s active paragraph cue. | Read the last marked paragraph on another device without searching for it. |
| CLI, MCP and agent setup | Return a canonical link for every completed write and an explicit after-retry state for each interrupted sync. Put scope and actor together. | A terminal receipt provides the same traceable identity as the web item and identifies exactly what remains. |

## Verification approach

- Check the reading loop using the shipping web build, the actual reading-room and article-reading-state routes, and an ephemeral Mongo database. Scroll a long article with real browser input, wait for the persisted anchor, open Wiki, and compare the focused paragraph to the stored text. Then dismiss and reload. Test 1440px, 1320px, and 430px with reduced motion.
- Fetch the public Mental Models payload without session credentials. In the same build, follow the landing CTA and use the keyboard to go to a reference and back. Check exact focus and horizontal overflow.
- Inject an HTTP failure for handoffs while Pencil returns successfully. The proposed change should stay visible and Retry should restore the handoff list.
- Verify the reading-room query against Mongo for owner mismatch, suppression, parking, finished reading, and absence. Check Chrome destination and duplicate receipts and build the iOS simulator targets. Device interaction and hosted rollout require separate evidence.

## Local verification results

- Browser at 1440px, 1320px, and 430px passed with the production web build. The resume flow saved a real scroll position into ephemeral Mongo and reopened the matching paragraph. The visible reader-rail link returned focus to Wiki. Dismissal survived reload, public citation focus made a round trip, and an injected handoff failure preserved Pencil and recovered on retry. No uncaught page errors or horizontal overflow in those flows.
- 386 focused UI tests across 17 files passed. Three server test files passed, including the real-Mongo reading route checks. The UI runner reported React console and act diagnostics. The builds and tests ran on the installed Node 22.22.3, below the declared 22.23.4 floor.
- A packed Chrome extension smoke passed with acknowledged destinations and a duplicate receipt. Xcode built the app, share extension, and Safari extension for the simulator. Native interaction and production deployment remain unverified.
