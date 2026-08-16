import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as router from 'react-router-dom';
import Library from './Library';
import AgentRail from '../agent/AgentRail';
import { AgentRailProvider } from '../agent/AgentRailContext';
import { resetFirstPaint } from '../motion/columnMotion';
import useFolders from '../hooks/useFolders';
import useLibraryArticles from '../hooks/useLibraryArticles';
import useArticleDetail from '../hooks/useArticleDetail';
import { getConnectionsForItem } from '../api/connections';
import { chatWithAgent } from '../api/agent';

const mockNavigate = jest.fn();

jest.mock('../hooks/useFolders', () => jest.fn());
jest.mock('../hooks/useLibraryArticles', () => jest.fn());
jest.mock('../hooks/useArticleDetail', () => jest.fn());

jest.mock('../components/library/LibraryMain', () => ({
  __esModule: true,
  default: ({ selectedArticleId, selectedArticle }) => (
    <div data-testid="library-main">
      {selectedArticleId ? `Reading ${selectedArticle?.title || selectedArticleId}` : 'Cabinet shell'}
    </div>
  )
}));
jest.mock('../components/library/LibraryContext', () => ({
  __esModule: true,
  default: () => <div>Library context details</div>
}));
jest.mock('../components/library/MoveToFolderModal', () => () => null);
jest.mock('../components/library/LibraryConceptModal', () => () => null);
jest.mock('../components/library/LibraryNotebookModal', () => () => null);
jest.mock('../components/library/LibraryQuestionModal', () => () => null);
jest.mock('../components/references/ReferencePullIn', () => ({
  __esModule: true,
  default: ({ targetId }) => <div>Pull references for {targetId}</div>
}));

jest.mock('../api/articles', () => ({ moveArticleToFolder: jest.fn() }));
jest.mock('../api/questions', () => ({ createQuestion: jest.fn() }));
jest.mock('../api/connections', () => ({
  getConnectionsForItem: jest.fn().mockResolvedValue({ outgoing: [], incoming: [] })
}));
jest.mock('../api/workingMemory', () => ({ createWorkingMemory: jest.fn() }));
jest.mock('../api/highlights', () => ({ updateHighlight: jest.fn(), deleteHighlight: jest.fn() }));
jest.mock('../api/agent', () => ({ chatWithAgent: jest.fn() }));
jest.mock('../api/library', () => ({ startLibraryFilingSuggestions: jest.fn() }));
jest.mock('../hooks/useAuthHeaders', () => ({ getAuthHeaders: () => ({}) }));
jest.mock('../api', () => ({
  __esModule: true,
  default: { post: jest.fn(), put: jest.fn(), delete: jest.fn() }
}));

const articles = [
  {
    _id: 'article-1',
    title: 'Inside OpenAI’s Model Spec',
    source: 'SemiAnalysis',
    summary: 'A technical read of OpenAI’s Model Spec and what it signals.',
    highlights: [{ _id: 'h1' }, { _id: 'h2' }],
    updatedAt: '2026-08-12T10:00:00.000Z'
  },
  {
    _id: 'article-2',
    title: 'Nvidia 10-K Fiscal Year 2024',
    source: 'Nvidia',
    updatedAt: '2026-05-22T10:00:00.000Z'
  },
  {
    _id: 'article-3',
    title: 'The Sovereign Individual',
    author: 'James Dale Davidson',
    updatedAt: '1997-11-01T10:00:00.000Z'
  }
];

const renderLibrary = (search = '') => {
  jest.spyOn(router, 'useLocation').mockReturnValue({
    pathname: '/library', search, hash: '', state: null, key: 'test'
  });
  jest.spyOn(router, 'useSearchParams').mockImplementation(() => {
    const params = new URLSearchParams(search);
    return [params, setSearchParams];
  });
  return render(
    <AgentRailProvider>
      <Library />
      <AgentRail />
    </AgentRailProvider>
  );
};

let setSearchParams;

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetFirstPaint();
  localStorage.clear();
  setSearchParams = jest.fn();
  mockNavigate.mockReset();
  jest.spyOn(router, 'useNavigate').mockReturnValue(mockNavigate);
  useFolders.mockReturnValue({ folders: [], loading: false, error: '' });
  useLibraryArticles.mockReturnValue({
    articles,
    allArticles: articles,
    loading: false,
    error: '',
    setAllArticles: jest.fn()
  });
  useArticleDetail.mockReturnValue({
    article: null,
    highlights: [],
    references: [],
    loading: false,
    error: '',
    addHighlightOptimistic: jest.fn(),
    replaceHighlight: jest.fn(),
    removeHighlight: jest.fn()
  });
  getConnectionsForItem.mockResolvedValue({ outgoing: [], incoming: [] });
});

describe('the Library column', () => {
  it('is one thing to continue and then the shelf', async () => {
    renderLibrary();

    // The source with highlights in it is the one worth continuing.
    expect(await screen.findByText('Continue')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Inside OpenAI’s Model Spec');
    expect(screen.getByText('SemiAnalysis')).toBeInTheDocument();
    expect(screen.getByText(/A technical read of OpenAI’s Model Spec/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue →' })).toBeInTheDocument();

    // Everything else is a hairline list: title, source, date.
    const shelf = document.querySelector('.library-column__shelf');
    expect(within(shelf).getByText('Nvidia 10-K Fiscal Year 2024')).toBeInTheDocument();
    expect(within(shelf).getByText('James Dale Davidson')).toBeInTheDocument();
    expect(within(shelf).queryByText('Inside OpenAI’s Model Spec')).not.toBeInTheDocument();
  });

  it('keeps finding and saving in the column, with the cabinet beside it', () => {
    renderLibrary();

    // The cabinet is present as a faint shelf list, not as the face.
    const cabinet = screen.getByRole('navigation', { name: 'Shelves' });
    expect(within(cabinet).getByRole('button', { name: 'All sources' })).toHaveClass('is-open');
    expect(within(cabinet).getByRole('button', { name: /^Unfiled/ })).toBeInTheDocument();
    expect(within(cabinet).getByRole('button', { name: 'Highlights' })).toBeInTheDocument();
    expect(within(cabinet).getByRole('button', { name: 'Review filing' })).toBeInTheDocument();

    expect(screen.getByText('Find in library')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Install the saver' })).toHaveAttribute('href', expect.stringContaining('chromewebstore'));
    expect(screen.queryByText('Cabinet')).not.toBeInTheDocument();
    expect(screen.queryByText('Reading room for your saved work.')).not.toBeInTheDocument();
    expect(screen.queryByText('Clean up structure')).not.toBeInTheDocument();
    // The page still needs a heading; it just is not shouted over the reading.
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toHaveClass('sr-only');
  });

  it('mounts no second agent beside the shell rail', () => {
    renderLibrary();

    expect(screen.getAllByRole('complementary', { name: 'Agent' })).toHaveLength(1);
    expect(screen.queryByTestId('thought-partner-panel')).not.toBeInTheDocument();
  });

  it('opens a source into the reader in the same column', () => {
    renderLibrary();

    fireEvent.click(screen.getByRole('button', { name: 'Continue →' }));

    expect(localStorage.getItem('library.lastArticleId')).toBe('article-1');
    const withArticle = setSearchParams.mock.calls
      .map(([params]) => params)
      .filter(params => params?.get?.('articleId') === 'article-1');
    expect(withArticle.length).toBeGreaterThan(0);
  });
});

describe('returning to the Library', () => {
  it('reopens the source you were reading instead of the shelf you walked past', async () => {
    localStorage.setItem('library.lastArticleId', 'article-2');

    renderLibrary();

    await waitFor(() => expect(setSearchParams).toHaveBeenCalled());
    const [params, options] = setSearchParams.mock.calls[0];
    expect(params.get('articleId')).toBe('article-2');
    expect(options).toEqual({ replace: true });
  });

  it('does not override an explicit request for something else', async () => {
    localStorage.setItem('library.lastArticleId', 'article-2');

    renderLibrary('?scope=folder&folderId=f1');

    await waitFor(() => expect(useLibraryArticles).toHaveBeenCalled());
    expect(setSearchParams).not.toHaveBeenCalled();
  });
});

describe('the Library rail', () => {
  it('is about the shelf, and narrows to the source being read', async () => {
    renderLibrary();

    const rail = screen.getByRole('complementary', { name: 'Agent' });
    expect(await within(rail).findByText('3 sources on the shelf.')).toBeInTheDocument();
  });

  it('retrieves into the rail and keeps the line only when the human accepts', async () => {
    chatWithAgent.mockResolvedValue({ reply: 'Two of these sources disagree about capacity. More follows.' });

    renderLibrary();

    const rail = screen.getByRole('complementary', { name: 'Agent' });
    fireEvent.change(within(rail).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'what disagrees here' }
    });
    fireEvent.click(within(rail).getByRole('button', { name: 'Ask' }));

    expect(await within(rail).findByText('Two of these sources disagree about capacity.')).toBeInTheDocument();
    expect(chatWithAgent).toHaveBeenCalledWith(expect.objectContaining({
      message: 'what disagrees here',
      context: expect.objectContaining({ type: 'workspace', id: 'library' })
    }));
    expect(within(rail).getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });
});
