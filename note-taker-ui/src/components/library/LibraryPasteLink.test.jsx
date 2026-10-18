import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibraryPasteLink, { linkFrom } from './LibraryPasteLink';
import { importPastedUrl } from '../../api/imports';

jest.mock('../../api/imports', () => ({ importPastedUrl: jest.fn() }));

const field = () => screen.getByLabelText('Paste a link to what you are reading');
const paste = text => fireEvent.paste(field(), { clipboardData: { getData: () => text } });

beforeEach(() => jest.clearAllMocks());

test('reads what people actually paste as a link, and nothing else', () => {
  expect(linkFrom(' https://example.com/essay ')).toBe('https://example.com/essay');
  expect(linkFrom('example.com/essay')).toBe('https://example.com/essay');
  expect(linkFrom('<https://example.com/a>')).toBe('https://example.com/a');
  expect(linkFrom('a few words of a passage')).toBe('');
  expect(linkFrom('localhost')).toBe('');
  expect(linkFrom('ftp://example.com/file')).toBe('');
});

test('pasting a link saves it at once and names what landed', async () => {
  importPastedUrl.mockResolvedValue({ article: { _id: 'a1', title: 'On Slow Reading' }, existing: false });
  const onSaved = jest.fn();
  const onOpen = jest.fn();
  render(<LibraryPasteLink onSaved={onSaved} onOpen={onOpen} />);

  paste('example.com/slow');
  expect(importPastedUrl).toHaveBeenCalledWith({ url: 'https://example.com/slow' });
  fireEvent.click(await screen.findByRole('button', { name: 'On Slow Reading' }));
  expect(screen.getByRole('status')).toHaveTextContent('Saved. On Slow Reading is at the top of your Library.');
  expect(onSaved).toHaveBeenCalledWith({ _id: 'a1', title: 'On Slow Reading' });
  expect(onOpen).toHaveBeenCalledWith('a1');
  expect(field()).toHaveValue('');
});

test('a link already saved opens the copy you have and says since when', async () => {
  importPastedUrl.mockResolvedValue({
    article: { _id: 'a1', title: 'On Slow Reading', createdAt: '2026-03-04T12:00:00.000Z' },
    existing: true
  });
  const onSaved = jest.fn();
  render(<LibraryPasteLink onSaved={onSaved} onOpen={jest.fn()} />);

  fireEvent.change(field(), { target: { value: 'https://example.com/slow' } });
  fireEvent.submit(field().closest('form'));
  await screen.findByRole('button', { name: 'On Slow Reading' });
  expect(screen.getByRole('status')).toHaveTextContent(/^Already yours since .*4.*: On Slow Reading$/);
  expect(onSaved).not.toHaveBeenCalled();
});

test('a page the server cannot read says so plainly', async () => {
  importPastedUrl.mockRejectedValue({ response: { status: 422 } });
  render(<LibraryPasteLink />);

  paste('https://example.com/walled');
  expect(await screen.findByText(/Noeis could not read that page/)).toBeInTheDocument();
});

test('words that are not a link are not sent anywhere', () => {
  render(<LibraryPasteLink />);
  fireEvent.change(field(), { target: { value: 'not a link' } });
  fireEvent.submit(field().closest('form'));
  expect(importPastedUrl).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('That does not look like a link.');
});
