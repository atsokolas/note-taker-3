import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import Judgment from './Judgment';
import { getWikiPage, listWikiSourceEvents, updateWikiPage } from '../api/wiki';

jest.mock('../api/articles', () => ({ getArticles: jest.fn(() => Promise.resolve([])) }));

jest.mock('../api/wiki', () => ({
  askWikiPage: jest.fn(),
  createWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
  listWikiPages: jest.fn().mockResolvedValue([]),
  listWikiSourceEvents: jest.fn(),
  updateWikiPage: jest.fn()
}));

const page = () => ({
  _id: 'p1',
  title: 'A written process improves judgment.',
  judgment: {
    currentJudgment: 'A written process improves judgment.',
    why: [{ reasonId: 'r1', text: 'Process still loses half the bets.', sourceRefIds: [], sourceLabel: 'Everyone Has a Process' }],
    against: [],
    falsifiers: [],
    decisions: []
  }
});

/* A judgment carried out of a tension arrives with two sides written and two
   sections empty. An empty section used to be absent entirely, so the page that
   is supposed to hold four things showed one. */
describe('the four sections of a judgment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    getWikiPage.mockResolvedValue(page());
    listWikiSourceEvents.mockResolvedValue([]);
  });

  it('are all on the page, whether or not there is anything in them yet', async () => {
    render(<MemoryRouter><Judgment /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Why' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Against' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /change my mind if/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What I did' })).toBeInTheDocument();
    expect(screen.getByText('Process still loses half the bets.')).toBeInTheDocument();
  });

  /* No Write button. A sentence you typed but had not submitted used to be
     nowhere — you could fill in all four fields, look away, and have written
     nothing down. */
  it('write themselves down, and keep the lines already written', async () => {
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
    render(<MemoryRouter><Judgment /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Why' });
    expect(screen.queryByRole('button', { name: 'Write' })).toBeNull();

    const input = screen.getByLabelText('What would change your mind?');
    fireEvent.change(input, { target: { value: 'Two quarters of falling margin.' } });
    fireEvent.blur(input);

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, updates] = updateWikiPage.mock.calls[0];
    expect(updates.judgment.falsifiers).toEqual([
      { falsifierId: expect.stringMatching(/^changeMindIf_/), text: 'Two quarters of falling margin.' }
    ]);
    expect(updates.judgment.why[0].text).toBe('Process still loses half the bets.');
  });

  /* Still typing the same sentence rewrites that line. A save that fired while
     you were mid-sentence used to append, so pausing twice in one thought left
     you with two lines saying half of it each. */
  it('rewrite the line still being typed rather than adding another', async () => {
    jest.useFakeTimers();
    try {
      updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
      render(<MemoryRouter><Judgment /></MemoryRouter>);
      await act(async () => { jest.advanceTimersByTime(0); });
      const input = screen.getByLabelText('What would change your mind?');

      fireEvent.change(input, { target: { value: 'Two quarters' } });
      await act(async () => { jest.advanceTimersByTime(800); });
      expect(updateWikiPage).toHaveBeenCalledTimes(1);

      // Kept typing — same line, no Enter, no leaving the field.
      fireEvent.change(input, { target: { value: 'Two quarters of falling margin.' } });
      await act(async () => { jest.advanceTimersByTime(800); });
      expect(updateWikiPage).toHaveBeenCalledTimes(2);

      const [, updates] = updateWikiPage.mock.calls[1];
      expect(updates.judgment.falsifiers).toHaveLength(1);
      expect(updates.judgment.falsifiers[0].text).toBe('Two quarters of falling margin.');
    } finally {
      jest.useRealTimers();
    }
  });

  /* Leaving the field settles the sentence into the section as a line, rather
     than leaving it sitting in the box you typed it in. */
  it('settle the line when you leave the field', async () => {
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
    render(<MemoryRouter><Judgment /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Why' });

    const input = screen.getByLabelText('What would change your mind?');
    fireEvent.change(input, { target: { value: 'Two quarters of falling margin.' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveValue(''));
    expect(await screen.findByText('Two quarters of falling margin.')).toBeInTheDocument();
  });

  it('finish the line on Enter, so the next one starts clean', async () => {
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
    render(<MemoryRouter><Judgment /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Why' });

    const input = screen.getByLabelText('What would change your mind?');
    fireEvent.change(input, { target: { value: 'Two quarters of falling margin.' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(input).toHaveValue(''));
    expect(await screen.findByText('Two quarters of falling margin.')).toBeInTheDocument();
  });
});

/* A save that comes back without the line is the failure that leaves no trace:
   the line settles into the field, the response replaces the page, and it is
   gone with nothing to read. */
describe('a line that does not land', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    getWikiPage.mockResolvedValue(page());
    listWikiSourceEvents.mockResolvedValue([]);
  });

  it('says so, instead of quietly dropping it', async () => {
    // 200, but the server kept nothing new.
    updateWikiPage.mockResolvedValue(page());
    render(<MemoryRouter><Judgment /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Why' });

    const input = screen.getByLabelText('What would change your mind?');
    fireEvent.change(input, { target: { value: 'Two quarters of falling margin.' } });
    fireEvent.blur(input);

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not saved/);
  });
});
