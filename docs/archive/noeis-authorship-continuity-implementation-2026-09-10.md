# C1 — Return without reconstruction

**September 11 release update:** C1 engineering is complete in the release branch, including chosen versions, portable offline work and whole-source recovery. The historical local-only statements below describe earlier stages. See [C1 release and user test](noeis-authorship-c1-release-2026-09-11.md) for current scope and evidence.

Updated September 11, 2026. First eight slices implemented locally: **Your writing** in Think, **Work with this passage** in Library, **Start a note** in Think, **Find your writing**, recovery when a Library highlight disappears, **Your work here** on an ordinary Library article, **Read fresh** in Library and ordinary Wiki readers, and **Copy continuation link** for deliberate private handoff. Uncommitted, unmerged, undeployed. Athan explicitly advanced C1; C0's remaining acceptance stays open without requiring another C0-only polish pass.

## What the person can do

Select a passage in a Library article and choose **Work with this passage**. No Wiki is required. The existing highlight API saves the exact passage (or reuses its matching highlight), then opens private writing beside it. Give the writing a title, leave a question and a return note, and wait for **Saved privately**. Closing preserves the work. Selecting that same passage again returns to the same writing, even after closing it on the same URL.

In Think, **Your writing** shows up to five recent meaningful explorations from Wiki or Library with their actual title/first line, return note and source title. Follow one to its exact source and saved words. Keeping a Notebook or Question copy does not remove the exploration from this shelf. Kept copies retain their click-time writing and exact source quotations; later private edits do not rewrite them.

Existing Wiki removed-claim recovery opens and scrolls to saved-work details without focusing an editor or rewriting accepted knowledge. The Think note and companion remain mounted; shelf loading/failure is independent. No qualifying work means no section. On narrow screens the shelf remains below the note, following the existing composition.

## Architecture and code craft

Ordinary Think, including `?tab=home`, routes to `ThinkNotes`, not the older `ThinkMode` Home index. The unused Home/CalmIndex prototype was removed in the first slice. Product routing and the companion were preserved.

- `ThinkNotes.jsx` reuses `RoomShelfSection`, `RoomShelfList` and `roomShelfItemClass`. Its cancellable read keeps private shelf words out of automatic agent context. `thinkNotesModel.js` builds trusted local links from explicit Wiki or Library identity, rather than trusting stored URLs.
- `AuthoredExploration` remains the single private collection. An exploration has exactly one origin: owner/page/claim or owner/article/highlight. Library identity is explicit; no synthetic Wiki pages or claim IDs. The same service enforces ownership, optimistic concurrency, uncertain-save retry, explicit Discard and idempotent Keep.
- Shared API construction replaces duplicate endpoint methods. `useAuthoredExplorations` accepts its origin API and cache scope; `authorshipFor` replaces repeated callback wiring. Wiki cache keys remain compatible; Library keys have a separate namespace.
- `OpenedLibraryPassage` replaces its device-only persistence/listener path with the existing owner-scoped save hook. Older device words remain available until a deliberate edit migrates them. Unsaved empty exercise controls stay local; opening alone is not a server save. The existing Library-to-Wiki Place beside path still works.
- `ArticleReader` adds the action to its existing selection menu and preserves Library scope/folder query parameters. Passages over 4,000 characters receive an explanation before creating a highlight. Selection and anchor extraction exclude inline controls and private writing, fixing the browser-observed quotation that accidentally included the adjacent Open label. A same-URL navigation also reopens a closed pocket.
- Existing `AuthoredWorkOrigin` supports the Library return path on kept copies. No new product component, editor, queue, worker, collection or dependency was added for Library entry.
- The only new code file in the second slice is `scripts/migrate_authored_exploration_indexes.js`. It replaces the old Wiki-only uniqueness constraint with separate partial unique indexes, creating and verifying replacements before removing the old constraint. The first slice's only new file was this report. Earlier C0 files retain their separate justification in its report.

Private writing does not trigger embedding or Wiki-source jobs. Explicit Keep uses the existing durable effects path. The Library source guide remains source-bound; this slice does not claim a new private-writing companion context or live-model quality.

## Direct blank writing in Think

**Start a note** opens the existing Notebook editor and deliberately places the cursor in its body. Naming the page keeps focus in the title; Enter moves to the body without breaking IME composition. Saved notes reopen in reading mode. The control remains above the page on phone and has a 44-pixel target.

This is an ordinary Notebook entry: an explicit click creates a blank record through the existing owner-scoped `POST /api/notebook`; typing uses the existing update API and normal Notebook indexing/source semantics. No Wiki, highlight, exploration, synthetic source, new editor or dependency is required. Blank notes are not private explorations and do not inherit their isolation/CAS guarantees. Opening Think alone creates nothing.

The editor exposes its existing save operation for navigation. Starting another note, choosing a recent note or changing the local Think tab waits for outstanding saves and words typed while those saves finish. Failed saves keep the current note. Creation is guarded against duplicate clicks; an uncertain creation reply asks the person to reload and check recent notes, never automatically repeats the POST. Browser close, global navigation, offline recovery and cross-device edits are not covered by this navigation guard.

One URL now owns the opened note identity; the competing URL/state synchronization was removed. Explicit links work beyond the bounded shelf, and browser Back returns to the requested note. A writing intent is consumed only after leaving its newly created note, accounting for deferred router transitions. Late save replies cannot replace a different open entry. Obsolete Save-button CSS and conflicting action-row rules were deleted. No code file was added for this slice; the existing Think page/editor replace the missing entry path.

An unnamed note now uses its first meaningful text as a shelf/search preview; its saved title and editor remain unchanged. Rename cancellation remains open. The companion remains mounted with the actual ordinary note context; private shelf words are still excluded from automatic context.

## Find writing by remembered words

The existing Think shelf field is now **Find your writing**. Type a literal phrase to search saved Notebook text and human-owned private exploration fields, including questions and return notes. Each match shows its actual words with a small highlight, its kind and, for private work, its source. Kept notes remain independent matches. Standalone Question records and imported Library articles are outside this field's explicitly labeled scope.

A result opens the actual note or exact Wiki/Library origin. Same-tab links save outstanding Notebook edits first; search never changes the active note or supplies private results to its companion. The query survives reload and browser Back in the URL, including copied/new-tab Notebook result links. Escape or **Back to recent work** restores the recent shelves. Empty, pending, limited and failed searches have distinct states; old requests are cancelled and late replies ignored.

On narrow screens **Find writing** sits beside **Start a note** and focuses the same shelf field. Following a Notebook result scrolls the page into view without turning on editing. No extra search pane, editor or index was added.

`server/services/authoredWorkDiscovery.js` replaces the recent selector previously embedded in the mutation/Keep service and the frontend's loaded-title-only filtering. It shares owner/origin checks and bounded summaries between recent discovery and explicit search. Its accompanying unit test is the only other new code file. Notebook summary reads now share one projection; the compact shelf gains a bounded first-meaningful-text preview, with legacy HTML decoded for display. The saved title is never rewritten. A stale summary cannot replace newer blocks after an edit.

## When the underline is gone

A saved Library exploration remains reachable through its original highlight link after that highlight is removed. **Your work here** opens the saved quotation, private writing, question and return note in reading mode. It explains that the highlight is gone. Existing kept copies stay linked; an interrupted Keep can finish its original reservation. New edits and new Keeps against a missing origin remain prohibited by the existing API. Explicit Discard retains owner/revision/conflict checks. A similar new highlight never inherits the old writing.

Think recent work and explicit search retain eligible work from a removed highlight and label it **Earlier passage**. The article must still be owned and eligible; missing/foreign/archived/suppressed articles remain excluded from discovery. Missing-article recovery is outside this slice and requires a separate access/ownership contract. The sixth slice below also makes that recovery discoverable from an ordinary article, without a highlight-specific URL.

The read-only inventory found that the API already retained the draft, exact origin and `originStale`; the reader's `focusedHighlight` condition made it unreachable. `ArticleReader` originally mounted recovery by requested identity; the sixth slice now mounts the shared session for every opened article. `OpenedLibraryPassage` owns one existing account-bound save session per article; its live pocket remains a keyed child. Missing-highlight recovery reuses `AuthoredWorkList`, whose Wiki-only availability check moved to the Wiki caller. No duplicate recovery component, editor, endpoint, collection or code file was added. The optional discovery projection branch was removed; recent/search now share the missing-highlight label. Legacy unresolved/relationship fields receive the same recovery title fallback. Origin-list responses are private/no-store.

Loading, failure/retry and confirmed absence differ. Only actual authored words qualify; empty passage placements do not create a recovery card. Opening server-saved work does not save, alter accepted Wiki content, or send private words to the source guide. Existing dirty/uncertain-save recovery retains its prior semantics; this does not introduce offline or cross-device editing.

## Find your work from its article

Open an ordinary Library article. **Your work here** names the meaningful writing made from that source and shows its actual return note. Choose a live entry to open the exact saved passage and writing. A removed highlight is labeled **Earlier passage**; opening its disclosure preserves the original quotation, writing and existing kept-copy links. Reload and Back retain the selected identity. Neither path focuses an editor merely to read.

The read-only inventory found the existing owner-bound article exploration endpoint already returns every exploration for that article, including removed origins. `ArticleReader` now mounts `OpenedLibraryPassage` by article identity, and passes its existing highlight collection. The wrapper loads once per article and reuses `AuthoredWorkList` alongside the keyed live pocket. This replaces the selected-only recovery branch; it does not add another save session or fetch per highlight. The shared list accepts an optional recovery-reveal callback and earlier-passage label; unopened live entries can show their return note. Wiki keeps its existing navigation and recovery behavior.

The URL retains Library scope/folder parameters and records the exact article/highlight plus exploration intent. Live entry scrolls to its rendered passage. Earlier work uses the existing native disclosure and source-context view. No new product component, code file, endpoint, collection, worker, editor or dependency was added. Private data remains outside automatic source-guide context; no companion call is made by opening the list.

**Article selection contract:** display meaningful records returned by the authenticated human's existing article-bound API, plus that same session's established account-bound unsaved recovery. Empty placements and unchanged source-only text are suppressed by the shared title predicate. Use the current highlight IDs to distinguish live from earlier passages; a similar quotation with a different ID never inherits writing. This is the work on one opened article, not the five-item recent shelf or global search, and introduces no new result cap. The existing API returns records by updatedAt/id and retains its existing origin access checks. No qualifying work means no list or empty prompt. Unrequested loading stays quiet; failure offers retry and never claims absence. A requested missing identity gets its separate loading/confirmed-absence states. No backend access policy changes.

## Read fresh, then return to your work

**Read fresh** sits with the existing reader actions in Library and supported ordinary Wiki pages. It temporarily hides personal highlight ink, writing pockets, return notes, saved-work lists and Library annotation tools. **Show my work** restores them. It never treats a view toggle as deletion, a reread, a new revision or an accepted wording. Reload or a different source starts ordinary reading again; exact source/exploration URL identity is retained.

The read-only inventory confirmed that Library's rendered source DOM already distinguishes stored highlight marks from imported emphasis, and that Wiki's accepted paragraphs and native citation buttons sit outside the private pocket. The implementation therefore keeps those nodes and the owner-bound save sessions mounted. Source text, source-authored emphasis, footnotes, citation buttons and references stay visible. An import containing only highlighted excerpts retains those excerpts as its reading body while hiding the person's notes. Specialized Wiki workflows keep their existing controls and have no new toggle.

`reader/ReadFresh.jsx` provides the new shared button, temporary state and visible-passage position preservation for both readers; its test is the only other new code file. It fills a missing capability through one shared implementation, replacing no existing component. No backend, collection, preference storage or dependency was added. A layout effect compensates for removed personal layers in the actual scroll container; browser scroll limits still apply at the ends of a document. No animation is needed. Scope changes clear the temporary view; the empty/loading reader is safe.

Existing OpenSentence selection/Escape handlers pause while hidden, so Escape cannot close an unseen exploration. Wiki and Library temporarily release their opened-work context and restore it on return; their existing agent surfaces and conversations remain mounted. No new model request is triggered. Personal highlight colors use the existing theme variable; hiding also removes transitional ink immediately. Citation navigation remains functional, with keyboard focus still available.

## Continue the same work elsewhere

**Copy continuation link**, under **Exploration options**, carries the exact Wiki claim or Library highlight into another tab/session. Removed-highlight recovery exposes the same control beside the surviving work. It becomes available only for meaningful, acknowledged saved work; dirty, saving, failed or conflicted records cannot claim readiness. Copying creates no save, revision, public share, agent run or offline package. The link opens the latest saved work for the signed-in owner, not an immutable historical copy. A new receiving tab preserves a different piece already open. No automatic device push or tab replacement is introduced.

The clipboard receipt appears only after clipboard success. Denied/unavailable clipboard access exposes a labeled, read-only link that selects on focus for ordinary copying. A receipt for an older revision disappears when the writing changes. No timed notice or animation is required. The link contains only object identifiers and the explicit exploration flag, never private words, arbitrary current-query parameters or credentials. Localhost links remain local: physical-device connectivity is not established by these tests.

One shared `buildAuthoredContinuationPath` in `sourceRoutes.js` replaces duplicate Think route construction and serves the writing and recovery controls. `AuthoredContinuation` lives in the existing `AuthoredWriting.jsx`; there is no new production component file, endpoint, collection, storage cache, scheduler or dependency. The one added file, `AuthoredWriting.test.jsx`, adds focused clipboard/persistence-boundary coverage to that existing component family.

The fresh-session browser test found and reproduced a pre-existing sign-in race: Login attempted the exact destination while the newly authenticated `/login` route independently redirected home. The authenticated route now owns the return; Login retains the remembered destination for it. `readReturnPath`/`forgetReturnPath` reuse the same session key and existing internal-path validation. Unsafe external/backslash redirects fail closed. This replaces the competing redirect behavior without a second return store. Sign-in survives unavailable session storage, although that storage failure still loses the remembered destination; no recovery guarantee is implied.

## Selection contract

**Eligibility:** authenticated human owner's server-saved exploration with non-whitespace title, writing, question, return note, legacy authored premise/composition, or changed provisional wording. Its origin Wiki page or Library article must remain owned and accessible; archived, hidden and debug origins are excluded using both Wiki status and Library boolean flags. Agent credentials cannot enumerate this endpoint.

**Quality:** empty placements, unchanged source-only wording, whitespace, missing/archived origins and foreign content are suppressed. Keep is not completion. Inspect the latest 50 meaningful candidates ordered by actual updatedAt/id and show at most five accessible results. One candidate query plus at most two bulk origin reads; no per-row source lookups. Summaries omit quotations, full drafts, mutation histories and Keep snapshots. Responses are private/no-store. This is a bounded recent shelf, not archive/search; older work may be absent if those 50 candidates are unavailable.

**Silence:** no qualified work means no shelf section. Loading/failure never asserts there is no writing. Failure is a quiet status alongside the functioning note and partner.

**Explicit search:** an authenticated human supplies 2–160 characters. Case-insensitive literal phrase matching allows flexible whitespace; regex punctuation is escaped. Search runs before taking the result window, so it can find work beyond the loaded 120-note shelf. It inspects at most 50 matching candidates per kind and returns at most 20 available matches, ordered by updatedAt/id. Candidate queries have a two-second database deadline. A cutoff is disclosed; displayed counts are returned matches, never corpus totals. Matching is within saved fields/blocks, not fuzzy or semantic and not across block boundaries. Legacy HTML notes use an initial-token candidate filter followed by visible-text phrase matching; the same cutoff applies.

Blank placeholder titles do not qualify by themselves. Foreign, suppressed, source-only unchanged provisional text and unavailable articles/pages are excluded. Removed Library highlights remain discoverable through their exact saved identity and are labeled Earlier passage. Private original/selected quotations, snapshots and mutation history are never searched or returned. The response contains bounded excerpts, highlights and identities, not whole drafts. It is private/no-store and unavailable to agent credentials. These reads create no save, embedding or maintenance effects. Missing-highlight recovery is now available; missing-article recovery remains separate. Suppression does not delete the saved work.

## Verification

All paths below are relative to this isolated implementation worktree.

- Real MongoDB/loopback Express acceptance: the existing C0 cases and new Library cases passed. Separate highlights coexist; owner/foreign/agent boundaries, stale-save conflicts, exact Notebook/Question quotations, immutable Keeps, stale/owned Discard and zero private-draft queue callbacks were checked. Accepted Wiki content was byte-for-byte unchanged. Cleanup removed 25 run records and left zero. Receipt: `tmp/authorship-acceptance/1789062998992-9c25dc9c79.json`; log `tmp/authorship-c1-library-acceptance.log`. Zero model calls.
- Earlier first-slice Mongo selection checks passed 12 cases: ownership, empty/unchanged wording, whitespace, unavailable/archived pages, completed Keeps, fallback titles, legacy work, order and five-item bound. `tmp/authorship-c1-mongo-contract.log`.
- Authored service/HTTP tests: 16 passed, `tmp/authorship-c1-library-server.log`.
- Current Think, existing ThinkMode companion/templates, ArticleReader, shelf model and origin footer: 101 passed, `tmp/authorship-c1-library-entry-tests.log`.
- Full deterministic Wiki gate passed server/harness groups, 86 frontend suites / 865 tests and production build, exit 0: `tmp/authorship-c1-library-wiki-qa.log`.
- After the final selection and same-URL refinements, 51 focused tests passed across selection, ArticleReader and OpenedLibraryPassage: `tmp/authorship-c1-library-final-entry-tests.log`. Final production build also passed: `tmp/authorship-c1-library-final-build.log`. Existing jsdom navigation/network and open-handle warnings remain in test logs; passing tests are not a claim of a warning-free suite.
- Signed-in browser: selected a real local article sentence, wrote **The next decision**, saved a question/return note, kept both destinations, found the writing in Think, and returned through both the shelf and kept Question footer. Reload restored all fields and Keep links. Re-selecting the same passage reused its highlight and writing after the control-text fix. The malformed highlight created while reproducing that bug was removed only from the isolated QA fixture; it had no exploration.
- Library writing rendered at 1440, 1320 and 430 CSS pixels without document horizontal overflow. Phone selection menu wrapped cleanly; exact sentence re-selection was exercised there. Initial re-entry/reload left focus on BODY. Prior first-slice Think/Wiki responsive checks remain recorded in `tmp/authorship-c1-reopen-receipt.json`. These are viewport checks, not physical touch, native input, zoom or reduced-motion acceptance. Viewport override reset.
- Direct Mongo before/after close, return and reload: Library revision 5 remained 5 with unchanged draft hash and timestamp. `tmp/authorship-c1-library-reopen-receipt.json`.

Third-slice verification:

- 88 focused tests passed across `ThinkNotes.firstPaint`, `thinkNotesModel`, `NotebookEditor` and `ThinkMode.templates`: `tmp/authorship-c1-blank-tests.log`. Cases cover explicit creation, duplicate click protection, deferred route transitions, requested IDs beyond the shelf, Back, failed creation/save, ordered saves, edits arriving during a navigation flush, deliberate focus, and existing companion/template coverage.
- Final production build compiled successfully: `tmp/authorship-c1-blank-build.log`. `git diff --check` passed. This slice does not rerun or claim fresh proof of the prior full Wiki gate; it changes no Wiki code.
- Signed-in browser created and named ordinary notes at desktop and 430px; typing persisted through the real API and Mongo. Title focus stayed in place and Enter moved to the body. Note switching and reload preserved the final paragraphs; browser Back returned to the requested note in reading mode. The companion remained beside the active note. No live answers were requested.
- Rendered checks at 1440, 1320 and 430px showed no document horizontal overflow. Start a note remains above the phone page with a 44px target. These remain viewport checks, not native phone-keyboard or physical-device proof.
- Mongo readback confirmed two/one body blocks for the desktop/phone notes and no fabricated claim/article/highlight origin. The desktop note's full-document hash and updatedAt remained identical through reload and return. Receipt: `tmp/authorship-c1-blank-reopen-receipt.json`. One empty disposable note from the focus-bug reproduction was deleted only after checking its exact owner, blank content/blocks and absent references. Both named demo notes remain.

Fourth-slice verification:

- 93 Think/editor/model/template tests passed: `tmp/authorship-c1-search-ui-tests.log`. 23 focused service/HTTP tests passed: `tmp/authorship-c1-search-server-focused.log`. Final frontend build compiled successfully: `tmp/authorship-c1-search-build.log`.
- Real Mongo/Express acceptance passed C0, Library and the new discovery cases. A literal phrase found an old note beyond 120 shelf rows and a private question; owner/agent, archived/debug/source-only/missing-origin boundaries, result cutoff, first-text summary, unchanged titles/revisions and no read effects were checked. Cleanup deleted 160 run records and left zero. Receipt: `tmp/authorship-acceptance/1789076996450-1bf7aab9ef.json`; log: `tmp/authorship-c1-search-acceptance.log`.
- The broader server wrapper ran 55 suites and found one failing Notion-maintenance assertion (expected ignored, received pending); 613 tests passed in that earlier run. The same Notion assertion failed independently, and its source/test/orchestrator files are unchanged by this slice. This is not a green full-server-suite claim. Logs: `tmp/authorship-c1-search-server-tests.log`, `tmp/authorship-c1-search-unrelated-notion.log`.
- Signed-in browser found **The next decision** through its question using **make easier**, followed the exact Library highlight, and returned with the same search and note. An unnamed note was found through **[room + time]**, displaying **Leave a little room for the unexpected.** as its preview while retaining **Untitled** as its actual title. Empty results and Escape were exercised; private words did not become the current Notebook context. Rendered search at 1440, 1320 and 430 CSS pixels had no document horizontal overflow. On phone width, Find writing focused the existing field; following a note result scrolled its page into view without activating the editor. Reload retained the query, title and both paragraphs; Escape restored recent work with the first-line preview. These are viewport checks, not physical touch or native-keyboard proof. The viewport override was reset.
- Final direct Mongo readback confirmed unchanged full-document hashes for the previously open Notebook, Library exploration (revision 5) and accepted Wiki page through search/return/reload. The new unnamed demo note retained title **Untitled** and both saved blocks. Receipt: `tmp/authorship-c1-search-reopen-receipt.json`; note `6aa324d72dcb132bcb8c7e74`. No live model requests were made.

Fifth-slice verification:

- Final focused UI pass: 111 tests across Library passage, Wiki passage, ArticleReader, Think and shelf model; 23 service/HTTP tests passed. Logs: `tmp/authorship-c1-recovery-final-ui.log`, `tmp/authorship-c1-recovery-server.log`.
- Full deterministic Wiki gate passed its server/harness chain, 86 frontend suites / 872 tests and build, exit 0: `tmp/authorship-c1-recovery-wiki-qa.log`. Final recovery-key/identifier cleanup passed the focused UI run above and another build: `tmp/authorship-c1-recovery-final-build.log`. Existing jsdom/open-handle warnings remain; no claim that every server test passed (the separately recorded Notion failure was not changed or rerun).
- Real Mongo/Express acceptance passed C0, Library, discovery and highlight recovery, including an identical replacement mark, owner/foreign/agent access, stale save/new-Keep rejection, unchanged draft/article/effect counters and explicit CAS Discard. Cleanup deleted 159 remaining run records, left zero, and made zero model calls. Receipt: `tmp/authorship-acceptance/1789078804765-e74bec57d7.json`; log `tmp/authorship-c1-recovery-acceptance.log`.
- Signed-in browser created **A thought can outlive its underline**, saved its question/return note, and kept a Notebook copy through the real UI. A controlled database removal then deleted only the exact highlight created for this test, retaining its backup. Think search for **underline disappears** rendered the private question with **Earlier passage**. Direct navigation/reload rendered the recovery at 1440, 1320 and 430 CSS pixels without document horizontal overflow or editor focus. The kept-note destination retained its exact quotation; browser Back restored the open recovery. This is viewport proof, not physical touch/native-keyboard/reduced-motion/zoom proof. Viewport override reset.
- Browser limitation: clicking the pre-existing Library Delete control stalled tab 1 at its native confirmation; the browser dialog API did not expose a dismissible dialog, and native Codex-app automation was unavailable. Post-removal mouse/keyboard click-through was therefore not accepted as proof. Direct navigation/render/reload continued in tab 2. If the old confirmation is visible, Cancel it. The current recovery tab is retained as the deliverable; manual result/kept-link/Discard acceptance remains open.
- Final direct Mongo readback held full-document hashes unchanged for the private exploration (revision 3), kept note, accepted Wiki page and post-removal article. The highlight remained absent. `tmp/authorship-c1-recovery-reopen-receipt.json`. No live companion requests were made.

Sixth-slice verification:

- 98 focused UI tests passed across ArticleReader, OpenedLibraryPassage, WikiOpenSentence and Library agent contracts: `tmp/authorship-c1-article-work-ui.log`. New cases cover ordinary article entry, no editor/context/save on discovery, exact routes with scope/folder, missing-origin reveal, quiet empty state, failed load, and one load across passage switches. Existing test mocks now supply the ordinary article read. Existing jsdom/act/open-handle warnings remain.
- Full deterministic Wiki gate passed its server/harness chain, 86 frontend suites / 876 tests and production build: `tmp/authorship-c1-article-work-wiki-qa.log`. `git diff --check` passed. This is not a green all-server-suite claim; the prior independent Notion failure remains outside this frontend slice.
- Real Mongo/Express C0/Library/discovery/recovery acceptance passed again; cleanup deleted 159 run records, left zero, and made zero model calls. Receipt: `tmp/authorship-acceptance/1789089994391-40855c5c50.json`; log: `tmp/authorship-c1-article-work-acceptance.log`.
- Signed-in ordinary article → The next decision → exact writing → reload passed. An ordinary removed-highlight article revealed Earlier passage; its disclosure updated the exact URL, and Open kept note → Back → reload restored the saved words. Normal kept-link/Back clicks passed on phone as well, closing the preceding run's click-through tooling gap. The old native dialog was absent in the fresh session. Discard and UI highlight deletion were not exercised this run.
- Rendered live and earlier work at desktop/sidebar/phone widths (1440/1320/430) had no document horizontal overflow. Earlier summary target measured 63.25px; phone live entry kept focus on its button. **Nomad — recoverable mistakes**, with no private authored work, showed no list or editor. Source guide remained source-bound. These are viewport checks, not physical touch/native-keyboard/reduced-motion/zoom or live-companion quality proof. Viewport reset; the ordinary article tab was retained for the user test.
- Final direct Mongo readback confirmed all seven full-document hashes unchanged: both articles, both private explorations (revisions 5 and 3), both kept Notebook copies and accepted Wiki. Removed highlight remains absent. `tmp/authorship-c1-article-work-reopen-receipt.json`. Discovery, navigation and reload requested no writes.

Seventh-slice verification (September 11):

- Final focused pass: 192 tests across ReadFresh, ArticleReader, Library passage, Wiki passage, Wiki reader and Library agent contracts. `/tmp/noeis-read-fresh-final-tests.log`. Cases include identical editor/footnote nodes across toggles, no save/reload, suspended Escape, source-context restoration, source switches, the empty reader, and nested scroll-container compensation.
- Full deterministic Wiki gate: server/harness chain, 86 frontend suites / 877 tests and build passed, `/tmp/noeis-read-fresh-wiki-qa.log`. Final focused tests and a final production build followed the highlight/theme and empty-reader refinements: `/tmp/noeis-read-fresh-final-build.log`. Existing jsdom/act/open-handle warnings remain; the prior independent Notion failure is not changed or claimed resolved.
- Browser plugin was unavailable this session. A separate signed-in headless Chromium used the local preview and existing QA account, with no user-browser/session manipulation. Six real Library/Wiki journeys at 1440/1320/430 passed: Read fresh hides work; Show my work restores the same editor node/value; Escape leaves it open; reload returns to ordinary reading. Native Wiki citation buttons remained visible and navigated to references while fresh. No page errors or console warnings/errors; no exploration mutations. Screenshots `/tmp/noeis-read-fresh-{library,wiki}-{1440,1320,430}.png`; script `/tmp/noeis-read-fresh-browser.cjs`; receipt `/tmp/noeis-read-fresh-browser-receipt.json`.
- Seven full-document hashes remained unchanged: both retained Library articles, private explorations (revisions 5/3), kept notes and accepted Wiki. This is actual database readback, not a UI-only save claim. The preceding acceptance harness remains historical; no backend code changed in this slice.
- Supplemental real local fixtures checked a long source and a highlight-only import. A source passage measured 438.046875px before, 438.125px while fresh, and 438.046875px after return. Source-authored emphasis and a native article footnote survived; imported excerpts remained visible while personal notes hid/restored. Zero browser errors, console warnings/errors or exploration mutations. All three temporary records were removed by exact generated IDs; zero remain. `/tmp/noeis-read-fresh-supplement-receipt.json`, `/tmp/noeis-read-fresh-supplement.log`.
- These are Chromium viewport and keyboard checks, not physical device, native Safari, zoom, reduced-motion preference, cross-device, live-model or human acceptance. The test browser closed; the isolated preview remains available. No paid/live model calls, merge or deployment.

Current local preview: Mongo 27028 PID 49738, API 5510 PID 51811, frontend 3100 PID 51318. Verify before restarting. API/UI serve this worktree; AI and background workers remain disabled. No production data, paid model calls, merge or deployment.

### Deliberate continuation — September 11

- Full `npm run wiki:qa` passed: deterministic server/harness chain, 87 frontend suites / 886 tests and build. `/tmp/noeis-continuation-wiki-qa.log`.
- After fixing the rendered sign-in race, 9 focused suites / 137 tests passed across Login, app return routes, App, source routes, Think model, persistence hook, ArticleReader, Library and AgentRail. Final production build compiled successfully. `/tmp/noeis-continuation-final-tests.log`, `/tmp/noeis-continuation-final-build.log`. Existing jsdom navigation/act/open-handle warnings are distinct from the browser result; all commands exited 0. No claim of every server suite passing.
- Browser plugin unavailable; regular isolated headless Playwright Chromium used the existing local preview. Twelve grouped checks passed: independent signed-out Library/Wiki links return through actual login; six Library/Wiki flows at 1440/1320/430 copy the exact URL and reopen the same title, writing, question and return note in a separately signed-in context; another receiving tab remains unchanged; removed-highlight recovery survives; clipboard denial exposes a selectable link. Meaningful pages and controls rendered without an overlay or horizontal overflow. Screenshots were visually inspected at phone and desktop widths.
- Actual API JWT middleware accepted a different signed identity and returned 404 for both owner-bound source/exploration lists, exposing no private writing. This is a controlled foreign-identity API check, not a second human user's acceptance.
- A disposable article/work pair exercised actual concurrent saves: the first acknowledged save enables copying; a stale second write receives 409 and copying stays disabled; **Use the saved version** restores the first saved words and enables copying. The first session's version remained authoritative in Mongo. This verifies current explicit conflict resolution, not richer merge/history or offline recovery.
- Zero page errors. The sole console error was the expected HTTP 409 from the deliberate conflict; no unexplained browser errors/warnings. Copying and opening produced zero exploration mutations. The separate concurrency check issued exactly two PUTs (one accepted, one rejected).
- All seven retained demonstration-document hashes were unchanged. Both disposable records were removed and zero remained. Script `/tmp/noeis-continuation-browser.cjs`, receipt `/tmp/noeis-continuation-browser-receipt.json`, log `/tmp/noeis-continuation-browser.log`; screenshots `/tmp/noeis-continuation-{library,wiki}-{1440,1320,430}.png` and `/tmp/noeis-continuation-fallback-430.png`. These temporary files may disappear; this report preserves the proof boundary.
- Physical-device/network handoff, native Safari/input, offline editing, reduced-motion preference, zoom, live model quality and human acceptance remain unverified. No paid/live calls, commit, merge, deployment or production migration. Preview listeners remain available.

## Release prerequisite

The old unique `{userId, pageId, claimId}` index permits only one Library row per user because its Wiki fields are empty. Before enabling Library writes on a target database, run the migration dry run with an explicitly supplied `MONGODB_URI`, inspect the target, then apply the migration. It loads no `.env` and does not delete documents. Both replacement unique indexes must be ready before the old constraint is dropped. Dry run and apply succeeded only against `noeis_authorship_qa`: `tmp/authorship-c1-library-index-dry-run.log` and `tmp/authorship-c1-library-index-apply.log`. No production migration was performed.

## User test

### Deliberate continuation

1. Open `http://localhost:3100/library?articleId=6a9f2f494619ce9e8ed84d68&highlightId=6aa2f001fe33bb4dd3f83f49&exploration=1`. In **The next decision**, open **Exploration options** and choose **Copy continuation link** after **Saved privately** appears.
2. Paste into a new private browser window on this computer. Sign into the same preview account. The exact source, title, writing, question and return note should open after sign-in. Keep an unrelated work open in the original window: it should remain unchanged.
3. Repeat for the Product strategy Wiki exploration. If clipboard access is denied, use the displayed selectable link. A private continuation link should never open a public share page or reveal another account's writing.
4. Optional, using your own test work: open it in two independent sessions before editing. Save different words in the first, then edit in the second. The second should show both versions and block copying until you explicitly resolve the conflict. This does not merge the versions for you.

Localhost verifies separate sessions on this computer. Testing a second physical device requires an accessible deployed/network preview and remains open.


For this slice, open `http://localhost:3100/library?articleId=6a9f2f494619ce9e8ed84d68&highlightId=6aa2f001fe33bb4dd3f83f49&exploration=1`.

1. Confirm the saved writing is open. Choose **Read fresh** beside the article actions. The personal ink, writing and return notes disappear; the source remains.
2. Press Escape, then **Show my work**. The same writing should still be open. No save should be triggered by either toggle.
3. Repeat on `http://localhost:3100/wiki/read/6a9f2f74394585a2a6d11087?claimId=authorship-strategy&exploration=1`. In Read fresh, follow its citation to References; source evidence should remain usable.
4. Reload while fresh. Ordinary annotations and the exact opened work should return. Try the same on phone width; opening the view should not focus an editor.
5. On a longer source, keep a passage in view while toggling and confirm it holds its position, subject to the document's scroll limits. A highlight-only import should retain its source excerpts.

For the prior article-level discovery slice, open `http://localhost:3100/library?articleId=6a9f2f494619ce9e8ed84d68`.

1. Under **Your work here**, find **The next decision** and its return note. The article should initially be readable without an open writing editor.
2. Choose that entry. The exact passage and saved writing should open. Reload; the same writing and kept-copy links should remain.
3. Open `http://localhost:3100/library?articleId=6aa32d9ea23608bcb931ff0a`. Reveal **A thought can outlive its underline — Earlier passage**. Confirm its earlier quotation, writing, question and return note.
4. Choose **Open kept note**, then Back. The earlier work should reopen; reload should preserve it. Repeat at phone width without horizontal scrolling or an automatically focused editor.
5. Open **Nomad — recoverable mistakes** from Library. With no authored work there, **Your work here** should stay absent.

For the prior removed-highlight search path, open `http://localhost:3100/think`:

1. Search **underline disappears**. Find **A thought can outlive its underline**, labeled **Earlier passage**, and open it.
2. Confirm the missing-highlight explanation, earlier quotation, private writing, open question and return note. Reload: the same work should stay open without an editor cursor.
3. Choose **Open kept note**. Its original writing and source quotation should remain. Use Back to return to the recovery view.
4. Try the same journey at phone width. The work should fit without horizontal scrolling; opening should not summon an editing keyboard.
5. Optional destructive acceptance only for a disposable exploration of your own: use Discard, reload, and confirm it stays gone while any kept copy remains. The retained demo does not need to be discarded.

Recovery demo: `http://localhost:3100/library?articleId=6aa32d9ea23608bcb931ff0a&highlightId=6aa32d9ea23608bcb931ff0b&exploration=1`. Kept note `6aa32ec1a4fe70f071eb656f`. These are illustrative local QA records. Details/backup: `tmp/authorship-c1-recovery-demo.json`.

For the prior search slice, open `http://localhost:3100/think`:

1. In **Find your writing**, type **make easier**. At phone width, use **Find writing** above the page to reach the field.
2. Follow **The next decision**. Its saved question and exact Library passage should reopen. Use Back: the same query and previous note should return.
3. Search **[room + time]**. The unnamed note should be recognizable by **Leave a little room for the unexpected.** Open it, then reload. The query and writing should remain; the stored title should still be Untitled and the body should stay in reading mode.
4. Try a phrase absent from the notes, then press Escape or choose **Back to recent work**. No filler should appear, and the recent shelves should return.
5. Start an unnamed note of your own, write two paragraphs, wait for Saved, leave it and search a phrase from the second paragraph. The result should show those actual words.

Illustrative unnamed-note fixture: `6aa324d72dcb132bcb8c7e74`. It remains in the local QA account.

Blank-note entry regression: open `http://localhost:3100/think`:

1. Choose **Start a note**. Type directly into the blank body. Give the page a title; Enter should return to the body.
2. Write another line and choose a recent note immediately. Open the new note again: the title and final words should remain.
3. Reload. The words should remain, with no cursor in the body. Click the body to edit deliberately, and wait for **Saved**.
4. Repeat at a narrow width. **Start a note** stays above the page; the recent shelf is below it. The existing companion remains available.

Saved illustrative note: `http://localhost:3100/think?tab=notebook&entryId=6aa318709886e4d91e881b5a`, **A thought before the evidence**. Phone-created note: `6aa31a889886e4d91e881d14`, **Before the first source**. These are local QA fixtures.

Library continuation regression:

1. In the local preview, open **Small product experiments** in Library. Select **A small release makes the next decision easier.** Choose **Work with this passage**. It should open **The next decision** with its saved writing, question, return note and two Keep links.
2. Close it and select the same sentence again. Choose the action again. The same work should reopen; neither an Open label nor a duplicate highlight should enter the source quotation.
3. Open Think. Under **Your writing**, find **The next decision** and its note **Next: try an experiment whose result disappoints.** Follow it, then reload. Your words and question should remain without the editor grabbing focus.
4. Open the kept note/question. Confirm the exact source quotation and follow **Return to Small product experiments**. Edit only the private writing, wait for Saved privately, and reopen the kept copy: its earlier snapshot should remain.
5. Try a fresh passage in another owned article. Select → Work with this passage → write and name a thought → return via Think. No Wiki creation step should appear.

Demo: `http://localhost:3100/library?articleId=6a9f2f494619ce9e8ed84d68&highlightId=6aa2f001fe33bb4dd3f83f49&exploration=1`. Notebook `6aa2f0f2fe33bb4dd3f83fd6`; Question `6aa2f101fe33bb4dd3f83fe9`. These are illustrative local fixtures, not production data.

## Remaining versus the roadmap

C1 is not complete. Deliberate private continuation is now implemented locally, including independent-session return and explicit save-conflict checks. Athan requested a handoff for the next agent to work through C2–C8: [chapter handoff](/Users/athantsokolas/Documents/GitHub/note-taker-3-1/docs/noeis-authorship-c2-c8-agent-handoff-2026-09-11.md). Start with C2's bounded **Find what I already have** inventory/journey; verify any already-working retrieval/placement before adding code. Relevant C1 foundations exist; offline and human acceptance remain separate gates.

Remaining C1: chosen offline field kit; physical-device handoff acceptance and richer revision recovery; missing-article recovery with an explicit access contract; richer conflict reconciliation and repeated voluntary returns. Separate-session explicit conflict resolution now has local browser/API proof. Search covers notes/private explorations; standalone Questions, fuzzy search and matched-block navigation remain beyond this slice. Removed-highlight discovery and kept-link/Back click-through now have local browser proof. Human acceptance, UI highlight deletion and manual Discard acceptance remain open.

C0 still needs physical/native input, reduced-motion/zoom, live companion quality and human acceptance. The proposed six-short-call/$1 live-model budget remains unanswered. C2–C8 and integration/release remain unperformed roadmap work.
