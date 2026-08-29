import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotebookEditor from './NotebookEditor';
import { listWikiPages } from '../../../api/wiki';
import { THINK_WRITING_IDLE_MS } from '../editor/useThinkWritingActivity';

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
  deleteRange: jest.fn(() => mockChain),
  insertContent: jest.fn(() => mockChain),
  run: jest.fn(() => true)
};

const mockEditor = {
  chain: jest.fn(() => mockChain),
  isActive: jest.fn(() => false),
  on: jest.fn(),
  off: jest.fn(),
  /* A note opens as reading; the editor is told when the human asks to edit. */
  setEditable: jest.fn(),
  state: {
    selection: {
      from: 0,
      to: 0,
      $from: {
        index: jest.fn(() => 0)
      }
    }
  },
  view: {
    coordsAtPos: jest.fn(() => ({ left: 0, right: 0 }))
  },
  commands: {
    focus: jest.fn(),
    setContent: jest.fn(),
    insertContent: jest.fn()
  },
  getHTML: jest.fn(() => '<p>Draft</p>'),
  getJSON: jest.fn(() => ({ type: 'doc', content: [] }))
};

jest.mock('@tiptap/react', () => ({
  BubbleMenu: ({ children }) => <div data-testid="selection-bubble">{children}</div>,
  EditorContent: ({ editor }) => <div data-testid="editor-content">{editor ? 'editor-ready' : 'editor-missing'}</div>,
  NodeViewWrapper: ({ children }) => <div>{children}</div>,
  ReactNodeViewRenderer: () => () => null,
  useEditor: (...args) => mockUseEditor(...args)
}));

jest.mock('../../return-queue/ReturnLaterControl', () => () => <div data-testid="return-later-control" />);
jest.mock('../../agent/AgentSkillDock', () => () => <div data-testid="agent-skill-dock" />);
jest.mock('./InsertHighlightModal', () => () => null);
jest.mock('./InsertReferenceModal', () => ({ open, title }) => (
  open ? <div data-testid={`reference-modal-${title}`}>{title}</div> : null
));

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

jest.mock('../../../api/wiki', () => ({
  listWikiPages: jest.fn(async () => [])
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
    listWikiPages.mockResolvedValue([]);
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
    mockEditor.state.selection.to = 0;
    mockEditor.state.selection.empty = true;
    mockEditor.state.selection.$from.parent = { textContent: '' };
    mockEditor.state.selection.$from.parentOffset = 0;
    delete mockEditor.state.doc;
    mockEditor.state.selection.$from.index.mockReturnValue(0);
    document.body.classList.remove('think-writing-active');
  });

  it('renders a title-first drafting surface with a compact selection toolbar', () => {
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
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Paragraph' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Heading' })).not.toBeInTheDocument();
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

  it('offers Hold this from /hold in the slash menu', async () => {
    mockEditor.state.selection.empty = true;
    mockEditor.state.selection.from = 5;
    mockEditor.state.selection.to = 5;
    mockEditor.state.selection.$from.parent = { textContent: '/hold' };
    mockEditor.state.selection.$from.parentOffset = 5;
    mockEditor.view.coordsAtPos.mockReturnValue({ left: 12, right: 12, top: 10, bottom: 24 });

    render(
      <NotebookEditor
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(await screen.findByRole('menuitem', { name: /Hold this/i })).toBeInTheDocument();
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

  it('opens source and concept insertion from Notion-style inline triggers', async () => {
    render(
      <NotebookEditor
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    const editorProps = mockUseEditor.mock.calls[0][0].editorProps;
    act(() => editorProps.handleTextInput({ state: { doc: { textBetween: () => ' ' } } }, 2, 2, '@'));
    expect(await screen.findByText('Insert Article')).toBeInTheDocument();

    act(() => editorProps.handleTextInput({ state: { doc: { textBetween: () => '[' } } }, 3, 3, '['));
    expect(await screen.findByText('Link Concept or Wiki')).toBeInTheDocument();
  });

  it('stages an exact selected passage in the thought partner without auto-submitting it', () => {
    const onInvokeAgentSkill = jest.fn();
    mockEditor.state.selection.from = 2;
    mockEditor.state.selection.to = 18;
    mockEditor.state.doc = { textBetween: jest.fn(() => 'A consequential claim') };
    render(
      <NotebookEditor
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        onInvokeAgentSkill={onInvokeAgentSkill}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask thought partner about selection' }));
    expect(onInvokeAgentSkill).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'draft',
      contextType: 'notebook',
      prompt: expect.stringContaining('A consequential claim')
    }));
  });

  it('does not rehydrate the editor when autosave returns the same note identity', () => {
    const props = {
      saving: false,
      error: '',
      onSave: jest.fn(),
      onDelete: jest.fn()
    };
    const { rerender } = render(
      <NotebookEditor
        {...props}
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Local draft</p>', blocks: [], type: 'note', tags: [] }}
      />
    );
    const hydrationCount = mockEditor.commands.setContent.mock.calls.length;

    rerender(
      <NotebookEditor
        {...props}
        entry={{ _id: 'note-1', title: 'Draft', content: '<p>Saved response</p>', blocks: [], type: 'note', tags: [] }}
      />
    );

    expect(mockEditor.commands.setContent).toHaveBeenCalledTimes(hydrationCount);
  });

  /* /think opens straight into whichever note you were last in, and the body
     used to be a live editor on first paint — so a keystroke aimed at the page
     landed in the note. Editing is something you ask for now. */
  describe('a note you have not asked to edit', () => {
    const paint = (entryId = 'note-1') => render(
      <NotebookEditor
        entry={{ _id: entryId, title: 'Playing to Win', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    const writingUpdates = () => mockEditor.on.mock.calls.filter(([eventName, handler]) => (
      eventName === 'update' && handler.length > 0
    ));

    it('opens closed, and offers Edit rather than Save', () => {
      paint();
      expect(mockEditor.setEditable).toHaveBeenCalledWith(false);
      expect(mockEditor.setEditable).not.toHaveBeenCalledWith(true);
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });

    it('becomes editable when you press Edit and replaces the Save button with quiet autosave state', () => {
      paint();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(mockEditor.setEditable).toHaveBeenCalledWith(true);
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('Editing');
    });

    it('also opens on a click in the note, because that is what a reader reaches for', () => {
      paint();
      fireEvent.click(document.querySelector('.think-notebook-editor__body'));
      expect(mockEditor.setEditable).toHaveBeenCalledWith(true);
    });

    it('autosaves after the document changes without interrupting writing', async () => {
      const onSave = jest.fn(async payload => payload);
      render(
        <NotebookEditor
          entry={{ _id: 'note-1', title: 'Playing to Win', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
          saving={false}
          error=""
          onSave={onSave}
          onDelete={jest.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      const updateRegistration = [...mockEditor.on.mock.calls].reverse().find(([eventName]) => eventName === 'update');
      expect(updateRegistration).toBeTruthy();
      act(() => updateRegistration[1]());
      expect(screen.getByRole('status')).toHaveTextContent('Editing');
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1', title: 'Playing to Win' }));
      }, { timeout: 1800 });
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
    });

    it('keeps rails visible on focus and fades them only after typing', () => {
      paint();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      const focusRegistration = mockEditor.on.mock.calls.find(([eventName]) => eventName === 'focus');
      if (focusRegistration) {
        act(() => focusRegistration[1]());
      }
      expect(document.body.classList.contains('think-writing-active')).toBe(false);

      const updateRegistrations = writingUpdates();
      expect(updateRegistrations.length).toBeGreaterThan(0);
      act(() => {
        updateRegistrations.forEach(([, handler]) => handler({ transaction: { docChanged: true } }));
      });
      expect(document.body.classList.contains('think-writing-active')).toBe(true);
    });

    it('does not retreat rails for a selection-only update', () => {
      paint();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      act(() => {
        writingUpdates().forEach(([, handler]) => handler({ transaction: { docChanged: false } }));
      });
      expect(document.body.classList.contains('think-writing-active')).toBe(false);
    });

    it('restores rails after typing goes idle', () => {
      jest.useFakeTimers();
      try {
        paint();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        act(() => {
          writingUpdates().forEach(([, handler]) => handler({ transaction: { docChanged: true } }));
        });
        expect(document.body.classList.contains('think-writing-active')).toBe(true);
        act(() => {
          jest.advanceTimersByTime(THINK_WRITING_IDLE_MS);
        });
        expect(document.body.classList.contains('think-writing-active')).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
