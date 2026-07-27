import React from 'react';
import { render, screen } from '@testing-library/react';
import LibraryMain from './LibraryMain';

let mockRelevancePayload;

jest.mock('./LibrarySourceMemory', () => function MockLibrarySourceMemory({ onDataChange }) {
  const ReactModule = require('react');
  ReactModule.useEffect(() => {
    onDataChange(mockRelevancePayload);
  }, [onDataChange]);
  return <div data-testid="source-memory">Source memory</div>;
});
jest.mock('./LibrarySourceList', () => function MockLibrarySourceList(props) {
  return (
    <div data-testid="source-list">
      {props.sources.length} sources · {props.paginationError || 'ready'}
    </div>
  );
});
jest.mock('./LibraryArticleList', () => function MockLibraryArticleList({ title }) {
  return <div data-testid="article-list">{title}</div>;
});
jest.mock('./LibraryReadingRoomLead', () => () => null);
jest.mock('./LibraryHighlights', () => () => null);
jest.mock('./LibrarySourceTrace', () => () => null);
jest.mock('../ArticleReader', () => () => null);

const baseProps = {
  selectedArticleId: '',
  selectedArticle: null,
  articleHighlights: [],
  articleGraphConnections: {},
  articleLoading: false,
  articleError: '',
  articles: [{ _id: 'article-1', title: 'Saved article' }],
  articlesLoading: false,
  articlesError: '',
  scope: 'all',
  selectedFolderName: '',
  allArticles: [{ _id: 'article-1', title: 'Saved article' }],
  onSelectArticle: jest.fn(),
  onMoveArticle: jest.fn(),
  sourceView: 'recent'
};

describe('LibraryMain mixed-source failure boundary', () => {
  it('keeps saved articles accessible when the initial mixed request fails', async () => {
    mockRelevancePayload = {
      loading: false,
      loadingMore: false,
      error: 'Mixed API unavailable.',
      paginationError: '',
      coverage: null,
      counts: {},
      sources: [],
      nextCursor: null,
      hasMore: false,
      filteredOutCount: 0,
      loadMore: jest.fn()
    };
    render(<LibraryMain {...baseProps} />);

    expect(await screen.findByTestId('article-list')).toHaveTextContent('offline fallback');
    expect(screen.queryByTestId('source-list')).not.toBeInTheDocument();
  });

  it('keeps loaded mixed rows visible when only cursor pagination fails', async () => {
    mockRelevancePayload = {
      loading: false,
      loadingMore: false,
      error: '',
      paginationError: 'Could not load more sources.',
      coverage: null,
      counts: { recent: { value: 1, exact: true } },
      sources: [{ source: { type: 'note', id: 'note-1', title: 'Saved note' } }],
      nextCursor: 'cursor-1',
      hasMore: true,
      filteredOutCount: 0,
      loadMore: jest.fn()
    };
    render(<LibraryMain {...baseProps} />);

    expect(await screen.findByTestId('source-list'))
      .toHaveTextContent('1 sources · Could not load more sources.');
    expect(screen.queryByTestId('article-list')).not.toBeInTheDocument();
  });
});
