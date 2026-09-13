import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotebookEditor from './NotebookEditor';
import { listWikiPages } from '../../../api/wiki';
import { getArticleEvergreen } from '../../../api/articles';
import { disposeNotebookSourceCorrection, exportNotebookMarkdown, getNotebookShare, getNotebookSummaries } from '../../../api/notebook';
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

jest.mock('../../../api/notebook', () => ({
  getNotebookSummaries: jest.fn(async () => []),
  getNotebookEntry: jest.fn(),
  createNotebookEntry: jest.fn(),
  updateNotebookEntry: jest.fn(),
  exportNotebookMarkdown: jest.fn(),
  disposeNotebookSourceCorrection: jest.fn(),
  getNotebookShare: jest.fn(async () => ({ shared: false, preview: null }))
}));

jest.mock('../../../api/wiki', () => ({
  listWikiPages: jest.fn(async () => [])
}));

jest.mock('../../../api/articles', () => ({
  getArticleEvergreen: jest.fn(),
  setArticleEvergreen: jest.fn()
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
  const beginEditingEssay = () => {
    fireEvent.click(screen.getByTestId('editor-content'));
    fireEvent.focus(document.querySelector('.think-notebook-editor__body'));
  };

  const openArrangement = (name = /Arrange this passage/) => {
    beginEditingEssay();
    fireEvent.click(screen.getByRole('button', { name }));
  };

  beforeEach(() => {
    listWikiPages.mockResolvedValue([]);
    // Keep this component suite at the rendering boundary. The hook has its
    // own async contract tests, and a pending read avoids post-assertion state.
    getArticleEvergreen.mockReturnValue(new Promise(() => {}));
    getNotebookSummaries.mockReturnValue(new Promise(() => {}));
    exportNotebookMarkdown.mockReset();
    exportNotebookMarkdown.mockResolvedValue(new Blob(['# Letter\n'], { type: 'text/markdown' }));
    getNotebookShare.mockReset();
    getNotebookShare.mockResolvedValue({ shared: false, preview: null });
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
    mockChain.deleteRange.mockReturnValue(mockChain);
    mockChain.insertContent.mockReturnValue(mockChain);
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
    document.body.classList.remove('think-rails-away');
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
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    expect(screen.queryByText('Arrangement')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Paragraph' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Heading' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Evidence block' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Concept block' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Question block' })).not.toBeInTheDocument();
  });

  it('registers blockId on code blocks so TipTap keeps the id', () => {
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
    const { extensions } = mockUseEditor.mock.calls[0][0];
    const blockIdExt = extensions.find((ext) => ext.name === 'blockId');
    const groups = blockIdExt.config.addGlobalAttributes();
    expect(groups.some((group) => group.types.includes('codeBlock'))).toBe(true);
  });

  it('does not rewrite the document when a code block already has a stable id', async () => {
    const onSave = jest.fn(async (payload) => payload);
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: { language: 'js', blockId: 'code-1' },
        content: [{ type: 'text', text: 'const a = 1;' }]
      }]
    });
    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Letter', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={onSave}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );
    mockEditor.commands.setContent.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const updateRegistration = [...mockEditor.on.mock.calls].reverse().find(([eventName]) => eventName === 'update');
    act(() => updateRegistration[1]());
    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 1800 });
    expect(mockEditor.commands.setContent).not.toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].blocks[0]).toMatchObject({
      id: 'code-1',
      type: 'code',
      text: 'const a = 1;',
      sourcePath: 'js'
    });
  });

  it('autosaves ordinary typing next to a source quotation without a failing articleId', async () => {
    const onSave = jest.fn(async (payload) => payload);
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'rule' },
          content: [{ type: 'text', text: 'Recoverable mistakes belong to the person who can still put things back.' }]
        },
        {
          type: 'blockquote',
          attrs: {
            blockId: 'quote-1',
            articleId: 'article-1',
            articleTitle: 'A beautiful source',
            sourcePath: '/library?articleId=article-1#passage=exact'
          },
          content: [{
            type: 'paragraph',
            attrs: { blockId: 'quote-1-p' },
            content: [{ type: 'text', text: 'The cost is borne by people who did not volunteer.' }]
          }]
        }
      ]
    });
    render(
      <NotebookEditor
        entry={{
          _id: 'essay-1',
          title: 'Letter',
          content: '',
          blocks: [],
          type: 'note',
          tags: [],
          linkedArticleId: 'article-1'
        }}
        saving={false}
        error=""
        onSave={onSave}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );
    mockEditor.commands.setContent.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const updateRegistration = [...mockEditor.on.mock.calls].reverse().find(([eventName]) => eventName === 'update');
    act(() => updateRegistration[1]());
    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 1800 });
    expect(mockEditor.commands.setContent).not.toHaveBeenCalled();
    const payload = onSave.mock.calls[0][0];
    expect(payload.blocks.map((block) => block.type)).toEqual(['paragraph', 'quote']);
    expect(payload.blocks[1].articleId).toBeUndefined();
    expect(payload.blocks[1].sourcePath).toBe('/library?articleId=article-1#passage=exact');
    expect(payload.asidePieces).toEqual([]);
    expect(payload.linkedArticleId).toBeNull();
  });

  it('keeps the exact Library passage visible beside a derived notebook page', () => {
    render(
      <NotebookEditor
        entry={{
          _id: 'note-library',
          title: 'A thought from reading',
          content: '<p>Draft</p>',
          blocks: [{
            id: 'block-1',
            type: 'highlight_embed',
            articleId: 'article-1',
            articleTitle: 'A beautiful source',
            highlightId: 'highlight-1',
            text: 'The exact passage'
          }],
          type: 'note',
          tags: []
        }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByText('Ariadne thread · Library')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to A beautiful source' })).toHaveAttribute(
      'href',
      '/library?articleId=article-1&highlightId=highlight-1'
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('hydrates and autosaves a source quote without losing its Library provenance', async () => {
    const onSave = jest.fn(async payload => payload);
    const sourceBlock = {
      id: 'quote-1',
      type: 'quote',
      text: 'The exact selected passage.',
      articleId: 'article-1',
      articleTitle: 'A beautiful source',
      sourcePath: '/library?articleId=article-1#passage=exact'
    };
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [{
        type: 'blockquote',
        attrs: {
          blockId: sourceBlock.id,
          highlightId: null,
          articleId: sourceBlock.articleId,
          articleTitle: sourceBlock.articleTitle,
          sourcePath: sourceBlock.sourcePath
        },
        content: [{
          type: 'paragraph',
          attrs: { blockId: `${sourceBlock.id}-p` },
          content: [{ type: 'text', text: sourceBlock.text }]
        }]
      }]
    });

    render(
      <NotebookEditor
        entry={{
          _id: 'note-source',
          title: 'Source note',
          content: '',
          blocks: [sourceBlock],
          type: 'note',
          tags: [],
          importMeta: {
            sourceType: 'authored_exploration',
            sourceLabel: 'Parenting',
            sourceUrl: '/wiki/read/page-1?claimId=claim-1',
            sourcePath: sourceBlock.sourcePath
          }
        }}
        saving={false}
        error=""
        onSave={onSave}
        onDelete={jest.fn()}
      />
    );

    expect(mockUseEditor.mock.calls[0][0].content.content[0]).toMatchObject({
      type: 'blockquote',
      attrs: {
        blockId: sourceBlock.id,
        articleId: sourceBlock.articleId,
        articleTitle: sourceBlock.articleTitle,
        sourcePath: sourceBlock.sourcePath
      }
    });
    expect(screen.getByRole('link', { name: 'Open A beautiful source' })).toHaveAttribute(
      'href',
      sourceBlock.sourcePath
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const updateRegistration = [...mockEditor.on.mock.calls].reverse().find(([eventName]) => eventName === 'update');
    act(() => updateRegistration[1]());
    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 1800 });
    const saved = onSave.mock.calls[0][0].blocks[0];
    expect(saved).toMatchObject({
      id: sourceBlock.id,
      type: 'quote',
      text: sourceBlock.text,
      articleTitle: sourceBlock.articleTitle,
      sourcePath: sourceBlock.sourcePath
    });
    expect(saved.articleId).toBeUndefined();
  });

  it('hydrates an authored highlight snapshot as saved quote content', () => {
    const sourceBlock = {
      id: 'source-highlight-1',
      type: 'highlight_embed',
      highlightId: 'highlight-1',
      text: 'The passage as it was when kept.',
      articleId: 'article-1',
      articleTitle: 'A beautiful source',
      sourcePath: '/library?articleId=article-1&highlightId=highlight-1'
    };

    render(
      <NotebookEditor
        entry={{ _id: 'note-source', title: 'Source note', content: '', blocks: [sourceBlock], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(mockUseEditor.mock.calls[0][0].content.content[0]).toMatchObject({
      type: 'blockquote',
      attrs: expect.objectContaining({
        blockId: sourceBlock.id,
        highlightId: sourceBlock.highlightId,
        sourcePath: sourceBlock.sourcePath
      }),
      content: [{ type: 'paragraph', content: [{ type: 'text', text: sourceBlock.text }] }]
    });
  });

  it('keeps the Library source from the note with the shared human-only control', async () => {
    const setEvergreen = jest.fn().mockResolvedValue({ evergreen: true });
    render(
      <NotebookEditor
        entry={{
          _id: 'note-library',
          title: 'A thought from reading',
          content: '<p>Draft</p>',
          blocks: [{
            id: 'block-1',
            type: 'highlight_embed',
            articleId: 'article-1',
            articleTitle: 'A beautiful source',
            highlightId: 'highlight-1',
            text: 'The exact passage'
          }],
          type: 'note',
          tags: []
        }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        sourceEvergreen={{ status: 'ready', evergreen: false, setEvergreen }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep source' }));
    await waitFor(() => expect(setEvergreen).toHaveBeenCalledWith(true));
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
    expect(screen.queryByRole('menuitem', { name: /This is a Why/i })).not.toBeInTheDocument();
  });

  it('offers Use this here from /use in the slash menu', async () => {
    mockEditor.state.selection.empty = true;
    mockEditor.state.selection.from = 4;
    mockEditor.state.selection.to = 4;
    mockEditor.state.selection.$from.parent = { textContent: '/use' };
    mockEditor.state.selection.$from.parentOffset = 4;
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

    expect(await screen.findByRole('menuitem', { name: /Use this here/i })).toBeInTheDocument();
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

  it('inserts the recorded distinction wording, not a live note rewrite', async () => {
    getNotebookSummaries.mockResolvedValue([{
      _id: 'note-room',
      title: 'Room to be wrong',
      snippet: 'A mistake that teaches the map, versus one that strands you.',
      importMeta: { sourceType: 'authored_distinction' }
    }]);
    render(
      <NotebookEditor
        entry={{ _id: 'note-2', title: 'Second use', content: '<p>Draft</p>', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert material' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use this here' }));
    expect(mockChain.insertContent).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        type: 'heading',
        content: [{ type: 'text', text: 'Room to be wrong' }]
      }),
      expect.objectContaining({
        type: 'blockquote',
        attrs: expect.objectContaining({
          articleTitle: 'Room to be wrong',
          sourcePath: expect.stringMatching(/entryId=note-room&v=/)
        }),
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'A mistake that teaches the map, versus one that strands you.' }]
        }]
      })
    ]));
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

    openArrangement();
    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));

    expect(mockEditor.commands.setContent).toHaveBeenCalledWith({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] }
      ]
    }, true);
  });

  it('names the hovered passage from the caret, not a stuck first piece', () => {
    const rule = {
      type: 'paragraph',
      attrs: { blockId: 'rule' },
      content: [{ type: 'text', text: 'Recoverable mistakes belong to the person who can still put things back.' }]
    };
    const exception = {
      type: 'paragraph',
      attrs: { blockId: 'exception' },
      content: [{ type: 'text', text: 'The exception is when the downside lands on someone who never chose the experiment.' }]
    };
    mockEditor.getJSON.mockReturnValue({ type: 'doc', content: [rule, exception] });
    mockEditor.state.selection.$from.index.mockReturnValue(0);

    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Letter', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    beginEditingEssay();
    expect(screen.getByRole('button', {
      name: 'Arrange this passage: Recoverable mistakes belong to the person who can still put things back.'
    })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();

    mockEditor.state.selection.$from.index.mockReturnValue(1);
    const selectionHandlers = mockEditor.on.mock.calls
      .filter((call) => call[0] === 'selectionUpdate')
      .map((call) => call[1]);
    expect(selectionHandlers.length).toBeGreaterThan(0);
    act(() => {
      selectionHandlers.forEach((handler) => handler());
    });
    expect(screen.getByRole('button', {
      name: 'Arrange this passage: The exception is when the downside lands on someone who never chose the experiment.'
    })).toBeInTheDocument();
  });

  it('keeps the arrange mark after the essay loses focus, without leaving actions on the prose', () => {
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'rule' },
          content: [{ type: 'text', text: 'Recoverable mistakes belong to the person who can still put things back.' }]
        }
      ]
    });
    mockEditor.state.selection.$from.index.mockReturnValue(0);

    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Letter', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    beginEditingEssay();
    const arrangeMark = screen.getByRole('button', {
      name: 'Arrange this passage: Recoverable mistakes belong to the person who can still put things back.'
    });
    expect(arrangeMark).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();

    const body = document.querySelector('.think-notebook-editor__body');
    fireEvent.blur(body, { relatedTarget: screen.getByPlaceholderText('Title') });
    expect(screen.getByRole('button', {
      name: 'Arrange this passage: Recoverable mistakes belong to the person who can still put things back.'
    })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();

    fireEvent.focus(body);
    fireEvent.blur(body, { relatedTarget: screen.getByRole('button', { name: 'Export' }) });
    expect(screen.getByRole('button', {
      name: 'Arrange this passage: Recoverable mistakes belong to the person who can still put things back.'
    })).toBeInTheDocument();

    fireEvent.focus(body);
    fireEvent.blur(body, { relatedTarget: screen.getByRole('button', { name: 'Structure' }) });
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
  });

  it('moves the exception before the rule, then undoes that move', () => {
    const rule = {
      type: 'paragraph',
      attrs: { blockId: 'rule' },
      content: [{ type: 'text', text: 'Recoverable mistakes belong to the person who can still put things back.' }]
    };
    const exception = {
      type: 'paragraph',
      attrs: { blockId: 'exception' },
      content: [{ type: 'text', text: 'The exception is when the downside lands on someone who never chose the experiment.' }]
    };
    const citation = {
      type: 'blockquote',
      attrs: {
        blockId: 'quote',
        articleId: 'article-1',
        articleTitle: 'A beautiful source',
        sourcePath: '/library?articleId=article-1#passage=exact'
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The cost is borne by people who did not volunteer.' }] }]
    };
    const close = {
      type: 'paragraph',
      attrs: { blockId: 'close' },
      content: [{ type: 'text', text: 'Who gets to experiment, and who pays?' }]
    };
    const original = { type: 'doc', content: [rule, exception, citation, close] };
    mockEditor.getJSON.mockReturnValue(original);
    mockEditor.state.selection.$from.index.mockReturnValue(1);

    render(
      <NotebookEditor
        entry={{
          _id: 'essay-1',
          title: 'Who gets to experiment, and who pays?',
          content: '',
          blocks: [],
          type: 'note',
          tags: []
        }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    openArrangement(/Arrange this passage: The exception/);
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));

    const movedDoc = mockEditor.commands.setContent.mock.calls
      .map((call) => call[0])
      .find((doc) => Array.isArray(doc?.content) && doc.content.length === 4);
    expect(movedDoc.content.map((node) => node.attrs.blockId)).toEqual([
      'exception',
      'quote',
      'rule',
      'close'
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo moving “The exception is when the downside lands on someone who never chose the experiment.”' }));
    expect(mockEditor.commands.setContent).toHaveBeenLastCalledWith(original, true);
  });

  it('sets a passage aside with a named way back', () => {
    const rule = {
      type: 'paragraph',
      attrs: { blockId: 'rule' },
      content: [{ type: 'text', text: 'Recoverable mistakes belong to the person who can still put things back.' }]
    };
    const exception = {
      type: 'paragraph',
      attrs: { blockId: 'exception' },
      content: [{ type: 'text', text: 'The exception is when the downside lands on someone who never chose the experiment.' }]
    };
    mockEditor.getJSON.mockReturnValue({ type: 'doc', content: [rule, exception] });
    mockEditor.state.selection.$from.index.mockReturnValue(1);

    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Letter', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    openArrangement();
    fireEvent.click(screen.getByRole('button', { name: 'Try without this passage' }));
    const asideDoc = mockEditor.commands.setContent.mock.calls
      .map((call) => call[0])
      .find((doc) => Array.isArray(doc?.content) && doc.content.length === 1);
    expect(asideDoc.content.map((node) => node.attrs.blockId)).toEqual(['rule']);
    mockEditor.getJSON.mockReturnValue({ type: 'doc', content: [rule] });
    fireEvent.click(screen.getByRole('button', { name: 'Bring back: The exception is when the downside lands on someone who never chose the experiment.' }));
    expect(mockEditor.commands.setContent.mock.calls.at(-1)[0].content.map((node) => node.attrs.blockId)).toEqual(['rule', 'exception']);
  });

  it('autosaves the set-aside list from the same arrangement, not the previous render', async () => {
    const onSave = jest.fn(async (payload) => payload);
    const rule = {
      type: 'paragraph',
      attrs: { blockId: 'rule' },
      content: [{ type: 'text', text: 'Recoverable mistakes belong to the person who can still put things back.' }]
    };
    const exception = {
      type: 'paragraph',
      attrs: { blockId: 'exception' },
      content: [{ type: 'text', text: 'The exception is when the downside lands on someone who never chose the experiment.' }]
    };
    mockEditor.getJSON.mockReturnValue({ type: 'doc', content: [rule, exception] });
    mockEditor.state.selection.$from.index.mockReturnValue(1);

    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Letter', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={onSave}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    openArrangement();
    fireEvent.click(screen.getByRole('button', { name: 'Try without this passage' }));
    mockEditor.getJSON.mockReturnValue({ type: 'doc', content: [rule] });

    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 1800 });
    const payload = onSave.mock.calls[0][0];
    expect(payload.asidePieces).toHaveLength(1);
    expect(payload.asidePieces[0].nodes[0]).toEqual(exception);
    expect(payload.asidePieces[0].blocks).toBeUndefined();
    expect(payload.blocks.map((block) => block.id)).toEqual(['rule']);
  });

  it('brings a set-aside passage back with its original marks and links', () => {
    const marked = {
      type: 'paragraph',
      attrs: { blockId: 'marked' },
      content: [{
        type: 'text',
        text: 'See this source',
        marks: [
          { type: 'bold' },
          { type: 'link', attrs: { href: 'https://example.com' } }
        ]
      }]
    };
    const closer = {
      type: 'paragraph',
      attrs: { blockId: 'close' },
      content: [{ type: 'text', text: 'Who pays?' }]
    };
    mockEditor.getJSON.mockReturnValue({ type: 'doc', content: [marked, closer] });
    mockEditor.state.selection.$from.index.mockReturnValue(0);

    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Letter', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    openArrangement();
    fireEvent.click(screen.getByRole('button', { name: 'Try without this passage' }));
    mockEditor.getJSON.mockReturnValue({ type: 'doc', content: [closer] });
    fireEvent.click(screen.getByRole('button', { name: 'Bring back: See this source' }));
    expect(mockEditor.commands.setContent.mock.calls.at(-1)[0].content[0]).toEqual(marked);
  });

  it('asks before deleting a passage and does not move it to Set aside', () => {
    const rule = {
      type: 'paragraph',
      attrs: { blockId: 'rule' },
      content: [{ type: 'text', text: 'Recoverable mistakes belong to the person who can still put things back.' }]
    };
    mockEditor.getJSON.mockReturnValue({ type: 'doc', content: [rule] });
    window.confirm = jest.fn(() => true);

    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Letter', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    openArrangement();
    fireEvent.click(screen.getByRole('button', { name: 'Delete this passage' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('will not wait in Set aside'));
    expect(screen.queryByRole('button', { name: /Bring back:/ })).not.toBeInTheDocument();
  });

  it('exports the saved notebook after flushing the draft', async () => {
    const onSave = jest.fn(async (payload) => payload);
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [{
        type: 'blockquote',
        attrs: {
          blockId: 'quote-1',
          articleId: 'article-1',
          articleTitle: 'A beautiful source',
          sourcePath: '/library?articleId=article-1#passage=exact'
        },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The cost is borne by people who did not volunteer.' }] }]
      }]
    });
    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Who gets to experiment, and who pays?', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={onSave}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    const click = jest.fn();
    const originalCreate = document.createElement.bind(document);
    const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      const node = originalCreate(tag);
      if (tag === 'a') node.click = click;
      return node;
    });
    global.URL.createObjectURL = jest.fn(() => 'blob:essay');
    global.URL.revokeObjectURL = jest.fn();
    global.fetch = jest.fn();

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(exportNotebookMarkdown).toHaveBeenCalledWith('essay-1'));
    expect(global.fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(click).toHaveBeenCalled());
    createSpy.mockRestore();
  });

  it('aborts export with a visible failure when the draft cannot be saved', async () => {
    const onSave = jest.fn(async () => {
      throw new Error('save failed');
    });
    mockEditor.getJSON.mockReturnValue({
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { blockId: 'rule' },
        content: [{ type: 'text', text: 'Recoverable mistakes belong to the person who can still put things back.' }]
      }]
    });
    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Who gets to experiment, and who pays?', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={onSave}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(exportNotebookMarkdown).not.toHaveBeenCalled();
    expect(screen.getByText('Could not save this draft, so export did not start.')).toBeInTheDocument();
  });

  it('opens the recipient preview from Share', async () => {
    getNotebookShare.mockResolvedValue({
      shared: false,
      publishable: true,
      preview: {
        title: 'Who gets to experiment, and who pays?',
        ownerDisplayName: 'Athan',
        blocks: [{ id: 'p1', type: 'paragraph', text: 'The exception arrives first.' }]
      },
      currentHash: 'hash'
    });
    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Who gets to experiment, and who pays?', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByTestId('notebook-share-preview')).toBeInTheDocument();
    expect(screen.getByText('The exception arrives first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create share link' })).toBeInTheDocument();
  });

  it('does not open Share when the draft cannot be saved', async () => {
    const onSave = jest.fn(async () => {
      throw new Error('Offline');
    });
    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Who gets to experiment, and who pays?', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={onSave}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.queryByTestId('notebook-share')).not.toBeInTheDocument();
    expect(screen.getByText('Could not save this draft, so sharing did not open.')).toBeInTheDocument();
  });

  it('refreshes share after a save while the panel stays open', async () => {
    const onSave = jest.fn(async (payload) => payload);
    getNotebookShare
      .mockResolvedValueOnce({
        shared: true,
        slug: 'essay-slug',
        stale: false,
        publishable: true,
        snapshot: {
          title: 'Who gets to experiment, and who pays?',
          ownerDisplayName: 'Athan',
          blocks: [{ id: 'p1', type: 'paragraph', text: 'The exception arrives first.' }]
        },
        preview: {
          title: 'Who gets to experiment, and who pays?',
          ownerDisplayName: 'Athan',
          blocks: [{ id: 'p1', type: 'paragraph', text: 'The exception arrives first.' }]
        },
        currentHash: 'hash'
      })
      .mockResolvedValueOnce({
        shared: true,
        slug: 'essay-slug',
        stale: true,
        publishable: true,
        snapshot: {
          title: 'Who gets to experiment, and who pays?',
          ownerDisplayName: 'Athan',
          blocks: [{ id: 'p1', type: 'paragraph', text: 'The exception arrives first.' }]
        },
        preview: {
          title: 'Rewritten in the workshop',
          ownerDisplayName: 'Athan',
          blocks: [{ id: 'p1', type: 'paragraph', text: 'Rewritten in the workshop.' }]
        },
        currentHash: 'hash-2'
      });
    render(
      <NotebookEditor
        entry={{ _id: 'essay-1', title: 'Who gets to experiment, and who pays?', content: '', blocks: [], type: 'note', tags: [] }}
        saving={false}
        error=""
        onSave={onSave}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByTestId('notebook-share-preview')).toBeInTheDocument();
    expect(getNotebookShare).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Rewritten in the workshop' } });
    await waitFor(() => expect(getNotebookShare).toHaveBeenCalledTimes(2), { timeout: 1800 });
    expect(await screen.findByTestId('notebook-update-share')).toBeInTheDocument();
    expect(screen.getByTestId('notebook-share-pending')).toHaveTextContent('Rewritten in the workshop.');
    expect(screen.getByTestId('notebook-share-preview')).not.toHaveTextContent('Rewritten in the workshop.');
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

    it('finishes pending writes in order before a navigation flush resolves', async () => {
      let finishFirst;
      const onSave = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; })).mockResolvedValue({});
      let flush;
      render(<NotebookEditor entry={{_id:'note-1', title:'First words', blocks:[]}} onSave={onSave} onRegisterSave={value => { flush = value; }} />);
      fireEvent.change(screen.getByPlaceholderText('Title'), {target:{value:'First version'}});
      let first;
      await act(async () => { first = flush(); });
      expect(onSave).toHaveBeenCalledTimes(1);
      fireEvent.change(screen.getByPlaceholderText('Title'), {target:{value:'The final version'}});
      let second;
      await act(async () => { second = flush(); });
      expect(onSave).toHaveBeenCalledTimes(1);
      await act(async () => { finishFirst({}); await first; await second; });
      expect(onSave.mock.calls.map(([payload]) => payload.title)).toEqual(['First version','The final version']);
      expect(await second).toBe(true);
    });

    it('keeps words and reports a failed flush so navigation can stay put', async () => {
      let flush;
      render(<NotebookEditor entry={{_id:'note-1',title:'Before',blocks:[]}} onSave={jest.fn().mockRejectedValue(new Error('Offline'))} onRegisterSave={value => {flush=value;}} />);
      fireEvent.change(screen.getByPlaceholderText('Title'), {target:{value:'Keep these words'}});
      let saved;
      await act(async () => { saved = await flush(); });
      expect(saved).toBe(false);
      expect(screen.getByPlaceholderText('Title')).toHaveValue('Keep these words');
    });

    it('finishes edits made during the navigation flush before reporting Saved', async () => {
      let flush;
      let finishSave;
      const onSave = jest.fn()
        .mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }))
        .mockResolvedValue({});
      render(<NotebookEditor entry={{ _id: 'note-1', title: 'Before', blocks: [] }} onSave={onSave} onRegisterSave={value => { flush = value; }} startWriting />);
      fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'First words' } });
      let saving;
      await act(async () => { saving = flush(); });
      fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'The words after that' } });
      expect(screen.getByRole('status')).toHaveTextContent('Editing');
      await act(async () => { finishSave({}); await saving; });
      expect(onSave.mock.calls.map(([payload]) => payload.title)).toEqual(['First words', 'The words after that']);
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
      expect(await saving).toBe(true);
    });

    it('starts a deliberately created note in writing mode without saving on open', () => {
      const onSave = jest.fn();
      render(<NotebookEditor entry={{_id:'new-note',title:'Untitled',blocks:[]}} onSave={onSave} startWriting />);
      expect(mockEditor.setEditable).toHaveBeenCalledWith(true);
      expect(onSave).not.toHaveBeenCalled();
    });

    it('keeps rails visible on focus and fades them only after typing', () => {
      paint();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      const focusRegistration = mockEditor.on.mock.calls.find(([eventName]) => eventName === 'focus');
      if (focusRegistration) {
        act(() => focusRegistration[1]());
      }
      expect(document.body.classList.contains('think-rails-away')).toBe(false);

      const updateRegistrations = writingUpdates();
      expect(updateRegistrations.length).toBeGreaterThan(0);
      act(() => {
        updateRegistrations.forEach(([, handler]) => handler({ transaction: { docChanged: true } }));
      });
      expect(document.body.classList.contains('think-rails-away')).toBe(true);
    });

    it('does not retreat rails for a selection-only update', () => {
      paint();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      act(() => {
        writingUpdates().forEach(([, handler]) => handler({ transaction: { docChanged: false } }));
      });
      expect(document.body.classList.contains('think-rails-away')).toBe(false);
    });

    it('restores rails after typing goes idle', () => {
      jest.useFakeTimers();
      try {
        paint();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        act(() => {
          writingUpdates().forEach(([, handler]) => handler({ transaction: { docChanged: true } }));
        });
        expect(document.body.classList.contains('think-rails-away')).toBe(true);
        act(() => {
          jest.advanceTimersByTime(THINK_WRITING_IDLE_MS);
        });
        expect(document.body.classList.contains('think-rails-away')).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('reviews a source correction on the note without rewriting the page', async () => {
    disposeNotebookSourceCorrection.mockResolvedValue({
      sourceCorrection: {
        eventId: 'evt-1',
        oldQuotation: 'Two hours a week can sustain this.',
        newEvidence: 'Two hours a week cannot sustain this.',
        changedSegments: [
          { kind: 'equal', text: 'Two hours a week ' },
          { kind: 'removed', text: 'can' },
          { kind: 'added', text: 'cannot' },
          { kind: 'equal', text: ' sustain this.' }
        ],
        sourceUpdatedOn: '2026-09-11',
        reviewedOn: '2026-09-12',
        ui: 'settled',
        disposition: 'no_change'
      }
    });
    render(
      <NotebookEditor
        entry={{
          _id: 'note-correction',
          title: 'Who gets to experiment',
          content: '',
          blocks: [],
          type: 'note',
          tags: [],
          sourceCorrection: {
            eventId: 'evt-1',
            oldQuotation: 'Two hours a week can sustain this.',
            newEvidence: 'Two hours a week cannot sustain this.',
            changedSegments: [
              { kind: 'equal', text: 'Two hours a week ' },
              { kind: 'removed', text: 'can' },
              { kind: 'added', text: 'cannot' },
              { kind: 'equal', text: ' sustain this.' }
            ],
            whatChanged: 'The saved passage was corrected.',
            whatItAffects: 'Who gets to experiment',
            sourceUpdatedOn: '2026-09-11',
            ui: 'review'
          }
        }}
        saving={false}
        error=""
        onSave={jest.fn()}
        onDelete={jest.fn()}
        showInlineAgentDock={false}
      />
    );
    expect(screen.getByLabelText('Source correction')).toBeInTheDocument();
    expect(screen.getByText('Two hours a week can sustain this.')).toBeInTheDocument();
    expect(screen.getByText('Two hours a week cannot sustain this.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'No change' }));
    expect(await screen.findByText('No change. The correction does not require this work to move.')).toBeInTheDocument();
    expect(disposeNotebookSourceCorrection).toHaveBeenCalledWith('note-correction', {
      eventId: 'evt-1',
      action: 'no_change'
    });
  });
});
