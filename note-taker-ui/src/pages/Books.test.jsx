import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as Router from 'react-router-dom';
import Books from './Books';
import { closeBook, listBooks, reopenBook, startBook } from '../api/imports';
import useArticleDetail from '../hooks/useArticleDetail';

jest.mock('../api/imports', () => ({ closeBook: jest.fn(), listBooks: jest.fn(), reopenBook: jest.fn(), startBook: jest.fn() }));
jest.mock('../api/highlights', () => ({ createHighlight: jest.fn(), deleteHighlight: jest.fn(), updateHighlight: jest.fn() }));
jest.mock('../hooks/useArticleDetail', () => jest.fn());

const at = (id) => {
  jest.spyOn(Router, 'useParams').mockReturnValue(id ? { id } : {});
  return render(<Books />);
};

beforeEach(() => {
  jest.clearAllMocks();
  useArticleDetail.mockReturnValue({ article: null, highlights: [], error: '' });
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
  const book = await screen.findByRole('link', { name: /The Better Angels of Our Nature/ });
  expect(book).toHaveAttribute('href', '/library/books/b1');
  expect(book).toHaveTextContent('pp. 188–190 · 1 quote, 1 question');
  expect(book).toHaveTextContent('Is he cherry-picking the base year?');
});

test('naming a book opens its page', async () => {
  listBooks.mockResolvedValue([]);
  startBook.mockResolvedValue({ article: { _id: 'b2' } });
  at();
  expect(await screen.findByText(/Name a book above/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('The book you are reading'), { target: { value: 'Middlemarch by George Eliot' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await waitFor(() => expect(Router.useNavigate()).toHaveBeenCalledWith('/library/books/b2'));
  expect(startBook).toHaveBeenCalledWith({ title: 'Middlemarch', author: 'George Eliot' });
});

test('a book has a page of its own: its name, and the desk', () => {
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch', author: 'George Eliot' }, highlights: [], error: '' });
  at('b2');
  expect(useArticleDetail).toHaveBeenCalledWith('b2');
  expect(screen.getByRole('heading', { level: 1, name: 'Middlemarch' })).toBeInTheDocument();
  expect(screen.getByText('George Eliot')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Reading desk' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Books' })).toHaveAttribute('href', '/library/books');
});

test('a book closed a year ago this week comes back at the top of the shelf with its sentence', async () => {
  listBooks.mockResolvedValue([
    { _id: 'b1', title: 'Persuasion', marks: [] },
    { _id: 'b2', title: 'Middlemarch', finishedAt: '2025-10-19T21:00:00Z', closingLine: 'Nobody is only what they do.', returning: { years: 1, days: 0 }, marks: [] }
  ]);
  at();
  const back = await screen.findByRole('link', { name: /A year ago today/ });
  expect(back).toHaveAttribute('href', '/library/books/b2');
  expect(back).toHaveTextContent('You finished Middlemarch and said you’d remember:Nobody is only what they do.Do you?');
  expect(screen.getByRole('link', { name: /^Middlemarch/ })).toHaveTextContent(/Finished October 2025/);
});

test('nothing comes back when no book is having its anniversary', async () => {
  listBooks.mockResolvedValue([{ _id: 'b2', title: 'Middlemarch', finishedAt: '2026-10-01T21:00:00Z', closingLine: 'x', returning: null, marks: [] }]);
  at();
  await screen.findByRole('link', { name: /Middlemarch/ });
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
  closeBook.mockResolvedValue({ finishedAt: '2026-10-19T20:00:00Z', closingLine: 'Nobody is only what they do.' });
  reopenBook.mockResolvedValue({ finishedAt: null, closingLine: '' });
  at('b2');
  fireEvent.click(screen.getByRole('button', { name: 'I’ve finished it' }));
  fireEvent.change(screen.getByLabelText('In one sentence, what will you remember?'), { target: { value: 'Nobody is only what they do.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close the book' }));

  const colophon = await screen.findByRole('region', { name: 'Colophon' });
  expect(closeBook).toHaveBeenCalledWith('b2', 'Nobody is only what they do.');
  expect(colophon).toHaveTextContent(/Finished (19 October|October 19,) 2026/);
  expect(colophon).toHaveTextContent('Nobody is only what they do.');
  expect(colophon).toHaveTextContent(/Read from (1 September|September 1,) 2026 · 2 sittings · pp\. 3–40 · 1 quote, 1 question/);
  expect(colophon).toHaveTextContent(/It comes back to you on (19 October|October 19,) 2027\./);

  fireEvent.click(screen.getByRole('button', { name: 'Still reading it' }));
  expect(await screen.findByRole('button', { name: 'I’ve finished it' })).toBeInTheDocument();
});

test('a book closed without a sentence keeps asking for one', async () => {
  useArticleDetail.mockReturnValue({ article: { _id: 'b2', title: 'Middlemarch', finishedAt: '2026-10-19T20:00:00Z', closingLine: '' }, highlights: [], error: '' });
  closeBook.mockResolvedValue({ finishedAt: '2026-10-19T20:00:00Z', closingLine: 'Late, but true.' });
  at('b2');
  fireEvent.change(screen.getByLabelText('In one sentence, what will you remember?'), { target: { value: 'Late, but true.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
  expect(await screen.findByText('Late, but true.', { selector: 'blockquote' })).toBeInTheDocument();
});
