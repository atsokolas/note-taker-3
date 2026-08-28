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
  getCompanyDossierJudgmentReview: jest.fn().mockResolvedValue(null),
  getJudgmentLibraryEvidence: jest.fn().mockResolvedValue({ candidates: [] }),
  getWikiPage: jest.fn(),
  listCompanyDossierJudgmentReviews: jest.fn().mockResolvedValue([]),
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

const renderCase = () => render(<MemoryRouter><Judgment /></MemoryRouter>);

const choose = (kind) => {
  fireEvent.click(screen.getByRole('radio', { name: kind }));
};

describe('updates on an opened judgment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    getWikiPage.mockResolvedValue(page());
    listWikiSourceEvents.mockResolvedValue([]);
  });

  it('holds the prior still, and the log underneath', async () => {
    renderCase();
    expect(await screen.findByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('What you hold')).toHaveValue('A written process improves judgment.');
    expect(screen.getByText('Process still loses half the bets.')).toBeInTheDocument();
    expect(screen.getByLabelText('Source 1: Everyone Has a Process')).toHaveTextContent('[1]');
    expect(screen.queryByText('Everyone Has a Process')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Why' })).toBeChecked();
  });

  it('writes a line into the log and keeps what was already there', async () => {
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
    renderCase();
    await screen.findByLabelText('Title');
    expect(screen.queryByRole('button', { name: 'Write' })).toBeNull();

    choose('Change');
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

  it('rewrites the line still being typed rather than adding another', async () => {
    jest.useFakeTimers();
    try {
      updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
      renderCase();
      await act(async () => { jest.advanceTimersByTime(0); });
      choose('Change');
      const input = screen.getByLabelText('What would change your mind?');

      fireEvent.change(input, { target: { value: 'Two quarters' } });
      await act(async () => { jest.advanceTimersByTime(800); });
      expect(updateWikiPage).toHaveBeenCalledTimes(1);

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

  it('settle the line when you leave the field', async () => {
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
    renderCase();
    await screen.findByLabelText('Title');
    choose('Change');
    const input = screen.getByLabelText('What would change your mind?');
    fireEvent.change(input, { target: { value: 'Two quarters of falling margin.' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveValue(''));
    expect(await screen.findByText('Two quarters of falling margin.')).toBeInTheDocument();
  });

  it('finish the line on Enter, so the next one starts clean', async () => {
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
    renderCase();
    await screen.findByLabelText('Title');
    choose('Change');
    const input = screen.getByLabelText('What would change your mind?');
    fireEvent.change(input, { target: { value: 'Two quarters of falling margin.' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(input).toHaveValue(''));
    expect(await screen.findByText('Two quarters of falling margin.')).toBeInTheDocument();
  });
});

describe('a line that does not land', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    getWikiPage.mockResolvedValue(page());
    listWikiSourceEvents.mockResolvedValue([]);
  });

  it('says so, instead of quietly dropping it', async () => {
    updateWikiPage.mockResolvedValue(page());
    renderCase();
    await screen.findByLabelText('Title');
    choose('Change');
    const input = screen.getByLabelText('What would change your mind?');
    fireEvent.change(input, { target: { value: 'Two quarters of falling margin.' } });
    fireEvent.blur(input);

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not saved/);
  });

  it('keeps the current kind when settling the draft fails', async () => {
    updateWikiPage.mockRejectedValue(new Error('That line was not saved. It is still only on this screen.'));
    renderCase();
    await screen.findByLabelText('Title');
    const input = screen.getByLabelText('Why do you believe it?');
    fireEvent.change(input, { target: { value: 'Process still loses half the bets twice.' } });
    choose('Against');

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not saved/);
    expect(screen.getByRole('radio', { name: 'Why' })).toBeChecked();
    expect(input).toHaveValue('Process still loses half the bets twice.');
  });
});
