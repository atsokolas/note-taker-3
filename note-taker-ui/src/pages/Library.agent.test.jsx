import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import Library from './Library';
import useFolders from '../hooks/useFolders';
import useLibraryArticles from '../hooks/useLibraryArticles';
import useArticleDetail from '../hooks/useArticleDetail';
import useTags from '../hooks/useTags';
import useLibraryRoom from '../hooks/useLibraryRoom';
import { getConnectionsForItem } from '../api/connections';
import { startLibraryFilingSuggestions } from '../api/library';

const mockNavigate = jest.fn();
const mockDeclareSurface = jest.fn();

jest.mock('../hooks/useFolders', () => jest.fn());
jest.mock('../hooks/useLibraryArticles', () => jest.fn());
jest.mock('../hooks/useArticleDetail', () => jest.fn());
jest.mock('../hooks/useTags', () => jest.fn());
jest.mock('../hooks/useLibraryRoom', () => jest.fn());

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
    shelfNavigation
  }) => (
    <div>
      {selectedArticleId ? 'Reading article shell' : 'Browse library shell'}
      {!selectedArticleId ? (
        <>
          <div data-testid="library-source-shelf">{shelfNavigation}</div>
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
jest.mock('../surface/NoeisSurfaceContext', () => ({
  useNoeisSurface: (descriptor) => mockDeclareSurface(descriptor)
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
    mockDeclareSurface.mockReset();
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
    useLibraryRoom.mockReturnValue({
      loading: false,
      loadingMore: false,
      error: '',
      paginationError: '',
      sources: [],
      coverage: null,
      counts: {},
      folders: [],
      shelfCounts: {
        articles: 2,
        rawArticles: 2,
        unfiledArticles: 2,
        keptArticles: 0,
        laterArticles: 0,
        setAsideArticles: 0,
        suppressedArticles: 0
      },
      piles: { later: [], setAside: [] },
      feedTopics: [],
      nextCursor: null,
      hasMore: false,
      loadMore: jest.fn()
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

  it('does not mount a second page-specific agent beside the persistent rail', () => {
    renderLibrary();

    expect(screen.queryByTestId('library-right')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Library thought partner')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Librarian' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Review filing' })).toBeInTheDocument();
  });

  it('puts Later, Set aside, and Kept at the top of the Library column', () => {
    renderLibrary();

    const places = screen.getByRole('navigation', { name: 'Library places' });
    expect(within(places).getByRole('link', { name: 'Later' }))
      .toHaveAttribute('href', '/library?scope=later');
    expect(within(places).getByRole('link', { name: 'Set aside' }))
      .toHaveAttribute('href', '/library?scope=set-aside');
    expect(within(places).getByRole('link', { name: 'Kept' }))
      .toHaveAttribute('href', '/library?scope=kept');
    expect(screen.queryByText(/^Feed$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Feed \(0\)/)).not.toBeInTheDocument();
  });

  it('names a screened topic in the Library places, never the word Feed', () => {
    useLibraryRoom.mockReturnValue({
      loading: false,
      loadingMore: false,
      error: '',
      paginationError: '',
      sources: [],
      coverage: null,
      counts: {},
      folders: [],
      shelfCounts: {
        articles: 2,
        rawArticles: 2,
        unfiledArticles: 2,
        keptArticles: 0,
        laterArticles: 0,
        setAsideArticles: 0,
        suppressedArticles: 0
      },
      piles: { later: [], setAside: [] },
      feedTopics: [{ id: 'news', name: 'Newsletters' }],
      nextCursor: null,
      hasMore: false,
      loadMore: jest.fn()
    });

    renderLibrary();

    expect(screen.getByRole('link', { name: 'Newsletters' }))
      .toHaveAttribute('href', '/library?scope=feed&topic=news');
    expect(screen.queryByText(/^Feed$/)).not.toBeInTheDocument();
  });

  it('starts the filing classification flow from the reading room lead action', async () => {
    renderLibrary();

    fireEvent.click(screen.getByRole('button', { name: 'Review filing' }));

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

  it('reads in one column with source work attached and no duplicate agent', async () => {
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Open article' }));

    await waitFor(() => {
      expect(document.querySelector('.library-page-shell.is-reading')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Librarian' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-left')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-reading-secondary-rail')).not.toHaveAttribute('open');
    expect(mockDeclareSurface).toHaveBeenLastCalledWith(expect.objectContaining({
      room: 'library',
      objectType: 'article',
      objectId: 'article-1',
      title: 'Investor letter'
    }));
  });

  it('opens source context when navigation targets an exact highlight', async () => {
    /* setupTests mocks useSearchParams to empty for the whole suite, so a deep
       link cannot be expressed through the URL here — it has to be handed in.
       This is the contract: arriving with a highlight named opens the source
       and the context that shows it, rather than opening the source and hiding
       the thing the link pointed at. */
    const params = new URLSearchParams('scope=all&articleId=article-1&highlightId=highlight-1');
    jest.spyOn(router, 'useSearchParams').mockReturnValue([params, jest.fn()]);

    renderLibrary();

    await waitFor(() => {
      expect(screen.getByTestId('library-reading-secondary-rail')).toHaveAttribute('open');
    });
  });

});
