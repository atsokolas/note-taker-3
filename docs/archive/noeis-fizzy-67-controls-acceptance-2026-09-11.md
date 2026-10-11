# Notebook focus and Library Actions

## Scope and state

[Fizzy #67](https://app.fizzy.do/6253588/cards/67), titled “Move the focus mode in Notebook to left rail not”, was open in In Progress on September 11. Its description is blank, it has no attachments, and its only comment records the move to In Progress. The accompanying user screenshot identifies Library's detached Actions disclosure as the additional cleanup.

Implementation lives in `/Users/athantsokolas/.codex/worktrees/noeis-fizzy-67-2026-09-11`, branch `codex/fizzy-67-2026-09-11`. Code commit: `08e25db29541ab5e65ee7ce89eebef39746e7351`, based on main `ca6e16db` (through PR #367). The canonical checkout's unrelated changes and existing worktrees were preserved. No backend behavior or selection policy changed.

## Result

- Notebook's Focus button sits at the top of its left rail. The shelf contents retreat separately, leaving the exit reachable. On phones, where the shelf stacks below the note, the same button sits beside Start a note and Find writing.
- The current Notebook surface is `ThinkNotes`: `/think`, `?tab=home`, and `?tab=notebook` all route there. The older Notebook editorial view is unchanged. Other Think surfaces retain their existing top-bar control.
- Deliberate focus owns a separate body class from temporary typing activity. Idle/blur cannot cancel it. Its preference survives reload; leaving the surface clears its presentation class. The button has an explicit accessible name and pressed state.
- Library's Actions disclosure is grouped with Later / Set aside / Kept, with a quiet border and chevron. The existing Clean up structure and review-import handlers remain connected. Phone menus anchor within the browse header, preventing horizontal overflow.
- No new production component or state layer was added. This document records the scoped acceptance evidence; it does not replace an existing specification.

## Verification

Local checks use sample data served on `127.0.0.1:5567` and the actual development UI on `127.0.0.1:3167`. The sample API has no production connection. Local fixture writes exercise the UI only and do not prove backend persistence.

| Check | Result |
| --- | --- |
| Targeted Jest suites | 136 tests across 9 suites pass, including Notebook editing, Think templates/partner wiring, current Think routing, focus, typing, TopBar, and Library actions. |
| Chromium, 1440 and 1320 pixels | Focus/exit, actual typing followed by idle, reload, keyboard toggle, Library menu, Escape/outside dismissal, and review-import query change pass. |
| WebKit, 1440 and 1320 pixels | Same scenarios pass. WebKit is automated engine coverage, not a test in the user's installed Safari session. |
| Chromium and WebKit, 430 pixels with touch | Focus is in the initial viewport; menu stays within the viewport; no horizontal document overflow; same interactions pass. |
| Reduced motion | Both engines' 1320-pixel cases use reduced motion; focus still collapses and restores the rails. |
| Runtime errors | No uncaught page errors in the six browser cases. |
| Production build | Optimized frontend build passes. |
| Patch integrity | `git diff --check` passes. |

The phone pass caught and fixed two placement issues: a menu extending past the viewport, and the shelf entrance animation making the mobile Focus button position relative to the shelf rather than the page.

## Evidence and repeatable checks

Local evidence directory: `output/fizzy-67-controls/` in the implementation worktree. It contains `browser-results.json`, `browser.log`, `final-tests.log`, `build.log`, `browser-qa.cjs`, and the isolated sample API `fixture-server.cjs`.

Screenshots are named `{chromium|webkit}-{notebook|focus|library|actions}-{1440|1320|430}.png`.

```sh
CI=true npm --prefix note-taker-ui test -- --watchAll=false --runInBand --testPathPattern='ThinkNotes|FocusMode|useThinkWritingActivity|thinkWritingCss|LibraryActions|TopBar|ThinkMode.templates|NotebookEditor.test'
GENERATE_SOURCEMAP=false npm --prefix note-taker-ui run build
node output/fizzy-67-controls/browser-qa.cjs
git diff --check
```

The browser script requires the two local servers and the installed Chromium/WebKit Playwright engines. It authenticates only against the local sample API.

## Release boundary and next action

The implementation is committed and prepared for review. It has not been merged or deployed. Production navigation reached login, so authenticated production behavior remains unverified. Fizzy #67 remains open; no card comment or state change was made.

Next action: review and merge the scoped PR, then verify the real Notebook and Library in the authenticated deployed application before closing #67. Check entering/exiting focus, typing then pausing, reload, and the Actions menu at desktop and phone widths.
