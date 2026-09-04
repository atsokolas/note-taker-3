import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Editions from './Editions';
import { listEditions } from '../api/editions';

jest.mock('../api/editions', () => ({ listEditions: jest.fn() }));

const row = (over = {}) => ({
  _id: 'e1',
  title: 'This Week in AI',
  issueLabel: 'Issue',
  number: 14,
  windowStart: '2026-09-01',
  windowEnd: '2026-09-07',
  itemCount: 4,
  savedCount: 1,
  unfilled: ['Evaluation & counterevidence'],
  writtenBy: 'OpenClaw · Jarvis',
  ...over
});

describe('the newsstand', () => {
  beforeEach(() => jest.clearAllMocks());

  const open = () => render(<MemoryRouter><Editions /></MemoryRouter>);

  it('says what the stand is for, and that Noeis does not write them', async () => {
    listEditions.mockResolvedValue([]);
    open();
    expect(await screen.findByText(/Noeis holds them to a shape; it does not write them/)).toBeInTheDocument();
  });

  it('reads each paper by its window and its issue', async () => {
    listEditions.mockResolvedValue([row()]);
    open();
    expect(await screen.findByText('This Week in AI')).toBeInTheDocument();
    expect(screen.getByText('Sep 1 – 7 · Issue 14')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /This Week in AI/ })).toHaveAttribute('href', '/editions/e1');
  });

  /* The two sentences that matter about a week. */
  it('says what the week left empty and how much of it you took', async () => {
    listEditions.mockResolvedValue([row()]);
    open();
    expect(await screen.findByText('1 of 4 in your library.')).toBeInTheDocument();
    expect(screen.getByText('Nothing this week under Evaluation & counterevidence.')).toBeInTheDocument();
  });

  /* A paper written by an agent says so, so you know which one to argue with. */
  it('signs the masthead', async () => {
    listEditions.mockResolvedValue([row()]);
    open();
    expect(await screen.findByText('Written by OpenClaw · Jarvis')).toBeInTheDocument();
  });

  it('stays quiet about a week that filled its own shape', async () => {
    listEditions.mockResolvedValue([row({ unfilled: [] })]);
    open();
    await screen.findByText('This Week in AI');
    expect(screen.queryByText(/Nothing this week under/)).not.toBeInTheDocument();
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
});
