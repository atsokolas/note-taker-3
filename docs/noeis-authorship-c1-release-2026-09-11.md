# C1 — return to your own writing

C1 now joins Wiki and Library writing into one durable, private continuation. A thought can have its own title, words, question and return note; reopen at its exact source; be found by remembered words; rest while the source is read fresh; and continue in another signed-in session. Notebook and Question Keeps remain independent copies. Private experiments are never accepted Wiki edits or agent-owned memory.

This release includes the previously local C0 foundation. It reconciles that work with main through `842b8951`, preserving the newer sentence tools, Edition sharing and Judgment work. The original authorship checkout is preserved at `6b83af4d`; the release checkout is `codex/authorship-c1-release-2026-09-11`.

## The final C1 details

- **Chosen versions:** explicitly keep up to 12 snapshots, including the recorded origin and private draft. Repeated clicks at the same revision are idempotent. The thirteenth replaces the oldest. Reading history does not update writing or indexes. Restoring earlier words creates a new current revision and leaves current source placement/experiments alone.
- **A portable field kit:** download one work with its recorded source excerpts. The HTML file runs without networking, authentication or dependencies. Save a JSON changes file, reconnect, and bring it back through Exploration options. Only title, writing, question and return note are importable. Account, work, size and revision checks apply. If the online version has advanced, both sets of words remain until an explicit decision. This is a chosen, manual offline workflow, not automatic offline app synchronization. Downloaded files persist until their owner deletes them.
- **Source loss:** an owner's existing private work remains discoverable when its whole source becomes inaccessible. The recovery route serves that owner's recorded copy, not the current inaccessible source. It allows reading, continuation, downloads and explicit revision-checked Discard; no new source edits or Keeps. Explicitly archived/hidden/debug sources remain suppressed from discovery.
- **Craft:** reuse the existing persistence/conflict contract, recovery context, controls and source routes. The field kit replaces the need for a second offline app/cache layer; recovery replaces a dead source destination; history uses the existing saved work rather than a new document system. One origin schema replaces repeated definitions. Main's sentence experiments now survive the private save boundary. Redundant placement controls stay suppressed where Library placement already owns the action.

## Selection contract

Eligibility: owner-authored notes and non-empty private writing, title, question, return note or actually changed wording. Missing sources qualify only through the owner's already stored work. Quality bar: suppress unchanged source-only wording, blank placeholders, inaccessible fresh source bodies and explicitly suppressed origins. Search is literal and bounded; excerpts come from the matched owned field. Silence: no invented recommendations, filler or automatic generation when nothing qualifies. Agent tokens cannot read private work or version history.

## Evidence before merge

- Full `npm run wiki:qa` passed, including 981 frontend tests in 87 suites, the backend Wiki/agent gates and an optimized production build.
- Additional changed-surface tests: 219 passed in 19 suites. Sentence/field-kit focused run: 288 passed. Targeted private-work server tests: 25 passed.
- Real Mongo/Express acceptance passed with zero model calls; all 158 disposable fixture records were removed. It covers optimistic concurrency, idempotent Keeps, original source integrity, independent kept copies, access denial, missing highlights/sources, bounded search and 12-version retention/concurrent deduplication.
- Real Chromium: two independently authenticated sessions, Wiki and Library at 1440/1320/430, exact continuation, clipboard fallback, conflict resolution; all seven retained demonstration records unchanged.
- Real Chromium: downloadable field kit edited/exported with networking disabled, stale import preserved online words until explicit choice, saved history survived reload/restored a new revision, missing-source recovery rendered at 1440/1320/430 and explicit Discard removed history. Reduced-motion preference enabled. Screenshots visually inspected; no JavaScript errors.
- Main already contained a failing maintenance-publication test fixture: it expected a full snapshot for unchanged content, which current revision storage intentionally omits. Reproduced in the canonical checkout; corrected the fixture to create actual changed candidate content. No maintenance runtime behavior changed for that repair.
- Production index dry run and apply completed on September 11. Both owner-scoped partial unique indexes exist before enabling Library saves. No old index or documents were removed. Local DNS SRV resolution failed; explicit public DNS resolved it. Deployment verification follows the merge and is recorded in the durable project checkpoint.

## User test

1. In Library, open one of your articles. Select a short passage and choose **Work with passage**. Give the thought a title, write a few lines, leave a question and a return note. Wait for **Saved privately**.
2. Open **Exploration options → Saved versions → Save this version**. Change a sentence, reload, then read the earlier version. **Use this writing** should restore the chosen words as a new save.
3. Choose **Take this work offline → Download field kit**. Open the downloaded HTML file, disconnect, edit, and **Save changes to bring back**. Reconnect and choose that JSON file under **Bring back offline changes**.
4. Repeat after changing the online copy first. Both versions should remain available until you choose. No silent overwrite.
5. Copy the continuation link and open it on another signed-in device. Read fresh, return to the work, then find it from Think using a phrase you wrote. Try the same writing/continuation loop on a Wiki sentence.
6. Keep a note or question, edit the exploration again, and confirm the kept copy remains unchanged. Use a disposable source/work to test source removal and recovery; Discard must leave independent kept copies alone.

## Remaining

C1 engineering is implemented. Physical-device/native Safari and native IME behavior, live companion quality, and voluntary returns over several days require their own acceptance evidence; Chromium viewport/keyboard checks do not claim those. Automatic background offline synchronization is not implemented. C2–C8 remain the roadmap, starting with existing-work retrieval and placement. Inventory main's already implemented sentence tools before expanding them; do not rebuild what is now present.
