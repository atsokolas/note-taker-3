import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ArticleReader from './ArticleReader';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import * as Router from 'react-router-dom';
import { writeReturnTicket } from './wiki/open-sentence/openSentenceJourney';
import { createHighlight } from '../api/highlights';
import { libraryExplorations } from '../api/authoredExplorations';
jest.mock('../api/authoredExplorations', () => ({
  ...jest.requireActual('../api/authoredExplorations'),
  libraryExplorations: { load: jest.fn(), save: jest.fn(), keep: jest.fn(), discard: jest.fn() }
}));
import { listWikiPages } from '../api/wiki';
import useTextSelection from './reader/useTextSelection';
import { handOffSentence, resetFirstPaint } from '../motion/columnMotion';
import { useFinePointer, usePrefersReducedMotion } from '../hooks/useMotionPreferences';
import {
  ARTICLE_PASSAGE_FRAGMENT_LIMIT,
  buildArticlePassageHref
} from '../utils/articlePassageAnchor';
import { cleanSourceTextForDisplay } from '../utils/sourceDisplayText';
import { passageFromSelection } from './wiki/open-sentence/LibraryPassagePicker';

jest.mock('../api/highlights', () => ({
  createHighlight: jest.fn()
}));
jest.mock('../api/wiki', () => ({
  listWikiPages: jest.fn(async () => [])
}));
jest.mock('./reader/SelectionMenu', () => ({ onAskLibrarian, onWorkWithPassage }) => (
  <><button type="button" onClick={onAskLibrarian}>Ask about this</button>
  <button type="button" onClick={onWorkWithPassage}>Work with this passage</button></>
));
jest.mock('./reader/MagneticReadingRail', () => () => <div data-testid="magnetic-reading-rail" />);
jest.mock('./reader/useTextSelection', () => jest.fn());
jest.mock('../tour/useTourSignal', () => () => jest.fn());
jest.mock('../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: jest.fn(() => false),
  useFinePointer: jest.fn(() => true)
}));
jest.mock('../motion/columnMotion', () => {
  const actual = jest.requireActual('../motion/columnMotion');
  return {
    ...actual,
    handOffSentence: jest.fn((...args) => actual.handOffSentence(...args))
  };
});

beforeEach(() => {
  libraryExplorations.load.mockResolvedValue({ userId: 'owner-1', explorations: [] });
});

describe('ArticleReader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    libraryExplorations.save.mockImplementation(async (articleId, highlightId, payload) => ({ articleId, highlightId, revision: payload.expectedRevision + 1, draft: payload.draft, keeps: [] }));
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/library?articleId=article-1');
    jest.spyOn(Router, 'useLocation').mockImplementation(() => ({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }));
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

  it('stays readable while no article is selected', () => {
    render(<ArticleReader />);
    expect(screen.getByText('Select an article to start reading.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Read fresh' })).not.toBeInTheDocument();
    expect(libraryExplorations.load).not.toHaveBeenCalled();
  });

  it('reads fresh without remounting writing, changing footnotes or saving on Escape', async () => {
    window.history.replaceState({}, '', '/library?articleId=article-1&highlightId=highlight-1&exploration=1');
    libraryExplorations.load.mockResolvedValue({ userId: 'owner-1', explorations: [{ highlightId: 'highlight-1', revision: 2, draft: { writing: 'Words worth keeping.', originalText: 'A source sentence.' } }] });
    const onOpenedSentence = jest.fn();
    const article = { _id: 'article-1', content: '<p>A source sentence. <a href="#footnote-1">[1]</a></p><p id="footnote-1">The original footnote.</p>' };
    render(<ArticleReader article={article} highlights={[{ _id: 'highlight-1', text: 'A source sentence.' }]} focusedHighlightId="highlight-1" onOpenedSentence={onOpenedSentence} />);
    const writing = await screen.findByRole('textbox', { name: 'Your writing' });
    await waitFor(() => expect(writing).toHaveValue('Words worth keeping.'));
    const footnote = screen.getByText('The original footnote.');
    fireEvent.click(screen.getByRole('button', { name: 'Read fresh' }));
    expect(screen.getByRole('button', { name: 'Show my work' })).toHaveAttribute('aria-pressed', 'true');
    expect(onOpenedSentence).toHaveBeenLastCalledWith('');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Show my work' }));
    expect(screen.getByRole('textbox', { name: 'Your writing' })).toBe(writing);
    expect(writing).toHaveValue('Words worth keeping.');
    expect(screen.getByText('The original footnote.')).toBe(footnote);
    expect(screen.getByRole('link', { name: '[1]' })).toHaveAttribute('href', '#footnote-1');
    expect(onOpenedSentence).toHaveBeenLastCalledWith('A source sentence.');
    expect(libraryExplorations.load).toHaveBeenCalledTimes(1);
    expect(libraryExplorations.save).not.toHaveBeenCalled();
  });

  it('finds authored work from the article itself without a requested highlight', async () => {
    libraryExplorations.load.mockResolvedValue({ userId: 'owner-1', explorations: [{ highlightId: 'highlight-1', revision: 1, draft: { title: 'A thought from this source', writing: 'My own words.', returnNote: 'Try another example.' } }] });
    const onOpenedSentence = jest.fn();
    render(<MemoryRouter><ArticleReader article={{ _id: 'article-1', content: 'An exact passage.' }} highlights={[{ _id: 'highlight-1', text: 'An exact passage.' }]} onOpenedSentence={onOpenedSentence} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'A thought from this source' })).toBeVisible();
    expect(screen.getByText('Try another example.')).toBeVisible();
    expect(screen.queryByLabelText('Your writing')).not.toBeInTheDocument();
    expect(onOpenedSentence).not.toHaveBeenCalled();
    expect(libraryExplorations.save).not.toHaveBeenCalled();
  });

  it('keeps the recovery route mounted when the requested highlight disappears', async () => {
    libraryExplorations.load.mockResolvedValue({ userId: 'owner-1', explorations: [{ highlightId: 'highlight-gone', revision: 1, draft: { writing: 'The mark went away; the thought did not.', originalText: 'Earlier quotation.' } }] });
    render(<MemoryRouter><ArticleReader article={{ _id: 'article-1', content: 'The article still reads normally.' }} highlights={[]} focusedHighlightId="highlight-gone" /></MemoryRouter>);
    expect(await screen.findByText('The mark went away; the thought did not.', { selector: 'summary' })).toBeVisible();
    expect(screen.getByText('Earlier quotation.')).toBeVisible();
    expect(screen.getByText('The article still reads normally.')).toBeVisible();
    expect(libraryExplorations.save).not.toHaveBeenCalled();
  });

  it('saves the exact selected passage and opens writing while preserving Library scope', async () => {
    window.history.replaceState({}, '', '/library?scope=kept&folder=folder-1');
    const selection = { text: 'A passage worth working with.', anchor: { prefix: 'Before. ', suffix: ' After.', startOffsetApprox: 8 }, isOpen: true };
    useTextSelection.mockReturnValue({ selectionState: selection, clearSelection: jest.fn() });
    createHighlight.mockResolvedValue({ _id: 'highlight-new' });
    render(<MemoryRouter initialEntries={['/library?scope=kept&folder=folder-1']}>
      <ArticleReader article={{ _id: 'article-1', title: 'A real source', content: selection.text }} highlights={[]} />
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Work with this passage' }));
    await waitFor(() => expect(useNavigate()).toHaveBeenCalledWith({ pathname: '/library', search: 'scope=kept&folder=folder-1&articleId=article-1&highlightId=highlight-new&exploration=1', hash: '' }));
    expect(createHighlight).toHaveBeenCalledWith(expect.objectContaining({ articleId: 'article-1', text: selection.text, anchor: selection.anchor }));
  });

  it('explains an oversized passage before creating a highlight', () => {
    const text = 'a'.repeat(4001);
    useTextSelection.mockReturnValue({ selectionState: { text, isOpen: true }, clearSelection: jest.fn() });
    render(<ArticleReader article={{ _id: 'article-1', content: text }} highlights={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Work with this passage' }));
    expect(screen.getByText('Choose a passage of 4000 characters or fewer to start writing.')).toBeInTheDocument();
    expect(createHighlight).not.toHaveBeenCalled();
  });

  it('restores durable Library writing after leaving, without saving merely to read it', async () => {
    const article = { _id: 'article-1', title: 'A real source', content: 'An exact passage.' };
    const highlight = { _id: 'highlight-1', text: 'An exact passage.' };
    let saved;
    libraryExplorations.save.mockImplementation(async (articleId, highlightId, payload) => {
      saved = { articleId, highlightId, revision: payload.expectedRevision + 1, draft: payload.draft, keeps: [] };
      return saved;
    });
    const reader = () => <MemoryRouter initialEntries={['/library?articleId=article-1&highlightId=highlight-1&exploration=1']}>
      <ArticleReader article={article} highlights={[highlight]} focusedHighlightId="highlight-1" />
    </MemoryRouter>;
    window.history.replaceState({}, '', '/library?articleId=article-1&highlightId=highlight-1&exploration=1');
    const first = render(reader());
    const writing = await screen.findByRole('textbox', { name: 'Your writing' });
    await waitFor(() => expect(writing).toBeEnabled());
    fireEvent.change(writing, { target: { value: 'My own distinction.' } });
    await screen.findByText('Saved privately');
    expect(saved.draft.originalText).toBe(highlight.text);
    first.unmount();
    libraryExplorations.load.mockResolvedValue({ userId: 'owner-1', explorations: [saved] });
    libraryExplorations.save.mockClear();
    render(reader());
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Your writing' })).toHaveValue('My own distinction.'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Close', exact: true })[0]);
    expect(libraryExplorations.save).not.toHaveBeenCalled();
  });

  it('returns an exact excerpt to its originating authored pocket without opening a Library experiment', () => {
    listWikiPages.mockImplementation(() => new Promise(() => {}));
    const passage = 'A second attempt remains possible.';
    const anchor = { text: passage, prefix: '', suffix: '', startOffsetApprox: 0 };
    writeReturnTicket({ articleId: 'article-1', pageId: 'wiki-1', pageTitle: 'Product strategy', claimId: 'claim-1', sentence: 'Try the smallest experiment.', passage, anchor, reopen: true });
    window.history.replaceState({}, '', buildArticlePassageHref({ articleId: 'article-1', anchor }));
    render(<MemoryRouter><ArticleReader article={{ _id: 'article-1', title: 'Nomad', content: `<p>${passage}</p>` }} highlights={[]} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Back to Product strategy →' })).toHaveAttribute('href', '/wiki/read/wiki-1?claimId=claim-1&exploration=1');
    expect(screen.getByText(/You were holding Try the smallest experiment/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    expect(createHighlight).not.toHaveBeenCalled();
  });

  it('opens an exact article-excerpt fragment as a transient passage without saving it', () => {
    listWikiPages.mockImplementation(() => new Promise(() => {}));
    const previousScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = jest.fn();
    const content = 'There must be room to be wrong without losing the next attempt.';
    const href = buildArticlePassageHref({
      articleId: 'article-1',
      anchor: {
        text: 'room to be wrong',
        prefix: 'There must be ',
        suffix: ' without losing the next attempt.',
        startOffsetApprox: 14
      }
    });
    window.history.replaceState({}, '', href);

    render(
      <ArticleReader
        article={{ _id: 'article-1', title: 'Parenting', content: `<p>${content}</p>` }}
        highlights={[]}
      />
    );

    const transient = screen.getByText('room to be wrong');
    expect(transient).toHaveTextContent('room to be wrong');
    expect(transient).toHaveClass('article-passage-return', 'is-cited-passage');
    expect(transient).not.toHaveAttribute('data-highlight-id');
    expect(createHighlight).not.toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    Element.prototype.scrollIntoView = previousScrollIntoView;
  });

  it('returns a canonical chooser selection to its exact paragraph and decoded entities', () => {
    listWikiPages.mockImplementation(() => new Promise(() => {}));
    const content = '<p>Before &amp; context.</p><p>Second &amp; chosen paragraph.</p><p>After.</p>';
    const text = cleanSourceTextForDisplay(content);
    const passage = 'Second & chosen paragraph.';
    const start = text.indexOf(passage);
    const selected = passageFromSelection({
      article: { _id: 'article-1', title: 'Three paragraphs' },
      text,
      start,
      end: start + passage.length
    });
    window.history.replaceState({}, '', selected.href);

    render(
      <ArticleReader
        article={{ _id: 'article-1', title: 'Three paragraphs', content }}
        highlights={[]}
      />
    );

    expect(screen.getByText(passage)).toHaveAttribute('data-transient-passage', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(createHighlight).not.toHaveBeenCalled();
  });

  it('keeps normal reading and saved highlights intact beside a transient passage return', () => {
    listWikiPages.mockImplementation(() => new Promise(() => {}));
    const content = 'A saved fact sits here. The exact private excerpt follows.';
    const href = buildArticlePassageHref({
      articleId: 'article-1',
      anchor: {
        text: 'exact private excerpt',
        prefix: 'A saved fact sits here. The ',
        suffix: ' follows.',
        startOffsetApprox: 28
      }
    });
    window.history.replaceState({}, '', href);
    render(
      <ArticleReader
        article={{ _id: 'article-1', title: 'Two kinds of ink', content: `<p>${content}</p>` }}
        highlights={[{ _id: 'saved-1', text: 'A saved fact', anchor: { text: 'A saved fact', prefix: '', suffix: ' sits here.', startOffsetApprox: 0 } }]}
      />
    );

    expect(screen.getByText('A saved fact')).toHaveAttribute('data-highlight-id', 'highlight-saved-1');
    expect(screen.getByText('exact private excerpt')).toHaveAttribute('data-transient-passage', 'true');
    expect(screen.queryByRole('complementary', { name: 'Saved passage' })).not.toBeInTheDocument();
  });

  it('states when an exact historical excerpt changed while leaving the article readable', () => {
    listWikiPages.mockImplementation(() => new Promise(() => {}));
    const href = buildArticlePassageHref({
      articleId: 'article-1',
      anchor: {
        text: 'room to be wrong',
        prefix: 'There must be ',
        suffix: ' without losing the next attempt.',
        startOffsetApprox: 14
      }
    });
    window.history.replaceState({}, '', href);
    render(
      <ArticleReader
        article={{ _id: 'article-1', title: 'Changed source', content: '<p>There must be room to recover.</p>' }}
        highlights={[]}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('no longer present exactly');
    expect(screen.getByText('There must be room to recover.')).toBeInTheDocument();
  });

  it('ignores a passage fragment when the open Library route names another article', () => {
    listWikiPages.mockImplementation(() => new Promise(() => {}));
    const href = buildArticlePassageHref({
      articleId: 'article-1',
      anchor: {
        text: 'room to be wrong',
        prefix: 'There must be ',
        suffix: ' without losing the next attempt.',
        startOffsetApprox: 14
      }
    });
    window.history.replaceState({}, '', href.replace('articleId=article-1', 'articleId=article-2'));
    render(
      <ArticleReader
        article={{ _id: 'article-1', title: 'Parenting', content: '<p>There must be room to be wrong without losing the next attempt.</p>' }}
        highlights={[]}
      />
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('There must be room to be wrong without losing the next attempt.')).toBeInTheDocument();
  });

  it('reports malformed and oversized passage fragments without disturbing the article', () => {
    listWikiPages.mockImplementation(() => new Promise(() => {}));
    window.history.replaceState({}, '', '/library?articleId=article-1#passage=%7Bbad');
    render(
      <ArticleReader
        article={{ _id: 'article-1', title: 'Still readable', content: '<p>The article remains.</p>' }}
        highlights={[]}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('could not be read');
    expect(screen.getByText('The article remains.')).toBeInTheDocument();

    act(() => {
      window.history.replaceState({}, '', `/library?articleId=article-1#passage=${'x'.repeat(ARTICLE_PASSAGE_FRAGMENT_LIMIT + 1)}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('could not be read');
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

  it('lets the focused passage open in place without leaving the article', () => {
    render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Abridged import',
          content: '<p>The imported body contains only a short summary.</p>'
        }}
        highlights={[{
          _id: 'highlight-1',
          text: 'The exact cited passage survives in the saved highlight.'
        }]}
        focusedHighlightId="highlight-1"
      />
    );

    expect(screen.queryByLabelText('Try a narrower wording')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByLabelText('Opened sentence')).toBeInTheDocument();
    expect(screen.getByText(/The saved passage still reads/)).toHaveTextContent(
      'The exact cited passage survives in the saved highlight.'
    );
    expect(screen.queryByRole('link', { name: 'Open in Library →' })).not.toBeInTheDocument();
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

  /* Rewritten for the switch. These three used to assert two separate words
     and a Remind me beside them; the fact they were protecting — exclusivity,
     pressing the active position sends it home, and the vow sits outside the
     mechanics — is what is asserted here instead. */

  /* An unparked source is offered the two piles and nothing else. Home used to
     sit there as a permanently lit third position that did nothing when
     pressed — which, on an ordinary source, was the whole control. */
  it('offers a source at home the two piles it could go to', async () => {
    const onTogglePlacement = jest.fn().mockResolvedValue({ placement: 'later' });
    render(
      <ArticleReader
        article={{ _id: 'a1', title: 'A source', content: '<p>Text.</p>' }}
        highlights={[]}
        onToggleEvergreen={jest.fn()}
        onTogglePlacement={onTogglePlacement}
      />
    );

    const group = screen.getByRole('group', { name: 'Where this sits' });
    const later = within(group).getByRole('button', { name: 'Put it in later' });
    const toggles = within(group).getAllByRole('button').filter(b => b.hasAttribute('aria-pressed'));
    expect(toggles).toHaveLength(2);
    expect(toggles.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true);

    fireEvent.click(later);
    await waitFor(() => expect(onTogglePlacement).toHaveBeenCalledWith('a1', 'later'));
  });

  it('keeps the vow outside the switch, because a vow is not a position', () => {
    render(
      <ArticleReader
        article={{ _id: 'a1', title: 'A source', content: '<p>Text.</p>' }}
        highlights={[]}
        onToggleEvergreen={jest.fn()}
        onTogglePlacement={jest.fn()}
      />
    );

    const keep = screen.getByRole('button', { name: 'Keep for good' });
    const group = screen.getByRole('group', { name: 'Where this sits' });
    expect(group.contains(keep)).toBe(false);
    expect(keep.closest('.article-reader-decisions')).toBeTruthy();
  });

  it('returns home when the position it already sits in is pressed again', async () => {
    const onTogglePlacement = jest.fn().mockResolvedValue({ placement: 'stream' });
    render(
      <ArticleReader
        article={{ _id: 'a1', title: 'A source', content: '<p>Text.</p>', placement: 'setAside' }}
        highlights={[]}
        onTogglePlacement={onTogglePlacement}
      />
    );

    /* The pile you are in is the way out of it, and now the button says so
       rather than leaving the reader to discover it by pressing a lit
       control and seeing what happens. */
    const aside = screen.getByRole('button', { name: 'Take it back home' });
    expect(aside).toHaveAttribute('aria-pressed', 'true');
    expect(aside).toHaveTextContent('SET ASIDE');
    fireEvent.click(aside);
    await waitFor(() => expect(onTogglePlacement).toHaveBeenCalledWith('a1', 'stream'));
  });

  it('grows a clock cap only once something is parked', () => {
    const { rerender } = render(
      <ArticleReader
        article={{ _id: 'a1', title: 'A source', content: '<p>Text.</p>' }}
        highlights={[]}
        onTogglePlacement={jest.fn()}
      />
    );
    expect(document.querySelector('.placement-switch__cap')).toBeNull();

    rerender(
      <ArticleReader
        article={{ _id: 'a1', title: 'A source', content: '<p>Text.</p>', placement: 'later' }}
        highlights={[]}
        onTogglePlacement={jest.fn()}
      />
    );
    expect(document.querySelector('.placement-switch__cap')).not.toBeNull();
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
