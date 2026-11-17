# Nested list spacing — 30 October 2026

Work gave every paragraph a bottom margin and every list a block margin,
including the paragraph and child list inside a single list item. The shared
paragraph styles caused the same separation in Think, Wiki and Library.

The fix removes those margins only inside list items. Additional paragraphs
within an item still have a paragraph gap. Work keeps its original `.8em`
spacing outside list items, including quotations. Wiki's openable paragraph
wrapper receives the same treatment. No note HTML, empty bullets, stored
records, editor commands or Open composer behavior changes.

## Audit

| Surface | Result |
| --- | --- |
| Work note editor | Shared item spacing; original paragraph, quotation and outer-list margins retained |
| Think notebook and entry editors | Shared item spacing through ProseMirror |
| Wiki editor | Shared item spacing through ProseMirror |
| Wiki reader, critical CSS and deferred CSS | Shared item spacing |
| Wiki openable paragraphs | Wrapper-aware item spacing; opening behavior unchanged |
| Public Wiki page and investor brief | Shared item spacing |
| Library article HTML | Shared item spacing |
| Public Wiki collection preview | Already compact; no behavior change |

## Verification

Use the repository-supported Node 22 runtime and locked frontend dependencies.

```sh
npm run test:ui -- --runTestsByPath src/work/WorkNoteEditor.test.jsx src/work/WorkNotes.test.jsx src/components/think/ThinkEntryEditor.test.jsx src/components/think/notebook/NotebookEditor.test.jsx src/components/think/editor/editorShortcuts.test.js src/components/wiki/renderTiptapDoc.test.jsx src/styles/wikiCriticalCss.test.js src/styles/thinkWritingCss.test.js src/components/wiki/open-sentence/WikiOpenSentence.test.jsx src/components/wiki/open-sentence/open-sentence.css.test.js --runInBand
cd note-taker-ui
npx playwright test --config=playwright.prose.config.js
npx playwright test --config=playwright.prose.config.js --browser=webkit
npm run build
```

- Focused UI run: **177/177 pass**, 10 files. Existing test output includes
  NotebookEditor `act` warnings and jsdom network/navigation console errors.
- Chromium: **30/30 pass**. WebKit: **30/30 pass**.
- Browser matrix: 10 surface/style combinations at 1440, 1280 and 430 pixels.
  Synthetic fixtures cover paragraph parents, three nested list levels, both
  list types, inline emphasis/links, multiple paragraphs, quotations and an
  empty bullet. Assertions check computed margins, parent-to-child geometry,
  unchanged HTML/empty bullets, preserved quotation spacing and no prose overflow.
- Desktop fixtures reproduced the original excess margin before the fix.
  Screenshots were visually inspected for Work, Think and wrapped Wiki writing,
  including mobile. Set `PROSE_SCREENSHOT_DIR` to export the fixture frames.
- These are isolated CSS rendering checks, not authenticated production QA.
  Fonts are offline fallbacks; spacing assertions use the real production CSS.
- `git diff --check`: pass. Independent review: two findings corrected; delta
  review has no remaining findings.

## Existing local build blocker

The UI build fails on this case-insensitive macOS filesystem before completion:
`ArticleReader.jsx` imports `./reader/ReturnGreeting` without an extension.
Resolution chooses `reader/returnGreeting.js` (a helper) ahead of the component
`reader/ReturnGreeting.jsx`, then reports that there is no default export.
Both files and that import exist on base commit `4df1c3c`.

The same collision causes **48/51 ArticleReader tests to fail**. A run with the
two changed shared/Work CSS files restored exactly to the base reproduces the
same 48 failures. The unrelated import is unchanged in this spacing fix. A
complete UI build and production verification remain outstanding.
