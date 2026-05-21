import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import WikiWorkspace from './WikiWorkspace';
import { streamChatWithAgent } from '../../api/agent';
import { getArticles } from '../../api/articles';
import {
  acceptWikiLintFinding,
  createWikiPage,
  fixWikiLintFinding,
  getWikiPage,
  getWikiSchema,
  ignoreWikiLintFinding,
  ingestWikiSource,
  listWikiActivity,
  listWikiPages,
  saveWikiSchema,
  streamLintWiki,
  streamMaintainWikiPage
} from '../../api/wiki';

jest.mock('../../api/agent', () => ({
  streamChatWithAgent: jest.fn()
}));

jest.mock('../../api/articles', () => ({
  getArticles: jest.fn()
}));

jest.mock('../../api/wiki', () => ({
  createWikiPage: jest.fn(),
  acceptWikiLintFinding: jest.fn(),
  fixWikiLintFinding: jest.fn(),
  getWikiPage: jest.fn(),
  getWikiSchema: jest.fn(),
  ignoreWikiLintFinding: jest.fn(),
  ingestWikiSource: jest.fn(),
  listWikiActivity: jest.fn(),
  listWikiPages: jest.fn(),
  saveWikiSchema: jest.fn(),
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
jest.mock('./WikiPageReadView', () => ({ pageId, workspaceMode, onEdit }) => (
  <div data-testid="wiki-read-view">
    Page {pageId} {workspaceMode ? 'workspace' : ''}
    <button type="button" onClick={onEdit}>Edit page</button>
  </div>
));
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
    mockNavigate.mockClear();
    window.localStorage.clear();
    streamChatWithAgent.mockImplementation(async (_payload, handlers = {}) => {
      handlers.onDelta?.('Agent reply.');
      const result = { reply: 'Agent reply.', thread: { threadId: 'thread-1' } };
      handlers.onFinal?.(result);
      return result;
    });
    createWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    getArticles.mockResolvedValue([{ _id: 'article-1', title: 'Source memo', url: 'https://example.com' }]);
    getWikiPage.mockResolvedValue({ _id: 'wiki-1', title: 'Wiki page' });
    getWikiSchema.mockResolvedValue({ content: '# Wiki Schema' });
    ingestWikiSource.mockResolvedValue({ affectedPageIds: ['wiki-1'] });
    listWikiActivity.mockResolvedValue([{ id: 'event-1', title: 'Maintained page', summary: 'Updated one page.', pageId: 'wiki-1' }]);
    listWikiPages.mockResolvedValue([
      { _id: 'wiki-1', title: 'Investing' },
      { _id: 'wiki-2', title: 'Systems Thinking' }
    ]);
    saveWikiSchema.mockResolvedValue({ content: '# Saved' });
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

  it('renders the graph beside persistent chat by default', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    expect(screen.getByLabelText('Wiki agent chat')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-index')).toBeInTheDocument();
    expect(document.querySelector('.wiki-workspace')).toHaveStyle('--wiki-workspace-chat-width: 300px');
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

  it('keeps page editing inside the canonical workspace URL state', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1');
    await settleWorkspaceEffects();

    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
    fireEvent.click(screen.getByRole('button', { name: 'Edit page' }));

    expect(await screen.findByTestId('wiki-page-editor')).toHaveTextContent('Editing wiki-1');
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
    expect(listWikiPages).not.toHaveBeenCalled();

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

  it('AT-19 — defers the ambient agent presence until after the workspace first paint', async () => {
    jest.useFakeTimers();
    try {
      renderWorkspace('/wiki/workspace?page=wiki-1');
      await settleWorkspaceEffects();

      expect(screen.getByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
      expect(screen.queryByRole('status', { name: 'Agent status' })).not.toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      await settleWorkspaceEffects();

      expect(screen.getByRole('status', { name: 'Agent status' })).toHaveTextContent(/ready/i);
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

    const status = await screen.findByRole('status', { name: 'Agent status' });
    expect(status).toHaveTextContent('1 signal pending for Investing.');
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

    const status = await screen.findByRole('status', { name: 'Agent status' });
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
    expect(await screen.findByText('Ingested source. 1 page affected.')).toBeInTheDocument();
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
    expect(await screen.findByText('Saved thread')).toBeInTheDocument();
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

    expect(await screen.findByText('Partial reply')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(streamSignal.aborted).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument());
    expect(screen.getByText('Partial reply')).toBeInTheDocument();
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

  it('shows and dismisses the composer discoverability hint', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    expect(screen.getByText('Type / for commands, @ to reference your library.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss composer hint' }));
    expect(screen.queryByText('Type / for commands, @ to reference your library.')).not.toBeInTheDocument();
  });

  it('auto-hides the discoverability hint after slash and at-reference use', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByTestId('wiki-read-view');
    expect(screen.queryByText('Type / for commands, @ to reference your library.')).not.toBeInTheDocument();
  });

  it('surfaces the saved broader thread and continues it on later messages', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: 'Start a workspace thread' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Saved thread')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open thread/ })).toHaveAttribute('href', '/think?tab=threads&threadId=thread-1');

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

  it('switches panes with a horizontal swipe on mobile', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();
    const workspace = screen.getByRole('main');

    expect(workspace).toHaveClass('is-mobile-chat');
    fireEvent.touchStart(workspace, { touches: [{ clientX: 300, clientY: 20 }] });
    fireEvent.touchEnd(workspace, { changedTouches: [{ clientX: 120, clientY: 28 }] });
    expect(workspace).toHaveClass('is-mobile-wiki');
  });
});
