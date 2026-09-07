import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Editions from './Editions';
import { getEdition, listEditions } from '../api/editions';

jest.mock('../api/editions', () => ({
  listEditions: jest.fn(),
  getEdition: jest.fn()
}));

const SECTIONS = [
  { key: 'models_methods', label: 'Models & methods' },
  { key: 'evaluation_counterevidence', label: 'Evaluation & counterevidence' }
];

/* A window whose end is comfortably past, so the issue reads as closed. */
const closed = { windowStart: '2026-08-30', windowEnd: '2026-09-05' };
/* One that has not: filling. */
const filling = { windowStart: '2100-01-03', windowEnd: '2100-01-09' };

const row = (over = {}) => ({
  _id: 'e2',
  profile: 'this_week_in_ai',
  profileLabel: 'This Week in AI',
  title: 'This Week in AI',
  issueLabel: 'Issue',
  number: 2,
  sections: SECTIONS,
  itemCount: 1,
  savedCount: 0,
  unfilled: ['Evaluation & counterevidence'],
  writtenBy: 'Jarvis',
  ...filling,
  ...over
});

const item = (over = {}) => ({
  itemId: 'i1',
  title: 'A Unified Framework for VLA Agents',
  url: 'https://example.com/vla',
  sourceLabel: 'arXiv',
  sourceDate: '1 September 2026',
  section: 'models_methods',
  finding: 'Prerequisites are checked before acting and outcomes verified afterward.',
  boundary: 'A preprint, not independent production validation.',
  filedBy: 'Jarvis',
  savedArticleId: null,
  ...over
});

const full = (over = {}) => ({ ...row(), items: [item()], watchNext: [], ...over });

describe('the newsstand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getEdition.mockResolvedValue(full());
  });

  const open = () => render(<MemoryRouter><Editions /></MemoryRouter>);

  it('sets the paper by its nameplate and its dateline', async () => {
    listEditions.mockResolvedValue([row()]);
    open();
    expect(await screen.findByRole('heading', { name: 'This Week in AI' })).toBeInTheDocument();
    expect(screen.getByText('Issue 2', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/Sunday 3 – Saturday 9 January 2100/)).toBeInTheDocument();
  });

  /* One column per section: the shape of the paper is the shape of the week. */
  it('gives every section a column, filled or not', async () => {
    listEditions.mockResolvedValue([row()]);
    open();
    expect(await screen.findByText('Models & methods')).toBeInTheDocument();
    expect(screen.getByText('Evaluation & counterevidence')).toBeInTheDocument();
  });

  /* The tense of the silence. An open issue has not finished failing to find
     counterevidence; a closed one has. */
  it('says "nothing yet" while the issue is still filling', async () => {
    listEditions.mockResolvedValue([row()]);
    open();
    expect(await screen.findByText('Nothing yet.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing that week.')).not.toBeInTheDocument();
  });

  it('says "nothing that week" once the window has closed', async () => {
    listEditions.mockResolvedValue([row({ ...closed })]);
    getEdition.mockResolvedValue(full({ ...closed }));
    open();
    expect(await screen.findByText('Nothing that week.')).toBeInTheDocument();
  });

  /* Two agents can keep one paper, so a column carries its own byline. */
  it('signs each column with whoever filed it', async () => {
    listEditions.mockResolvedValue([row()]);
    getEdition.mockResolvedValue(full({
      items: [item(), item({ itemId: 'i2', url: 'https://example.com/two', filedBy: 'Hermes' })]
    }));
    open();
    expect(await screen.findByText('Filed by Jarvis and Hermes')).toBeInTheDocument();
  });

  it('stays quiet about a byline nobody signed', async () => {
    listEditions.mockResolvedValue([row()]);
    getEdition.mockResolvedValue(full({ items: [item({ filedBy: '' })] }));
    open();
    await screen.findByText('Models & methods');
    expect(screen.queryByText(/Filed by/)).not.toBeInTheDocument();
  });

  /* A headline carries the front page; the finding is folded underneath it. */
  it('shows the headline first and unfolds the finding on click', async () => {
    listEditions.mockResolvedValue([row()]);
    open();
    const head = await screen.findByRole('button', { name: /A Unified Framework/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Prerequisites are checked before acting/)).toBeInTheDocument();
    expect(screen.getByText(/not independent production validation/)).toBeInTheDocument();
  });

  /* A run of issues, not a pile: the same paper, turned back through. */
  it('gathers a paper’s issues into one run and turns between them', async () => {
    listEditions.mockResolvedValue([
      row(),
      row({ _id: 'e1', number: 1, ...closed })
    ]);
    open();
    const run = await screen.findByRole('navigation', { name: /back issues/ });
    expect(within(run).getByRole('button', { name: 'Issue 2' })).toHaveAttribute('aria-current', 'true');

    await userEvent.click(within(run).getByRole('button', { name: 'Issue 1' }));
    await waitFor(() => {
      expect(within(run).getByRole('button', { name: 'Issue 1' })).toHaveAttribute('aria-current', 'true');
    });
  });

  /* Papers, not a date-ordered pile: two profiles are two front pages. */
  it('keeps two papers apart rather than interleaving them by date', async () => {
    listEditions.mockResolvedValue([
      row(),
      row({ _id: 'w1', profile: 'weekend_readings', profileLabel: 'Weekend Readings', title: 'Weekend Readings', number: 1 })
    ]);
    open();
    expect(await screen.findByRole('heading', { name: 'This Week in AI' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weekend Readings' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: /back issues/ })).toHaveLength(2);
  });

  /* An empty stand is not a failure state — the reader who has never
     connected an agent is not failing at anything. */
  it('tells you how to get one when there is none', async () => {
    listEditions.mockResolvedValue([]);
    open();
    expect(await screen.findByText('No paper yet.')).toBeInTheDocument();
    expect(screen.getByText(/noeis connect/)).toBeInTheDocument();
  });

  /* Nothing on the stand is not the same as nothing loaded. */
  it('does not claim an empty stand before it has looked', () => {
    listEditions.mockReturnValue(new Promise(() => {}));
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Opening the stand…');
    expect(screen.queryByText('No paper yet.')).not.toBeInTheDocument();
  });

  it('says so when the stand does not answer', async () => {
    listEditions.mockRejectedValue({ response: { data: { error: 'Nope.' } } });
    open();
    await waitFor(() => expect(screen.getByText('Nope.')).toBeInTheDocument());
  });

  /* The masthead stands even when the columns cannot be set. */
  it('keeps the nameplate when an issue will not open', async () => {
    listEditions.mockResolvedValue([row()]);
    getEdition.mockRejectedValue(new Error('nope'));
    open();
    expect(await screen.findByRole('heading', { name: 'This Week in AI' })).toBeInTheDocument();
  });
});
