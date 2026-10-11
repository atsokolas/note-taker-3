# Think craftsmanship implementation

Status: implemented on `codex/think-craft-2026-09-16`; not merged or deployed.

## What changed

Think now rests as a quiet writing page. The left shelf owns New note and recent work, the center keeps one compact utility row and a modest wrapping title, and the single optional context area stays closed until the writer asks for Material or Partner. Opening context keeps the desktop writing measure fixed; tablet and phone use a focused view with an explicit Close action and an inert writing background.

The existing Tiptap document remains canonical. The new note-local workbench stores staged material, wording trials, loose thoughts, a next-time line, and writing continuity separately. Its authenticated update route checks ownership and a monotonically increasing revision, bounds every private collection and string, and updates only `workingState`. It cannot overwrite title, canonical content, blocks, or set-aside passages.

The passage bracket and `Command/Control + /` menu follow stable block IDs. Source staging captures the target block and caret before focus moves. Insertions use editor transactions, retain exact source identity, and leave an operation receipt whose inverse deletes only the inserted block. A missing target asks the writer to choose another place.

Try without retains a passage and its attached source blocks with stable neighbor anchors. Bring back resolves those anchors against the current document and declines to guess when both are gone. Move, set-aside, restore, source insertion, held-thought insertion, trial commit, and next-line clearing use operation-specific inverses so Undo does not restore an old whole-document snapshot over newer writing.

Wording trials remain outside the canonical document. Read in place uses a read-only ProseMirror decoration. Commit checks the target block and original text before replacing it through a transaction; a changed target becomes stale and requires an explicit review-baseline update. Closing the panel or choosing Keep my original retains the private alternative; Discard removes it.

Thought Partner remains mounted per note. An explicit selection is carried into the existing partner request, and an assistant suggestion can enter the private wording-trial flow with `partner` origin. Partner replies never write directly to the draft.

Normal Markdown export, public preview, and frozen share snapshots serialize canonical content only. Server tests prove that workbench fields, set-aside content, and private asides are absent. A separate versioned private recovery JSON contains the current note, canonical draft, set-aside groups, and workbench state; it is labelled as a recovery file and has no import claim or credentials.

No data migration is required. Existing notes receive migration-compatible defaults on read. Blank titles are valid and remain blank; the server no longer manufactures `Untitled` during notebook create/update.

## Intentional differences from the prototype

- The production editor stays Tiptap rather than becoming a plain-text fixture.
- Material uses real Library articles and highlights; it has no fictional sources or scores.
- Insertion attaches a source block after the held paragraph and says so; it does not imply inline insertion.
- Trials preview through isolated editor decorations rather than replacing and re-saving document text.
- Working state persists through an ownership-checked, revisioned server route rather than local storage.
- The context panel is fixed beside the wide composition so long notes cannot scroll it out of reach.

## Verification

- Focused React suites: 132 tests passed across editor, arrangement, workbench, first paint, Partner, share, and export.
- Server persistence/privacy: 4 Markdown tests plus notebook update, share, and workbench route suites passed.
- Browser journeys: 3 Chromium and 3 WebKit tests passed at desktop, tablet, and phone widths with a long title, rich text, a source, a staged passage, a trial, a loose thought, set-aside content, and a next-time line.
- Production frontend build compiled successfully.
- `git diff --check` passed.

The Thought Partner suite still prints its existing asynchronous React `act(...)` warnings while passing. Physical iPad behavior, increased OS text size, authenticated production saving, and production deployment remain unverified. No production content was touched.

## Screenshot evidence

- `docs/ui-regression/screenshots/think-craft-2026-09-16/01-resting-draft.png`
- `docs/ui-regression/screenshots/think-craft-2026-09-16/02-material-held-target.png`
- `docs/ui-regression/screenshots/think-craft-2026-09-16/03-trial-in-context.png`
- `docs/ui-regression/screenshots/think-craft-2026-09-16/04-held-thought.png`
- `docs/ui-regression/screenshots/think-craft-2026-09-16/05-set-aside.png`
- `docs/ui-regression/screenshots/think-craft-2026-09-16/06-next-time-line.png`
- `docs/ui-regression/screenshots/think-craft-2026-09-16/07-phone-context.png`

## User test

1. Open an existing Notebook note. Confirm the quiet page has no idle right rail, the long title wraps, writing begins directly below it, and the save label moves honestly from Editing to Saving to Saved.
2. Place the caret in a paragraph and open Material. Confirm the blue bracket holds that paragraph without moving the prose. Stage a highlight; verify the draft is unchanged. Choose Insert here, type another sentence, then Undo the passage insertion. The newer sentence must remain.
3. Open the paragraph menu with `Command + /` or `Control + /`. Choose Try another wording, edit the alternative, and use Read in place. Confirm the preview is labelled and read-only. Close and reopen Material; the alternative should remain. Change the original paragraph, then confirm Use this version is blocked until Review against the current paragraph is chosen.
4. Choose Hold a thought. Closing an empty field must create nothing. Save a real thought, reload, and put it into the draft. Undo should restore the loose thought without removing later edits.
5. Choose Try without on a paragraph with an attached quotation, reload, and Bring back. The paragraph and quotation should return together. If their neighboring passages are removed first, Think should ask where to restore rather than silently append.
6. Leave a line for next time, reload, and choose Pick up here. Confirm the caret returns to the saved paragraph. Not now should only hide it for this session; Clear this line should offer Undo.
7. Select words and choose Ask about this. Confirm Partner shows that selection. On an assistant reply choose Try as alternate wording; verify it opens as a private trial and never changes the draft until Use this version.
8. Export normally and create or inspect a share preview. Confirm neither contains trials, staged material, loose thoughts, next-time lines, set-aside passages, or Partner conversation. The Private recovery export should contain the note's private workbench and no tokens.
9. At phone width, open Material. Confirm the writing surface behind it is not tabbable and Close returns to the same note. Repeat the core flow with touch controls; dragging must not be required.

