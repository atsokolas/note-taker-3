import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import Library from './Library';
import useFolders from '../hooks/useFolders';
import useLibraryArticles from '../hooks/useLibraryArticles';
import useArticleDetail from '../hooks/useArticleDetail';
import useTags from '../hooks/useTags';
import { getConnectionsForItem } from '../api/connections';
import { startLibraryFilingSuggestions } from '../api/library';

const mockNavigate = jest.fn();

jest.mock('../hooks/useFolders', () => jest.fn());
jest.mock('../hooks/useLibraryArticles', () => jest.fn());
jest.mock('../hooks/useArticleDetail', () => jest.fn());
jest.mock('../hooks/useTags', () => jest.fn());

jest.mock('../layout/ThreePaneLayout', () => ({
  __esModule: true,
  default: ({ left, main, right, rightTitle, rightToggleLabel, mainHeader, mainActions, leftOpen, rightOpen }) => (
    <div>
      {leftOpen ? <aside data-testid="library-left">{left}</aside> : null}
      <main data-testid="library-main">
        {mainHeader}
        {mainActions}
        {main}
      </main>
      <aside data-testid="library-right" aria-label={rightTitle} data-open={String(rightOpen)}>
        <button type="button">{rightToggleLabel}</button>
        {right}
      </aside>
    </div>
  )
}));

jest.mock('../components/library/LibraryMain', () => ({
  __esModule: true,
  default: ({
    selectedArticleId,
    articleQuery,
    onArticleQueryChange,
    onSelectArticle,
    onReviewFiling,
    onToggleSuppressed,
    suppressedVisible,
    unfiledCount,
    shelfNavigation
  }) => (
    <div>
      {selectedArticleId ? 'Reading article shell' : 'Browse library shell'}
      {!selectedArticleId ? (
        <>
          <div data-testid="library-source-shelf">{shelfNavigation}</div>
          <div data-testid="library-reading-room-lead">
            Reading room lead · {unfiledCount} unfiled
            {suppressedVisible ? ' · showing review imports' : ''}
          </div>
          <button type="button" onClick={onReviewFiling}>Review filing suggestions</button>
          <button type="button" onClick={onToggleSuppressed}>
            {suppressedVisible ? 'Hide review imports' : 'Show review imports'}
          </button>
        </>
      ) : null}
      {!selectedArticleId ? (
        <label htmlFor="mock-library-article-search">
          Search articles
          <input
            id="mock-library-article-search"
            value={articleQuery || ''}
            onChange={(event) => onArticleQueryChange?.(event.target.value)}
          />
        </label>
      ) : null}
      {!selectedArticleId ? (
        <>
          <button type="button" onClick={() => onSelectArticle('article-1')}>
            Open article
          </button>
          <button type="button" onClick={() => onSelectArticle('article-1', { highlightId: 'highlight-1' })}>
            Open highlighted source
          </button>
        </>
      ) : null}
    </div>
  )
}));
jest.mock('../components/library/LibraryContext', () => ({
  __esModule: true,
  default: () => <div>Library context details</div>
}));
jest.mock('../components/library/FolderTree', () => ({
  __esModule: true,
  default: () => <div>Folder tree</div>
}));
jest.mock('../components/library/MoveToFolderModal', () => () => null);
jest.mock('../components/library/LibraryConceptModal', () => () => null);
jest.mock('../components/library/LibraryNotebookModal', () => () => null);
jest.mock('../components/library/LibraryQuestionModal', () => () => null);
jest.mock('../components/references/ReferencePullIn', () => ({
  __esModule: true,
  default: ({ targetId }) => <div>Pull references for {targetId}</div>
}));
jest.mock('../components/agent/ThoughtPartnerPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="thought-partner-panel">Library thought partner</div>
}));
jest.mock('../components/agent/AgentSkillDock', () => ({
  __esModule: true,
  default: () => <div data-testid="agent-skill-dock">Article moves</div>
}));

jest.mock('../api/articles', () => ({
  moveArticleToFolder: jest.fn()
}));
jest.mock('../api/questions', () => ({
  createQuestion: jest.fn()
}));
jest.mock('../api/connections', () => ({
  getConnectionsForItem: jest.fn().mockResolvedValue({ outgoing: [], incoming: [] })
}));
jest.mock('../api/workingMemory', () => ({
  createWorkingMemory: jest.fn()
}));
jest.mock('../api/highlights', () => ({
  updateHighlight: jest.fn(),
  deleteHighlight: jest.fn()
}));
jest.mock('../api/agent', () => ({
  chatWithAgent: jest.fn()
}));
jest.mock('../api/library', () => ({
  startLibraryFilingSuggestions: jest.fn()
}));
jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({})
}));
jest.mock('../api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }
}));

const renderLibrary = (path = '/library?scope=all') => {
  jest.spyOn(router, 'useNavigate').mockReturnValue(mockNavigate);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Library />
    </MemoryRouter>
  );
};

describe('Library agent rail', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockNavigate.mockReset();
    localStorage.clear();
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    getConnectionsForItem.mockResolvedValue({ outgoing: [], incoming: [] });
    startLibraryFilingSuggestions.mockResolvedValue({
      thread: { threadId: 'thread-filing-1' },
      receipt: {
        stage: 'ready',
        summary: 'Staged 2 filing suggestions across 2 folders for review.'
      }
    });
    useFolders.mockReturnValue({
      folders: [],
      loading: false,
      error: ''
    });
    useLibraryArticles.mockReturnValue({
      articles: [],
      allArticles: [
        { _id: 'article-1', title: 'Investor letter', source: 'Library' },
        { _id: 'article-2', title: 'Unfiled note', source: 'Readwise', highlightCount: 2 }
      ],
      loading: false,
      error: '',
      setAllArticles: jest.fn()
    });
    useTags.mockReturnValue({
      tags: [{ tag: 'valuation' }, { tag: 'process' }],
      loading: false
    });
    useArticleDetail.mockImplementation((articleId) => ({
      article: articleId ? { _id: articleId, title: 'Investor letter' } : null,
      highlights: articleId ? [{ _id: 'highlight-1', text: 'Cash flow discipline.' }] : [],
      references: articleId ? [{ _id: 'reference-1', title: 'Source note' }] : [],
      loading: false,
      error: '',
      addHighlightOptimistic: jest.fn(),
      replaceHighlight: jest.fn(),
      removeHighlight: jest.fn()
    }));
  });

  it('folds the Librarian behind a word and opens it in full when asked', () => {
    // One agent to a screen. The rail is the agent every room shares; the
    // Librarian does more — filing, structure, selection — so it keeps its
    // panel, it just no longer holds a third pane open to say so.
    renderLibrary();

    expect(screen.queryByTestId('library-right')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Librarian' })[0]);

    const rightRail = screen.getByTestId('library-right');
    expect(rightRail).toHaveAccessibleName('Librarian');
    expect(rightRail).toHaveTextContent('Library context visible');
    expect(rightRail).toHaveTextContent('themes: valuation, process');
    expect(screen.getByLabelText('Librarian library trace')).toBeInTheDocument();
  });

  it('names the Librarian on the word that opens it', () => {
    renderLibrary();

    expect(screen.getAllByRole('button', { name: 'Librarian' }).length).toBeGreaterThan(0);
  });

  it('keeps article search in the main list instead of duplicating it in the Cabinet rail', () => {
    renderLibrary();

    const main = screen.getByTestId('library-main');

    expect(screen.queryByTestId('library-left')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search articles')).toBeInTheDocument();
    expect(main).toContainElement(screen.getByLabelText('Search articles'));
  });

  it('defaults to reading-room browse with cabinet closed until opened', () => {
    renderLibrary();

    // The locked middle is the reading and the list. The reading-room lead,
    // with its filing and review verbs, is not in it — those moved up to the
    // column head, and the shelves moved to a rail of their own.
    expect(screen.queryByTestId('library-reading-room-lead')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-left')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Shelves' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review filing suggestions' })).toBeInTheDocument();
  });

  it('starts the filing classification flow from the reading room lead action', async () => {
    renderLibrary();

    fireEvent.click(screen.getByRole('button', { name: 'Review filing suggestions' }));

    await waitFor(() => {
      expect(startLibraryFilingSuggestions).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/think?tab=threads&threadId=thread-filing-1');
  });

  it('keeps useful folders and filtered tag shortcuts in the single source shelf', () => {
    useTags.mockReturnValueOnce({
      tags: [{ tag: 'valuation' }, { tag: 'Blah' }, { tag: 'TEST' }],
      loading: false
    });

    renderLibrary();

    // Folders live on the shelf rail now rather than inside the middle.
    const shelves = screen.getByRole('navigation', { name: 'Shelves' });
    expect(within(shelves).getByRole('button', { name: /All sources/ })).toBeInTheDocument();
    expect(within(shelves).getByRole('button', { name: /Highlights/ })).toBeInTheDocument();
  });

  it('exposes an explicit low-signal review action from the reading room lead', () => {
    renderLibrary();

    expect(screen.getByRole('button', { name: 'Show review imports' })).toBeInTheDocument();
  });

  it('reads in one column, with the Librarian a word away and marginalia closed', async () => {
    // What matters here is the fold, not which component the harness mocks:
    // reading is the source and its marginalia, the Librarian is reachable by
    // name, and neither is a pane held open before anyone asks.
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

    await waitFor(() => {
      expect(document.querySelector('.library-page-shell.is-reading')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'Librarian' }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('library-left')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-reading-secondary-rail')).not.toHaveAttribute('open');
  });

  it('opens source context when navigation targets an exact highlight', async () => {
    renderLibrary('/library?scope=all&highlightId=highlight-1');
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

    await waitFor(() => {
      expect(screen.getByTestId('library-reading-secondary-rail')).toHaveAttribute('open');
    });
  });

});
