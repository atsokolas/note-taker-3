import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import WikiWorkspace from './WikiWorkspace';
import { chatWithAgent } from '../../api/agent';
import { getArticles } from '../../api/articles';
import { getWikiPage, getWikiSchema, ingestWikiSource, listWikiActivity, maintainWikiPage, saveWikiSchema } from '../../api/wiki';

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
    maintainWikiPage.mockResolvedValue({ _id: 'wiki-1', title: 'Updated page' });
    saveWikiSchema.mockResolvedValue({ content: '# Saved' });
  });

  it('renders the graph beside persistent chat by default', () => {
    renderWorkspace();

    expect(screen.getByLabelText('Wiki agent chat')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-index')).toBeInTheDocument();
  });

  it('opens a page from the /page chat command', async () => {
    renderWorkspace();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/page @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByTestId('wiki-read-view')).toHaveTextContent('Page wiki-1 workspace');
  });

  it('runs maintenance only through the chat command', async () => {
    renderWorkspace('/wiki/workspace?page=wiki-1');

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/draft @wiki:wiki-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(maintainWikiPage).toHaveBeenCalledWith('wiki-1'));
    expect(await screen.findByText('Finished drafting @wiki:wiki-1.')).toBeInTheDocument();
  });

  it('uses broader agent chat infra for ordinary messages', async () => {
    renderWorkspace();

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
      context: expect.objectContaining({ type: 'wiki_workspace', pageId: 'wiki-1' })
    })));
    expect(await screen.findByText('Agent reply.')).toBeInTheDocument();
  });

  it('opens Library sources as the right pane', async () => {
    renderWorkspace();

    fireEvent.change(screen.getByLabelText('Wiki workspace message'), {
      target: { value: '/sources' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByLabelText('Library sources')).toBeInTheDocument();
    expect(await screen.findByText('Source memo')).toBeInTheDocument();
  });

  it('switches panes with a horizontal swipe on mobile', () => {
    renderWorkspace();
    const workspace = screen.getByRole('main');

    expect(workspace).toHaveClass('is-mobile-chat');
    fireEvent.touchStart(workspace, { touches: [{ clientX: 300, clientY: 20 }] });
    fireEvent.touchEnd(workspace, { changedTouches: [{ clientX: 120, clientY: 28 }] });
    expect(workspace).toHaveClass('is-mobile-wiki');
  });
});
