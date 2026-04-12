# Noeis Redesign Implementation Map

## Visual Thesis

A warm editorial workspace where the active thought is the loudest thing on the page, the archive feels like shelving, and the agent is reduced to provenance, tension, and next move instead of acting like a second app.

## Global Foundation

- `note-taker-ui/src/layout/AppShell.jsx`
- `note-taker-ui/src/layout/ThreePaneLayout.jsx`
- `note-taker-ui/src/layout/LeftNav.jsx`
- `note-taker-ui/src/layout/TopBar.jsx`
- `note-taker-ui/src/styles/theme.css`
- `note-taker-ui/src/styles/think-home-polish.css`
- `note-taker-ui/src/styles/idea-workbench.css`

Global changes:

- Reduce equal-weight surfaces and pill noise.
- Keep one dominant content plane per screen.
- Use the right rail for provenance and next move, not a dense secondary application.
- Preserve the paper-toned palette and serif/sans split while increasing hierarchy contrast.

## Screen 1: Think Home

Primary files:

- `note-taker-ui/src/pages/ThinkMode.jsx`
- `note-taker-ui/src/components/think/ThinkHome.jsx`
- `note-taker-ui/src/components/working-memory/WorkingMemoryPanel.jsx`

Changes:

- Promote the active thread into a full-width lead surface.
- Collapse secondary dashboard fragments into a single active queue below the lead surface.
- Rewrite the right rail to show only `next move`, `what changed`, and `support`.

## Screen 2: Notebook

Primary files:

- `note-taker-ui/src/components/think/notebook/NotebookEditor.jsx`
- `note-taker-ui/src/components/think/notebook/NotebookContext.jsx`
- `note-taker-ui/src/layout/RightContextPanel.jsx`

Changes:

- Make the note body visually dominant.
- Move reuse actions and AI prompts into the right margin.
- Reduce exposed controls unless text selection or insertion context requires them.

## Screen 3: Concept Workbench

Primary files:

- `note-taker-ui/src/components/think/concepts/idea-workbench/IdeaWorkbenchMain.jsx`
- `note-taker-ui/src/components/think/concepts/idea-workbench/IdeaWorkbenchAgentRail.jsx`
- `note-taker-ui/src/components/think/concepts/idea-workbench/useIdeaWorkbenchModel.js`
- `note-taker-ui/src/styles/idea-workbench.css`

Changes:

- Turn the top section into a clear current-claim surface.
- Keep the draft central and attach evidence/contradiction beside it.
- Replace chat-like agent logs with deltas, support added, and unresolved tension.

## Screen 4: Library

Primary files:

- `note-taker-ui/src/pages/Library.jsx`
- `note-taker-ui/src/components/library/LibraryMain.jsx`
- `note-taker-ui/src/components/library/LibraryContext.jsx`
- `note-taker-ui/src/components/ArticleReader.jsx`

Changes:

- Preserve long-form reading rhythm by reducing surrounding chrome.
- Treat the left side as shelving and saved views, not a filter matrix.
- Narrow the right side into marginalia connected to reuse and open questions.

## Screen 5: Handoffs

Primary files:

- `note-taker-ui/src/components/think/handoffs/HandoffsSidebar.jsx`
- `note-taker-ui/src/components/think/handoffs/HandoffsMainPanel.jsx`
- `note-taker-ui/src/pages/ThinkMode.jsx`

Changes:

- Compress the creation form into a dispatch strip.
- Keep queue left, selected output center, status right.
- Return work as pressure points and evidence, not metadata-heavy forms.

## Preview Assets

Live preview routes:

- `note-taker-ui/public/redesign-preview.html`
- `note-taker-ui/src/pages/DesignPreview.jsx`
- `note-taker-ui/src/styles/design-preview.css`

Rendered screen exports:

- `output/ui-redesign-v3/home.png`
- `output/ui-redesign-v3/notebook.png`
- `output/ui-redesign-v3/concept.png`
- `output/ui-redesign-v3/library.png`
- `output/ui-redesign-v3/handoffs.png`
