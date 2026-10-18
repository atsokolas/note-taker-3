import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { returnGreetingHighlight } from './returnGreeting';
import ReturnGreeting from './ReturnGreeting';
import FootnotePeek, { footnoteFor } from './FootnotePeek';
import OpenSource from './OpenSource';
import usePassageOpens from './usePassageOpens';
import { sourceKind, timeLeftLine } from './readerDress';
import { inkDepth, renderArticleContentWithHighlights } from '../../utils/highlightMarkup';
import { checkOriginalSource, markPassageOpened } from '../../api/articleReadingState';

jest.mock('../../api/articleReadingState');

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-10-18T12:00:00Z').getTime();
const at = (ms) => new Date(ms).toISOString();
const line = (id, createdAt, text = 'A sentence worth keeping close.') => ({ _id: id, text, createdAt });

const setReducedMotion = (reduced) => {
  window.matchMedia = (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener() {},
    removeEventListener() {}
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  setReducedMotion(false);
  markPassageOpened.mockResolvedValue();
  checkOriginalSource.mockResolvedValue(null);
});

describe('your highlight greets you on return', () => {
  const lastOpenedAt = at(NOW - 3 * 24 * HOUR);

  test('serves the latest line marked on the last visit', () => {
    const highlights = [
      line('older', at(NOW - 3 * 24 * HOUR + 60000), 'The first thing you marked last time.'),
      line('newer', at(NOW - 3 * 24 * HOUR + 120000), 'The last thing you marked last time.')
    ];
    expect(returnGreetingHighlight({ highlights, lastOpenedAt, now: NOW })._id).toBe('newer');
  });

  test.each([
    ['no visit on record', { lastOpenedAt: null }],
    ['marked before the last visit', { highlights: [line('a', at(NOW - 5 * 24 * HOUR))] }],
    ['marked within the hour: a refresh, not a return', { highlights: [line('a', at(NOW - 10 * 60000))] }],
    ['too short for a quote', { highlights: [line('a', at(NOW - 2 * 24 * HOUR), 'Yes.')] }],
    ['too long for a quote', { highlights: [line('a', at(NOW - 2 * 24 * HOUR), 'word '.repeat(80))] }],
    ['not yet saved', { highlights: [line('temp-1', at(NOW - 2 * 24 * HOUR))] }],
    ['nothing marked', { highlights: [] }]
  ])('is silent when %s', (_label, overrides) => {
    expect(returnGreetingHighlight({ highlights: [line('a', at(NOW - 2 * 24 * HOUR))], lastOpenedAt, now: NOW, ...overrides })).toBeNull();
  });

  const greet = (arrival, extra = {}) => render(
    <ReturnGreeting
      article={{ _id: 'a1', lastOpenedAt: at(Date.now() - 3 * 24 * HOUR) }}
      highlights={[line('h1', at(Date.now() - 2 * 24 * HOUR))]}
      arrival={arrival}
      contentRef={{ current: null }}
      {...extra}
    />
  );

  test('greets only when the reader was not returned to a place', () => {
    greet('none');
    expect(screen.getByTestId('return-greeting')).toHaveTextContent('A sentence worth keeping close.');
  });

  test.each(['pending', 'shown', 'explicit'])('stays quiet when arrival is %s: one greeting, never two', (arrival) => {
    greet(arrival);
    expect(screen.queryByTestId('return-greeting')).toBeNull();
  });

  test('settles away after a moment', () => {
    jest.useFakeTimers();
    try {
      greet('none');
      act(() => { jest.advanceTimersByTime(7000); });
      expect(screen.getByTestId('return-greeting')).toHaveClass('is-settling');
      act(() => { jest.advanceTimersByTime(700); });
      expect(screen.queryByTestId('return-greeting')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('with reduced motion it stays, still', () => {
    setReducedMotion(true);
    jest.useFakeTimers();
    try {
      greet('none');
      act(() => { jest.advanceTimersByTime(20000); });
      expect(screen.getByTestId('return-greeting')).not.toHaveClass('is-settling');
    } finally {
      jest.useRealTimers();
    }
  });

  test('opens where it came from', () => {
    const content = document.createElement('div');
    content.innerHTML = '<p><mark data-highlight-id="highlight-h1">A sentence</mark></p>';
    const mark = content.querySelector('mark');
    mark.scrollIntoView = jest.fn();
    greet('none', { contentRef: { current: content } });
    fireEvent.click(screen.getByRole('button'));
    expect(mark.scrollIntoView).toHaveBeenCalled();
  });
});

describe('footnotes open in place', () => {
  const article = (body) => {
    const root = document.createElement('div');
    root.innerHTML = body;
    document.body.append(root);
    return root;
  };
  afterEach(() => { document.body.innerHTML = ''; });

  test.each([
    ['a Markdown #fn', '<p>Claim<sup><a href="#fn1">1</a></sup></p><ol><li id="fn1">The source of the claim. <a href="#fnref1">↩︎</a></li></ol>'],
    ['the DPUB role', '<p>Claim<a role="doc-noteref" href="#n-1">1</a></p><aside id="n-1">The source of the claim. <a role="doc-backlink" href="#r">back</a></aside>'],
    ['a Wikipedia cite note', '<p>Claim<sup><a href="#cite_note-4">[4]</a></sup></p><ol><li id="cite_note-4"><span class="mw-cite-backlink">^</span> The source of the claim.</li></ol>']
  ])('reads %s without its backlink', (_label, body) => {
    const root = article(body);
    expect(footnoteFor(root, root.querySelector('p a')).text).toBe('The source of the claim.');
  });

  test.each([
    ['an ordinary link', '<p><a href="https://example.com">elsewhere</a></p>'],
    ['a note that is not in the piece', '<p><sup><a href="#fn9">9</a></sup></p>'],
    ['an empty note', '<p><sup><a href="#fn1">1</a></sup></p><div id="fn1"> </div>']
  ])('leaves %s alone', (_label, body) => {
    const root = article(body);
    expect(footnoteFor(root, root.querySelector('a'))).toBeNull();
  });

  test('opens beside the reference, and Esc closes it and returns focus', () => {
    const root = article('<p>Claim<sup><a href="#fn1">1</a></sup></p><ol><li id="fn1">The source.</li></ol>');
    render(<FootnotePeek contentRef={{ current: root }} />);
    const ref = root.querySelector('a');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { ref.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    expect(screen.getByRole('note')).toHaveTextContent('The source.');
    expect(ref).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('note')).toBeNull();
    expect(ref).not.toHaveAttribute('aria-expanded');
    expect(document.activeElement).toBe(ref);
  });

  test('a click elsewhere closes it; an ordinary link is not intercepted', () => {
    const root = article('<p>Claim<sup><a href="#fn1">1</a></sup> <a href="https://example.com">out</a></p><ol><li id="fn1">The source.</li></ol>');
    render(<FootnotePeek contentRef={{ current: root }} />);
    act(() => { root.querySelector('sup a').click(); });
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('note')).toBeNull();
    const out = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => { root.querySelector('a[href^="https"]').dispatchEvent(out); });
    expect(out.defaultPrevented).toBe(false);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('deeper ink', () => {
  test('three quiet steps', () => {
    expect([0, 1, 2, 3, 5, 6, 40, undefined].map(inkDepth)).toEqual([0, 1, 1, 2, 2, 3, 3, 0]);
  });

  test('the mark carries its step and never a number in the text', () => {
    const html = renderArticleContentWithHighlights(
      { content: '<p>Some words to keep.</p>' },
      [{ _id: 'h1', text: 'words to keep', opens: 4 }]
    );
    expect(html).toContain('data-ink="2"');
    expect(html).not.toMatch(/>\s*4\s*</);
  });

  const old = { _id: 'h1', text: 'x', opens: 2, createdAt: at(Date.now() - 48 * HOUR) };

  test('opening a held passage counts once per visit and inks it now', () => {
    const { result, rerender } = renderHook((props) => usePassageOpens(props), {
      initialProps: { articleId: 'a1', highlightId: 'h1', highlights: [old] }
    });
    expect(markPassageOpened).toHaveBeenCalledWith('a1', 'h1');
    expect(result.current[0].opens).toBe(3);
    rerender({ articleId: 'a1', highlightId: '', highlights: [old] });
    rerender({ articleId: 'a1', highlightId: 'h1', highlights: [old] });
    expect(markPassageOpened).toHaveBeenCalledTimes(1);
    rerender({ articleId: 'a1', highlightId: 'h1', highlights: [{ ...old, opens: 3 }] });
    expect(result.current[0].opens).toBe(3);
  });

  test.each([
    ['no passage was opened', { highlightId: '' }],
    ['a line marked moments ago', { highlights: [{ ...old, createdAt: at(Date.now() - 60000) }] }],
    ['a line not yet saved', { highlightId: 'temp-1', highlights: [{ ...old, _id: 'temp-1' }] }],
    ['a passage not in this piece', { highlightId: 'elsewhere' }]
  ])('does not count %s', (_label, overrides) => {
    renderHook(() => usePassageOpens({ articleId: 'a1', highlightId: 'h1', highlights: [old], ...overrides }));
    expect(markPassageOpened).not.toHaveBeenCalled();
  });
});

describe('the original is gone; your copy is not', () => {
  test('says so when we already know', () => {
    render(<OpenSource article={{ _id: 'a1', url: 'https://example.com/x', sourceGoneAt: at(NOW) }} />);
    expect(screen.getByText(/The original is gone\. Your copy isn/)).toBeInTheDocument();
  });

  test('says nothing until a look finds it gone', async () => {
    checkOriginalSource.mockResolvedValue(at(NOW));
    render(<OpenSource article={{ _id: 'a1', url: 'https://example.com/x' }} />);
    expect(screen.queryByText(/The original is gone/)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText('Open source')); });
    expect(checkOriginalSource).toHaveBeenCalledWith('a1');
    expect(screen.getByText(/The original is gone/)).toBeInTheDocument();
  });

  test('a look that cannot tell stays quiet, and no URL means no link', async () => {
    checkOriginalSource.mockRejectedValue(new Error('offline'));
    const { container, rerender } = render(<OpenSource article={{ _id: 'a1', url: 'https://example.com/x' }} />);
    await act(async () => { fireEvent.click(screen.getByText('Open source')); });
    expect(screen.queryByText(/The original is gone/)).toBeNull();
    rerender(<OpenSource article={{ _id: 'a2', url: 'pasted-text' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the reader dresses for the source', () => {
  const words = (count) => `<p>${'word '.repeat(count)}</p>`;
  test.each([
    ['pasted text stays plain', { importMeta: { sourceType: 'text' }, content: words(5000) }, 'plain'],
    ['an SEC filing', { url: 'https://www.sec.gov/Archives/x.htm', content: words(10) }, 'filing'],
    ['a filing by its title', { title: 'Costco 10-K 2025', url: 'https://example.com', content: words(10) }, 'filing'],
    ['a long essay', { url: 'https://example.com', content: words(3200) }, 'essay'],
    ['an ordinary piece', { url: 'https://example.com', content: words(900) }, ''],
    ['nothing at all', null, '']
  ])('%s', (_label, article, kind) => {
    expect(sourceKind(article)).toBe(kind);
  });
});

describe('time left', () => {
  test.each([
    [2300, 0.4, ''],
    [2300, 0.5, ''],
    [2300, 0.8, 'Two minutes left'],
    [1150, 0.8, 'A minute left'],
    [500, 0.8, 'Under a minute left'],
    [46000, 0.6, '80 minutes left'],
    [2300, 0.98, ''],
    [0, 0.8, '']
  ])('%s words, %s seen: "%s"', (count, seen, expected) => {
    expect(timeLeftLine(count, seen)).toBe(expected);
  });
});
