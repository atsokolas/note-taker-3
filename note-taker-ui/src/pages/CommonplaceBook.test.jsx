import React from 'react';
import { render, screen, within } from '@testing-library/react';
import CommonplaceBook from './CommonplaceBook';
import { getCommonplaceBook } from '../api/library';
import { listBooks } from '../api/imports';

jest.mock('../api/library', () => ({ getCommonplaceBook: jest.fn() }));
jest.mock('../api/imports', () => ({ listBooks: jest.fn() }));

beforeEach(() => listBooks.mockResolvedValue([]));

const BOOK = {
  year: 2026,
  years: [2026, 2025],
  passages: 3,
  sources: 2,
  epigraph: {
    text: 'Adding manpower to a late software project makes it later.',
    title: 'The Mythical Man-Month',
    articleId: '64f100000000000000000001',
    highlightId: '64f100000000000000000011'
  },
  chapters: [
    {
      name: 'Software',
      passages: 2,
      sources: [{
        id: '64f100000000000000000001',
        title: 'The Mythical Man-Month',
        byline: 'Fred Brooks',
        passages: [
          { id: '64f100000000000000000012', text: 'Plan to throw one away; you will, anyhow.', note: '' },
          { id: '64f100000000000000000011', text: 'Adding manpower to a late software project makes it later.', note: 'Every time.' }
        ]
      }]
    },
    {
      name: null,
      passages: 1,
      sources: [{ id: '64f100000000000000000002', title: 'Seeing Like a State', byline: '', passages: [{ id: '64f100000000000000000021', text: 'Legibility is a central problem in statecraft.', note: '' }] }]
    }
  ]
};

describe('CommonplaceBook', () => {
  it('sets the year as a book: title page, epigraph, contents, chapters, notes beside passages', async () => {
    getCommonplaceBook.mockResolvedValue(BOOK);
    render(<CommonplaceBook />);
    expect(await screen.findByRole('heading', { level: 1, name: '2026' })).toBeInTheDocument();
    expect(screen.getByText('3 passages from 2 sources')).toBeInTheDocument();
    expect(screen.getByText(/the passage you went back to most/)).toBeInTheDocument();

    const contents = screen.getByRole('navigation', { name: 'Contents' });
    expect(within(contents).getAllByRole('link').map(link => link.textContent)).toEqual(['Software', 'Also marked']);
    expect(screen.getByRole('region', { name: 'Software' })).toBeInTheDocument();
    expect(screen.getByText('Every time.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2025' })).toHaveAttribute('href', '/library/book?year=2025');
    expect(screen.getByRole('button', { name: 'Print or save as PDF' })).toBeInTheDocument();
  });

  it('a book of one unnamed chapter has no contents and no chapter heading', async () => {
    getCommonplaceBook.mockResolvedValue({ ...BOOK, epigraph: null, chapters: [{ ...BOOK.chapters[1] }], passages: 1, sources: 1 });
    render(<CommonplaceBook />);
    expect(await screen.findByText('1 passage from 1 source')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Contents' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('an empty year says so in one line and offers nothing to print', async () => {
    getCommonplaceBook.mockResolvedValue({ year: 2019, years: [2026], passages: 0, sources: 0, epigraph: null, chapters: [] });
    render(<CommonplaceBook />);
    expect(await screen.findByText('Nothing was marked in 2019.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Print/ })).not.toBeInTheDocument();
  });

  it('the year’s finished books stand as a shelf of spines, a book read twice that year twice', async () => {
    getCommonplaceBook.mockResolvedValue(BOOK);
    const mark = (id, page, createdAt) => ({ _id: id, text: `Passage ${id}.`, page, createdAt });
    listBooks.mockResolvedValue([
      {
        _id: 'b1', title: 'Middlemarch', author: 'George Eliot', finishedOn: '2026-10-19',
        readBefore: [{ finishedOn: '2026-03-02', closingLine: '', until: '2026-03-03T00:00:00Z' }],
        marks: [mark('a', 10, '2026-02-01T20:00:00Z'), mark('b', 20, '2026-02-02T20:00:00Z'), mark('c', 30, '2026-02-03T20:00:00Z'), mark('d', 211, '2026-10-01T20:00:00Z')]
      },
      { _id: 'b2', title: 'Persuasion', finishedOn: '2025-12-30', marks: [] },
      { _id: 'b3', title: 'The Power Broker', finishedOn: '', marks: [] }
    ]);
    render(<CommonplaceBook />);
    const shelf = await screen.findByRole('region', { name: 'The books you finished' });
    const rows = within(shelf).getAllByRole('link');
    expect(rows.map(row => row.getAttribute('href'))).toEqual(['/books/b1', '/books/b1']);
    expect(rows[0]).toHaveTextContent('Middlemarch, George EliotMarch 2026 · pp. 10–30 · 3 quotes');
    expect(rows[1]).toHaveTextContent('October 2026 · p. 211 · 1 quote');
  });
});

