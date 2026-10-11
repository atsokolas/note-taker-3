import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiPageEditor from './WikiPageEditor';
import { applyWikiAutolink, deleteWikiPage, getWikiPage, listWikiAutolinks, maintainWikiPage, updateWikiPage } from '../../api/wiki';

const mockUseEditor = jest.fn();
const mockEditor = {
  commands: {
    insertContent: jest.fn(),
    insertPullquote: jest.fn(),
    setContent: jest.fn()
  },
  chain: jest.fn(() => ({
    focus: jest.fn(function focus() { return this; }),
    insertPullquote: jest.fn(function insertPullquote() { return this; }),
    run: jest.fn()
  })),
  getJSON: jest.fn(() => ({ type: 'doc', content: [{ type: 'paragraph' }] })),
  on: jest.fn(),
  off: jest.fn(),
  state: {
    selection: { from: 0, to: 0, empty: true },
    doc: { textBetween: jest.fn(() => '') }
  }
};

jest.mock('@tiptap/react', () => ({
  EditorContent: ({ editor }) => (
    <div data-testid="wiki-editor-content">
      {editor?.renderTestContent || (editor ? 'ready' : 'missing')}
    </div>
  ),
  useEditor: (...args) => mockUseEditor(...args)
}));

jest.mock('@tiptap/starter-kit', () => ({}));

jest.mock('@tiptap/extension-placeholder', () => ({
  configure: () => ({})
}));

jest.mock('../../api/wiki', () => ({
  applyWikiAutolink: jest.fn(),
  deleteWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
  listWikiAutolinks: jest.fn(),
  maintainWikiPage: jest.fn(),
  updateWikiPage: jest.fn()
}));

const page = {
  _id: 'wiki-1',
  title: 'Enterprise AI Memory',
  pageType: 'topic',
  status: 'draft',
  visibility: 'private',
  sourceScope: 'entire_library',
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  sourceRefs: [
    { _id: 'source-1', type: 'article', objectId: 'article-1', title: 'Memory article', snippet: 'Source snippet' }
  ],
  aiState: {
    draftStatus: 'idle',
    maintenanceSummary: '',
    health: {
      newItems: [],
      unsupportedClaims: [],
      missingCitations: [],
      staleSections: [],
      contradictions: [],
      relatedPages: []
    },
    suggestions: [
      { id: 'suggestion-1', type: 'edit', title: 'Evidence section', text: 'Rewrote the evidence section.' }
    ]
  }
};

describe('WikiPageEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditor.chain.mockImplementation(() => ({
      focus: jest.fn(function focus() { return this; }),
      insertPullquote: jest.fn(function insertPullquote() { return this; }),
      run: jest.fn()
    }));
    mockEditor.renderTestContent = null;
    mockEditor.on.mockReset();
    mockEditor.off.mockReset();
    mockEditor.state = {
      selection: { from: 0, to: 0, empty: true },
      doc: { textBetween: jest.fn(() => '') }
    };
    mockUseEditor.mockReturnValue(mockEditor);
    getWikiPage.mockResolvedValue(page);
    listWikiAutolinks.mockResolvedValue({ suggestions: [], scanned: 0 });
    applyWikiAutolink.mockResolvedValue({
      ...page,
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Compounding interest',
            marks: [{ type: 'wikiLink', attrs: { pageId: 'wiki-related', title: 'Compounding interest' } }]
          }]
        }]
      }
    });
    updateWikiPage.mockResolvedValue(page);
    deleteWikiPage.mockResolvedValue({ ...page, status: 'archived' });
    maintainWikiPage.mockResolvedValue({
      ...page,
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Maintained page body.' }] }] },
      aiState: {
        ...page.aiState,
        draftStatus: 'ready',
        maintenanceSummary: 'Rebuilt from 3 relevant sources.',
        health: {
          ...page.aiState.health,
          newItems: [{ text: 'New article affects this page.', sourceTitle: 'Memory article' }]
        }
      }
    });
  });

  it('renders rich text editor and default metadata controls', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    expect(await screen.findByDisplayValue('Enterprise AI Memory')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-editor-content')).toHaveTextContent('ready');
    expect(screen.getByLabelText('Wiki page metadata')).toBeInTheDocument();
    expect(screen.getByDisplayValue('private')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Entire library')).toBeInTheDocument();
  });

  it('registers and exposes pullquote insertion in the wiki editor', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    const editorOptions = mockUseEditor.mock.calls[0][0];
    const extensionNames = editorOptions.extensions.map(extension => extension?.name).filter(Boolean);

    expect(extensionNames).toContain('pullquote');
    fireEvent.click(screen.getByRole('button', { name: 'Pullquote' }));
    const chain = mockEditor.chain.mock.results[0].value;
    expect(chain.focus).toHaveBeenCalled();
    expect(chain.insertPullquote).toHaveBeenCalledWith('');
    expect(chain.run).toHaveBeenCalled();
  });

  it('exits edit mode from the Done editing button or Escape key when a read shell owns mode', async () => {
    const onDoneEditing = jest.fn();
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" onDoneEditing={onDoneEditing} />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    expect(onDoneEditing).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDoneEditing).toHaveBeenCalledTimes(2);
  });

  it('saves metadata changes', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.change(screen.getByDisplayValue('private'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(updateWikiPage).toHaveBeenCalledWith('wiki-1', { visibility: 'shared' });
    });
  });

  it('does not expose page-level ambient maintenance presence in edit mode', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    expect(screen.queryByRole('status', { name: 'Thought partner status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maintain page' })).not.toBeInTheDocument();
  });

  it('runs linkify across current autolink suggestions from edit mode', async () => {
    listWikiAutolinks.mockResolvedValueOnce({
      scanned: 4,
      suggestions: [
        { pageId: 'wiki-a', title: 'First concept', mentionCount: 1 },
        { pageId: 'wiki-b', title: 'Second concept', mentionCount: 1 }
      ]
    });
    applyWikiAutolink
      .mockResolvedValueOnce({
        ...page,
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First concept' }] }] }
      })
      .mockResolvedValueOnce({
        ...page,
        body: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'Second concept',
              marks: [{ type: 'wikiLink', attrs: { pageId: 'wiki-b', title: 'Second concept' } }]
            }]
          }]
        }
      });

    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.click(screen.getByRole('button', { name: 'Linkify' }));

    await waitFor(() => {
      expect(applyWikiAutolink).toHaveBeenCalledWith('wiki-1', 'wiki-a');
      expect(applyWikiAutolink).toHaveBeenCalledWith('wiki-1', 'wiki-b');
      expect(mockEditor.commands.setContent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' }),
        false
      );
    });
  });

  it('keeps the editor to the page itself', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" onDoneEditing={jest.fn()} />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    expect(screen.queryByRole('status', { name: 'Thought partner status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maintain page' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ask this page')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wiki partner and sources')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show partner/sources' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Wiki' })).not.toBeInTheDocument();
    expect(screen.getByText('Editing page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done editing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Linkify' })).toBeInTheDocument();
  });

  it('resolves claim popover sources from the persisted claim ledger before citation indexes', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      sourceRefs: [
        { _id: 'source-old', type: 'article', title: 'Old source', snippet: 'Stale index source' },
        {
          _id: 'source-ledger',
          type: 'highlight',
          objectId: 'highlight-ledger',
          parentObjectId: 'article-ledger',
          title: 'Ledger source',
          snippet: 'Stable ledger source',
          url: 'https://example.com/ledger'
        },
        {
          _id: 'source-conflict',
          type: 'article',
          objectId: 'article-conflict',
          title: 'Counter source',
          snippet: 'Contradicting ledger source',
          url: 'https://example.com/conflict'
        }
      ],
      citations: [
        { _id: 'citation-ledger', sourceRefId: 'source-ledger', sourceTitle: 'Ledger source' },
        { _id: 'citation-conflict', sourceRefId: 'source-conflict', sourceTitle: 'Counter source' }
      ],
      claims: [{
        claimId: 'claim-ledger',
        text: 'Ledger backed claim.',
        section: 'Evidence',
        support: 'conflicted',
        citationIds: ['citation-ledger'],
        sourceRefIds: ['source-ledger'],
        contradictedByCitationIds: ['citation-conflict'],
        confidence: 0.84,
        lastVerifiedAt: '2026-05-09T12:00:00.000Z',
        createdAt: '2026-01-15T12:00:00.000Z',
        history: [{ at: '2026-01-15T12:00:00.000Z', event: 'created' }, { event: 'updated' }]
      }]
    });
    mockEditor.renderTestContent = (
      <button
        type="button"
        className="wiki-claim-citation"
        data-claim-id="claim-ledger"
        data-support="supported"
        data-citation-indexes="1"
        data-testid="ledger-citation-number"
      >
        [1]
      </button>
    );

    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.mouseOver(screen.getByTestId('ledger-citation-number'));

    const popover = await screen.findByRole('dialog', { name: 'Claim citations' });
    expect(within(popover).getByText('84% confidence')).toBeInTheDocument();
    expect(within(popover).getByText('Evidence')).toBeInTheDocument();
    expect(within(popover).getByText('2 events')).toBeInTheDocument();
    expect(within(popover).getByText('Born')).toBeInTheDocument();
    expect(within(popover).queryByText('Unknown')).not.toBeInTheDocument();
    const supportGroup = within(popover).getByRole('heading', { name: 'Supporting sources' }).closest('section');
    const contradictionGroup = within(popover).getByRole('heading', { name: 'Contradicting sources' }).closest('section');
    expect(within(supportGroup).getByText('Ledger source')).toBeInTheDocument();
    expect(within(contradictionGroup).getByText('Counter source')).toBeInTheDocument();
    expect(within(supportGroup).queryByText('Counter source')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Old source')).not.toBeInTheDocument();
    expect(within(supportGroup).getByRole('link', { name: 'Open in Library →' })).toHaveAttribute(
      'href',
      '/library?articleId=article-ledger&highlightId=highlight-ledger'
    );
    expect(within(contradictionGroup).getByRole('link', { name: 'Open in Library →' }))
      .toHaveAttribute('href', '/library?articleId=article-conflict');
  });

  it('uses inline contradiction indexes as the fallback when no claim ledger exists', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      sourceRefs: [
        { _id: 'source-support', type: 'article', title: 'Supporting inline source', snippet: 'Inline support' },
        { _id: 'source-conflict', type: 'article', title: 'Contradicting inline source', snippet: 'Inline contradiction' }
      ],
      claims: []
    });
    mockEditor.renderTestContent = (
      <button
        type="button"
        className="wiki-claim-citation"
        data-claim-id="draft-claim"
        data-support="conflicted"
        data-citation-indexes="1"
        data-contradiction-indexes="2"
        data-testid="draft-citation-number"
      >
        [1]
      </button>
    );

    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.mouseOver(screen.getByTestId('draft-citation-number'));

    const popover = await screen.findByRole('dialog', { name: 'Claim citations' });
    const supportGroup = within(popover).getByRole('heading', { name: 'Supporting sources' }).closest('section');
    const contradictionGroup = within(popover).getByRole('heading', { name: 'Contradicting sources' }).closest('section');
    expect(within(supportGroup).getByText('Supporting inline source')).toBeInTheDocument();
    expect(within(contradictionGroup).getByText('Contradicting inline source')).toBeInTheDocument();
  });

  it('deletes the current Wiki page after confirmation', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Wiki' }));

    await waitFor(() => {
      expect(deleteWikiPage).toHaveBeenCalledWith('wiki-1');
    });
    expect(confirmSpy).toHaveBeenCalledWith('Delete "Enterprise AI Memory"?');
    confirmSpy.mockRestore();
  });

  it('previews the first sentence in the title field without writing it', async () => {
    getWikiPage.mockResolvedValue({
      ...page,
      title: '',
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'Memory compounds with review. A second sentence stays.' }]
        }]
      }
    });
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );
    const titleField = await screen.findByLabelText('Wiki page title');
    expect(titleField).toHaveValue('');
    expect(titleField).toHaveAttribute('placeholder', 'Memory compounds with review.');
    expect(updateWikiPage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Make this the title' })).not.toBeInTheDocument();
  });

  it('names the page from the selected wording without rewriting the body', async () => {
    mockEditor.state = {
      selection: { from: 0, to: 28, empty: false },
      doc: { textBetween: jest.fn(() => 'Memory compounds with review.') }
    };
    updateWikiPage.mockResolvedValue({ ...page, title: 'Memory compounds with review.' });
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );
    await screen.findByLabelText('Wiki page title');
    fireEvent.click(screen.getByRole('button', { name: 'Make this the title' }));
    expect(screen.getByLabelText('Wiki page title')).toHaveValue('Memory compounds with review.');
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith('wiki-1', {
      title: 'Memory compounds with review.'
    }), { timeout: 2000 });
    expect(updateWikiPage).not.toHaveBeenCalledWith('wiki-1', expect.objectContaining({
      body: expect.anything()
    }));
  });

  it('keeps a pending body edit when the selected wording becomes the title', async () => {
    mockEditor.state = {
      selection: { from: 0, to: 28, empty: false },
      doc: { textBetween: jest.fn(() => 'Memory compounds with review.') }
    };
    const nextBody = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Memory compounds with review. A second sentence stays.' }]
      }]
    };
    updateWikiPage.mockResolvedValue({
      ...page,
      title: 'Memory compounds with review.',
      body: nextBody
    });
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );
    await screen.findByLabelText('Wiki page title');
    const editorOptions = mockUseEditor.mock.calls[0][0];
    act(() => {
      editorOptions.onUpdate({ editor: { getJSON: () => nextBody } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Make this the title' }));
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith('wiki-1', {
      body: nextBody,
      title: 'Memory compounds with review.'
    }), { timeout: 2000 });
  });
});
