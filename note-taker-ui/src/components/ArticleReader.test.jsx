import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ArticleReader from './ArticleReader';
import { createHighlight } from '../api/highlights';
import { listWikiPages } from '../api/wiki';
import useTextSelection from './reader/useTextSelection';
import { resetFirstPaint } from '../motion/columnMotion';
import { useFinePointer, usePrefersReducedMotion } from '../hooks/useMotionPreferences';

jest.mock('../api/highlights', () => ({
  createHighlight: jest.fn()
}));
jest.mock('../api/wiki', () => ({
  listWikiPages: jest.fn(async () => [])
}));
jest.mock('./reader/SelectionMenu', () => ({ onAskLibrarian }) => (
  <button type="button" onClick={onAskLibrarian}>Ask about this</button>
));
jest.mock('./reader/MagneticReadingRail', () => () => <div data-testid="magnetic-reading-rail" />);
jest.mock('./reader/useTextSelection', () => jest.fn());
jest.mock('../tour/useTourSignal', () => () => jest.fn());
jest.mock('../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: jest.fn(() => false),
  useFinePointer: jest.fn(() => true)
}));

describe('ArticleReader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    resetFirstPaint();
    listWikiPages.mockResolvedValue([]);
    usePrefersReducedMotion.mockReturnValue(false);
    useFinePointer.mockReturnValue(true);
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

  it('puts a deep-linked saved passage in the reader when the imported body omits it', () => {
    const previousScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = jest.fn();
    const { container } = render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Abridged import',
          content: '<p>The imported body contains only a short summary.</p>'
        }}
        highlights={[{
          _id: 'highlight-1',
          text: 'The exact cited passage survives in the saved highlight.',
          note: 'The reader should land here.'
        }]}
        focusedHighlightId="highlight-1"
      />
    );

    const passage = screen.getByRole('complementary', { name: 'Saved passage' });
    expect(passage).toHaveTextContent('The exact cited passage survives in the saved highlight.');
    expect(passage).toHaveTextContent('The reader should land here.');
    expect(passage).toHaveAttribute('data-highlight-id', 'highlight-highlight-1');
    expect(container.querySelectorAll('[data-highlight-id="highlight-highlight-1"]')).toHaveLength(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(passage).toHaveClass('is-cited-passage');
    Element.prototype.scrollIntoView = previousScrollIntoView;
  });

  it('does not repeat a deep-linked passage already marked in the article body', () => {
    const { container } = render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Full import',
          content: '<p>The exact cited passage is already here.</p>'
        }}
        highlights={[{
          _id: 'highlight-1',
          text: 'The exact cited passage is already here.',
          anchor: { text: 'The exact cited passage is already here.', startOffsetApprox: 0 }
        }]}
        focusedHighlightId="highlight-1"
      />
    );

    expect(screen.queryByRole('complementary', { name: 'Saved passage' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-highlight-id="highlight-highlight-1"]')).toHaveLength(1);
  });

  it('does not repeat a deep-linked passage in a highlight-only import', () => {
    const { container } = render(
      <ArticleReader
        article={{ _id: 'article-1', title: 'Highlight-only import', content: '' }}
        highlights={[{
          _id: 'highlight-1',
          text: 'The saved highlight is already the reading body.'
        }]}
        focusedHighlightId="highlight-1"
      />
    );

    expect(screen.queryByRole('complementary', { name: 'Saved passage' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-highlight-id="highlight-highlight-1"]')).toHaveLength(1);
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

  it('lets a saved passage answer a held judgment from the direct article reader', async () => {
    listWikiPages.mockResolvedValue([{
      _id: 'judgment-1',
      title: 'Capacity judgment',
      judgment: {
        currentJudgment: 'Deliverable capacity still lags demand.',
        why: [],
        against: []
      }
    }]);

    render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Capacity field notes',
          content: '<p>Deliverable capacity lags demand by two years.</p>'
        }}
        highlights={[{
          _id: 'highlight-1',
          text: 'Deliverable capacity lags demand by two years.'
        }]}
      />
    );

    expect(await screen.findByTestId('passage-door-offer')).toHaveTextContent(
      'Deliverable capacity still lags demand.'
    );
    expect(screen.getByRole('button', { name: 'Why' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Against' })).toBeInTheDocument();
    expect(listWikiPages).toHaveBeenCalledTimes(1);
  });

  /* Asking about a sentence saves it first, so the answer has something to
     point at. Asking about one you already kept must not keep it twice. */
  it('reuses an exact saved highlight before opening the agent', async () => {
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
    const onAskLibrarian = jest.fn();

    render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Investor letter',
          content: '<p>Cash flow discipline matters.</p>'
        }}
        highlights={[savedHighlight]}
        onAskLibrarian={onAskLibrarian}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ask about this' }));
    await waitFor(() => expect(onAskLibrarian).toHaveBeenCalledWith(savedHighlight));
    expect(createHighlight).not.toHaveBeenCalled();
    expect(clearSelection).toHaveBeenCalled();
  });

  /* Every article opened onto a panel: the source record -- who wrote it, when
     it was saved, where else it is used -- sat between the headline and the
     first paragraph. Same record, read after the piece instead of instead of
     starting it. */
  it('opens onto the article, with the source record after the text', () => {
    render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Investor letter',
          content: '<p>Cash flow discipline matters.</p>'
        }}
        highlights={[]}
        sourceTrace={<div data-testid="source-record">Source record</div>}
      />
    );

    const record = screen.getByTestId('source-record');
    const content = document.querySelector('.article-reader-content');
    expect(record).toBeInTheDocument();
    expect(content.compareDocumentPosition(record) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('keeping a source for life', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetFirstPaint();
    listWikiPages.mockResolvedValue([]);
    useTextSelection.mockReturnValue({
      selectionState: { isOpen: false, text: '', rect: null, anchor: null },
      clearSelection: jest.fn()
    });
  });

  it('offers the mark, and settles it the moment it is pressed', async () => {
    const onToggleEvergreen = jest.fn().mockResolvedValue({ evergreen: true });
    render(
      <ArticleReader
        article={{ _id: 'a1', title: 'The Bitter Lesson', content: '<p>Text.</p>' }}
        highlights={[]}
        onToggleEvergreen={onToggleEvergreen}
      />
    );

    const keep = screen.getByRole('button', { name: 'Keep for good' });
    expect(keep).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(keep);

    await waitFor(() => expect(onToggleEvergreen).toHaveBeenCalledWith('a1', true));
    // It states the fact about the thing, rather than the pending action.
    expect(await screen.findByRole('button', { name: 'Kept for good' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('still reads as kept after the source is reloaded from what the server stored', async () => {
    const onToggleEvergreen = jest.fn().mockResolvedValue({ evergreen: true, evergreenAt: '2026-08-29T12:00:00.000Z' });
    const { rerender } = render(
      <ArticleReader
        article={{ _id: 'a1', title: 'The Bitter Lesson', content: '<p>Text.</p>' }}
        highlights={[]}
        onToggleEvergreen={onToggleEvergreen}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep for good' }));
    expect(await screen.findByRole('button', { name: 'Kept for good' })).toHaveAttribute('aria-pressed', 'true');

    rerender(
      <ArticleReader
        article={{
          _id: 'a1',
          title: 'The Bitter Lesson',
          content: '<p>Text.</p>',
          evergreen: true,
          evergreenAt: '2026-08-29T12:00:00.000Z'
        }}
        highlights={[]}
        onToggleEvergreen={onToggleEvergreen}
      />
    );

    expect(screen.getByRole('button', { name: 'Kept for good' })).toHaveAttribute('aria-pressed', 'true');
  });

  /* It sat in the meta line as a grey word between a date and a link, which
     read as another label rather than something you could do. It belongs with
     Move: the other thing you can do to a source. */
  it('sits with the actions, not in the row of metadata labels', () => {
    render(
      <ArticleReader
        article={{ _id: 'a1', title: 'A source', content: '<p>Text.</p>' }}
        highlights={[]}
        onMove={() => {}}
        onToggleEvergreen={jest.fn()}
      />
    );
    const keep = screen.getByRole('button', { name: 'Keep for good' });
    const move = screen.getByRole('button', { name: 'Move' });
    expect(keep.parentElement).toBe(move.parentElement);
    expect(document.querySelector('.article-reader-meta').contains(keep)).toBe(false);
  });

  it('is absent where nothing can be kept', () => {
    render(<ArticleReader article={{ _id: 'a1', title: 'A source', content: '<p>Text.</p>' }} highlights={[]} />);
    expect(screen.queryByRole('button', { name: 'Keep for good' })).not.toBeInTheDocument();
  });
});

describe('Later and Set aside', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetFirstPaint();
    listWikiPages.mockResolvedValue([]);
    useTextSelection.mockReturnValue({
      selectionState: { isOpen: false, text: '', rect: null, anchor: null },
      clearSelection: jest.fn()
    });
  });

  it('sit beside Keep as two different words, and swap rather than stack', async () => {
    const onTogglePlacement = jest.fn().mockResolvedValue({ placement: 'later' });
    render(
      <ArticleReader
        article={{ _id: 'a1', title: 'A source', content: '<p>Text.</p>' }}
        highlights={[]}
        onToggleEvergreen={jest.fn()}
        onTogglePlacement={onTogglePlacement}
      />
    );

    const later = screen.getByRole('button', { name: 'Later' });
    const aside = screen.getByRole('button', { name: 'Set aside' });
    const keep = screen.getByRole('button', { name: 'Keep for good' });
    expect(later.parentElement).toBe(keep.parentElement);
    expect(aside.parentElement).toBe(keep.parentElement);
    expect(later.parentElement).toHaveClass('article-reader-decisions');

    fireEvent.click(later);
    await waitFor(() => expect(onTogglePlacement).toHaveBeenCalledWith('a1', 'later'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Later' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Set aside' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('returns home when the active word is pressed again', async () => {
    const onTogglePlacement = jest.fn().mockResolvedValue({ placement: 'stream' });
    render(
      <ArticleReader
        article={{ _id: 'a1', title: 'A source', content: '<p>Text.</p>', placement: 'setAside' }}
        highlights={[]}
        onTogglePlacement={onTogglePlacement}
      />
    );

    const aside = screen.getByRole('button', { name: 'Set aside' });
    expect(aside).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(aside);
    await waitFor(() => expect(onTogglePlacement).toHaveBeenCalledWith('a1', 'stream'));
  });
});

describe('the folio line', () => {
  const relatedClaim = (extras = {}) => ({
    _id: extras._id || 'wiki-compute',
    title: extras.title || 'Compute',
    updatedAt: extras.updatedAt || '2026-08-01T00:00:00.000Z',
    evergreen: Boolean(extras.evergreen),
    sourceRefs: extras.sourceRefs || [{
      _id: 'src-1',
      type: 'article',
      objectId: 'article-1'
    }],
    judgment: {
      currentJudgment: extras.currentJudgment || 'Compute stays scarce.',
      why: extras.why || []
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    resetFirstPaint();
    listWikiPages.mockResolvedValue([]);
    usePrefersReducedMotion.mockReturnValue(false);
    useFinePointer.mockReturnValue(true);
    useTextSelection.mockReturnValue({
      selectionState: { isOpen: false, text: '', rect: null, anchor: null },
      clearSelection: jest.fn()
    });
  });

  const renderReader = (props = {}) => render(
    <ArticleReader
      article={{
        _id: 'article-1',
        title: 'On compute',
        content: '<p>Capacity still lags demand.</p>'
      }}
      highlights={[]}
      {...props}
    />
  );

  it('shows the held sentence and opens that claim', async () => {
    listWikiPages.mockResolvedValue([relatedClaim({
      title: 'NVIDIA',
      currentJudgment: 'Demand still outruns deliverable capacity.'
    })]);
    renderReader();

    const folio = await screen.findByTestId('article-folio');
    expect(folio).toHaveTextContent('Demand still outruns deliverable capacity.');
    expect(folio).toHaveAttribute('href', '/judgment/wiki-compute');
    expect(folio).toHaveClass('article-folio');
  });

  it('is absent on an unrelated source, with no empty state', async () => {
    listWikiPages.mockResolvedValue([relatedClaim({
      sourceRefs: [{ _id: 'src-9', type: 'article', objectId: 'article-9' }]
    })]);
    renderReader();

    await waitFor(() => expect(listWikiPages).toHaveBeenCalledWith({ limit: 500, summary: 1 }));
    expect(screen.queryByTestId('article-folio')).not.toBeInTheDocument();
    expect(screen.queryByText(/what you hold/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no claim/i)).not.toBeInTheDocument();
  });

  it('stays the opinion sentence when the case is unnamed', async () => {
    const sentence = 'A written process improves judgment.';
    listWikiPages.mockResolvedValue([relatedClaim({
      title: sentence,
      currentJudgment: sentence
    })]);
    renderReader();

    expect(await screen.findByTestId('article-folio')).toHaveTextContent(sentence);
  });

  it('prefers the claim named on the URL when several cite the source', async () => {
    listWikiPages.mockResolvedValue([
      relatedClaim({
        _id: 'newer',
        currentJudgment: 'The newer claim.',
        updatedAt: '2026-08-20T00:00:00.000Z'
      }),
      relatedClaim({
        _id: 'older',
        currentJudgment: 'The older claim.',
        updatedAt: '2026-01-01T00:00:00.000Z'
      })
    ]);
    renderReader({ preferredClaimId: 'older' });

    const folio = await screen.findByTestId('article-folio');
    expect(folio).toHaveTextContent('The older claim.');
    expect(folio).toHaveAttribute('href', '/judgment/older');
    expect(screen.queryByText('The newer claim.')).not.toBeInTheDocument();
  });

  it('arrives with opacity only when motion is reduced', async () => {
    usePrefersReducedMotion.mockReturnValue(true);
    listWikiPages.mockResolvedValue([relatedClaim()]);
    renderReader();

    const folio = await screen.findByTestId('article-folio');
    expect(folio).toHaveClass('is-arriving');
    expect(folio).toHaveClass('is-reduced');
  });

  it('can take the claim from a graph connection when the ledger is silent', async () => {
    listWikiPages.mockResolvedValue([relatedClaim({
      _id: 'wiki-graph',
      currentJudgment: 'Rates still matter.',
      sourceRefs: []
    })]);
    renderReader({
      graphConnections: {
        outgoing: [{ toType: 'wiki_page', toId: 'wiki-graph' }],
        incoming: []
      }
    });

    const folio = await screen.findByTestId('article-folio');
    expect(folio).toHaveTextContent('Rates still matter.');
    expect(folio).toHaveAttribute('href', '/judgment/wiki-graph');
  });
});
