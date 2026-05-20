import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiPageEditor from './WikiPageEditor';
import { addWikiSource, applyWikiAutolink, deleteWikiPage, getWikiAutolinkSuggestions, getWikiBacklinks, getWikiPage, listWikiAutolinks, listWikiConnectorActions, listWikiRevisions, maintainWikiPage, promoteWikiDiscussion, rebuildWikiPageGraph, removeWikiSource, reviewWikiFreshness, updateWikiPage } from '../../api/wiki';
import { fetchGraphData } from '../../api/map';

const mockUseEditor = jest.fn();
const mockEditor = {
  commands: {
    insertContent: jest.fn(),
    setContent: jest.fn()
  },
  getJSON: jest.fn(() => ({ type: 'doc', content: [{ type: 'paragraph' }] }))
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
  addWikiSource: jest.fn(),
  applyWikiAutolink: jest.fn(),
  askWikiPage: jest.fn(),
  deleteWikiPage: jest.fn(),
  getWikiBacklinks: jest.fn(),
  // WikiAutolinkSuggestions in the right rail calls this on mount; stub
  // it so existing editor tests don't crash on (undefined).then().
  getWikiAutolinkSuggestions: jest.fn(() => Promise.reject(new Error('not relevant in WikiPageEditor tests'))),
  getWikiPage: jest.fn(),
  listWikiAutolinks: jest.fn(),
  listWikiConnectorActions: jest.fn(),
  listWikiRevisions: jest.fn(),
  maintainWikiPage: jest.fn(),
  promoteWikiDiscussion: jest.fn(),
  rebuildWikiPageGraph: jest.fn(),
  removeWikiDiscussion: jest.fn(),
  removeWikiSource: jest.fn(),
  reviewWikiFreshness: jest.fn(),
  updateWikiPage: jest.fn()
}));

jest.mock('../../api/map', () => ({
  fetchGraphData: jest.fn()
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
    mockEditor.renderTestContent = null;
    mockUseEditor.mockReturnValue(mockEditor);
    getWikiPage.mockResolvedValue(page);
    getWikiBacklinks.mockResolvedValue({ count: 0, backlinks: [] });
    getWikiAutolinkSuggestions.mockResolvedValue({ suggestions: [], scanned: 0 });
    listWikiAutolinks.mockResolvedValue({ suggestions: [], scanned: 0 });
    listWikiConnectorActions.mockResolvedValue([]);
    listWikiRevisions.mockResolvedValue([]);
    fetchGraphData.mockResolvedValue({ nodes: [], edges: [], page: { hasMore: false } });
    rebuildWikiPageGraph.mockResolvedValue({ edgesCreated: 0, edgesDeleted: 0 });
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
    reviewWikiFreshness.mockResolvedValue(page);
    updateWikiPage.mockResolvedValue(page);
    addWikiSource.mockResolvedValue(page);
    deleteWikiPage.mockResolvedValue({ ...page, status: 'archived' });
    removeWikiSource.mockResolvedValue({ ...page, sourceRefs: [] });
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

  it('shows wiki autolink opportunities in the activity rail', async () => {
    listWikiAutolinks.mockResolvedValueOnce({
      scanned: 4,
      suggestions: [
        {
          pageId: 'wiki-related',
          title: 'Compounding interest',
          snippet: 'This page mentions Compounding interest as a related topic.',
          mentionCount: 2
        }
      ]
    });

    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    expect(await screen.findByText('Link opportunities')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compounding interest' })).toHaveAttribute('href', '/wiki/workspace?page=wiki-related');
    expect(screen.getByText('2 mentions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply link' }));
    await waitFor(() => {
      expect(applyWikiAutolink).toHaveBeenCalledWith('wiki-1', 'wiki-related');
      expect(mockEditor.commands.setContent).toHaveBeenCalledWith(expect.objectContaining({ type: 'doc' }), false);
    });
  });

  it('renders relationship graph health and refreshes persisted graph edges', async () => {
    fetchGraphData.mockResolvedValueOnce({
      nodes: [
        { id: 'wiki_page:wiki-1', itemType: 'wiki_page', title: 'Enterprise AI Memory' },
        { id: 'wiki_claim:wiki-1:claim-1', itemType: 'wiki_claim', title: 'Claim', snippet: 'Memory needs explicit source trails.' },
        { id: 'article:article-1', itemType: 'article', title: 'Memory article' },
        { id: 'wiki_page:wiki-related', itemType: 'wiki_page', title: 'Compounding interest', openPath: '/wiki/wiki-related' }
      ],
      edges: [
        { id: 'edge-1', source: 'wiki_page:wiki-1', target: 'wiki_claim:wiki-1:claim-1', relationType: 'contains' },
        { id: 'edge-2', source: 'article:article-1', target: 'wiki_claim:wiki-1:claim-1', relationType: 'supports' },
        { id: 'edge-3', source: 'wiki_page:wiki-1', target: 'wiki_page:wiki-related', relationType: 'related' }
      ]
    }).mockResolvedValueOnce({
      nodes: [
        { id: 'wiki_page:wiki-1', itemType: 'wiki_page', title: 'Enterprise AI Memory' },
        { id: 'wiki_claim:wiki-1:claim-1', itemType: 'wiki_claim', title: 'Claim', snippet: 'Memory needs explicit source trails.' },
        { id: 'article:article-1', itemType: 'article', title: 'Memory article' }
      ],
      edges: [
        { id: 'edge-1', source: 'wiki_page:wiki-1', target: 'wiki_claim:wiki-1:claim-1', relationType: 'contains' },
        { id: 'edge-2', source: 'article:article-1', target: 'wiki_claim:wiki-1:claim-1', relationType: 'supports' }
      ]
    });

    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    expect(await screen.findByText('Relationship graph')).toBeInTheDocument();
    expect(await screen.findByText('Memory needs explicit source trails.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compounding interest' })).toHaveAttribute('href', '/wiki/wiki-related');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(rebuildWikiPageGraph).toHaveBeenCalledWith('wiki-1');
      expect(fetchGraphData).toHaveBeenCalledTimes(2);
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
    expect(screen.queryByRole('status', { name: 'Agent status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maintain page' })).not.toBeInTheDocument();
  });

  it('runs linkify across current autolink suggestions from edit mode', async () => {
    listWikiAutolinks.mockResolvedValueOnce({ scanned: 4, suggestions: [] });
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

  it('hides the fallback linkable-pages rail when inline wiki links already exist', async () => {
    getWikiPage.mockResolvedValueOnce({
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

    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    expect(screen.queryByTestId('wiki-autolinks')).not.toBeInTheDocument();
  });

  it('adds and removes sources while showing applied updates', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    expect(screen.getAllByText('Rewrote the evidence section.').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Source title'), { target: { value: 'New source' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach source' }));

    await waitFor(() => {
      expect(addWikiSource).toHaveBeenCalledWith('wiki-1', expect.objectContaining({ title: 'New source' }));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(removeWikiSource).toHaveBeenCalledWith('wiki-1', 'source-1');
    });
  });

  it('hides per-page operation surfaces when mounted inside the workspace', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" workspaceMode onDoneEditing={jest.fn()} />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    expect(screen.queryByRole('status', { name: 'Agent status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maintain page' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ask this page')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wiki AI and sources')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show AI/Sources' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach source' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done editing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Linkify' })).toBeInTheDocument();
  });

  it('focuses the matching source only when a claim citation number is clicked', async () => {
    mockEditor.renderTestContent = (
      <>
        <span
          className="wiki-claim"
          data-claim-id="claim-1"
          data-support="supported"
          data-citation-indexes="1"
          data-testid="inline-citation-claim"
        >
          Source-backed sentence.
        </span>
        <button
          type="button"
          className="wiki-claim-citation"
          data-citation-indexes="1"
          data-testid="inline-citation-number"
        >
          [1]
        </button>
      </>
    );

    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    const sourceCard = screen.getByTestId('wiki-source-ref-1');
    fireEvent.click(screen.getByTestId('inline-citation-claim'));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(sourceCard).not.toHaveFocus();

    fireEvent.click(screen.getByTestId('inline-citation-number'));

    await waitFor(() => {
      expect(sourceCard).toHaveFocus();
    });
  });

  it('resolves claim popover sources from the persisted claim ledger before citation indexes', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      sourceRefs: [
        { _id: 'source-old', type: 'article', title: 'Old source', snippet: 'Stale index source' },
        { _id: 'source-ledger', type: 'article', title: 'Ledger source', snippet: 'Stable ledger source' },
        { _id: 'source-conflict', type: 'article', title: 'Counter source', snippet: 'Contradicting ledger source' }
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
        history: [{ event: 'created' }, { event: 'updated' }]
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
    const supportGroup = within(popover).getByRole('heading', { name: 'Supporting sources' }).closest('section');
    const contradictionGroup = within(popover).getByRole('heading', { name: 'Contradicting sources' }).closest('section');
    expect(within(supportGroup).getByText('Ledger source')).toBeInTheDocument();
    expect(within(contradictionGroup).getByText('Counter source')).toBeInTheDocument();
    expect(within(supportGroup).queryByText('Counter source')).not.toBeInTheDocument();
    expect(within(popover).queryByText('Old source')).not.toBeInTheDocument();
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

  it('uses ledger source ids for source-panel focus when citation indexes are stale', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      sourceRefs: [
        { _id: 'source-old', type: 'article', title: 'Old source', snippet: 'Stale index source' },
        { _id: 'source-ledger', type: 'article', title: 'Ledger source', snippet: 'Stable ledger source' }
      ],
      claims: [{
        claimId: 'claim-ledger',
        text: 'Ledger backed claim.',
        support: 'supported',
        sourceRefIds: ['source-ledger']
      }]
    });
    mockEditor.renderTestContent = (
      <button
        type="button"
        className="wiki-claim-citation"
        data-claim-id="claim-ledger"
        data-support="supported"
        data-citation-indexes="1"
        data-testid="ledger-focus-number"
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
    fireEvent.click(screen.getByTestId('ledger-focus-number'));

    await waitFor(() => {
      expect(screen.getByText('Ledger source').closest('[data-testid="wiki-source-ref-2"]')).toHaveFocus();
    });
  });

  it('links highlight sources back to the original article and highlight', async () => {
    getWikiPage.mockResolvedValueOnce({
      ...page,
      sourceRefs: [
        {
          _id: 'source-highlight-1',
          type: 'highlight',
          objectId: 'highlight-1',
          parentObjectId: 'article-1',
          title: 'Memory article highlight',
          snippet: 'A key highlighted passage.'
        }
      ]
    });

    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/library?articleId=article-1&highlightId=highlight-1'
    );
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
});
