import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibraryPasteLink, { linkFrom } from './LibraryPasteLink';
import { importPastedUrl } from '../../api/imports';

jest.mock('../../api/imports', () => ({ importPastedUrl: jest.fn() }));

const field = () => screen.getByLabelText('Paste a link to read later');
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
  const piece = { _id: 'a1', title: 'On Slow Reading', placement: 'later' };
  importPastedUrl.mockResolvedValue({ article: piece, existing: false });
  const onSaved = jest.fn();
  const onOpen = jest.fn();
  const onShowNightstand = jest.fn();
  render(<LibraryPasteLink onSaved={onSaved} onOpen={onOpen} onShowNightstand={onShowNightstand} />);

  paste('example.com/slow');
  expect(importPastedUrl).toHaveBeenCalledWith({ url: 'https://example.com/slow', placement: 'later' });
  fireEvent.click(await screen.findByRole('button', { name: 'On Slow Reading' }));
  expect(screen.getByRole('status')).toHaveTextContent('On your nightstand: On Slow Reading See the nightstand');
  expect(onSaved).toHaveBeenCalledWith(piece);
  expect(onOpen).toHaveBeenCalledWith('a1');
  fireEvent.click(screen.getByRole('button', { name: 'See the nightstand' }));
  expect(onShowNightstand).toHaveBeenCalled();
  expect(field()).toHaveValue('');
});

test('a link already saved names the copy you have, since when, and where it sits', async () => {
  importPastedUrl.mockResolvedValue({
    article: { _id: 'a1', title: 'On Slow Reading', createdAt: '2026-03-04T12:00:00.000Z', placement: 'setAside' },
    existing: true
  });
  render(<LibraryPasteLink onSaved={jest.fn()} onOpen={jest.fn()} />);

  fireEvent.change(field(), { target: { value: 'https://example.com/slow' } });
  fireEvent.submit(field().closest('form'));
  await screen.findByRole('button', { name: 'On Slow Reading' });
  expect(screen.getByRole('status')).toHaveTextContent(/^Already yours since .*4.*, on your desk: On Slow Reading$/);
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
