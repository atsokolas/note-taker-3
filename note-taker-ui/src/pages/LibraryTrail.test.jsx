import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import LibraryTrail, { outsideSearchHref } from './LibraryTrail';
import { getLibraryTrail } from '../api/libraryCollection';
import { createNotebookEntry } from '../api/notebook';

jest.mock('../api/libraryCollection', () => ({ getLibraryTrail: jest.fn() }));
jest.mock('../api/notebook', () => ({ createNotebookEntry: jest.fn() }));

const ARTICLE = '64f100000000000000000021';
const HIGHLIGHT = '64f100000000000000000099';

const mine = {
  kind: 'mine',
  articleId: ARTICLE,
  highlightId: HIGHLIGHT,
  title: 'Attention, explained from the start',
  author: 'Field Notes',
  passage: 'Attention lets a model weigh every word against every other word.',
  marked: true,
  date: '2017-06-12T00:00:00.000Z',
  why: 'The idea itself, before its costs.'
};
const outside = { kind: 'outside', title: 'Attention Is All You Need', author: 'Vaswani et al.', why: 'The turn the field took.' };

const open = (subject = 'attention') => {
  jest.spyOn(router, 'useSearchParams').mockReturnValue([new URLSearchParams({ subject }), jest.fn()]);
  return render(<MemoryRouter><LibraryTrail /></MemoryRouter>);
};

beforeEach(() => jest.clearAllMocks());

describe('LibraryTrail', () => {
  it('lays your pieces first, each opening at the passage you marked', async () => {
    getLibraryTrail.mockResolvedValue({ subject: 'attention', steps: [mine, outside], gap: 'Nothing here says where it led.', ordered: 'path', empty: false });
    open();
    expect(await screen.findByText('Foundations first, the frontier last.')).toBeInTheDocument();
    expect(getLibraryTrail).toHaveBeenCalledWith('attention');
    const title = screen.getByRole('link', { name: mine.title });
    expect(title).toHaveAttribute('href', `/library?articleId=${ARTICLE}&highlightId=${HIGHLIGHT}`);
    expect(screen.getByText('You marked')).toBeInTheDocument();
    expect(screen.getByText(mine.why)).toBeInTheDocument();
    expect(screen.getByText('Nothing here says where it led.')).toBeInTheDocument();
  });

  it('names a work from outside by title and author, linking only a search for it', async () => {
    getLibraryTrail.mockResolvedValue({ subject: 'attention', steps: [mine, outside], gap: 'A gap.', ordered: 'path', empty: false });
    open();
    const step = (await screen.findByText(outside.title)).closest('li');
    expect(within(step).getByText('From outside your library')).toBeInTheDocument();
    const links = within(step).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', outsideSearchHref(outside));
    expect(links[0].getAttribute('href')).toMatch(/^https:\/\/duckduckgo\.com\/\?q=%22Attention%20Is%20All%20You%20Need%22%20Vaswani/);
  });

  it('without a model, says the order is by date and shows no gap', async () => {
    getLibraryTrail.mockResolvedValue({ subject: 'attention', steps: [{ ...mine, why: '' }], gap: '', ordered: 'date', empty: false });
    open();
    expect(await screen.findByText('What you have saved on it, oldest first.')).toBeInTheDocument();
    expect(screen.queryByText('The gap')).not.toBeInTheDocument();
    expect(screen.queryByText('From outside your library')).not.toBeInTheDocument();
  });

  it('with nothing saved on the subject, says so in one line', async () => {
    getLibraryTrail.mockResolvedValue({ subject: 'the French Revolution', steps: [], gap: '', ordered: 'date', empty: true });
    open('the French Revolution');
    expect(await screen.findByText('Nothing in your Library is on the French Revolution yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep this trail' })).not.toBeInTheDocument();
  });

  it('keeps a trail as a note whose passages open where they came from', async () => {
    getLibraryTrail.mockResolvedValue({ subject: 'attention', steps: [mine, outside], gap: 'A gap.', ordered: 'path', empty: false });
    createNotebookEntry.mockResolvedValue({ _id: 'note-1' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Keep this trail' }));
    expect(await screen.findByText(/Kept in your notebook/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open it →' })).toHaveAttribute('href', '/think?tab=notebook&entryId=note-1');
    const [{ title, blocks }] = createNotebookEntry.mock.calls[0];
    expect(title).toBe('Trail: attention');
    expect(blocks.map(block => block.type)).toEqual(['paragraph', 'paragraph', 'highlight_embed', 'paragraph', 'paragraph']);
    expect(blocks[2]).toMatchObject({ highlightId: HIGHLIGHT, articleId: ARTICLE, sourcePath: `/library?articleId=${ARTICLE}&highlightId=${HIGHLIGHT}` });
    expect(blocks[3].text).toBe('The gap: A gap.');
    expect(blocks[4].text).toBe('2. Attention Is All You Need — Vaswani et al., from outside your library. The turn the field took.');
  });
});
