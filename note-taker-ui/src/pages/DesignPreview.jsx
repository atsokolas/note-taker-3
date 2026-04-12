import React, { useMemo, useState } from 'react';

const SCREENS = [
  {
    id: 'home',
    label: 'Think home',
    title: 'Live desk',
    summary: 'One dominant thread, one active queue, one tiny rail for deltas and next move.',
    files: [
      'src/pages/ThinkMode.jsx',
      'src/components/think/ThinkHome.jsx',
      'src/layout/ThreePaneLayout.jsx',
      'src/components/working-memory/WorkingMemoryPanel.jsx'
    ],
    changes: [
      'Promote the current thread into a full-width lead surface.',
      'Demote dashboard fragments into a single active queue block.',
      'Shrink the right rail into provenance, support, and next move.'
    ]
  },
  {
    id: 'notebook',
    label: 'Notebook',
    title: 'Document first',
    summary: 'The note becomes the room; actions and AI stay in the margins.',
    files: [
      'src/components/think/notebook/NotebookEditor.jsx',
      'src/components/think/notebook/NotebookContext.jsx',
      'src/layout/RightContextPanel.jsx',
      'src/layout/ThreePaneLayout.jsx'
    ],
    changes: [
      'Give the writing surface more width and reduce toolbar density.',
      'Move reuse and recall actions into a marginalia rail.',
      'Show structure only when it improves selection and retrieval.'
    ]
  },
  {
    id: 'concept',
    label: 'Concept',
    title: 'Argument instrument',
    summary: 'The claim is loud, the draft is central, and support plus contradiction remain attached.',
    files: [
      'src/components/think/concepts/idea-workbench/IdeaWorkbenchMain.jsx',
      'src/components/think/concepts/idea-workbench/IdeaWorkbenchAgentRail.jsx',
      'src/components/think/concepts/idea-workbench/useIdeaWorkbenchModel.js',
      'src/styles/idea-workbench.css'
    ],
    changes: [
      'Turn the top of the page into a current-claim surface.',
      'Replace chat-like agent output with deltas, support, and tension.',
      'Keep contradiction visible until the draft resolves it.'
    ]
  },
  {
    id: 'library',
    label: 'Library',
    title: 'Reading room',
    summary: 'Saved views become shelving, the article remains central, and context behaves like marginalia.',
    files: [
      'src/pages/Library.jsx',
      'src/components/library/LibraryMain.jsx',
      'src/components/library/LibraryContext.jsx',
      'src/components/ArticleReader.jsx'
    ],
    changes: [
      'Preserve reading rhythm by reducing control weight around the article.',
      'Treat saved views as shelving instead of filter-heavy utility.',
      'Keep context narrow and tied to reuse, not chrome.'
    ]
  },
  {
    id: 'handoffs',
    label: 'Handoffs',
    title: 'Dispatch',
    summary: 'Delegation feels operational instead of administrative.',
    files: [
      'src/components/think/handoffs/HandoffsSidebar.jsx',
      'src/components/think/handoffs/HandoffsMainPanel.jsx',
      'src/pages/ThinkMode.jsx'
    ],
    changes: [
      'Reduce the form into one compact assignment strip.',
      'Keep the queue left and returned work center.',
      'Make outputs come back as pressure points, not metadata blobs.'
    ]
  }
];

const PLATFORM_FILES = [
  'src/layout/AppShell.jsx',
  'src/layout/ThreePaneLayout.jsx',
  'src/layout/LeftNav.jsx',
  'src/layout/TopBar.jsx',
  'src/styles/theme.css',
  'src/styles/think-home-polish.css',
  'src/styles/idea-workbench.css'
];

export default function DesignPreview() {
  const [activeScreen, setActiveScreen] = useState('home');

  const current = useMemo(
    () => SCREENS.find((screen) => screen.id === activeScreen) || SCREENS[0],
    [activeScreen]
  );

  return (
    <div className="design-preview-shell">
      <header className="design-preview-shell__header">
        <div className="design-preview-shell__intro">
          <div className="design-preview-shell__eyebrow">Noeis redesign</div>
          <h1>Premium direction plus a literal build map.</h1>
          <p>
            The embedded frame shows the visual target. The panel on the right maps each target back to the current React files so the
            redesign can move from concept into implementation.
          </p>
        </div>

        <div className="design-preview-shell__tabs" role="tablist" aria-label="Redesign screens">
          {SCREENS.map((screen) => (
            <button
              key={screen.id}
              type="button"
              className={`design-preview-shell__tab${screen.id === activeScreen ? ' is-active' : ''}`}
              onClick={() => setActiveScreen(screen.id)}
            >
              {screen.label}
            </button>
          ))}
        </div>
      </header>

      <section className="design-preview-shell__stage">
        <div className="design-preview-shell__frame">
          <iframe
            key={activeScreen}
            title={`Noeis redesign preview - ${current.label}`}
            src={`/redesign-preview.html#${activeScreen}`}
            className="design-preview-shell__iframe"
          />
        </div>

        <aside className="design-preview-shell__notes">
          <div className="design-preview-shell__panel">
            <div className="design-preview-shell__panel-eyebrow">Visual target</div>
            <h2>{current.title}</h2>
            <p>{current.summary}</p>
          </div>

          <div className="design-preview-shell__panel">
            <div className="design-preview-shell__panel-eyebrow">Implementation map</div>
            <ul className="design-preview-shell__list">
              {current.files.map((file) => (
                <li key={file}>
                  <code>{file}</code>
                </li>
              ))}
            </ul>
          </div>

          <div className="design-preview-shell__panel">
            <div className="design-preview-shell__panel-eyebrow">Screen changes</div>
            <ul className="design-preview-shell__list">
              {current.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </div>

          <div className="design-preview-shell__panel">
            <div className="design-preview-shell__panel-eyebrow">Cross-screen foundation</div>
            <ul className="design-preview-shell__list">
              {PLATFORM_FILES.map((file) => (
                <li key={file}>
                  <code>{file}</code>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
