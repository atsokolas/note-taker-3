import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as Router from 'react-router-dom';
import Books from './Books';
import { askBook, beforeBook, bookEcho, closeBook, lendBook, listBookQuestions, listBooks, readAgain, renameBook, reopenBook, startBook, takeBookBack } from '../api/imports';
import { updateHighlight } from '../api/highlights';
import useArticleDetail from '../hooks/useArticleDetail';
import { listWikiPages, settleIntoWiki } from '../api/wiki';
import { fetchAdded, fetchMarginNotes } from '../api/retrieval';

jest.mock('../api/imports', () => ({ askBook: jest.fn(), beforeBook: jest.fn(), bookEcho: jest.fn(), lendBook: jest.fn(), takeBookBack: jest.fn(), closeBook: jest.fn(), listBookQuestions: jest.fn(), listBooks: jest.fn(), readAgain: jest.fn(), renameBook: jest.fn(), reopenBook: jest.fn(), startBook: jest.fn() }));
jest.mock('../api/highlights', () => ({ createHighlight: jest.fn(), deleteHighlight: jest.fn(), updateHighlight: jest.fn() }));
jest.mock('../hooks/useArticleDetail', () => jest.fn());
jest.mock('../api/wiki', () => ({ listWikiPages: jest.fn(), settleIntoWiki: jest.fn() }));
jest.mock('../api/retrieval', () => ({ fetchMarginNotes: jest.fn(), fetchAdded: jest.fn() }));

const at = (id) => {
  jest.spyOn(Router, 'useParams').mockReturnValue(id ? { id } : {});
  return render(<Books />);
};

beforeEach(() => {
  jest.clearAllMocks();
  useArticleDetail.mockReturnValue({ article: null, highlights: [], error: '' });
  listWikiPages.mockResolvedValue([]);
  fetchMarginNotes.mockResolvedValue([]);
  fetchAdded.mockResolvedValue([]);
  listBookQuestions.mockResolvedValue([]);
  bookEcho.mockResolvedValue(null);
  beforeBook.mockResolvedValue([]);
});

test('the shelf shows each book with what was written in it and the last line', async () => {
  listBooks.mockResolvedValue([{
    _id: 'b1',
    title: 'The Better Angels of Our Nature',
    author: 'Steven Pinker',
    marks: [
      { _id: 'm1', text: 'The decline of violence.', page: 188, createdAt: '2026-10-19T20:00:00Z' },
      { _id: 'm2', note: 'Is he cherry-picking the base year?', page: 190, createdAt: '2026-10-19T20:05:00Z' }
    ]
  }]);
  at();
  const book = await screen.findByRole('button', { name: 'The Better Angels of Our Nature' });
  expect(book).toHaveAttribute('aria-pressed', 'true');
  expect(book.closest('li')).toHaveStyle({ '--marks': '2', '--furthest': '190' });
  const preview = screen.getByRole('complementary', { name: 'The Better Angels of Our Nature' });
  expect(preview).toHaveTextContent('pp. 188–190 · 1 quote, 1 question');
  expect(preview).toHaveTextContent('last marked at p. 190');
  expect(preview).toHaveTextContent('Is he cherry-picking the base year?');
  expect(screen.getByRole('link', { name: 'Open at p. 190' })).toHaveAttribute('href', '/books/b1?highlight=m2');
});

test('the shelf stands what you are reading before what you set down and finished, with a bookend between', async () => {
  listBooks.mockResolvedValue([
    { _id: 'done', title: 'Persuasion', finishedOn: '2026-11-12' },
    { _id: 'now', title: 'Middlemarch' }
  ]);
  at();
  await screen.findByRole('button', { name: 'Middlemarch' });
  const spines = screen.getAllByRole('listitem').filter(item => item.classList.contains('books__volume'));
  expect(spines.map(item => item.textContent)).toEqual(['Middlemarch', 'PersuasionNov']);
  expect(spines[1]).toHaveAttribute('data-bookend', 'Finished');
  fireEvent.click(screen.getByRole('button', { name: 'Persuasion' }));
  expect(screen.getByRole('button', { name: 'Persuasion' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', { name: 'Open book' })).toHaveAttribute('href', '/books/done');
});

test('a heavily marked book keeps distinct ticks on its spine, not a bar', async () => {
  listBooks.mockResolvedValue([{
    _id: 'pb', title: 'The Power Broker',
    marks: Array.from({ length: 400 }, (_, index) => ({ _id: `m${index}`, text: 'A line.', page: index * 4 + 1, createdAt: '2026-11-20T20:00:00Z' }))
  }]);
  at();
  const spine = await screen.findByRole('button', { name: 'The Power Broker' });
  const ticks = spine.querySelectorAll('.books__volume-ticks i');
  expect(ticks.length).toBe(41);
  expect(new Set([...ticks].map(tick => tick.style.top)).size).toBe(41);
});

test('back from a book, the shelf is scrolled to where its spine stood', async () => {
  window.history.replaceState({ bookshelfPlace: { id: 'b1', status: 'Reading', top: 0, left: 240 } }, '');
  listBooks.mockResolvedValue([{ _id: 'b1', title: 'Middlemarch' }]);
  try {
    at();
    const spine = await screen.findByRole('button', { name: 'Middlemarch' });
    await waitFor(() => expect(spine).toHaveFocus());
    expect(spine.closest('ol').scrollLeft).toBe(240);
  } finally {
    window.history.replaceState(null, '');
  }
});

test('filters and previews title-only records without needing artwork or a reading position', async () => {
  listBooks.mockResolvedValue([
    { _id: 'finished', title: 'Persuasion', finishedOn: '2026-11-12', closingLine: 'I would read it again.' },
    { _id: 'reading', title: 'An Island Notebook' }
  ]);
  at();
  await screen.findByRole('button', { name: 'An Island Notebook' });
  fireEvent.click(screen.getByRole('button', { name: 'Reading' }));
  expect(screen.queryByRole('button', { name: /Persuasion/ })).not.toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'An Island Notebook' })).toHaveTextContent('Nothing written yet.');
  expect(screen.getByRole('link', { name: 'Open book' })).toHaveAttribute('href', '/books/reading');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finished' }));
  expect(screen.getByRole('complementary', { name: 'Persuasion' })).toHaveTextContent('I would read it again.');
});

test('naming a book opens its page', async () => {
  listBooks.mockResolvedValue([]);
  startBook.mockResolvedValue({ article: { _id: 'b2' } });
  at();
  expect(await screen.findByText(/Name a book above/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('The book you are reading'), { target: { value: 'Middlemarch by George Eliot' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await waitFor(() => expect(Router.useNavigate()).toHaveBeenCalledWith('/books/b2'));
  expect(startBook).toHaveBeenCalledWith({ title: 'Middlemarch', author: 'George Eliot' });
});

test('a book has a page of its own: its name, and the desk', () => {
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch', author: 'George Eliot' }, highlights: [], error: '' });
  at('b2');
  expect(useArticleDetail).toHaveBeenCalledWith('b2');
  expect(screen.getByRole('heading', { level: 1, name: 'Middlemarch' })).toBeInTheDocument();
  expect(screen.getByText('George Eliot')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Reading desk' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Books' })).toHaveAttribute('href', '/books');
});

test('a book’s name is typed over in place: Enter keeps it, Esc puts the old one back', async () => {
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch', author: 'George Eliot' }, highlights: [], error: '' });
  renameBook.mockResolvedValue({ title: 'Middlemarch: A Study of Provincial Life' });
  at('b2');
  const name = screen.getByRole('heading', { level: 1, name: 'Middlemarch' });
  name.textContent = 'Middle';
  fireEvent.keyDown(name, { key: 'Escape' });
  expect(name).toHaveTextContent('Middlemarch');
  expect(renameBook).not.toHaveBeenCalled();

  name.focus();
  name.textContent = '  Middlemarch: A Study of Provincial Life ';
  fireEvent.keyDown(name, { key: 'Enter' });
  expect(renameBook).toHaveBeenCalledTimes(1);
  expect(renameBook).toHaveBeenCalledWith('b2', 'Middlemarch: A Study of Provincial Life');
  await waitFor(() => expect(document.title).toMatch(/Provincial/));
  expect(await screen.findByRole('heading', { level: 1, name: 'Middlemarch: A Study of Provincial Life' })).toBeInTheDocument();
});

test('a book’s name typed away to nothing stays its name', () => {
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch' }, highlights: [], error: '' });
  at('b2');
  const name = screen.getByRole('heading', { level: 1, name: 'Middlemarch' });
  name.textContent = '   ';
  fireEvent.blur(name);
  expect(name).toHaveTextContent('Middlemarch');
  expect(renameBook).not.toHaveBeenCalled();
});

test('a book opened from the shelf goes back to that history entry', () => {
  const location = jest.spyOn(Router, 'useLocation').mockReturnValue({ state: { fromShelf: true } });
  try {
    at('b2');
    fireEvent.click(screen.getByRole('link', { name: '← Books' }));
    expect(Router.useNavigate()).toHaveBeenCalledWith(-1);
  } finally {
    location.mockRestore();
  }
});

test('a book closed a year ago this week comes back at the top of the shelf with its sentence', async () => {
  listBooks.mockResolvedValue([
    { _id: 'b1', title: 'Persuasion', marks: [] },
    { _id: 'b2', title: 'Middlemarch', finishedOn: '2025-10-19', closingLine: 'Nobody is only what they do.', returning: { years: 1, days: 0, line: 'Nobody is only what they do.' }, marks: [] }
  ]);
  at();
  const back = await screen.findByRole('link', { name: /A year ago today/ });
  expect(back).toHaveAttribute('href', '/books/b2');
  expect(back).toHaveTextContent('You finished Middlemarch and said you’d remember:Nobody is only what they do.Do you?');
  fireEvent.click(screen.getByRole('button', { name: 'Middlemarch' }));
  expect(screen.getByRole('complementary', { name: 'Middlemarch' })).toHaveTextContent(/Finished October 2025/);
});

test('nothing comes back when no book is having its anniversary', async () => {
  listBooks.mockResolvedValue([{ _id: 'b2', title: 'Middlemarch', finishedOn: '2026-10-01', closingLine: 'x', returning: null, marks: [] }]);
  at();
  await screen.findByRole('button', { name: 'Middlemarch' });
  expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
});

test('closing a book asks one sentence, says when it comes back, and can be undone', async () => {
  useArticleDetail.mockReturnValue({
    article: { _id: 'b2', title: 'Middlemarch' },
    highlights: [
      { _id: 'm1', text: 'A finely touched spirit.', page: 3, createdAt: '2026-09-01T20:00:00Z' },
      { _id: 'm2', note: 'Is Dorothea foolish?', page: 40, createdAt: '2026-09-09T20:00:00Z' }
    ],
    error: ''
  });
  closeBook.mockResolvedValue({ finishedOn: '2026-10-19', closingLine: 'Nobody is only what they do.' });
  reopenBook.mockResolvedValue({ finishedOn: '', closingLine: '' });
  at('b2');
  expect(screen.getByRole('region', { name: 'When you finish' })).toHaveTextContent(
    'You’ll write one sentence to remember it by, and your open question can be put to the book, answered only from what you marked.'
  );
  fireEvent.click(screen.getByRole('button', { name: 'I’ve finished it' }));
  fireEvent.change(screen.getByLabelText('In one sentence, what will you remember?'), { target: { value: 'Nobody is only what they do.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close the book' }));

  const colophon = await screen.findByRole('region', { name: 'Colophon' });
  expect(closeBook).toHaveBeenCalledWith('b2', 'Nobody is only what they do.');
  expect(colophon).toHaveTextContent(/Finished (19 October|October 19,) 2026/);
  expect(colophon).toHaveTextContent('Nobody is only what they do.');
  expect(colophon).toHaveTextContent(/Read in 2 sittings from (1 September|September 1,) 2026\./);
  expect(colophon).toHaveTextContent('pp. 3–40 · 1 quote, 1 question · 3 words of your own · 1 question still open');
  expect(colophon).toHaveTextContent(/It comes back to you on (19 October|October 19,) 2027\./);

  fireEvent.click(screen.getByRole('button', { name: 'Still reading it' }));
  expect(await screen.findByRole('button', { name: 'I’ve finished it' })).toBeInTheDocument();
});

test('a book closed without a sentence keeps asking for one', async () => {
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch', finishedOn: '2026-10-19', closingLine: '' }, highlights: [], error: '' });
  closeBook.mockResolvedValue({ finishedOn: '2026-10-19', closingLine: 'Late, but true.' });
  at('b2');
  fireEvent.change(screen.getByLabelText('In one sentence, what will you remember?'), { target: { value: 'Late, but true.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
  expect(await screen.findByText('Late, but true.', { selector: 'blockquote' })).toBeInTheDocument();
});

test('the spine sits under the book’s name and a tick opens its mark', () => {
  const marks = [12, 180, 190, 400].map(page => ({ _id: `m${page}`, text: `On p. ${page}`, page, createdAt: '2026-10-19T20:00:00Z' }));
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch' }, highlights: marks, error: '' });
  const { container } = at('b2');
  expect(screen.getByRole('figure', { name: /Your marks along the book, to p\. 400/ })).toHaveTextContent('p. 400');
  const mark = container.querySelector('[data-highlight-id="highlight-m190"]');
  mark.scrollIntoView = jest.fn();
  fireEvent.click(container.querySelector('[data-mark="m190"]'));
  expect(mark.scrollIntoView).toHaveBeenCalled();
  expect(mark).toHaveAttribute('data-found');
});

test('the thickest stretch is a button that opens its first mark', () => {
  const marks = [12, 180, 182, 185, 400].map(page => ({ _id: `m${page}`, text: `On p. ${page}`, page, createdAt: '2026-10-19T20:00:00Z' }));
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch' }, highlights: marks, error: '' });
  const { container } = at('b2');
  const mark = container.querySelector('[data-highlight-id="highlight-m180"]');
  mark.scrollIntoView = jest.fn();
  fireEvent.click(screen.getByRole('button', { name: 'Thickest at pp. 160–200' }));
  expect(mark.scrollIntoView).toHaveBeenCalled();
});

test('reading a book again keeps the first reading: its sentence, and its marks in faded ink', async () => {
  const then = { _id: 'm1', text: 'A finely touched spirit.', page: 3, createdAt: '2025-09-01T20:00:00Z' };
  useArticleDetail.mockReturnValue({
    article: { _id: 'b2', title: 'Middlemarch', finishedOn: '2025-10-19', closingLine: 'Nobody is only what they do.' },
    highlights: [then, { ...then, _id: 'm2', page: 9 }, { ...then, _id: 'm3', page: 40 }],
    error: ''
  });
  readAgain.mockResolvedValue({
    finishedOn: '', closingLine: '',
    readBefore: [{ finishedOn: '2025-10-19', closingLine: 'Nobody is only what they do.', until: new Date().toISOString() }]
  });
  const { container } = at('b2');
  fireEvent.click(screen.getByRole('button', { name: 'Read it again' }));

  expect(await screen.findByRole('button', { name: 'I’ve finished it' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Reading desk' })).toHaveTextContent('Read before, finished October 2025Nobody is only what they do.');
  const mark = container.querySelector('[data-highlight-id="highlight-m1"]');
  expect(mark).toHaveAttribute('data-earlier');
  expect(mark).toHaveTextContent('2025');
  expect(container.querySelector('[data-mark="m1"]')).toHaveAttribute('data-earlier');
});

test('the book says where it went in your wiki, one line per page', async () => {
  const mark = { _id: 'm1', text: 'A finely touched spirit.', page: 3, createdAt: '2026-09-01T20:00:00Z' };
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch' }, highlights: [mark], error: '' });
  listWikiPages.mockResolvedValue([{ _id: 'w1', title: 'Vocation', sourceRefs: [{ type: 'highlight', objectId: 'm1' }] }]);
  at('b2');
  const went = await screen.findByRole('list', { name: 'Where this book went' });
  expect(went).toHaveTextContent('One passage from this book is cited on your page about Vocation.');
  expect(screen.getByRole('link', { name: 'Vocation' })).toHaveAttribute('href', '/wiki/workspace?page=w1');
});

test('a book set down a month ago says so on the shelf, and stays there', async () => {
  listBooks.mockResolvedValue([{ _id: 'b1', title: 'Leviathan', createdAt: '2026-01-01T00:00:00Z', marks: [{ _id: 'm1', note: 'Hobbes on fear', page: 40, createdAt: '2026-02-03T20:00:00Z' }] }]);
  at();
  await screen.findByRole('button', { name: 'Leviathan' });
  const book = screen.getByRole('complementary', { name: 'Leviathan' });
  expect(book).toHaveTextContent('Set down in February 2026, last marked at p. 40');
  expect(book).toHaveTextContent('1 note');
  expect(screen.getByRole('button', { name: 'Leviathan' }).closest('li')).toHaveAttribute('data-status', 'Set down');
});

test('a book changed lately is not set down, whatever its marks’ dates', async () => {
  listBooks.mockResolvedValue([{ _id: 'b1', title: 'Leviathan', createdAt: '2026-01-01T00:00:00Z', updatedAt: new Date().toISOString(), marks: [{ _id: 'm1', note: 'Hobbes on fear', page: 40, createdAt: '2026-02-03T20:00:00Z' }] }]);
  at();
  await screen.findByRole('button', { name: 'Leviathan' });
  expect(screen.getByRole('complementary', { name: 'Leviathan' })).not.toHaveTextContent(/Set down/);
});

test('an imported book was set down when you last marked it, not the day it arrived', async () => {
  const arrived = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  listBooks.mockResolvedValue([{ _id: 'b1', title: 'Thinking in Systems', createdAt: arrived, updatedAt: arrived, marks: [{ _id: 'm1', text: 'A system is more than the sum of its parts.', createdAt: '2024-03-02T20:00:00Z' }] }]);
  at();
  await screen.findByRole('button', { name: 'Thinking in Systems' });
  expect(screen.getByRole('complementary', { name: 'Thinking in Systems' })).toHaveTextContent('Set down in March 2024');
});

test('beside a mark, the closest thing you marked in another book', async () => {
  const quote = 'He built the roads first, and the parks came after, because the roads carried the votes.';
  useArticleDetail.mockReturnValue({
    article: { _id: 'b3', title: 'The Power Broker' },
    highlights: [{ _id: 'm1', text: quote, page: 12, createdAt: '2026-10-20T20:00:00Z' }, { _id: 'm2', note: 'Too short to ask.' }],
    error: ''
  });
  fetchMarginNotes.mockResolvedValue([{ paragraph: 0, highlight: { _id: 'h9', text: 'Infrastructure is politics poured in concrete, and it outlasts every mayor.', articleId: 'b4', articleTitle: 'Seeing Like a State' } }]);
  at('b3');
  expect(await screen.findByRole('complementary', { name: 'From your library' })).toHaveTextContent('Seeing Like a State');
  expect(fetchMarginNotes).toHaveBeenCalledWith({ articleId: 'b3', paragraphs: [quote] });
});

test('a mark saved earlier in the book asks the margins again, so each note stays beside its own mark', async () => {
  const later = 'He built the roads first, and the parks came after, because the roads carried the votes.';
  const earlier = 'Robert Moses was the most powerful man in New York for forty years without ever winning an election.';
  const book = { article: { _id: 'b3', title: 'The Power Broker' }, error: '' };
  useArticleDetail.mockReturnValue({ ...book, highlights: [{ _id: 'm1', text: later, page: 40 }] });
  const { rerender } = at('b3');
  await waitFor(() => expect(fetchMarginNotes).toHaveBeenCalledTimes(1));
  useArticleDetail.mockReturnValue({ ...book, highlights: [{ _id: 'm2', text: earlier, page: 3 }, { _id: 'm1', text: later, page: 40 }] });
  rerender(<Books />);
  await waitFor(() => expect(fetchMarginNotes).toHaveBeenLastCalledWith({ articleId: 'b3', paragraphs: [earlier, later] }));
});

test('a question asked beside a book comes back first with the passage marked since that answers it', async () => {
  listBooks.mockResolvedValue([]);
  listBookQuestions.mockResolvedValue([
    { _id: 'q1', note: 'Is he cherry-picking the base year?', page: 190, bookId: 'b1', bookTitle: 'The Better Angels of Our Nature', answer: null },
    { _id: 'q2', note: 'Why roads before parks?', page: 12, bookId: 'b3', bookTitle: 'The Power Broker', answer: { _id: 'h9', text: 'The parkways carried the cars out to the parks.', articleId: 'b5', articleTitle: 'Seeing Like a State' } }
  ]);
  at();
  const asked = await screen.findByRole('region', { name: 'Open questions' });
  const lines = asked.querySelectorAll('li');
  expect(lines[0]).toHaveTextContent('Why roads before parks?The Power Broker, p. 12Since then you marked, in Seeing Like a State: The parkways carried the cars out to the parks.');
  expect(screen.getByRole('link', { name: /Why roads before parks/ })).toHaveAttribute('href', '/books/b3?highlight=q2');
  expect(lines[1]).toHaveTextContent('Is he cherry-picking the base year?');
});

test('no questions, no section', async () => {
  listBooks.mockResolvedValue([]);
  at();
  await screen.findByText(/Name a book above/);
  expect(screen.queryByRole('region', { name: 'Open questions' })).not.toBeInTheDocument();
});

test('a finished book is written up in your wiki, and after that it is written up again', async () => {
  const mark = { _id: 'm1', text: 'A finely touched spirit.', page: 3, createdAt: '2026-09-01T20:00:00Z' };
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch', finishedOn: '2026-10-19', closingLine: 'Nobody is only what they do.' }, highlights: [mark], error: '' });
  settleIntoWiki.mockResolvedValue({ page: { _id: 'w9', title: 'Middlemarch', sourceRefs: [{ objectId: 'm1' }] }, resettled: false });
  at('b2');
  fireEvent.click(screen.getByRole('button', { name: 'Write it up in your wiki' }));
  expect(await screen.findByRole('link', { name: 'Middlemarch' })).toHaveAttribute('href', '/wiki/read/w9');
  expect(settleIntoWiki).toHaveBeenCalledWith('books', 'b2');
  expect(screen.getByText(/In your Wiki/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Write it up again' })).toBeInTheDocument();
});

test('a book already written up says where, and offers to write it up again', async () => {
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch', finishedOn: '2026-10-19', closingLine: 'x' }, highlights: [], error: '' });
  listWikiPages.mockResolvedValue([{ _id: 'w9', title: 'Middlemarch, read', createdFrom: { label: 'settled-book:b2' }, sourceRefs: [] }]);
  at('b2');
  expect(await screen.findByRole('button', { name: 'Write it up again' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Middlemarch, read' })).toHaveAttribute('href', '/wiki/read/w9');
});

test('the shelf shows a thought you marked twice, years apart, the earlier first', async () => {
  listBooks.mockResolvedValue([{ _id: 'b1', title: 'Middlemarch', marks: [] }]);
  bookEcho.mockResolvedValue({
    mark: { _id: 'm1', text: 'We are all of us born in moral stupidity.', page: 211, createdAt: '2026-10-01T20:00:00Z', bookId: 'b1', bookTitle: 'Middlemarch' },
    echo: { _id: 'h9', text: 'Every one of us starts out thinking the world is arranged around us.', createdAt: '2024-09-20T20:00:00Z', articleId: 'a2', articleTitle: 'This Is Water' }
  });
  at();
  const twice = await screen.findByRole('region', { name: 'Twice' });
  expect(twice).toHaveTextContent('You marked nearly the same thought 2 years apart.');
  const [first, second] = twice.querySelectorAll('a');
  expect(first).toHaveTextContent('This Is Water, September 2024');
  expect(second).toHaveAttribute('href', '/books/b1?highlight=m1');
  expect(second).toHaveTextContent('Middlemarch, p. 211, October 2026');
});

test('a new book opens with what you marked elsewhere that touches it, and a marked one does not', async () => {
  beforeBook.mockResolvedValue([{ _id: 'h4', text: 'Marriage is the beginning of the story, not its end.', articleId: 'a7', articleTitle: 'On Marriage', createdAt: '2025-03-02T20:00:00Z' }]);
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch' }, highlights: [], error: '' });
  const { unmount } = at('b2');
  const before = await screen.findByRole('region', { name: 'Before you start' });
  expect(before).toHaveTextContent('You have marked this elsewhere, and it touches this book.');
  expect(before.querySelector('a')).toHaveTextContent('On Marriage, March 2025');
  expect(beforeBook).toHaveBeenCalledWith('b2');
  unmount();

  beforeBook.mockClear();
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch' }, highlights: [{ _id: 'm1', text: 'A finely touched spirit.', createdAt: '2026-09-01T20:00:00Z' }], error: '' });
  at('b2');
  expect(beforeBook).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Before you start' })).not.toBeInTheDocument();
});

test('a finished book is asked your open questions; an answer kept is written under its question, one struck is gone', async () => {
  const replaceHighlight = jest.fn();
  const question = { _id: 'q1', note: 'Why does Dorothea marry him?', page: 20, createdAt: '2026-09-01T20:00:00Z' };
  const other = { _id: 'q2', note: 'Who pays for the hospital?', createdAt: '2026-09-02T20:00:00Z' };
  const quote = { _id: 'm1', text: 'Mr. Casaubon seemed to her a living Bossuet.', page: 22, createdAt: '2026-09-01T20:10:00Z' };
  useArticleDetail.mockReturnValue({
    article: { _id: 'b2', title: 'Middlemarch', finishedOn: '2026-10-19', closingLine: 'x' }, highlights: [question, other, quote], error: '', replaceHighlight
  });
  askBook.mockResolvedValue([
    { questionId: 'q1', answer: 'She mistook his learning for a life.', marks: [{ _id: 'm1', page: 22 }] },
    { questionId: 'q2', answer: 'Bulstrode, with money he should not have.', marks: [{ _id: 'm1', page: 22 }] }
  ]);
  updateHighlight.mockResolvedValue({});
  at('b2');
  fireEvent.click(screen.getByRole('button', { name: 'Ask the book your 2 open questions' }));
  await screen.findByText('She mistook his learning for a life.');
  const asked = screen.getByRole('region', { name: 'Ask the book' });
  expect(askBook).toHaveBeenCalledWith('b2');
  expect(asked).toHaveTextContent('Why does Dorothea marry him?She mistook his learning for a life.From what you marked at p. 22');

  fireEvent.click(screen.getAllByRole('button', { name: 'Keep it' })[0]);
  await waitFor(() => expect(replaceHighlight).toHaveBeenCalledWith('q1', { ...question, note: 'Why does Dorothea marry him?\n\nThe book: She mistook his learning for a life.' }));
  expect(updateHighlight).toHaveBeenCalledWith({ articleId: 'b2', highlightId: 'q1', payload: { note: 'Why does Dorothea marry him?\n\nThe book: She mistook his learning for a life.' } });
  expect(screen.getByRole('status')).toHaveTextContent('Kept under your question.');

  fireEvent.click(screen.getByRole('button', { name: 'Strike it' }));
  expect(screen.queryByText(/Bulstrode/)).not.toBeInTheDocument();
  expect(updateHighlight).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /^Ask the book your/ })).toBeInTheDocument();
});

test('the colophon holds the book between the first and last thing you marked, and counts your own words', () => {
  useArticleDetail.mockReturnValue({
    article: { _id: 'b2', title: 'Middlemarch', finishedOn: '2026-10-19', closingLine: 'x' },
    highlights: [
      { _id: 'm1', text: 'A finely touched spirit.', note: 'yes, exactly this', createdAt: '2026-10-19T20:00:00Z' },
      { _id: 'm2', text: 'Who can quit young lives?', createdAt: '2026-10-19T20:30:00Z' }
    ],
    error: ''
  });
  at('b2');
  expect(screen.getByText(/2 quotes · 3 words of your own/)).toBeInTheDocument();
  expect(screen.getByText(/It began with/)).toHaveTextContent('It began with A finely touched spirit. and ended with Who can quit young lives?');
});

test('a book whose marks answer none of its questions says so and keeps them open', async () => {
  useArticleDetail.mockReturnValue({
    article: { _id: 'b2', title: 'Middlemarch', finishedOn: '2026-10-19', closingLine: 'x' },
    highlights: [{ _id: 'q1', note: 'Why does Dorothea marry him?', createdAt: '2026-09-01T20:00:00Z' }],
    error: ''
  });
  askBook.mockResolvedValue([]);
  at('b2');
  fireEvent.click(screen.getByRole('button', { name: 'Ask the book your open question' }));
  expect(await screen.findByText('Nothing you marked answers them, so they stay open.')).toBeInTheDocument();
});

test('a book is lent by a link a friend reads it at, copied here, and taken back', async () => {
  const writeText = jest.fn(() => Promise.resolve());
  Object.assign(navigator, { clipboard: { writeText } });
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch' }, highlights: [], error: '' });
  lendBook.mockResolvedValue({ lentAs: 'slug9' });
  takeBookBack.mockResolvedValue({ lentAs: '' });
  at('b2');
  fireEvent.click(screen.getByRole('button', { name: 'Lend it' }));
  expect(await screen.findByText('Link copied. Anyone with it can read your copy.')).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/books/slug9`);
  expect(screen.getByRole('link', { name: 'Lent' })).toHaveAttribute('href', `${window.location.origin}/share/books/slug9`);

  fireEvent.click(screen.getByRole('button', { name: 'Take it back' }));
  expect(await screen.findByText('Taken back. That link no longer opens.')).toBeInTheDocument();
  expect(takeBookBack).toHaveBeenCalledWith('b2');
  expect(screen.getByRole('button', { name: 'Lend it' })).toBeInTheDocument();
});


test('a book prints as index cards of its quotes, in page order, with the book and page on each', () => {
  window.print = jest.fn();
  useArticleDetail.mockReturnValue({
    article: { _id: 'b2', title: 'Middlemarch', author: 'George Eliot' },
    highlights: [
      { _id: 'h2', text: 'the growing good of the world is partly dependent on unhistoric acts', note: '', page: 838, createdAt: '2026-10-02T20:00:00Z' },
      { _id: 'h1', text: 'a man’s mind has always the advantage of being masculine', note: '', page: 19, createdAt: '2026-10-01T20:00:00Z' },
      { _id: 'n1', text: '', note: 'Dorothea again', page: 20, createdAt: '2026-10-01T20:05:00Z' }
    ],
    error: ''
  });
  const { container } = at('b2');
  fireEvent.click(screen.getByRole('button', { name: 'Print as cards' }));
  expect(window.print).toHaveBeenCalled();
  const cards = [...container.querySelectorAll('.book-cards li')].map(card => card.textContent);
  expect(cards).toEqual([
    'a man’s mind has always the advantage of being masculineMiddlemarch · George Eliot · p. 19',
    'the growing good of the world is partly dependent on unhistoric actsMiddlemarch · George Eliot · p. 838'
  ]);
});

test('a book with no quotes has no cards to print', () => {
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch' }, highlights: [{ _id: 'n1', text: '', note: 'a thought', createdAt: '2026-10-01T20:05:00Z' }], error: '' });
  at('b2');
  expect(screen.queryByRole('button', { name: 'Print as cards' })).not.toBeInTheDocument();
});
