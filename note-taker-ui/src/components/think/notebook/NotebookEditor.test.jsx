import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NotebookEditor from './NotebookEditor';

const mockUseEditor = jest.fn();
const mockChain = {
  focus: jest.fn(() => mockChain),
  setParagraph: jest.fn(() => mockChain),
  toggleHeading: jest.fn(() => mockChain),
  toggleBold: jest.fn(() => mockChain),
  toggleItalic: jest.fn(() => mockChain),
  toggleBulletList: jest.fn(() => mockChain),
  toggleOrderedList: jest.fn(() => mockChain),
  toggleBlockquote: jest.fn(() => mockChain),
  run: jest.fn(() => true)
};

const mockEditor = {
  chain: jest.fn(() => mockChain),
  isActive: jest.fn(() => false),
  on: jest.fn(),
  off: jest.fn(),
  state: {
    selection: {
      from: 0,
      $from: {
        index: jest.fn(() => 0)
      }
    }
  },
  view: {
    coordsAtPos: jest.fn(() => ({ left: 0, right: 0 }))
  },
  commands: {
    setContent: jest.fn(),
    insertContent: jest.fn()
  },
  getHTML: jest.fn(() => '<p>Draft</p>'),
  getJSON: jest.fn(() => ({ type: 'doc', content: [] }))
};

jest.mock('@tiptap/react', () => ({
  EditorContent: ({ editor }) => <div data-testid="editor-content">{editor ? 'editor-ready' : 'editor-missing'}</div>,
  NodeViewWrapper: ({ children }) => <div>{children}</div>,
  ReactNodeViewRenderer: () => () => null,
  useEditor: (...args) => mockUseEditor(...args)
}));

jest.mock('../../return-queue/ReturnLaterControl', () => () => <div data-testid="return-later-control" />);
jest.mock('../../agent/AgentSkillDock', () => () => <div data-testid="agent-skill-dock" />);
jest.mock('./InsertHighlightModal', () => () => null);
jest.mock('./InsertReferenceModal', () => () => null);

jest.mock('../../../hooks/useHighlights', () => () => ({
  highlights: [],
  highlightMap: new Map(),
  loading: false,
  error: ''
}));

jest.mock('../../../hooks/useArticles', () => () => ({ articles: [] }));
jest.mock('../../../hooks/useConcepts', () => () => ({ concepts: [] }));
jest.mock('../../../hooks/useQuestions', () => () => ({ questions: [] }));

jest.mock('../../../api/organize', () => ({
  getNotebookClaimEvidence: jest.fn(async () => ({ evidence: [] })),
  searchNotebookClaims: jest.fn(async () => [])
}));

jest.mock('../../../hooks/useCssMagneticLerp', () => () => ({
  elRef: { current: null },
  setTarget: jest.fn(),
  reset: jest.fn()
}));

jest.mock('../../../hooks/useMotionPreferences', () => ({
  useFinePointer: () => false,
  usePrefersReducedMotion: () => true
}));

describe('NotebookEditor', () => {
  beforeEach(() => {
    mockUseEditor.mockReturnValue(mockEditor);
    mockEditor.chain.mockReturnValue(mockChain);
    mockEditor.isActive.mockImplementation(() => false);
    Object.values(mockChain).forEach((value) => {
      if (typeof value === 'function') value.mockClear?.();
    });
    mockChain.focus.mockReturnValue(mockChain);
    mockChain.setParagraph.mockReturnValue(mockChain);
    mockChain.toggleHeading.mockReturnValue(mockChain);
    mockChain.toggleBold.mockReturnValue(mockChain);
    mockChain.toggleItalic.mockReturnValue(mockChain);
    mockChain.toggleBulletList.mockReturnValue(mockChain);
    mockChain.toggleOrderedList.mockReturnValue(mockChain);
    mockChain.toggleBlockquote.mockReturnValue(mockChain);
    mockChain.run.mockReturnValue(true);
    mockEditor.chain.mockClear();
    mockEditor.on.mockClear();
    mockEditor.off.mockClear();
    mockEditor.view.coordsAtPos.mockClear();
    mockEditor.commands.setContent.mockClear();
    mockEditor.commands.insertContent.mockClear();
    mockEditor.state.selection.from = 0;
    mockEditor.state.selection.$from.index.mockReturnValue(0);
  });

  it('renders a title-first drafting surface with rich text controls', () => {
    render(
      <NotebookEditor
        entry={{ _id: 'note-1', title: '', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();
    expect(screen.getByText(/Type \/ for commands/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paragraph' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subhead' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bulleted list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Numbered list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Evidence block' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Concept block' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Question block' })).toBeInTheDocument();
  });

  it('routes toolbar actions through the editor commands', () => {
    render(
      <NotebookEditor
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quote' }));

    expect(mockEditor.chain).toHaveBeenCalled();
    expect(mockChain.toggleBold).toHaveBeenCalled();
    expect(mockChain.toggleBlockquote).toHaveBeenCalled();
  });

  it('keeps insert actions collapsed until requested', () => {
    render(
      <NotebookEditor
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Insert material' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Highlight' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Article' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Concept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Question' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Insert material' }));

    expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Article' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Concept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Question' })).toBeInTheDocument();
  });

  it('can hide the inline notebook agent surface when the shell provides it elsewhere', () => {
    render(
      <NotebookEditor
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    expect(screen.queryByTestId('agent-skill-dock')).not.toBeInTheDocument();
  });

  it('moves the current block down from the helper controls', () => {
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] }
      ]
    });
    mockEditor.state.selection.$from.index.mockReturnValue(0);

    render(
      <NotebookEditor
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));

    expect(mockEditor.commands.setContent).toHaveBeenCalledWith({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] }
      ]
    }, false);
  });

  it('inserts a structured question block from the visible draft block actions', () => {
    render(
      <NotebookEditor
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Question block' }));

    expect(mockEditor.commands.insertContent).toHaveBeenCalledWith([
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Question' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Open question: ' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Why it matters: ' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Next evidence to find: ' }]
      }
    ]);
  });
});
