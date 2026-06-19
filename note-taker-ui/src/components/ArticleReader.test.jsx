import { render, screen } from '@testing-library/react';
import ArticleReader from './ArticleReader';

jest.mock('../api/highlights', () => ({
  createHighlight: jest.fn()
}));
jest.mock('./reader/SelectionMenu', () => () => <div data-testid="selection-menu" />);
jest.mock('./reader/MagneticReadingRail', () => () => <div data-testid="magnetic-reading-rail" />);
jest.mock('./reader/useTextSelection', () => () => ({
  selectionState: {
    isOpen: false,
    text: '',
    rect: null,
    anchor: null
  },
  clearSelection: jest.fn()
}));
jest.mock('../tour/useTourSignal', () => () => jest.fn());

describe('ArticleReader', () => {
  it('shows saved highlights as the reading body when an imported source has no full text', () => {
    render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Poor Charlie\'s Almanack',
          content: '',
          createdAt: '2026-06-07T00:00:00.000Z'
        }}
        highlights={[
          {
            _id: 'highlight-1',
            text: 'Invert, always invert.',
            note: 'Useful for decision-making.',
            tags: ['mental models'],
            createdAt: '2026-06-07T00:00:00.000Z'
          }
        ]}
      />
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Poor Charlie's Almanack");
    expect(screen.getByText('Highlight edition')).toBeInTheDocument();
    expect(screen.getByText(/No full article text was imported/)).toBeInTheDocument();
    expect(screen.getByText('Invert, always invert.')).toBeInTheDocument();
    expect(screen.getByText('Useful for decision-making.')).toBeInTheDocument();
    expect(screen.getByText('mental models')).toBeInTheDocument();
  });

  it('does not render the inline thought partner dock before article content', () => {
    render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Investor letter',
          content: '<p>Cash flow discipline matters.</p>',
          createdAt: '2026-06-07T00:00:00.000Z'
        }}
        highlights={[]}
      />
    );

    expect(screen.queryByTestId('thought-partner-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-skill-dock')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ask against the full article/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Investor letter');
    expect(screen.getByText('Cash flow discipline matters.')).toBeInTheDocument();
  });

  it('keeps a single page h1 when imported article HTML already includes an h1', () => {
    const { container } = render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Investor letter',
          content: '<h1>Investor letter</h1><p>Cash flow discipline matters.</p>',
          createdAt: '2026-06-07T00:00:00.000Z'
        }}
        highlights={[]}
      />
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Investor letter');
    expect(container.querySelector('.article-reader-content h1')).toBeNull();
    expect(container.querySelector('.article-reader-content h2')).not.toBeNull();
  });
});
