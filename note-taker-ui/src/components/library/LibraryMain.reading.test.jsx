import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibraryMain from './LibraryMain';

jest.mock('../ArticleReader', () => function ArticleReaderMock({ article }) {
  return <div data-testid="article-reader">{article?.title}</div>;
});

const renderReadingRoom = (props = {}) => {
  const onSelectArticle = jest.fn();
  const onRetryArticle = jest.fn();
  const rendered = render(
    <LibraryMain
      selectedArticleId="article-1"
      selectedArticle={null}
      articleHighlights={[]}
      articleGraphConnections={{ notebookBlocks: [], collections: [] }}
      articleLoading={false}
      articleError=""
      articleErrorKind=""
      onSelectArticle={onSelectArticle}
      onRetryArticle={onRetryArticle}
      scope="all"
      {...props}
    />
  );
  return { ...rendered, onSelectArticle, onRetryArticle };
};

describe('LibraryMain reading recovery', () => {
  it('keeps loading distinct from missing or failed', () => {
    const { container } = renderReadingRoom({ articleLoading: true });

    expect(container.querySelector('.think-concept-loading')).not.toBeNull();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('article-reader')).not.toBeInTheDocument();
  });

  it('explains a missing source and returns to the Library', () => {
    const { onSelectArticle } = renderReadingRoom({
      articleError: 'This source is no longer available in your Library.',
      articleErrorKind: 'missing'
    });

    expect(screen.getByRole('heading', { name: 'This source left the shelf.' })).toBeInTheDocument();
    expect(screen.getByText('It may have been deleted since this link was made.')).toBeInTheDocument();
    expect(screen.queryByTestId('article-reader')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Library' }));
    expect(onSelectArticle).toHaveBeenCalledWith('');
  });

  it('holds the exact place and retries a transient failure', () => {
    const { onRetryArticle } = renderReadingRoom({
      articleError: 'Library could not open this source.',
      articleErrorKind: 'failed'
    });

    expect(screen.getByRole('heading', { name: 'The shelf did not answer.' })).toBeInTheDocument();
    expect(screen.getByText('Your place is held. Try again when the connection settles.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryArticle).toHaveBeenCalledTimes(1);
  });

  it('keeps a readable copy visible when only refresh fails', () => {
    renderReadingRoom({
      selectedArticle: { _id: 'article-1', title: 'A source worth keeping' },
      articleError: 'Library could not open this source.',
      articleErrorKind: 'failed'
    });

    expect(screen.getByTestId('article-reader')).toHaveTextContent('A source worth keeping');
    expect(screen.getByRole('status')).toHaveTextContent('Your reading copy is still here.');
    expect(screen.queryByRole('heading', { name: 'The shelf did not answer.' })).not.toBeInTheDocument();
  });
});
