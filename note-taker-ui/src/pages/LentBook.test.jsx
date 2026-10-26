import React from 'react';
import { render, screen } from '@testing-library/react';
import * as Router from 'react-router-dom';
import LentBook from './LentBook';
import { getLentBook } from '../api/imports';

jest.mock('../api/imports', () => ({ getLentBook: jest.fn() }));
jest.mock('../api/highlights', () => ({}));
jest.mock('../hooks/useSeoMetadata', () => jest.fn());

const open = () => {
  jest.spyOn(Router, 'useParams').mockReturnValue({ slug: 'slug9' });
  return render(<LentBook />);
};

test('a lent book reads as its reader left it: their marks under their pages, and the sentence they kept', async () => {
  getLentBook.mockResolvedValue({
    title: 'Middlemarch',
    author: 'George Eliot',
    finishedOn: '2026-10-19',
    closingLine: 'Nobody is as finished as they think they are.',
    readBefore: [],
    marks: [
      { _id: 'm1', text: 'A finely touched spirit.', note: 'yes, exactly this', page: 3, createdAt: '2026-10-01T20:00:00Z' },
      { _id: 'm2', text: '', note: 'Why does she marry him?', page: 40, createdAt: '2026-10-02T20:00:00Z' }
    ]
  });
  open();
  expect(await screen.findByRole('heading', { level: 1, name: 'Middlemarch' })).toBeInTheDocument();
  expect(getLentBook).toHaveBeenCalledWith('slug9');
  expect(screen.getByText('A copy lent to you · George Eliot')).toBeInTheDocument();
  expect(screen.getByText('A finely touched spirit.', { selector: 'blockquote' })).toBeInTheDocument();
  expect(screen.getByText('Why does she marry him?', { selector: '.book-desk__own' })).toBeInTheDocument();
  expect(screen.getByText('Nobody is as finished as they think they are.')).toBeInTheDocument();
  expect(screen.getByText(/8 words of their own/)).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('a book taken back says so', async () => {
  getLentBook.mockRejectedValue(new Error('404'));
  open();
  expect(await screen.findByRole('alert')).toHaveTextContent('This book is not lent any more.');
});
