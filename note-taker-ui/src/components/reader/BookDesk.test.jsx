import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BookDesk from './BookDesk';
import { createHighlight, deleteHighlight, updateHighlight } from '../../api/highlights';

jest.mock('../../api/highlights', () => ({
  createHighlight: jest.fn(),
  deleteHighlight: jest.fn(),
  updateHighlight: jest.fn()
}));

const KINDLE = {
  _id: 'k1',
  text: 'The decline of violence may be the most significant development in our history.',
  note: '',
  location: 'Location 1702–1705',
  // A week ago: the book is being read, not set down.
  createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
};

/* The desk as the reader holds it: the marks live with the parent. */
const Desk = ({ marks: initial, readBefore, createdAt }) => {
  const [marks, setMarks] = useState(initial);
  return (
    <BookDesk
      article={{ _id: 'book-1', title: 'The Better Angels', url: 'import://kindle/the-better-angels-pinker', readBefore, createdAt }}
      marks={marks}
      onAdd={mark => setMarks(current => [...current, mark])}
      onReplace={(id, mark) => setMarks(current => current.map(item => (item._id === id ? { ...item, ...mark } : item)))}
      onRemove={id => setMarks(current => current.filter(item => item._id !== id))}
    />
  );
};

const line = () => screen.getByLabelText('Type a quote, a note or a question');
const type = (text) => fireEvent.change(line(), { target: { value: text } });
const keep = (options = {}) => fireEvent.keyDown(line(), { key: 'Enter', ...options });

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

test('a number turns the page, and the page stays for the lines after it', async () => {
  createHighlight
    .mockResolvedValueOnce({ _id: 'n1', text: '', note: 'he is conflating risk and uncertainty', page: 212, createdAt: new Date().toISOString() })
    .mockResolvedValueOnce({ _id: 'n2', text: '', note: 'or is he?', page: 212, createdAt: new Date().toISOString() });
  render(<Desk marks={[]} />);
  expect(screen.getByText(/A number turns the page/)).toBeInTheDocument();

  type('212 he is conflating risk and uncertainty');
  await act(async () => keep());
  expect(createHighlight).toHaveBeenLastCalledWith({ articleId: 'book-1', text: '', note: 'he is conflating risk and uncertainty', page: 212 });
  expect(screen.getByLabelText('Page you are on')).toHaveValue('212');

  type('or is he?');
  await act(async () => keep());
  expect(createHighlight).toHaveBeenLastCalledWith({ articleId: 'book-1', text: '', note: 'or is he?', page: 212 });
  expect(await screen.findByText('Tonight')).toBeInTheDocument();
  expect(screen.getByText('p. 212 · 1 note, 1 question')).toBeInTheDocument();
  expect(screen.getByText('p. 212')).toBeInTheDocument();
});

test('the book finishes a quote you marked on the Kindle, and it stays one mark', async () => {
  createHighlight.mockResolvedValue({ ...KINDLE, page: 214 });
  render(<Desk marks={[KINDLE]} />);
  expect(screen.getByText('Last time')).toBeInTheDocument();
  expect(screen.getByText(KINDLE.text, { selector: 'q' })).toBeInTheDocument();

  type('214 "The decline of viol');
  expect(screen.getByText('ence may be the most significant development in our history.')).toHaveClass('book-desk__ghost');
  expect(screen.getByText('Tab takes the rest of the passage you marked')).toBeInTheDocument();
  fireEvent.keyDown(line(), { key: 'Tab' });
  expect(line()).toHaveValue(`214 "${KINDLE.text}`);

  await act(async () => keep());
  expect(createHighlight).toHaveBeenCalledWith({ articleId: 'book-1', text: KINDLE.text, note: '', page: 214 });
  expect(await screen.findByText('You marked this on your Kindle too. It is one mark now, with your note.')).toBeInTheDocument();
  expect(screen.getAllByText(KINDLE.text, { selector: 'blockquote' })).toHaveLength(1);
});

test('on a second reading a passage marked again is a new mark, and the desk says when you marked it before', async () => {
  const then = { ...KINDLE, createdAt: '2025-10-01T20:00:00Z' };
  const readBefore = [{ finishedOn: '2025-10-10', closingLine: '', until: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }];
  createHighlight.mockResolvedValue({ ...KINDLE, _id: 'k2', location: '', page: 214, createdAt: new Date().toISOString() });
  render(<Desk marks={[then]} readBefore={readBefore} />);
  expect(screen.getByText('What you marked then is here in faded ink.')).toBeInTheDocument();

  type(`214 "${KINDLE.text}`);
  await act(async () => keep());
  expect(await screen.findByText('You marked this in 2025 too.')).toBeInTheDocument();
  expect(screen.getAllByText(KINDLE.text, { selector: 'blockquote' })).toHaveLength(2);
  expect(screen.getByText('Tonight')).toBeInTheDocument();
});

test('a book untouched for a month asks why you stopped, and the answer is a mark like any other', async () => {
  const old = { ...KINDLE, createdAt: '2026-01-05T20:00:00Z' };
  createHighlight.mockResolvedValue({ _id: 'n1', text: '', note: 'It got repetitive after the Leviathan.', createdAt: new Date().toISOString() });
  render(<Desk marks={[old]} createdAt="2026-01-01T00:00:00Z" />);
  expect(screen.getByText('Set down in January 2026')).toBeInTheDocument();
  expect(screen.getByText('Why’d you stop?')).toBeInTheDocument();
  expect(line()).toHaveAttribute('placeholder', 'Why you stopped, or the next line');

  type('It got repetitive after the Leviathan.');
  await act(async () => keep());
  expect(await screen.findByText('Tonight')).toBeInTheDocument();
  expect(screen.queryByText('Why’d you stop?')).not.toBeInTheDocument();
});

test('taking back a line that joined a Kindle mark gives the mark its own note back, never deletes it', async () => {
  const noted = { ...KINDLE, note: 'first read' };
  createHighlight.mockResolvedValue({ ...noted, page: 214 });
  updateHighlight.mockResolvedValue(noted);
  render(<Desk marks={[noted]} />);
  type(`214 "${KINDLE.text}`);
  await act(async () => keep());
  fireEvent.keyDown(line(), { key: 'z', metaKey: true });
  await waitFor(() => expect(updateHighlight).toHaveBeenCalledWith({ articleId: 'book-1', highlightId: 'k1', payload: { note: 'first read' } }));
  expect(deleteHighlight).not.toHaveBeenCalled();
  expect(screen.getAllByText(KINDLE.text, { selector: 'blockquote' })).toHaveLength(1);
});

test('⌥↩ writes the line as the note on the quote just kept', async () => {
  createHighlight.mockResolvedValue({ _id: 'q1', text: 'Risk you can price.', note: '', page: 30, createdAt: new Date().toISOString() });
  updateHighlight.mockResolvedValue({ _id: 'q1', note: 'and uncertainty you cannot' });
  render(<Desk marks={[]} />);
  type('30 "Risk you can price.');
  await act(async () => keep());
  type('and uncertainty you cannot');
  await act(async () => keep({ altKey: true }));
  expect(updateHighlight).toHaveBeenCalledWith({ articleId: 'book-1', highlightId: 'q1', payload: { note: 'and uncertainty you cannot' } });
  expect(createHighlight).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('and uncertainty you cannot')).toBeInTheDocument();
});

test('a quote typed with only its ends says what became of it', async () => {
  createHighlight.mockResolvedValue({ _id: 'e1', text: 'The decline … our history', note: '', page: 9, createdAt: new Date().toISOString() });
  render(<Desk marks={[]} />);
  type('9 "The decline … our history');
  await act(async () => keep());
  expect(await screen.findByText(/Kept as you typed it/)).toBeInTheDocument();
  expect(screen.getByText('The decline … our history').closest('li')).toHaveAttribute('data-unfinished', 'true');
});

test('a line typed with no connection waits on this device and goes when it is back', async () => {
  createHighlight.mockRejectedValueOnce(new Error('Network Error'));
  render(<Desk marks={[]} />);
  type('12 a thought on a plane');
  await act(async () => keep());
  expect(screen.getByText(/Kept on this device/)).toBeInTheDocument();
  expect(screen.getByText('a thought on a plane').closest('li')).toHaveAttribute('data-unsent', 'true');

  createHighlight.mockResolvedValueOnce({ _id: 's1', text: '', note: 'a thought on a plane', page: 12, createdAt: new Date().toISOString() });
  await act(async () => { window.dispatchEvent(new Event('online')); });
  await waitFor(() => expect(screen.getByText('a thought on a plane').closest('li')).not.toHaveAttribute('data-unsent'));
  expect(createHighlight).toHaveBeenLastCalledWith(expect.objectContaining({ note: 'a thought on a plane', page: 12 }));
});
