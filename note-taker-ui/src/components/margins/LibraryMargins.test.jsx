import fs from 'fs';
import path from 'path';
import React, { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ArticleMargins, markedWhen } from './LibraryMargins';
import { fetchMarginNotes } from '../../api/retrieval';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

jest.mock('../../api/retrieval', () => ({ fetchMarginNotes: jest.fn() }));
jest.mock('../../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: jest.fn(() => false),
  useFinePointer: () => true
}));

const long = (lead) => `${lead} — a paragraph with well over a dozen words in it, so that it is worth asking about.`;
const article = `
  <p>${long('First')}</p>
  <p>Too short.</p>
  <ul><li><p>${long('Listed')}</p></li></ul>
  <blockquote><p>${long('Quoted')}</p></blockquote>
`;

const passage = {
  _id: 'h9',
  text: 'A checklist is not a crutch for the inexpert but a net for the expert who forgets the obvious step.',
  articleId: 'a2',
  articleTitle: 'The Checklist Manifesto',
  createdAt: `${new Date().getFullYear()}-03-04T12:00:00Z`
};

const Reader = ({ articleId = 'a1', hidden = false }) => {
  const frameRef = useRef(null);
  const contentRef = useRef(null);
  return (
    <MemoryRouter>
      <div ref={frameRef} className="article-reader">
        <div ref={contentRef} className="article-reader-content" dangerouslySetInnerHTML={{ __html: article }} />
        <ArticleMargins articleId={articleId} contentRef={contentRef} frameRef={frameRef} contentKey={article} hidden={hidden} />
      </div>
    </MemoryRouter>
  );
};

const box = (top, right) => ({ top, bottom: top + 60, left: 0, right, width: right, height: 60, x: 0, y: top });

const settle = () => act(async () => {});

describe('your library in the margins of the reader', () => {
  beforeEach(() => {
    fetchMarginNotes.mockReset();
    usePrefersReducedMotion.mockReturnValue(false);
  });
  afterEach(() => jest.restoreAllMocks());

  it('asks about the long paragraphs only, and sets the note beside the one it belongs to', async () => {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      if (this.classList.contains('article-reader-content')) return box(0, 600);
      if (this.tagName === 'LI') return box(300, 600);
      return box(0, 1000);
    });
    fetchMarginNotes.mockResolvedValue([{ paragraph: 1, relation: 'close', highlight: passage }]);
    render(<Reader />);
    await settle();
    expect(fetchMarginNotes).toHaveBeenCalledWith({
      articleId: 'a1',
      paragraphs: [long('First'), long('Listed'), long('Quoted')]
    });
    const note = document.querySelector('.library-margin-note');
    // The second paragraph asked about is the list item, the third block on the page.
    expect(note).toHaveAttribute('data-beside', '2');
    expect(note).toHaveClass('is-margin');
    expect(note.style.top).toBe('300px');
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('You marked something close in The Checklist Manifesto, March:');
    expect(link).toHaveTextContent('“A checklist is not a crutch');
    expect(link.getAttribute('href')).toContain('articleId=a2');
    expect(link.getAttribute('href')).toContain('h9');
  });

  it('is silent when nothing you marked elsewhere is close', async () => {
    fetchMarginNotes.mockResolvedValue([]);
    const { container } = render(<Reader />);
    await settle();
    expect(container.querySelector('.library-margins')).toBeNull();
  });

  it('is silent when the index cannot be reached', async () => {
    fetchMarginNotes.mockRejectedValue(new Error('offline'));
    const { container } = render(<Reader />);
    await settle();
    expect(container.querySelector('.library-margins')).toBeNull();
  });

  it('keeps out of a fresh read', async () => {
    fetchMarginNotes.mockResolvedValue([{ paragraph: 0, relation: 'close', highlight: passage }]);
    const { container } = render(<Reader hidden />);
    await settle();
    expect(container.querySelector('.library-margins')).toBeNull();
  });

  it('folds to a mark after the paragraph on a narrow page, and opens on a tap', async () => {
    // A phone: the text runs to the edge of the window.
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => box(0, window.innerWidth - 16));
    fetchMarginNotes.mockResolvedValue([{ paragraph: 0, relation: 'close', highlight: passage }]);
    render(<Reader />);
    await settle();
    const mark = screen.getByRole('button', { name: 'Something you marked close to this, in The Checklist Manifesto' });
    expect(mark.closest('.library-margin-note')).toHaveClass('is-mark');
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(mark);
    expect(screen.getByRole('link')).toHaveTextContent('The Checklist Manifesto');
  });

  it('fades in when motion is welcome', async () => {
    fetchMarginNotes.mockResolvedValue([{ paragraph: 0, relation: 'close', highlight: passage }]);
    render(<Reader />);
    await settle();
    expect(document.querySelector('.library-margin-note')).toHaveClass('is-arriving');
  });

  it('arrives without movement when the reader asks for less motion', async () => {
    usePrefersReducedMotion.mockReturnValue(true);
    fetchMarginNotes.mockResolvedValue([{ paragraph: 0, relation: 'close', highlight: passage }]);
    render(<Reader />);
    await settle();
    expect(document.querySelector('.library-margin-note')).not.toHaveClass('is-arriving');
  });

  it('names the month, and the year only when it is not this one', () => {
    const now = new Date('2026-10-18T12:00:00Z');
    expect(markedWhen('2026-03-04T12:00:00Z', now)).toBe('March');
    expect(markedWhen('2024-03-04T12:00:00Z', now)).toBe('March 2024');
    expect(markedWhen('', now)).toBe('');
  });

  it('moves only for readers who have not asked for less motion', () => {
    const css = fs.readFileSync(path.join(__dirname, 'margins.css'), 'utf8');
    const [outside, inside = ''] = css.split('@media (prefers-reduced-motion: no-preference)');
    expect(outside).not.toMatch(/animation:/);
    expect(inside).toMatch(/animation: library-margin-arrive/);
    expect(css).not.toMatch(/backdrop-filter/);
  });
});
