# Notebook saving and passage controls — September 13, 2026

## Outcome and proof boundary

The production save failure is confirmed to be Atlas storage exhaustion. The
cluster rejected a transactional diagnostic insert with Mongo code 8000:
`you are over your space quota, using 512 MB of 512 MB.` The transaction was
aborted and zero diagnostic records remained. The specific reported Notebook
entry passes current schema validation after the existing identity sanitizer.
Production API `/api/version` served `f0002c5726a1edca1b37567d76e266a7dc4290e9`,
which already includes the recent legacy-identity save repairs.

This branch improves failure recovery and passage controls. Production storage
recovery and daily retention subsequently shipped in PRs #421–422; see
[the storage report](noeis-storage-retention-2026-09-13.md). The notebook controls
were still unreleased when the user reported the missing brackets. This release
is rebased onto `ff92d346` and contains no production data changes.

## Changes

- Existing arrangement control opens with **Command + /** or **Control + /**
  from the note. It targets the caret passage and focuses the first available
  action. Escape closes it and returns to writing. Composition and unrelated
  text fields do not activate the shortcut.
- A quiet **Noeis blue right bracket** covers the complete tracked passage,
  including its attached source quotation. It remeasures on layout changes.
  An open menu holds its target when focus leaves the editor. Existing grouped
  Move, Try without, Delete, Undo and Bring back behavior remains shared.
- The error status says **Not saved**, with an explicit **Retry save** action.
  It also appears for title-only edits. The latest draft stays dirty until the
  server acknowledges it; the existing navigation flush remains in force.
- The Notebook update route translates Atlas quota failures to HTTP 507 with
  `storage_full` and guidance to keep the page open. Unrelated failures remain
  HTTP 500. It does not expose database internals in the response.

No new production components or abstractions were added. Full-passage geometry
replaces the old first-line position helper; each rendered node is measured once
per layout sync. Motion remains restricted to a fine pointer without a reduced
motion preference. The blue uses `--noeis-pointer`; the general accent token is
cyan in this surface.

## Verification

- 88 tests across five UI suites: NotebookArrangementRail, NotebookEditor,
  notebookArrangement, ThinkNotes.firstPaint and thinkWritingCss.
- Notebook update route tests: existing malformed-identity/source cases, storage
  quota 507, unrelated Atlas error 500.
- Optimized frontend build and `git diff --check` passed.
- Real local Mongo + Express + browser at 1440, 1320 and 430px: shortcut/focus,
  grouped paragraph + source bounds, grouped move, undo, reflow, menu bounds and
  Focus mode. Mobile document width was exactly 430px; menu stayed inside it.
- Controlled local API outage: entered new words, observed Not saved/Retry save,
  restored API, retried without editing, observed Saved, reloaded and read back
  the same words. No production note was used for this test.

The browser run used the Codex in-app browser. Native Safari, physical touch and
native IME behavior are not proven by it. Unit coverage guards composition and
editor key handling; CSS tests cover reduced-motion rules. No live agent/model
calls or broad Wiki behavior changes were made.

## User test

Once released and production storage is available:

1. Keep any page with unsaved words open. Copy those words somewhere safe before
   refreshing an older client. In Think, open a disposable note and type a line.
   Wait for Saved; reload and confirm the line remains.
2. Click into a paragraph with an attached source. The blue bracket should cover
   both. Press Command + / (Control + / on Windows/Linux), then Tab/Enter to move
   it. Confirm the source moves too. Use Undo to restore its original place.
3. Press Escape, then type: the menu should close and writing should continue in
   the note. Try the same interaction with Focus on and in a narrow window.
4. For a failure check, use a disposable test note, briefly disconnect networking,
   type a line and wait for Not saved. Restore networking, press Retry save, wait
   for Saved and reload. Do not reload while Not saved is showing.

## Release verification — September 13

- Rebased the previously local notebook-controls commit onto current main
  (`ff92d346`) without conflicts.
- Re-ran all 88 notebook UI tests and the Notebook update-route tests.
- The Mac build exposed an existing case-insensitive import collision between
  `SharedQuestionCompanion.jsx` and `sharedQuestionCompanion.js`. Three component
  imports now specify `.jsx`; no Question behavior changed. The 12 relevant
  Question tests and optimized frontend build pass.
- Refreshed Chromium acceptance at 1440, 1320 and 430px with reduced motion:
  the blue bracket matches paragraph and source bounds within 2px, the menu
  stays inside the viewport, both shortcut variants open it, Escape restores
  editor focus, and a grouped move/undo survives reload. Zero page errors.

## Remaining

Native Safari keyboard and physical touch acceptance remain user checks. This
work does not claim to finish later authorship roadmap chapters. Daily storage
retention is already deployed; the next actual daily cycle is a separate
longitudinal check, not a reason to rerun cleanup today.

Local repair checkout: `/Users/athantsokolas/.codex/worktrees/noeis-notebook-save-controls-2026-09-13`
(branch `codex/notebook-save-controls-2026-09-13`). Isolated preview uses UI 3103,
API 5513 and Mongo 27029 / `noeis_notebook_repair`; background workers and AI are
disabled. QA credentials remain in the seed script, not here.
