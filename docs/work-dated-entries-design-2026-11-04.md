# Dated meeting entries inside Work notes

A supplier/customer note remains one document. Add a dated entry to append a level-two date heading and a blank writing paragraph; the default date is today in Work's selected timezone. A compact date index jumps to meetings. Adding the same date continues that section rather than adding another heading. Backdating is allowed; existing sections never move automatically.

The dates are ordinary editable headings, read from the same HTML/blocks already saved by Work. No second meeting store, schema change, migration or automatic reformatting of older notes. Correct a date by editing its heading. Undo/delete updates the index because it is derived from the document. The full date includes a year and round-trips through the existing block projection.

Existing undated writing stays untouched. The explicit Date existing writing action places the selected date above it. Otherwise new dated entries append after the original text. The original capture date and editable note-level meeting date remain unchanged.

Considered separate meeting records/editors, which would require a new persistence and conflict contract; ruled out for this focused request. Also considered automatically stamping dates on every visit/day, which could mislabel old writing or create empty duplicate sections. Explicit dated sections use the existing editor and autosave/recovery/ownership paths. This is an implementation choice within the delegated design-and-build request; the independent Things 3 exploration is outside scope.

## Local acceptance and limits

- Add dated entry uses the selected Work-zone day by default. Choose an earlier date to backfill a meeting. Continue this entry returns to the end of that date's section; index buttons jump to its heading. Date-index order is newest date first; document order and old writing never move automatically.
- Date existing writing is explicit and only offered before dated sections exist. There is no automatic guessing of meeting dates from old paragraphs.
- Level-two headings recognize valid ISO dates or English day/month/year dates (full or abbreviated month names). These remain ordinary editable text, with no hidden date field to drift away from what the person sees.
- An untitled note's derived name skips date headings, retaining supplier/customer words. Explicit titles remain authoritative.
- Tests cover rich-text and block-ID preservation, explicit dating, multiple dates, same-date continuation, empty heading recovery, valid/leap/invalid days, year boundaries, editable heading/undo, HTML reload, blocks-only recovery, default-day rollover, and title derivation. The API acceptance test round-trips dated HTML/blocks and checks unchanged capture/meeting metadata, ownership and stale revisions.
- Existing Work session, reconciliation, editor, planner, project, rail and account-boundary tests are included in regression verification. No production data, credentials, schema changes or migration used.
- Local fixture preview: `http://127.0.0.1:3102/work?note=n0`; fictional supplier notes, browser-local saves and an adapter that rejects non-fixture requests. Screenshots in ignored `output/playwright/meetings-{desktop,tablet,mobile}.png` at 1440, 1280 and 430px. Full app and fixture builds are separate; temporary fixture entry is restored.
- Native date-picker display follows browser locale; saved date keys and English heading labels are unambiguous. Safari remains unverified. Available Node is 22.22.3, below the declared >=22.23.4 <23 range; no dependency or credential changes were made.

Implementation is local on `codex/work-meeting-entries`, based on main `e4168f277b690160c8cbbf72b0735168fb324c23`. The initial local verification made no push, merge or deployment. Subsequent release status is recorded in the task PR. The separate Things 3 design exploration is untouched.
