# Make Open from Work writing

Approved visual: Library `libfile_52884aa10f908191b27d9af419a32c21`. This extends the inline composer on the isolated `codex/inline-open-composer` branch, based on main `cbff4a8f` including the spacing fix. User approved building with elegant-code, testing and merging after green checks.

## Behavior and code craft

Make Open extends the existing selection toolbar and Writing tools menu. Selected text (including multiple blocks) becomes one editable title; without a selection it uses the current logical paragraph, including only a nested bullet's own paragraph. Source text, formatting, HTML and block IDs stay unchanged. Add is explicit, literal calendar words remain literal, and source selection is mapped through intervening transactions before restoring focus and scroll. Cancel creates nothing. No new shortcut or automatic mirroring.

Deleted the old `[]` / `?` Enter conversion and its separate callback path. Ordinary Enter continues writing. The composer now uses a growing textarea so multiple blocks remain visible and editable. Existing drafts remain selectable in immutable device snapshots; unsafe memory-only writing cannot be replaced or switched away from silently. One shared unsafe-draft guard serves both operations. Parent acknowledgement retains its local receipt until dependent canonical links are durable, so a device-write failure cannot orphan a linked item.

Read and applied `/Users/athantsokolas/.codex/skills/elegant-code/SKILL.md`: extended existing components/session, removed the destructive path, derived capture from the editor selection, reused existing theme tokens and the queue/identity mechanisms; no API/schema/dependency changes or second toolbar family.

## Verification

Node 22.23.4, locked UI dependencies. Final implementation at `adfbb49f1f5637f00f3b6c297824acab5b7e9549`:

- Work: **138/138 tests across 9 suites** pass.
- Work plus directly related shared editor, NotebookEditor, ThinkEntryEditor, AuthoredWriting and typography/CSS checks: **247/247 tests across 20 suites** pass. The unchanged NotebookEditor asynchronous `setOpposite` path emits four act warnings; the Tippy dependency emits three destroyed-instance warnings during fast test teardown. No Work act errors or aggregate errors.
- Independent whole-branch review found two P1 storage failures. Both were reproduced RED, fixed and verified GREEN. A scoped delta review independently reproduced recovery and found no new substantive issues. No self-approval or test weakening.
- Scoped real-Work preview compiles. Chromium synthetic browser QA at 1440, 1280 and 430px passes with zero page errors and no horizontal overflow (mobile composer width 390px).
- Browser checks: real toolbar to exact prefill; older draft preserved; no creation before Add; source HTML/document/selection and focus unchanged; own nested paragraph only; literal calendar words; offline, lost reply and reload using one operation/one record; touch-capable DOM selection retained through Writing tools tap; multiline title; IME Enter guard; Cancel returns to the original writing selection and creates nothing. API calls were intercepted into an in-memory synthetic server; no real-account writes.

Browser source, result JSON, screenshots and logs are retained in `tmp/inline-open/`: `verify-make-open.cjs`, `make-open-browser-result.json`, `make-open-selected.png`, `make-open-prefilled.png`, `make-open-1280.png`, `make-open-mobile.png`. Final screenshots are uploaded to Library separately from the approved mockup.

## Build, publication and runtime limits

The full local macOS production build still fails on the pre-existing `ReturnGreeting.jsx` / `returnGreeting.js` import-resolution collision, unchanged by this branch. Hosted Linux production build and exact-head CI are required before merge. Physical mobile keyboard/selection handles and live private-note persistence are not tested; synthetic touch/IME and persistence paths are verified.

Initial PR creation was automatically rejected while the first confirmed P1 was present; no PR was created by that attempt. Both P1s are now fixed and independently re-reviewed, providing new verification before publication retry. PR/merge/deployment outcomes are recorded in the final task report, not inferred from local test results. This report supersedes the earlier publication-permission limitation in `docs/noeis-inline-open-qa-2026-10-30.md`.
