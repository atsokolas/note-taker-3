import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Library from './Library';
import useFolders from '../hooks/useFolders';
import useLibraryArticles from '../hooks/useLibraryArticles';
import useArticleDetail from '../hooks/useArticleDetail';
import useTags from '../hooks/useTags';
import { getConnectionsForItem } from '../api/connections';

jest.mock('../hooks/useFolders', () => jest.fn());
jest.mock('../hooks/useLibraryArticles', () => jest.fn());
jest.mock('../hooks/useArticleDetail', () => jest.fn());
jest.mock('../hooks/useTags', () => jest.fn());

jest.mock('../layout/ThreePaneLayout', () => ({
  __esModule: true,
  default: ({ left, main, right, rightTitle, rightToggleLabel, mainHeader, mainActions }) => (
    <div>
      <aside data-testid="library-left">{left}</aside>
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
  default: ({ selectedArticleId, articleQuery, onArticleQueryChange, onSelectArticle }) => (
    <div>
      {selectedArticleId ? 'Reading article shell' : 'Browse library shell'}
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

const renderLibrary = (path = '/library?scope=all') => render(
  <MemoryRouter initialEntries={[path]}>
    <Library />
  </MemoryRouter>
);

describe('Library agent rail', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    getConnectionsForItem.mockResolvedValue({ outgoing: [], incoming: [] });
    useFolders.mockReturnValue({
      folders: [],
      loading: false,
      error: ''
    });
    useLibraryArticles.mockReturnValue({
      articles: [],
      allArticles: [
        { _id: 'article-1', title: 'Investor letter', source: 'Library' }
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

    const leftRail = screen.getByTestId('library-left');
    const main = screen.getByTestId('library-main');

    expect(leftRail).not.toHaveTextContent('Article search');
    expect(leftRail).not.toHaveTextContent('Highlight search');
    expect(screen.getByLabelText('Search articles')).toBeInTheDocument();
    expect(main).toContainElement(screen.getByLabelText('Search articles'));
  });
});
