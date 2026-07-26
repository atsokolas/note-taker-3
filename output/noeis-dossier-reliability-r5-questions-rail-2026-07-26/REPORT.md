# R5 — Questions rail populated-state repair

**Date:** 2026-07-26  
**Branch:** `cursor/r5-questions-rail-2026-07-26`  
**Worktree:** `/Users/athantsokolas/.cursor/worktrees/noeis-r5-questions-rail-2026-07-26`  
**Base:** `origin/main` @ `a7e7bb72`  
**Environment:** local API `http://localhost:5500` + UI `http://localhost:3000` (seed user `qa_wiki_seed` via `scripts/seed_wiki_qa.js`)

## Root cause

`ThinkMode` gated the global questions list fetch to Home and Questions only:

```js
const questionsListEnabled = activeView === 'home' || activeView === 'questions';
```

`ThinkShelfRail` still mounts on Concepts index and Notebook, so those surfaces received `questions=[]` and showed **"No questions yet"** even when `GET /api/questions` returned wiki-derived open questions.

## Fix

Enable the questions list fetch wherever the calm shelf rail is shown (Home, Questions, Concepts, Notebook).

## Files changed

- `note-taker-ui/src/pages/ThinkMode.jsx` — expand `questionsListEnabled`
- `note-taker-ui/src/pages/ThinkMode.templates.test.jsx` — regression: Home / Concepts / Notebook populate rail; mock respects `enabled`
- `note-taker-ui/src/components/think/ThinkShelfRail.test.jsx` — populated Questions section coverage

## Acceptance

| Check | Result |
| --- | --- |
| Focused tests (`ThinkShelfRail.test` + `ThinkMode.templates.test`) | Pass (35) |
| `cd note-taker-ui && CI=true npm run build` | Pass |
| Authenticated screenshot with ≥1 real question | Pass (`concepts-desktop-1440.png` and others) |
| Desktop / 1360 Safari-sidebar / ~430 mobile, no horizontal overflow | Pass (see `qa-report.json`) |
| `git diff --check` | Pass |
| Commit / push | **None** (per instructions) |

## Screenshots

Primary proof (Concepts, desktop, populated Questions with Wiki page links):

- `concepts-desktop-1440.png`

Also captured:

- `home-desktop-1440.png`, `home-safari-sidebar-1360.png`, `home-mobile-430.png`
- `concepts-safari-sidebar-1360.png`, `concepts-mobile-430.png`
- `notebook-desktop-1440.png`, `notebook-safari-sidebar-1360.png`, `notebook-mobile-430.png`

Machine-readable summary: `qa-report.json` (5 questions on every Home/Concepts/Notebook × width combo; `hasHorizontalOverflow: false`).

## Routes checked

- `/think?tab=home`
- `/think?tab=concepts`
- `/think?tab=notebook`

Widths: 1440, 1360, 430.

## Notes

- `wiki_open_question` → `/wiki/workspace?page=<id>#open-questions` preserved (existing `ThinkShelfRail` / `getWikiOpenQuestionHref` path; covered by tests).
- ThoughtPartnerPanel mounting patterns unchanged.
- No `server/**` changes.
