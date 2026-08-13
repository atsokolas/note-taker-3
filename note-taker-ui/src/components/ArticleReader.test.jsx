import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ArticleReader from './ArticleReader';
import { createHighlight } from '../api/highlights';
import useTextSelection from './reader/useTextSelection';

jest.mock('../api/highlights', () => ({
  createHighlight: jest.fn()
}));
jest.mock('./reader/SelectionMenu', () => ({ onAddConcept }) => (
  <button type="button" onClick={onAddConcept}>Create concept</button>
));
jest.mock('./reader/MagneticReadingRail', () => () => <div data-testid="magnetic-reading-rail" />);
jest.mock('./reader/useTextSelection', () => jest.fn());
jest.mock('../tour/useTourSignal', () => () => jest.fn());

describe('ArticleReader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTextSelection.mockReturnValue({
      selectionState: {
        isOpen: false,
        text: '',
        rect: null,
        anchor: null
      },
      clearSelection: jest.fn()
    });
  });

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

  it('places source provenance outside the selectable article content', () => {
    const { container } = render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Investor letter',
          content: '<p>Cash flow discipline matters.</p>'
        }}
        highlights={[]}
        sourceTrace={<section data-testid="source-trace">Source provenance</section>}
      />
    );

    expect(screen.getByTestId('source-trace')).toBeInTheDocument();
    expect(container.querySelector('.article-reader-content [data-testid="source-trace"]')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('reuses an exact saved highlight before opening a Concept', async () => {
    const clearSelection = jest.fn();
    const savedHighlight = {
      _id: 'highlight-1',
      text: 'Cash flow discipline matters.',
      anchor: { text: 'Cash flow discipline matters.', startOffsetApprox: 0 }
    };
    useTextSelection.mockReturnValue({
      selectionState: {
        isOpen: true,
        text: 'Cash flow discipline matters.',
        rect: { top: 100, left: 100, width: 200 },
        anchor: { text: 'Cash flow discipline matters.', startOffsetApprox: 0 }
      },
      clearSelection
    });
    const onOpenConcept = jest.fn();

    render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Investor letter',
          content: '<p>Cash flow discipline matters.</p>'
        }}
        highlights={[savedHighlight]}
        onOpenConcept={onOpenConcept}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create concept' }));
    await waitFor(() => expect(onOpenConcept).toHaveBeenCalledWith(savedHighlight));
    expect(createHighlight).not.toHaveBeenCalled();
    expect(clearSelection).toHaveBeenCalled();
  });
});
