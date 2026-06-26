import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  default: ({ left, main, right, rightTitle, rightToggleLabel, mainHeader, mainActions, leftOpen }) => (
    <div>
      {leftOpen ? <aside data-testid="library-left">{left}</aside> : null}
      <main data-testid="library-main">
        {mainHeader}
        {mainActions}
        {main}
      </main>
      <aside data-testid="library-right" aria-label={rightTitle}>
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
    unfiledCount
  }) => (
    <div>
      {selectedArticleId ? 'Reading article shell' : 'Browse library shell'}
      {!selectedArticleId ? (
        <>
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
        <button type="button" onClick={() => onSelectArticle('article-1')}>
          Open article
        </button>
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

  it('keeps the shared Thought partner visible in the default Library browse rail', () => {
    renderLibrary();

    const rightRail = screen.getByTestId('library-right');
    expect(rightRail).toHaveAccessibleName('Thought partner');
    expect(rightRail).toHaveTextContent('Library context visible');
    expect(rightRail).toHaveTextContent('themes: valuation, process');
    expect(screen.getByLabelText('Thought partner library trace')).toBeInTheDocument();
  });

  it('labels the Library right rail as the shared agent surface', () => {
    renderLibrary();

    expect(screen.getByTestId('library-right')).toHaveAccessibleName('Thought partner');
    expect(screen.getAllByRole('button', { name: 'Thought partner' }).length).toBeGreaterThan(0);
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

    expect(screen.getByTestId('library-reading-room-lead')).toBeInTheDocument();
    expect(screen.queryByTestId('library-left')).not.toBeInTheDocument();
  });

  it('starts the filing classification flow from the reading room lead action', async () => {
    renderLibrary();

    fireEvent.click(screen.getByRole('button', { name: 'Review filing suggestions' }));

    await waitFor(() => {
      expect(startLibraryFilingSuggestions).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/think?tab=threads&threadId=thread-filing-1');
  });

  it('keeps low-signal tag shortcuts out of the Cabinet saved-view shelf', () => {
    useTags.mockReturnValueOnce({
      tags: [{ tag: 'valuation' }, { tag: 'Blah' }, { tag: 'TEST' }],
      loading: false
    });

    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Cabinet' }));

    expect(screen.getByText('valuation')).toBeInTheDocument();
    expect(screen.queryByText('Blah')).not.toBeInTheDocument();
    expect(screen.queryByText('TEST')).not.toBeInTheDocument();
  });

  it('exposes an explicit low-signal review action from the reading room lead', () => {
    renderLibrary();

    expect(screen.getByRole('button', { name: 'Show review imports' })).toBeInTheDocument();
  });

  it('mounts the thought partner in the reading right rail with source context collapsed', async () => {
    renderLibrary();

    fireEvent.click(screen.getByRole('button', { name: 'Open article' }));

    await waitFor(() => {
      expect(screen.getByTestId('thought-partner-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('Reading article shell')).toBeInTheDocument();
    expect(screen.getByTestId('library-reading-secondary-rail')).not.toHaveAttribute('open');
  });
});
