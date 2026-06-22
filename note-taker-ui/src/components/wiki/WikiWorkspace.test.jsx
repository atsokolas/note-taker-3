import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import WikiWorkspace from './WikiWorkspace';
import { streamChatWithAgent } from '../../api/agent';
import { getArticles } from '../../api/articles';
import { createConnection, getConnectionsForItem, searchConnectableItems } from '../../api/connections';
import { getAllHighlights } from '../../api/highlights';
import {
  acceptWikiLintFinding,
  createLibrarySourceProvenanceFixture,
  createWikiPage,
  fixWikiLintFinding,
  getWikiIngestRun,
  getWikiPage,
  getWikiSchema,
  ignoreWikiLintFinding,
  ingestWikiSource,
  listWikiActivity,
  listWikiPages,
  revertWikiSchema,
  reviewWikiIngestRun,
  saveWikiSchema,
  suggestWikiSchemaUpdates,
  streamLintWiki,
  streamMaintainWikiPage
} from '../../api/wiki';

jest.mock('../../api/agent', () => ({
  streamChatWithAgent: jest.fn()
}));

jest.mock('../../api/articles', () => ({
  getArticles: jest.fn()
}));

jest.mock('../../api/connections', () => ({
  createConnection: jest.fn(),
  getConnectionsForItem: jest.fn(),
  searchConnectableItems: jest.fn()
}));

jest.mock('../../api/highlights', () => ({
  getAllHighlights: jest.fn()
}));

jest.mock('../../api/wiki', () => ({
  createLibrarySourceProvenanceFixture: jest.fn(),
  createWikiPage: jest.fn(),
  acceptWikiLintFinding: jest.fn(),
  fixWikiLintFinding: jest.fn(),
  getWikiIngestRun: jest.fn(),
  getWikiPage: jest.fn(),
  getWikiSchema: jest.fn(),
  ignoreWikiLintFinding: jest.fn(),
  ingestWikiSource: jest.fn(),
  listWikiActivity: jest.fn(),
  listWikiPages: jest.fn(),
  revertWikiSchema: jest.fn(),
  reviewWikiIngestRun: jest.fn(),
  saveWikiSchema: jest.fn(),
  suggestWikiSchemaUpdates: jest.fn(),
  streamLintWiki: jest.fn(),
  streamMaintainWikiPage: jest.fn()
}));

jest.mock('./WikiIndex', () => ({ onOpenPage }) => (
  <div data-testid="wiki-index">
    Graph view
    <button type="button" onClick={() => onOpenPage?.('wiki-1')}>Open Investing</button>
  </div>
));
jest.mock('./WikiList', () => ({ compact }) => <div data-testid="wiki-list">List view {compact ? 'compact' : ''}</div>);
jest.mock('./WikiPageReadView', () => jest.fn(({ pageId, workspaceMode, onEdit, liveUpdate, streamedPage }) => (
  <div data-testid="wiki-read-view">
    Page {pageId} {workspaceMode ? 'workspace' : ''}
    {streamedPage?.title ? <span data-testid="wiki-streamed-page-title">{streamedPage.title}</span> : null}
    {liveUpdate?.anchorId ? <span data-testid="wiki-live-update">{liveUpdate.anchorId}</span> : null}
    <button type="button" onClick={onEdit}>Edit page</button>
  </div>
)));
jest.mock('./WikiPageEditor', () => ({ pageId, onDoneEditing }) => (
  <div data-testid="wiki-page-editor">
    Editing {pageId}
    <button type="button" onClick={onDoneEditing}>Done editing</button>
  </div>
));

const mockNavigate = jest.fn();

const renderWorkspace = (initialEntry = '/wiki/workspace?view=graph') => {
  const parsed = new URL(initialEntry, 'http://localhost');
  jest.spyOn(router, 'useLocation').mockReturnValue({
    pathname: parsed.pathname,
    search: parsed.search,
    hash: '',
    state: null,
    key: 'test'
  });
  jest.spyOn(router, 'useNavigate').mockReturnValue(mockNavigate);
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WikiWorkspace />
    </MemoryRouter>
  );
};

const settleWorkspaceEffects = async () => {
  await act(async () => {});
};

describe('WikiWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    require('./WikiPageReadView').mockImplementation(({ pageId, workspaceMode, onEdit, liveUpdate, streamedPage }) => (
      <div data-testid="wiki-read-view">
        Page {pageId} {workspaceMode ? 'workspace' : ''}
        {streamedPage?.title ? <span data-testid="wiki-streamed-page-title">{streamedPage.title}</span> : null}
        {liveUpdate?.anchorId ? <span data-testid="wiki-live-update">{liveUpdate.anchorId}</span> : null}
        <button type="button" onClick={onEdit}>Edit page</button>
      </div>
    ));
    mockNavigate.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
    streamChatWithAgent.mockImplementation(async (_payload, handlers = {}) => {
      handlers.onDelta?.('Agent reply.');
      const result = { reply: 'Agent reply.', thread: { threadId: 'thread-1' } };
      handlers.onFinal?.(result);
      return result;
    });
    createWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    getArticles.mockResolvedValue([{
      _id: 'article-1',
      title: 'Source memo',
      url: 'https://example.com',
      summary: 'Library source summary.'
    }]);
    getAllHighlights.mockResolvedValue([{
      _id: 'highlight-1',
      text: 'Margin of safety is the central risk-control idea.',
      note: 'Useful for wiki grounding.',
      articleId: 'article-1',
      articleTitle: 'Source memo',
      tags: ['investing', 'risk']
    }]);
    createConnection.mockResolvedValue({ _id: 'connection-1' });
    createLibrarySourceProvenanceFixture.mockResolvedValue({
      fixture: {
        articleTitle: 'Debug Fixture - Library Source Provenance',
        wikiTitle: 'Debug Fixture - Source-Backed Thesis',
        wikiPath: '/wiki/workspace?page=wiki-fixture',
        libraryPath: '/library?articleId=article-fixture&highlightId=highlight-fixture',
        questionPath: '/think?tab=questions&questionId=question-fixture'
      }
    });
    getConnectionsForItem.mockResolvedValue({ outgoing: [], incoming: [] });
    searchConnectableItems.mockResolvedValue([]);
    getWikiPage.mockResolvedValue({ _id: 'wiki-1', title: 'Wiki page' });
    getWikiSchema.mockResolvedValue({
      content: '# Wiki Schema',
      snapshots: [{ id: 'snap-1', createdAt: '2026-05-01T12:00:00.000Z' }]
    });
    ingestWikiSource.mockResolvedValue({
      runId: 'ingest-1',
      status: 'processed',
      summary: 'The agent found 1 wiki page that this source may update.',
      affectedPageIds: ['wiki-1'],
      reviewStatus: 'pending_review',
      sourceRef: { title: 'Example source', url: 'https://example.com/source' },
      candidateUpdates: [{
        id: 'candidate-wiki-1',
        targetType: 'wiki_page',
        pageId: 'wiki-1',
        title: 'Investing',
        reason: 'Source overlaps this wiki page.',
        confidence: 'medium',
        provenance: { sourceEventId: 'ingest-1', sourceTitle: 'Candidate source' }
      }, {
        id: 'candidate-think-1',
        targetType: 'question',
        objectId: 'question-1',
        title: 'What should update?',
        reason: 'Source overlaps this question.',
        confidence: 'low',
        provenance: { sourceEventId: 'ingest-1', sourceTitle: 'Question source' }
      }]
    });
    reviewWikiIngestRun.mockResolvedValue({
      runId: 'ingest-1',
      status: 'processed',
      summary: 'The agent found 1 wiki page that this source may update.',
      affectedPageIds: ['wiki-1'],
      reviewStatus: 'partially_accepted',
      sourceRef: { title: 'Example source', url: 'https://example.com/source' },
      candidateUpdates: [{
        id: 'candidate-wiki-1',
        targetType: 'wiki_page',
        pageId: 'wiki-1',
        title: 'Investing',
        reason: 'Source overlaps this wiki page.',
        confidence: 'medium',
        status: 'accepted',
        provenance: { sourceEventId: 'ingest-1', sourceTitle: 'Candidate source' },
        graphTrace: {
          bidirectional: true,
          source: { type: 'external', id: 'ingest-1' },
          target: { type: 'wiki_page', id: 'wiki-1' }
        }
      }, {
        id: 'candidate-think-1',
        targetType: 'question',
        objectId: 'question-1',
        title: 'What should update?',
        reason: 'Source overlaps this question.',
        confidence: 'low',
        status: 'candidate',
        provenance: { sourceEventId: 'ingest-1', sourceTitle: 'Question source' }
      }]
    });
    listWikiActivity.mockResolvedValue([{ id: 'event-1', title: 'Maintained page', summary: 'Updated one page.', pageId: 'wiki-1' }]);
    listWikiPages.mockResolvedValue([
      { _id: 'wiki-1', title: 'Investing' },
      { _id: 'wiki-2', title: 'Systems Thinking' }
    ]);
    saveWikiSchema.mockResolvedValue({ content: '# Saved', snapshots: [{ id: 'snap-2', createdAt: '2026-05-02T12:00:00.000Z' }] });
    revertWikiSchema.mockResolvedValue({ content: '# Reverted', snapshots: [] });
    suggestWikiSchemaUpdates.mockResolvedValue({
      summary: 'Add overview page guidance.',
      proposedPatch: '+ Prefer overview for promoted notebook pages.'
    });
    streamLintWiki.mockImplementation(async (_options, handlers = {}) => {
      handlers.onEvent?.('wiki-lint', { stage: 'loading_pages', summary: 'Loading wiki pages for lint.' });
      handlers.onEvent?.('wiki-lint', { stage: 'persisting', summary: 'Saving wiki lint run.' });
      return {
        runId: 'lint-1',
        summary: 'Wiki lint found 2 issues: 1 missingLinks, 1 gaps.',
        findings: {
          missingLinks: [{
            id: 'missing-link-1',
            type: 'missing_link',
            status: 'open',
            actionability: 'automatic',
            title: 'Possible wiki link missing',
            summary: 'The page text mentions "Systems Thinking" without linking it.',
            recommendedAction: 'Apply the suggested wiki link to the source page.',
            pageId: 'wiki-1',
            targetPageId: 'wiki-2'
          }],
          gaps: [{
            id: 'gap-1',
            type: 'gap',
            status: 'open',
            actionability: 'review',
            title: 'Evidence coverage is thin',
            summary: '1 weak claim.',
            recommendedAction: 'Attach stronger sources or mark the weak claim as unresolved.',
            pageId: 'wiki-1'
          }]
        }
      };
    });
    acceptWikiLintFinding.mockResolvedValue({ run: { runId: 'lint-1', findings: {} }, status: 'accepted' });
    fixWikiLintFinding.mockResolvedValue({
      run: { runId: 'lint-1', findings: {} },
      status: 'fixed',
      page: { _id: 'wiki-1', title: 'Investing' }
    });
    ignoreWikiLintFinding.mockResolvedValue({ run: { runId: 'lint-1', findings: {} }, status: 'ignored' });
    streamMaintainWikiPage.mockImplementation(async (_pageId, _options, handlers = {}) => {
      handlers.onPage?.({ _id: 'wiki-1', title: 'Maintaining page' }, { stage: 'maintaining' });
      handlers.onPage?.({ _id: 'wiki-1', title: 'Updated page' }, { stage: 'complete' });
      return { _id: 'wiki-1', title: 'Updated page' };
    });
  });

  it('renders the compact wiki list inside the workspace list shell', async () => {
    renderWorkspace('/wiki/workspace?view=list');
    await settleWorkspaceEffects();

    expect(document.querySelector('.wiki-workspace')).toHaveClass('wiki-workspace--list-view');
    expect(await screen.findByTestId('wiki-list')).toHaveTextContent('List view compact');
    expect(screen.getByLabelText('Thought partner chat')).toBeInTheDocument();
    expect(screen.queryByTestId('wiki-read-view')).not.toBeInTheDocument();
  });

  it('renders the graph beside persistent chat by default', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    expect(screen.getByLabelText('Thought partner chat')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Thought partner status')).toHaveTextContent('Agent ready.'));
    expect(screen.queryByLabelText('Thought partner trace')).not.toBeInTheDocument();
    expect(screen.getByTestId('wiki-index')).toBeInTheDocument();
    expect(document.querySelector('.wiki-workspace')).toHaveStyle('--wiki-workspace-chat-width: 260px');
    expect(document.querySelector('.wiki-workspace__right-pane')).toBeInTheDocument();
  });

  it('exposes a QA-only source provenance fixture seeder and routes to the seeded wiki page', async () => {
    renderWorkspace('/wiki/workspace?view=graph&qa=source-fixture');

    fireEvent.click(screen.getByRole('button', { name: /seed source/i }));

    await waitFor(() => expect(createLibrarySourceProvenanceFixture).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-fixture'));
    expect(screen.getByText(/Seeded Debug Fixture - Library Source Provenance/i)).toBeInTheDocument();
  });

  it('routes the QA-only source provenance fixture to Think when question evidence mode is requested', async () => {
    renderWorkspace('/wiki/workspace?view=graph&qa=question-evidence');

    fireEvent.click(screen.getByRole('button', { name: /seed source/i }));

    await waitFor(() => expect(createLibrarySourceProvenanceFixture).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/think?tab=questions&questionId=question-fixture'));
  });

  it('AT-248 — shows first-visit onboarding until dismissed and stores the seen flag', async () => {
    listWikiPages.mockResolvedValueOnce([]);
    renderWorkspace('/wiki/workspace?view=graph');

    expect(await screen.findByRole('heading', { name: /start the wiki with one page or one source/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(window.localStorage.getItem('noeis.wiki.first_visit_seen')).toBe('true');
    expect(screen.queryByRole('heading', { name: /start the wiki with one page or one source/i })).not.toBeInTheDocument();
  });

  it('AT-248 — does not show onboarding for returning wiki workspace users', async () => {
    window.localStorage.setItem('noeis.wiki.first_visit_seen', 'true');

    renderWorkspace('/wiki/workspace?view=graph');
    await settleWorkspaceEffects();

    expect(screen.queryByRole('heading', { name: /start the wiki with one page or one source/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Thought partner chat')).toBeInTheDocument();
  });

  it('AT-250 — does not show first-visit onboarding when the workspace already has pages', async () => {
    renderWorkspace('/wiki/workspace?view=graph');
    await waitFor(() => expect(listWikiPages).toHaveBeenCalledWith({ limit: 1 }));

    expect(screen.queryByRole('heading', { name: /start the wiki with one page or one source/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Thought partner chat')).toBeInTheDocument();
  });

  it('AT-250 — does not show first-visit onboarding on direct wiki page links', async () => {
    listWikiPages.mockClear();

    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    expect(listWikiPages).not.toHaveBeenCalledWith({ limit: 1 });
    expect(screen.queryByRole('heading', { name: /start the wiki with one page or one source/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1');
  });

  it('AT-248 — marks onboarding seen when a first-visit CTA is used', async () => {
    listWikiPages.mockResolvedValueOnce([]);
    renderWorkspace('/wiki/workspace?view=graph');
    await screen.findByRole('heading', { name: /start the wiki with one page or one source/i });

    fireEvent.click(screen.getAllByRole('button', { name: /build page/i }).at(-1));

    expect(window.localStorage.getItem('noeis.wiki.first_visit_seen')).toBe('true');
    await waitFor(() => expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/build '));
  });

  it('AT-248 — drop source CTA opens the source workflow and stores the seen flag', async () => {
    listWikiPages.mockResolvedValueOnce([]);
    renderWorkspace('/wiki/workspace?view=graph');
    await screen.findByRole('heading', { name: /start the wiki with one page or one source/i });

    fireEvent.click(screen.getByRole('button', { name: /drop source/i }));

    expect(window.localStorage.getItem('noeis.wiki.first_visit_seen')).toBe('true');
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?view=sources&pane=chat', { replace: true });
    await waitFor(() => expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/ingest https://'));
  });

  it('opens the general wiki workspace instead of resuming the last page when no page is requested', async () => {
    window.localStorage.setItem('noeis.wiki.workspace.last_page_id', 'wiki-1');

    renderWorkspace('/wiki/workspace');
    await settleWorkspaceEffects();

    expect(screen.getByTestId('wiki-index')).toBeInTheDocument();
    expect(screen.queryByTestId('wiki-read-view')).not.toBeInTheDocument();
  });

  it('opens a wiki page from the general wiki workspace', async () => {
    renderWorkspace('/wiki/workspace');
    await settleWorkspaceEffects();

    expect(screen.getByTestId('wiki-index')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Investing' }));

    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
  });

  it('wraps workspace page navigation in a view transition when supported', async () => {
    const startViewTransition = jest.fn((callback) => {
      callback();
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    });
    document.startViewTransition = startViewTransition;

    try {
      renderWorkspace('/wiki/workspace');
      await settleWorkspaceEffects();

      fireEvent.click(screen.getByRole('button', { name: 'Open Investing' }));

      expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
      expect(startViewTransition).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?page=wiki-1');
    } finally {
      delete document.startViewTransition;
    }
  });

  it('keeps the read view mounted across page-to-page navigation', async () => {
    let mountCount = 0;
    const MockReadView = require('./WikiPageReadView');
    MockReadView.mockImplementation(({ pageId, workspaceMode, onEdit }) => {
      React.useEffect(() => {
        mountCount += 1;
      }, []);
      return (
        <div data-testid="wiki-read-view">
          Page {pageId} {workspaceMode ? 'workspace' : ''}
          <button type="button" onClick={onEdit}>Edit page</button>
        </div>
      );
    });

    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();
    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
    expect(mountCount).toBe(1);

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:wiki-2' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-2 workspace');
    expect(mountCount).toBe(1);
  });

  it('keeps page editing inside the canonical workspace URL state', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
    fireEvent.click(screen.getByRole('button', { name: 'Edit page' }));

    expect(await screen.findByTestId('wiki-page-editor')).toHaveTextContent('Editing wiki-1');
    expect(document.querySelector('.wiki-workspace__page-shell--editing')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?page=wiki-1&mode=edit');

    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?page=wiki-1');
  });

  it('opens the workspace editor directly from an edit-mode URL', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1&mode=edit');
    await settleWorkspaceEffects();

    expect(await screen.findByTestId('wiki-page-editor')).toHaveTextContent('Editing wiki-1');
    expect(screen.queryByTestId('wiki-read-view')).not.toBeInTheDocument();
  });

  it('defers wiki page reference loading until the chat asks for it', async () => {
    renderWorkspace('/wiki/workspace');
    await settleWorkspaceEffects();

    fireEvent.click(screen.getByRole('button', { name: 'Open Investing' }));
    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
    expect(listWikiPages).not.toHaveBeenCalledWith({ limit: 30 });

    fireEvent.focus(screen.getByLabelText('Wiki workspace message'));
    await waitFor(() => expect(listWikiPages).toHaveBeenCalledWith({ limit: 30 }));
  });

  it('keeps the chat composer visible above the message history', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    const composer = document.querySelector('.wiki-workspace-chat__composer');
    const messages = document.querySelector('.wiki-workspace-chat__messages');
    expect(composer).toBeInTheDocument();
    expect(messages).toBeInTheDocument();
    expect(Boolean(composer.compareDocumentPosition(messages) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('keeps the chat pane addressable from the workspace URL on narrow layouts', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1&pane=chat');
    await settleWorkspaceEffects();

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-chat');
    expect(document.querySelector('.wiki-workspace__chat-pane')).not.toHaveClass('wiki-workspace__pane--inactive');
    expect(document.querySelector('.wiki-workspace__right-pane')).toHaveClass('wiki-workspace__pane--inactive');
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Wiki workspace message')).toBeInTheDocument();
  });

  it('keeps the wiki pane and chat pane mutually exclusive on mobile tab changes', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1&pane=chat');
    await settleWorkspaceEffects();

    fireEvent.click(screen.getByRole('tab', { name: 'Wiki' }));

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-wiki');
    expect(document.querySelector('.wiki-workspace__chat-pane')).toHaveClass('wiki-workspace__pane--inactive');
    expect(document.querySelector('.wiki-workspace__right-pane')).not.toHaveClass('wiki-workspace__pane--inactive');
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?page=wiki-1&pane=wiki', { replace: true });

    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-chat');
    expect(document.querySelector('.wiki-workspace__chat-pane')).not.toHaveClass('wiki-workspace__pane--inactive');
    expect(document.querySelector('.wiki-workspace__right-pane')).toHaveClass('wiki-workspace__pane--inactive');
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?page=wiki-1&pane=chat', { replace: true });
  });

  it('keeps a compact agent prompt available while the mobile wiki pane is active', async () => {
    renderWorkspace('/wiki/workspace?view=graph&pane=wiki');
    await settleWorkspaceEffects();

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-wiki');
    expect(document.querySelector('.wiki-workspace__chat-pane')).toHaveClass('wiki-workspace__pane--inactive');
    const quickPrompt = screen.getByRole('form', { name: 'Thought partner quick prompt' });
    expect(within(quickPrompt).getByText('Thought partner')).toBeInTheDocument();
    expect(within(quickPrompt).getByText('Ready')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Thought partner quick message'), {
      target: { value: '/build Research maps' }
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Thought partner quick prompt' }));

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-chat');
    await waitFor(() => expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/build Research maps'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?view=graph&pane=chat', { replace: true });
  });

  it('lets the compact wiki prompt start a build from the active wiki pane', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1&pane=wiki');
    await settleWorkspaceEffects();

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-wiki');
    expect(screen.getByRole('form', { name: 'Thought partner quick prompt' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Build' }));

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-chat');
    await waitFor(() => expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/build '));
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?page=wiki-1&pane=chat', { replace: true });
  });

  it('lets the compact wiki prompt start a page-scoped ask from the active wiki pane', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1&pane=wiki');
    await settleWorkspaceEffects();

    const quickPrompt = screen.getByRole('form', { name: 'Thought partner quick prompt' });
    const askButton = within(quickPrompt).getByRole('button', { name: 'Ask' });

    expect(askButton).toBeEnabled();
    fireEvent.click(askButton);

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-chat');
    await waitFor(() => expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/ask @wiki:wiki-1 '));
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?page=wiki-1&pane=chat', { replace: true });
  });

  it('sends typed compact wiki asks instead of only opening a second composer', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1&pane=wiki');
    await settleWorkspaceEffects();

    const quickPrompt = screen.getByRole('form', { name: 'Thought partner quick prompt' });
    fireEvent.change(within(quickPrompt).getByLabelText('Thought partner quick message'), {
      target: { value: 'How does this connect to Opportunity Cost?' }
    });
    fireEvent.click(within(quickPrompt).getByRole('button', { name: 'Ask' }));

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-chat');
    await waitFor(() => expect(streamChatWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'How does this connect to Opportunity Cost?',
        context: expect.objectContaining({
          pageId: 'wiki-1',
          metadata: expect.objectContaining({ surface: 'wiki_workspace' })
        })
      }),
      expect.any(Object)
    ));
  });

  it('opens the reference picker from the transient workspace pull URL', async () => {
    renderWorkspace('/wiki/workspace?view=graph&pull=1');
    await settleWorkspaceEffects();

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-chat');
    expect(await screen.findByRole('dialog', { name: 'Reference Library or Wiki material' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search references')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?view=graph&pane=chat', { replace: true });
  });

  it('opens selected-page reference pull-in from the transient workspace pull URL', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1&pull=1');
    await settleWorkspaceEffects();

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-chat');
    expect(await screen.findByLabelText('Search references to pull in')).toBeInTheDocument();
    await waitFor(() => expect(listWikiPages).toHaveBeenCalledWith({ limit: 30 }));
    expect(getArticles).toHaveBeenCalledWith({ limit: 30, sort: 'recent' });
    expect(getAllHighlights).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?page=wiki-1&pane=chat', { replace: true });
  });

  it('offers a build-page agent action on every workspace surface', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.click(screen.getByRole('button', { name: 'Build page' }));

    expect(document.querySelector('.wiki-workspace')).toHaveClass('is-mobile-chat');
    await waitFor(() => expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/build '));
    expect(mockNavigate).toHaveBeenLastCalledWith('/wiki/workspace?page=wiki-1&pane=chat', { replace: true });
  });

  it('AT-19 — defers the ambient agent presence until after the workspace first paint', async () => {
    jest.useFakeTimers();
    try {
      renderWorkspace('/wiki/workspace?page=wiki-1');
      await settleWorkspaceEffects();

      expect(screen.getByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
      expect(screen.queryByRole('status', { name: 'Thought partner status' })).not.toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      await settleWorkspaceEffects();

      expect(screen.getByRole('status', { name: 'Thought partner status' })).toHaveTextContent(/ready/i);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the chat composer as the agent status surface for the selected page', async () => {
    getWikiPage.mockResolvedValueOnce({
      _id: 'wiki-1',
      title: 'Investing',
      aiState: {
        draftStatus: 'ready',
        health: {
          newItems: [{ text: 'New source' }],
          unsupportedClaims: [],
          missingCitations: [],
          staleSections: [],
          contradictions: []
        }
      }
    });

    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    const status = await screen.findByRole('status', { name: 'Thought partner status' });
    expect(status).toHaveTextContent('1 review item for Investing.');
    expect(status).toHaveAttribute('data-status', 'ready');
  });

  it('opens a page from the /page chat command', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
  });

  it('runs maintenance only through the chat command', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/draft @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamMaintainWikiPage).toHaveBeenCalledWith('wiki-1', {}, expect.any(Object)));
    expect(await screen.findByText('Finished drafting @wiki:wiki-1.')).toBeInTheDocument();
  });

  it('shows active agent work in the chat composer while drafting', async () => {
    let resolveDraft;
    streamMaintainWikiPage.mockImplementationOnce(() => new Promise(resolve => {
      resolveDraft = () => resolve({ _id: 'wiki-1', title: 'Updated page' });
    }));
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/draft @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const status = await screen.findByRole('status', { name: 'Thought partner status' });
    expect(status).toHaveTextContent('Agent updating Wiki page...');
    expect(status).toHaveAttribute('data-status', 'working');

    await act(async () => { resolveDraft(); });
    expect(await screen.findByText('Finished drafting @wiki:wiki-1.')).toBeInTheDocument();
  });

  it('ingests a pasted URL directly through chat', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'https://example.com/source' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(ingestWikiSource).toHaveBeenCalledWith({ type: 'url', url: 'https://example.com/source' }));
    expect(await screen.findByLabelText('Source ripple result')).toBeInTheDocument();
    expect(screen.getByLabelText('Latest source ripple')).toBeInTheDocument();
    expect(screen.getByLabelText('Candidate update plan')).toHaveTextContent('provenance: Candidate source');
    expect(screen.getByText('Done — Example source landed in Wiki Activity. Review 2 proposed destinations: Investing, What should update?.')).toBeInTheDocument();
    expect(screen.getAllByText('The agent found 1 wiki page that this source may update.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: 'Inspect activity' })[0]).toHaveAttribute('href', '/wiki/activity/ingest-1');
    expect(screen.getByText('Saved Example source to Wiki activity.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Think' })).toHaveAttribute('href', '/think?tab=questions&questionId=question-1');
    expect(screen.getByLabelText('Review ingest plan')).toHaveTextContent('Plan status: pending review');
  });

  it('keeps a visible metabolize receipt while source ingest is running', async () => {
    let resolveIngest;
    ingestWikiSource.mockImplementationOnce(() => new Promise(resolve => {
      resolveIngest = resolve;
    }));

    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/ingest https://example.com/source' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Metabolizing https://example.com/source...')).toBeInTheDocument();
    expect(screen.getByText('Source landed in Wiki: https://example.com/source.')).toBeInTheDocument();
    expect(screen.getByText('Scanning Library, Think, and Wiki for pages or threads this can update.')).toBeInTheDocument();
    expect(screen.getByText('Preparing the source ripple and candidate update plan.')).toBeInTheDocument();

    await act(async () => {
      resolveIngest({
        runId: 'ingest-1',
        status: 'processed',
        summary: 'The agent found 1 wiki page that this source may update.',
        affectedPageIds: ['wiki-1'],
        reviewStatus: 'pending_review',
        sourceRef: { title: 'Example source', url: 'https://example.com/source' },
        candidateUpdates: [{
          id: 'candidate-wiki-1',
          targetType: 'wiki_page',
          pageId: 'wiki-1',
          title: 'Investing',
          reason: 'Source overlaps this wiki page.',
          confidence: 'medium'
        }]
      });
    });

    expect(await screen.findByLabelText('Source ripple result')).toBeInTheDocument();
    expect(screen.getByText('Done — Example source landed in Wiki Activity. Review 1 proposed destination: Investing.')).toBeInTheDocument();
    expect(screen.queryByText('Metabolizing https://example.com/source...')).not.toBeInTheDocument();
  });

  it('persists a review decision for an ingest update plan', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'https://example.com/source' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByLabelText('Review ingest plan')).toHaveTextContent('Plan status: pending review');
    fireEvent.click(screen.getByLabelText('Select update for What should update?'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(reviewWikiIngestRun).toHaveBeenCalledWith('ingest-1', 'accept', {
      candidateIds: ['candidate-wiki-1']
    }));
    expect(await screen.findByLabelText('Review ingest plan')).toHaveTextContent('Plan status: partially accepted');
    expect(screen.getAllByText('Linked Candidate source ↔ wiki page')).toHaveLength(2);
  });

  it('builds a new wiki page from a no-match source while preserving source provenance', async () => {
    ingestWikiSource.mockResolvedValueOnce({
      runId: '507f1f77bcf86cd799439011',
      status: 'ignored',
      summary: 'No existing page matched strongly enough; create a page for the source.',
      affectedPageIds: [],
      reviewStatus: 'pending_review',
      suggestedCreatePage: true,
      suggestedTitle: 'Market Sentiment Timing',
      sourceRef: {
        type: 'external',
        title: 'Sentiment memo',
        url: 'https://example.com/sentiment',
        summary: 'Market sentiment creates timing signals.'
      }
    });
    createWikiPage.mockResolvedValueOnce({ _id: 'wiki-new', title: 'Market Sentiment Timing' });

    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'https://example.com/sentiment' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('button', { name: 'Build page from source' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Build page from source' }));

    await waitFor(() => expect(createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Market Sentiment Timing',
      pageType: 'overview',
      sourceScope: 'selected_sources',
      initialSourceRef: expect.objectContaining({
        type: 'external',
        title: 'Sentiment memo',
        snippet: 'Market sentiment creates timing signals.',
        url: 'https://example.com/sentiment',
        citationLabel: 'ingest:507f1f77bcf86cd799439011',
        addedBy: 'ai'
      })
    })));
    await waitFor(() => expect(streamMaintainWikiPage).toHaveBeenCalledWith('wiki-new', {}, expect.any(Object)));
    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-new');
    expect(await screen.findByText(/Created @wiki:wiki-new from Sentiment memo/)).toBeInTheDocument();
    expect(await screen.findByText(/Built @wiki:wiki-new from Sentiment memo/)).toBeInTheDocument();
  });

  it('ingests a Library source object through chat', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/ingest @article:article-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(ingestWikiSource).toHaveBeenCalledWith(expect.objectContaining({
      type: 'article',
      objectId: 'article-1'
    })));
    expect(await screen.findByLabelText('Source ripple result')).toBeInTheDocument();
  });

  it('ingests a Library highlight object through chat', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/ingest @highlight:highlight-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(ingestWikiSource).toHaveBeenCalledWith(expect.objectContaining({
      type: 'highlight',
      objectId: 'highlight-1'
    })));
    expect(await screen.findByLabelText('Source ripple result')).toBeInTheDocument();
  });

  it('pulls wiki and Library references into context through the reference picker', async () => {
    searchConnectableItems.mockResolvedValueOnce([{
      itemType: 'highlight',
      itemId: 'highlight-1',
      articleId: 'article-1',
      title: 'Source memo',
      snippet: 'Margin of safety quote.'
    }]);
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Search references to pull in'), {
      target: { value: 'source' }
    });

    expect(await screen.findByRole('button', { name: /Source memo/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Source memo/ }));

    expect(await screen.findByLabelText('In context')).toHaveTextContent('@highlight:Source memo');
    await waitFor(() => expect(createConnection).toHaveBeenCalledWith({
      fromType: 'highlight',
      fromId: 'highlight-1',
      toType: 'wiki_page',
      toId: 'wiki-1',
      relationType: 'supports'
    }));
    expect(screen.getAllByText('Saved a bidirectional graph trace for this pull-in.').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'View trace' })).toHaveAttribute(
      'href',
      '/wiki/workspace?page=wiki-1&pane=wiki&trace=1'
    );

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Use this pulled source.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamChatWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          references: [expect.objectContaining({
            type: 'highlight',
            id: 'highlight-1',
            articleId: 'article-1'
          })]
        })
      }),
      expect.any(Object)
    ));
  });

  it('persists wiki pull-ins as related wiki graph traces', async () => {
    searchConnectableItems.mockResolvedValueOnce([{
      itemType: 'wiki_page',
      itemId: 'wiki-2',
      title: 'Systems Thinking',
      snippet: 'A wiki page'
    }]);
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Search references to pull in'), {
      target: { value: 'systems' }
    });
    expect(await screen.findByRole('button', { name: /Systems Thinking/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Systems Thinking/ }));

    await waitFor(() => expect(createConnection).toHaveBeenCalledWith({
      fromType: 'wiki_page',
      fromId: 'wiki-1',
      toType: 'wiki_page',
      toId: 'wiki-2',
      relationType: 'related'
    }));
    expect(await screen.findByLabelText('In context')).toHaveTextContent('@wiki:Systems Thinking');
  });

  it('builds a new overview wiki page from the chat command', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/build Portfolio Concentration' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Portfolio Concentration',
      pageType: 'overview',
      sourceScope: 'entire_library',
      createdFrom: expect.objectContaining({
        type: 'idea',
        text: 'Portfolio Concentration'
      })
    })));
    await waitFor(() => expect(streamMaintainWikiPage).toHaveBeenCalledWith('wiki-new', {}, expect.any(Object)));
    expect(await screen.findByText('Built @wiki:wiki-new for "Portfolio Concentration".')).toBeInTheDocument();
  });

  it('reframes build failure chat lines after a quality-gate rebuild succeeds', async () => {
    createWikiPage.mockResolvedValueOnce({ _id: 'wiki-new', title: 'Economic Moats' });
    streamMaintainWikiPage.mockImplementationOnce(async (_pageId, _options, handlers = {}) => {
      handlers.onEvent?.('wiki-draft', { stage: 'quality_rebuild' });
      handlers.onPage?.({ _id: 'wiki-new', title: 'Economic Moats' }, { stage: 'complete' });
      return { _id: 'wiki-new', title: 'Economic Moats' };
    });
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/build Economic Moats' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const recovery = await screen.findByText('First pass needed another try — rebuilding with stricter instructions.');
    const built = await screen.findByText('Built @wiki:wiki-new for "Economic Moats".');
    expect(recovery.compareDocumentPosition(built) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Failed to build a wiki page for/i)).not.toBeInTheDocument();
  });

  it('clears stale build failure lines when the maintenance stream recovers after quality rebuild', async () => {
    createWikiPage.mockResolvedValueOnce({ _id: 'wiki-new', title: 'Economic Moats' });
    streamMaintainWikiPage.mockImplementationOnce(async (_pageId, _options, handlers = {}) => {
      handlers.onEvent?.('wiki-draft', { stage: 'quality_rebuild' });
      handlers.onPage?.({ _id: 'wiki-new', title: 'Economic Moats' }, { stage: 'complete' });
      throw new Error('stream tail error');
    });
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/build Economic Moats' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const recovery = await screen.findByText('First pass needed another try — rebuilding with stricter instructions.');
    const built = await screen.findByText('Built @wiki:wiki-new for "Economic Moats".');
    expect(recovery.compareDocumentPosition(built) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Failed to build a wiki page for/i)).not.toBeInTheDocument();
  });

  it('auto-drafts pages opened from the home build composer and refreshes the reader', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-new&build=1');
    await settleWorkspaceEffects();

    await waitFor(() => expect(streamMaintainWikiPage).toHaveBeenCalledWith('wiki-new', {}, expect.objectContaining({
      onPage: expect.any(Function)
    })));
    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-new', { replace: true });
    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-new workspace');
    expect(await screen.findByTestId('wiki-streamed-page-title')).toHaveTextContent('Updated page');
  });

  it('streams a built wiki page into the mounted reader without waiting for reload', async () => {
    createWikiPage.mockResolvedValueOnce({ _id: 'wiki-built', title: 'Portfolio Concentration' });
    streamMaintainWikiPage.mockImplementationOnce(async (_pageId, _options, handlers = {}) => {
      handlers.onPage?.({ _id: 'wiki-built', title: 'Portfolio Concentration Draft' }, { stage: 'drafting' });
      handlers.onPage?.({ _id: 'wiki-built', title: 'Portfolio Concentration Final' }, { stage: 'complete' });
      return { _id: 'wiki-built', title: 'Portfolio Concentration Final' };
    });
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/build Portfolio Concentration' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamMaintainWikiPage).toHaveBeenCalledWith('wiki-built', {}, expect.objectContaining({
      onPage: expect.any(Function)
    })));
    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-built workspace');
    expect(await screen.findByTestId('wiki-streamed-page-title')).toHaveTextContent('Portfolio Concentration Final');
  });

  it('recovers when an auto-build maintenance stream never completes', async () => {
    window.__NOEIS_WIKI_MAINTENANCE_TIMEOUT_MS__ = 0;
    streamMaintainWikiPage.mockImplementationOnce(() => new Promise(() => {}));

    renderWorkspace('/wiki/workspace?page=wiki-new&build=1');
    await settleWorkspaceEffects();

    expect(await screen.findByRole('alert')).toHaveTextContent('The page was created, but the build stream did not finish.');
    expect(await screen.findByRole('status', { name: 'Thought partner status' })).not.toHaveAttribute('data-status', 'working');

    delete window.__NOEIS_WIKI_MAINTENANCE_TIMEOUT_MS__;
  });

  it('streams wiki lint into an actionable chat card without leaving the workspace', async () => {
    renderWorkspace('/wiki/workspace?view=graph');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/lint @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamLintWiki).toHaveBeenCalledWith({ pageId: 'wiki-1' }, expect.any(Object)));
    expect(await screen.findByText('Wiki lint')).toBeInTheDocument();
    expect(screen.getByText('Possible wiki link missing')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-index')).toBeInTheDocument();
  });

  it('can fix and ignore lint findings from the chat card', async () => {
    renderWorkspace('/wiki/workspace?view=graph');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/lint' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const fixButton = await screen.findByRole('button', { name: 'Fix' });
    fireEvent.click(fixButton);
    await waitFor(() => expect(fixWikiLintFinding).toHaveBeenCalledWith('lint-1', 'missing-link-1'));
    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/lint' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const ignoreButtons = await screen.findAllByRole('button', { name: 'Ignore' });
    fireEvent.click(ignoreButtons[0]);
    await waitFor(() => expect(ignoreWikiLintFinding).toHaveBeenCalledWith('lint-1', 'missing-link-1'));
  });

  it('uses broader agent chat infra for ordinary messages', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByTestId('wiki-read-view');

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'What changed here?' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamChatWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'What changed here?',
        persistThread: true,
        context: expect.objectContaining({
          type: 'workspace',
          id: 'wiki',
          pageId: 'wiki-1',
          metadata: expect.objectContaining({ surface: 'wiki_workspace' })
        })
      }),
      expect.any(Object)
    ));
    expect(await screen.findByText('Agent reply.')).toBeInTheDocument();
  });

  it('streams agent deltas and inline activity receipts into the pending reply', async () => {
    streamChatWithAgent.mockImplementationOnce(async (_payload, handlers = {}) => {
      handlers.onActivity?.({
        key: 'read-page',
        stage: 'read_page',
        summary: 'Read the selected wiki page.'
      });
      handlers.onActivity?.({
        key: 'read-page',
        stage: 'read_page',
        summary: 'Read the selected wiki page.'
      });
      handlers.onDelta?.('First ');
      handlers.onDelta?.('chunk.');
      const result = {
        reply: 'First chunk.',
        activityReceipts: [{
          key: 'read-page',
          stage: 'read_page',
          summary: 'Read the selected wiki page.'
        }],
        thread: { threadId: 'thread-1' }
      };
      handlers.onFinal?.(result);
      return result;
    });
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Stream this response' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('First chunk.')).toBeInTheDocument();
    const receipts = await screen.findByLabelText('Agent activity');
    expect(receipts).toHaveTextContent('Read the selected wiki page.');
    expect(receipts.querySelectorAll('li')).toHaveLength(1);
    expect(receipts.querySelector('.wiki-workspace-chat__receipt-icon')).toBeInTheDocument();
    expect(await screen.findByText('Thread · Wiki workspace')).toBeInTheDocument();
  });

  it('renders visible citation chips from streamed agent replies', async () => {
    streamChatWithAgent.mockImplementationOnce(async (_payload, handlers = {}) => {
      handlers.onDelta?.('The thesis is disciplined capital allocation [1,2].');
      const result = {
        reply: 'The thesis is disciplined capital allocation [1,2].',
        activityReceipts: [{ key: 'read-page', stage: 'read_page', summary: 'Read the selected wiki page.' }],
        thread: { threadId: 'thread-1' }
      };
      handlers.onFinal?.(result);
      return result;
    });
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Summarize thesis' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/The thesis is disciplined capital allocation/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Citation 1' })).toHaveAttribute('href', '#wiki-ref-1');
    expect(screen.getByRole('link', { name: 'Citation 2' })).toHaveAttribute('href', '#wiki-ref-2');
  });

  it('forwards paragraph edit stream events to the active wiki read view', async () => {
    streamChatWithAgent.mockImplementationOnce(async (_payload, handlers = {}) => {
      handlers.onActivity?.({ type: 'paragraph_edited', pageId: 'wiki-1', anchorId: 'wiki-block-1', summary: 'Edited Core idea.' });
      const result = { reply: 'Updated paragraph.', thread: { threadId: 'thread-1' } };
      handlers.onFinal?.(result);
      return result;
    });
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Update this page' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByTestId('wiki-live-update')).toHaveTextContent('wiki-block-1');
  });

  it('renders the living-agent pending state without a literal Thinking placeholder', async () => {
    let resolveStream;
    streamChatWithAgent.mockImplementationOnce(async (_payload, handlers = {}) => {
      const result = await new Promise(resolve => {
        resolveStream = () => resolve({ reply: 'Resolved reply.', thread: { threadId: 'thread-1' } });
      });
      handlers.onFinal?.(result);
      return result;
    });
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toHaveClass('wiki-workspace-chat__send', 'is-empty');
    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Hold the stream open' }
    });
    expect(screen.getByRole('button', { name: 'Send' })).toHaveClass('wiki-workspace-chat__send', 'is-ready');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('button', { name: 'Cancel' })).toHaveClass('wiki-workspace-chat__send', 'is-cancel');
    expect(document.querySelector('.wiki-workspace-chat__composer')).toHaveAttribute('data-streaming', 'true');
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    expect(document.querySelector('.wiki-workspace-chat__message.is-assistant .wiki-workspace-chat__caret')).toBeInTheDocument();

    await act(async () => {
      resolveStream();
    });
    expect(await screen.findByText('Resolved reply.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(document.querySelector('.wiki-workspace-chat__composer')).toHaveAttribute('data-streaming', 'false');
  });

  it('aborts an active streamed agent reply from the cancel affordance', async () => {
    let streamSignal;
    streamChatWithAgent.mockImplementationOnce(async (_payload, handlers = {}) => {
      streamSignal = handlers.signal;
      handlers.onDelta?.('Partial reply');
      return new Promise((_resolve, reject) => {
        streamSignal.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Cancel this response' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamSignal).toBeTruthy());
    expect(await screen.findByText('Partial reply')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(streamSignal.aborted).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument());
    expect(screen.getByText('Agent reply cancelled before completion.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('restores composer state and keeps the draft when a streamed reply errors', async () => {
    streamChatWithAgent.mockImplementationOnce(async (_payload, handlers = {}) => {
      handlers.onDelta?.('Half answer that should not render');
      throw new Error('network dropped');
    });
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Fail this response' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Agent chat failed. Your draft is still in the composer; retry when ready.')).toBeInTheDocument();
    expect(screen.queryByText('Half answer that should not render')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('Fail this response');
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });

  it('keeps referenced wiki pages in context for later agent turns until removed', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByTestId('wiki-read-view');

    expect(screen.getByLabelText('In context')).toHaveTextContent('@wiki:wiki-1');

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'What should I read next?' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamChatWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'What should I read next?',
        context: expect.objectContaining({
          references: [expect.objectContaining({ type: 'wiki', id: 'wiki-1' })],
          metadata: expect.objectContaining({
            contextReferences: [expect.objectContaining({ type: 'wiki', id: 'wiki-1' })]
          })
        })
      }),
      expect.any(Object)
    ));

    fireEvent.click(screen.getByRole('button', { name: /Remove @wiki:/ }));
    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Continue without that page.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamChatWithAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: 'Continue without that page.',
        context: expect.objectContaining({
          references: [],
          metadata: expect.objectContaining({ contextReferences: [] })
        })
      }),
      expect.any(Object)
    ));
  });

  it('suggests article references and stores them as context chips', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Use @article:source' }
    });

    expect(await screen.findByLabelText('Article references')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Source memo/ }));
    expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('Use @article:article-1');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByLabelText('In context')).toHaveTextContent('@article:Source memo');
  });

  it('suggests Library highlights and sends them as agent context', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Ground this with @highlight:margin' }
    });

    expect(await screen.findByLabelText('Highlight references')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Source memo/ }));
    expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('Ground this with @highlight:highlight-1');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByLabelText('In context')).toHaveTextContent('@highlight:Source memo');

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'What does this highlight change?' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamChatWithAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: 'What does this highlight change?',
        context: expect.objectContaining({
          references: [expect.objectContaining({
            type: 'highlight',
            id: 'highlight-1',
            articleId: 'article-1',
            title: 'Source memo'
          })],
          metadata: expect.objectContaining({
            contextReferences: [expect.objectContaining({ type: 'highlight', id: 'highlight-1' })]
          })
        })
      }),
      expect.any(Object)
    ));
  });

  it('shows and dismisses the composer discoverability hint', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    expect(screen.getByText(/Type \/ for commands, @ to reference your library/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss composer hint' }));
    expect(screen.queryByText(/Type \/ for commands, @ to reference your library/)).not.toBeInTheDocument();
  });

  it('normalizes home build intent into a wiki build command', async () => {
    renderWorkspace('/wiki/workspace?pane=chat&homeCommand=build%20a%20page%20about%20research%20maps');
    await settleWorkspaceEffects();

    expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/build research maps');
    expect(mockNavigate).toHaveBeenCalledWith('/wiki/workspace?pane=chat', { replace: true });
  });

  it('hydrates Home command references into Wiki chat context', async () => {
    window.sessionStorage.setItem('noeis.homeCommand.pendingReferences', JSON.stringify([{
      itemType: 'article',
      itemId: 'article-1',
      title: 'Source memo',
      url: 'https://example.com'
    }]));

    renderWorkspace('/wiki/workspace?pane=chat&homeCommand=build%20a%20page%20about%20research%20maps');
    await settleWorkspaceEffects();

    expect(await screen.findByLabelText('In context')).toHaveTextContent('@article:Source memo');
    expect(window.sessionStorage.getItem('noeis.homeCommand.pendingReferences')).toBeNull();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'What does this source change?' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamChatWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'What does this source change?',
        context: expect.objectContaining({
          references: [expect.objectContaining({
            type: 'article',
            id: 'article-1',
            title: 'Source memo',
            url: 'https://example.com'
          })],
          metadata: expect.objectContaining({
            contextReferences: [expect.objectContaining({ type: 'article', id: 'article-1' })]
          })
        })
      }),
      expect.any(Object)
    ));
  });

  it('auto-runs home source ingest handoffs so the source ripple is visible', async () => {
    renderWorkspace('/wiki/workspace?pane=chat&homeCommand=%2Fingest%20https%3A%2F%2Fexample.com%2Fsource');
    await settleWorkspaceEffects();

    await waitFor(() => expect(ingestWikiSource).toHaveBeenCalledWith({
      type: 'url',
      url: 'https://example.com/source'
    }));
    expect(await screen.findByLabelText('Source ripple result')).toBeInTheDocument();
    expect(screen.getByLabelText('Latest source ripple')).toHaveTextContent('Investing');
    expect(screen.getByLabelText('Review ingest plan')).toHaveTextContent('Plan status: pending review');
  });

  it('auto-hides the discoverability hint after slash and at-reference use', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByTestId('wiki-read-view');
    expect(screen.queryByText(/Type \/ for commands, @ to reference your library/)).not.toBeInTheDocument();
  });

  it('surfaces the saved broader thread and continues it on later messages', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Start a workspace thread' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Thread · Wiki workspace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Thread/ })).toHaveAttribute('href', '/think?tab=threads&threadId=thread-1');

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Continue it' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(streamChatWithAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: 'Continue it',
        threadId: 'thread-1'
      }),
      expect.any(Object)
    ));
  });

  it('shows slash command discovery and fills a selected command', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/' }
    });

    expect(screen.getByLabelText('Wiki commands')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\/build/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /\/draft/ }));
    expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/draft @wiki:');
  });

  it('filters slash commands by the active command token', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/pa' }
    });

    const commands = screen.getByLabelText('Wiki commands');
    expect(commands).toHaveTextContent('/page');
    expect(commands).not.toHaveTextContent('/draft');
    expect(commands).not.toHaveTextContent('/lint');
  });

  it('keeps the slash command palette canonical and discoverable', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/' }
    });

    const commands = screen.getByLabelText('Wiki commands');
    ['/new', '/create', '/promote', '/diff', '/ask'].forEach(command => (
      expect(commands).not.toHaveTextContent(command)
    ));

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/he' }
    });

    expect(screen.getByLabelText('Wiki commands')).toHaveTextContent('/help');
  });

  it('suggests wiki page references for @wiki input', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:sys' }
    });

    expect(await screen.findByLabelText('Wiki page references')).toBeInTheDocument();
    expect(screen.queryByLabelText('Wiki commands')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Systems Thinking/ }));
    expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/page @wiki:wiki-2');
    expect(screen.queryByLabelText('Wiki page references')).not.toBeInTheDocument();
  });

  it('opens Library sources as the right pane', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/sources' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByLabelText('Library sources')).toBeInTheDocument();
    expect(await screen.findByText('Source memo')).toBeInTheDocument();
  });

  it('renders ingest detail links and touched-page counts in the activity pane', async () => {
    listWikiActivity.mockResolvedValueOnce([{
      id: 'event-ingest',
      type: 'ingest',
      title: 'Source memo ingested',
      summary: 'Updated related pages.',
      runId: 'ingest-1',
      affectedPageIds: ['wiki-1', 'wiki-2']
    }]);

    renderWorkspace('/wiki/workspace?view=activity');
    await settleWorkspaceEffects();

    expect(await screen.findByText('Source memo ingested')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/wiki/activity/ingest-1');
    expect(screen.getByText('2 pages touched')).toBeInTheDocument();
  });

  it('surfaces schema snapshots and suggestions in the workspace schema pane', async () => {
    renderWorkspace('/wiki/workspace?view=schema');
    await settleWorkspaceEffects();

    expect(await screen.findByDisplayValue('# Wiki Schema')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revert to/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest updates' }));
    await waitFor(() => expect(suggestWikiSchemaUpdates).toHaveBeenCalledWith({ currentSchema: '# Wiki Schema' }));
    expect(await screen.findByLabelText('Suggested wiki schema patch')).toHaveValue('+ Prefer overview for promoted notebook pages.');

    fireEvent.click(screen.getByRole('button', { name: /Revert to/ }));
    await waitFor(() => expect(revertWikiSchema).toHaveBeenCalledWith('snap-1'));
    expect(await screen.findByDisplayValue('# Reverted')).toBeInTheDocument();
  });

  it('can send a Library source back into the chat composer', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByTestId('wiki-read-view');

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/sources' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Source memo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use in chat' }));

    expect(screen.getByLabelText('Wiki workspace message')).toHaveValue(
      'Use "Source memo" (https://example.com) @article:article-1 for @wiki:wiki-1 and tell me what wiki update it supports.'
    );
  });

  it('can feed a Library source into the wiki ingest command from the source pane', async () => {
    renderWorkspace('/wiki/workspace?view=sources');
    await settleWorkspaceEffects();

    expect(await screen.findByText('Source memo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Feed to wiki' }));

    await waitFor(() => expect(ingestWikiSource).toHaveBeenCalledWith(expect.objectContaining({
      type: 'article',
      objectId: 'article-1'
    })));
    expect(await screen.findByLabelText('Source ripple result')).toBeInTheDocument();
  });

  it('switches panes with a horizontal swipe on mobile', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();
    const workspace = screen.getByRole('region', { name: 'Wiki workspace' });

    expect(workspace).toHaveClass('is-mobile-wiki');
    fireEvent.touchStart(workspace, { touches: [{ clientX: 120, clientY: 20 }] });
    fireEvent.touchEnd(workspace, { changedTouches: [{ clientX: 300, clientY: 28 }] });
    expect(workspace).toHaveClass('is-mobile-chat');
  });
});
