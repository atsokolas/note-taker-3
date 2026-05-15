import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import WikiWorkspace from './WikiWorkspace';
import { chatWithAgent } from '../../api/agent';
import { getArticles } from '../../api/articles';
import { getWikiPage, getWikiSchema, ingestWikiSource, listWikiActivity, listWikiPages, maintainWikiPage, saveWikiSchema } from '../../api/wiki';

jest.mock('../../api/agent', () => ({
  chatWithAgent: jest.fn()
}));

jest.mock('../../api/articles', () => ({
  getArticles: jest.fn()
}));

jest.mock('../../api/wiki', () => ({
  getWikiPage: jest.fn(),
  getWikiSchema: jest.fn(),
  ingestWikiSource: jest.fn(),
  listWikiActivity: jest.fn(),
  listWikiPages: jest.fn(),
  maintainWikiPage: jest.fn(),
  saveWikiSchema: jest.fn()
}));

jest.mock('./WikiIndex', () => () => <div data-testid="wiki-index">Graph view</div>);
jest.mock('./WikiPageReadView', () => ({ pageId, workspaceMode }) => (
  <div data-testid="wiki-read-view">
    Page {pageId} {workspaceMode ? 'workspace' : ''}
  </div>
));

const renderWorkspace = (initialEntry = '/wiki/workspace?view=graph') => {
  window.history.pushState({}, '', initialEntry);
  return render(
    <BrowserRouter>
      <WikiWorkspace />
    </BrowserRouter>
  );
};

const settleWorkspaceEffects = async () => {
  await act(async () => {});
};

describe('WikiWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    chatWithAgent.mockResolvedValue({ reply: 'Agent reply.', thread: { threadId: 'thread-1' } });
    getArticles.mockResolvedValue([{ _id: 'article-1', title: 'Source memo', url: 'https://example.com' }]);
    getWikiPage.mockResolvedValue({ _id: 'wiki-1', title: 'Wiki page' });
    getWikiSchema.mockResolvedValue({ content: '# Wiki Schema' });
    ingestWikiSource.mockResolvedValue({ affectedPageIds: ['wiki-1'] });
    listWikiActivity.mockResolvedValue([{ id: 'event-1', title: 'Maintained page', summary: 'Updated one page.', pageId: 'wiki-1' }]);
    listWikiPages.mockResolvedValue([
      { _id: 'wiki-1', title: 'Investing' },
      { _id: 'wiki-2', title: 'Systems Thinking' }
    ]);
    maintainWikiPage.mockResolvedValue({ _id: 'wiki-1', title: 'Updated page' });
    saveWikiSchema.mockResolvedValue({ content: '# Saved' });
  });

  it('renders the graph beside persistent chat by default', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    expect(screen.getByLabelText('Wiki agent chat')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-index')).toBeInTheDocument();
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

    await waitFor(() => expect(maintainWikiPage).toHaveBeenCalledWith('wiki-1'));
    expect(await screen.findByText('Finished drafting @wiki:wiki-1.')).toBeInTheDocument();
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

    await waitFor(() => expect(chatWithAgent).toHaveBeenCalledWith(expect.objectContaining({
      message: 'What changed here?',
      persistThread: true,
      context: expect.objectContaining({
        type: 'workspace',
        id: 'wiki',
        pageId: 'wiki-1',
        metadata: { surface: 'wiki_workspace' }
      })
    })));
    expect(await screen.findByText('Agent reply.')).toBeInTheDocument();
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

    await waitFor(() => expect(chatWithAgent).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'Continue it',
      threadId: 'thread-1'
    })));
  });

  it('shows slash command discovery and fills a selected command', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/' }
    });

    expect(screen.getByLabelText('Wiki commands')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /\/draft/ }));
    expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/draft @wiki:');
  });

  it('suggests wiki page references for @wiki input', async () => {
    renderWorkspace();
    await settleWorkspaceEffects();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:sys' }
    });

    expect(await screen.findByLabelText('Wiki page references')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Systems Thinking/ }));
    expect(screen.getByLabelText('Wiki workspace message')).toHaveValue('/page @wiki:wiki-2');
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
      'Use "Source memo" (https://example.com) for @wiki:wiki-1 and tell me what wiki update it supports.'
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
