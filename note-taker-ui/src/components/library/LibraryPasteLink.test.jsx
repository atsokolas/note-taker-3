import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibraryPasteLink, { linkFrom } from './LibraryPasteLink';
import { importPastedUrl } from '../../api/imports';

jest.mock('../../api/imports', () => ({ importPastedUrl: jest.fn() }));

const field = () => screen.getByLabelText('Paste a link to save');
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
  expect(importPastedUrl).toHaveBeenCalledWith({ url: 'https://example.com/slow', placement: 'later', folderId: '' });
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

test('a link already read goes into the Library, filed in the folder chosen', async () => {
  importPastedUrl.mockResolvedValue({
    article: { _id: 'a2', title: 'Notes on Taste', placement: 'stream', folder: { _id: 'f2', name: 'Essays' } },
    existing: false
  });
  const folders = [{ _id: 'f2', name: 'Essays' }, { _id: 'f1', name: 'Art' }];
  render(<LibraryPasteLink folders={folders} folderId="f1" onShowNightstand={jest.fn()} />);

  expect(screen.getByRole('button', { name: 'Goes on your nightstand. Change' })).toBeInTheDocument();
  expect(screen.getByText('in Art')).toBeInTheDocument();
  const select = screen.getByLabelText('Folder');
  expect([...select.options].map(option => option.text)).toEqual(['Unfiled', 'Art', 'Essays']);
  fireEvent.change(select, { target: { value: 'f2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Goes on your nightstand. Change' }));
  expect(screen.getByRole('button', { name: 'Goes in your Library, already read. Change' })).toBeInTheDocument();
  expect(screen.getByText('in Essays')).toBeInTheDocument();
  paste('https://example.com/taste');
  expect(importPastedUrl).toHaveBeenCalledWith({ url: 'https://example.com/taste', placement: 'stream', folderId: 'f2' });
  await screen.findByRole('button', { name: 'Notes on Taste' });
  expect(screen.getByRole('status')).toHaveTextContent(/^In your Library, in Essays: Notes on Taste$/);
});

test('a page the server cannot read says so plainly', async () => {
  importPastedUrl.mockRejectedValue({ response: { status: 422 } });
  render(<LibraryPasteLink />);

  paste('https://example.com/walled');
  expect(await screen.findByText(/Noeis could not read that page/)).toBeInTheDocument();
});

test('without folders the sentence only says where, and Save shows once there is a link', () => {
  render(<LibraryPasteLink />);
  expect(screen.getByText(/^Goes/, { selector: 'p' })).toHaveTextContent(/^Goes on your nightstand\.$/);
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  fireEvent.change(field(), { target: { value: 'example.com/a' } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});

test('words that are not a link are not sent anywhere', () => {
  render(<LibraryPasteLink />);
  fireEvent.change(field(), { target: { value: 'not a link' } });
  fireEvent.submit(field().closest('form'));
  expect(importPastedUrl).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('That does not look like a link.');
});
