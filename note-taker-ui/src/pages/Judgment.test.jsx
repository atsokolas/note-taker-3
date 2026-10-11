import React from 'react';
import * as router from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Judgment from './Judgment';
import { useNoeisSurface } from '../surface/NoeisSurfaceContext';
import {
  createWikiPage,
  getWikiPage,
  listWikiPages,
  proposeJudgmentChange,
  resolveJudgmentChange,
  updateWikiPage
} from '../api/wiki';
import { recordJudgmentVerdict, setJudgmentResolution } from '../api/judgmentResolution';

jest.mock('../surface/NoeisSurfaceContext', () => ({ useNoeisSurface: jest.fn() }));

jest.mock('../api/wiki', () => ({
  createWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
  listWikiPages: jest.fn(),
  proposeJudgmentChange: jest.fn(),
  resolveJudgmentChange: jest.fn(),
  updateWikiPage: jest.fn()
}));

jest.mock('../api/judgmentResolution', () => ({
  recordJudgmentVerdict: jest.fn(),
  setJudgmentResolution: jest.fn()
}));

const CLAIM = 'Costco’s membership model makes it recession-resistant.';

const viewPage = (judgment = {}) => ({
  _id: 'view-1',
  title: CLAIM,
  judgment: {
    currentJudgment: CLAIM,
    startedAt: '2026-10-10T12:00:00.000Z',
    status: 'monitoring',
    why: [{
      reasonId: 'why-1',
      text: 'Renewals held above ninety percent through 2009.',
      sourceLabel: 'Costco FY09 10-K',
      acceptedFrom: 'highlight:article-1:highlight-1',
      createdAt: '2026-10-11T12:00:00.000Z'
    }],
    against: [{
      reasonId: 'against-1',
      text: 'Discretionary categories fall hard in a downturn.',
      sourceLabel: 'Ben Carlson',
      acceptedFrom: 'article:article-2',
      createdAt: '2026-10-12T12:00:00.000Z'
    }],
    ...judgment
  }
});

const openView = () => {
  jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'view-1' });
  return render(<Judgment />);
};

const openIndex = () => {
  jest.spyOn(router, 'useParams').mockReturnValue({});
  return render(<Judgment />);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  listWikiPages.mockResolvedValue([]);
  getWikiPage.mockResolvedValue(viewPage());
  updateWikiPage.mockImplementation(async (_id, updates) => ({ ...viewPage(), judgment: updates.judgment }));
});

describe('the index', () => {
  it('opens the hold form, with an example, when nothing is held', async () => {
    openIndex();
    const field = await screen.findByLabelText('One sentence you think is true.');
    expect(field).toHaveAttribute('placeholder', CLAIM);
    expect(screen.getByRole('button', { name: 'Hold it' })).toBeDisabled();
    expect(useNoeisSurface).toHaveBeenCalledWith(expect.objectContaining({ room: 'judgment', objectType: 'judgment_index' }));
  });

  it('holds a sentence and opens it', async () => {
    createWikiPage.mockResolvedValue({ _id: 'view-new' });
    updateWikiPage.mockResolvedValue({});
    openIndex();
    fireEvent.change(await screen.findByLabelText('One sentence you think is true.'), { target: { value: 'Rates stay high.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hold it' }));
    await waitFor(() => expect(router.useNavigate()).toHaveBeenCalledWith('/judgment/view-new'));
    expect(updateWikiPage).toHaveBeenCalledWith('view-new', {
      judgment: expect.objectContaining({ currentJudgment: 'Rates stay high.' })
    });
  });

  it('lists views with how long they have been held and what moved', async () => {
    listWikiPages.mockResolvedValue([viewPage(), { _id: 'plain', title: 'An ordinary wiki page' }]);
    openIndex();
    const link = await screen.findByRole('link', { name: CLAIM });
    expect(link).toHaveAttribute('href', '/judgment/view-1');
    expect(screen.getByText(/1 for · 1 against · moved Oct 12/)).toBeInTheDocument();
    expect(screen.queryByText('An ordinary wiki page')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Views/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Set aside' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The Mirror' })).toBeInTheDocument();
  });
});

describe('the view', () => {
  it('shows the sentence once, how long it has been held, and two columns', async () => {
    openView();
    expect(await screen.findByRole('heading', { level: 1, name: CLAIM })).toBeInTheDocument();
    expect(screen.getAllByText(CLAIM)).toHaveLength(1);
    expect(screen.getByText(/Held since Oct 10/)).toBeInTheDocument();
    const forColumn = screen.getByRole('region', { name: 'For' });
    expect(within(forColumn).getByText('Renewals held above ninety percent through 2009.')).toBeInTheDocument();
    expect(within(forColumn).getByRole('link', { name: 'Costco FY09 10-K' }).getAttribute('href')).toContain('highlight-1');
    const against = screen.getByRole('region', { name: 'Against' });
    expect(within(against).getByRole('link', { name: 'Ben Carlson' }).getAttribute('href')).toContain('article-2');
    expect(screen.getByText('Filed a passage against, from Ben Carlson.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revise' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
  });

  it('saves the confidence you choose on the existing field', async () => {
    openView();
    fireEvent.click(await screen.findByRole('button', { name: 'Fairly sure' }));
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith('view-1', {
      judgment: expect.objectContaining({ confidence: 0.75 })
    }));
    expect(screen.getByRole('button', { name: 'Fairly sure' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says so and puts the page back when a write does not land', async () => {
    updateWikiPage.mockRejectedValue(new Error('That did not save.'));
    openView();
    fireEvent.click(await screen.findByRole('button', { name: 'Sure' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not save.');
    expect(screen.getByRole('button', { name: 'Sure' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('revises the sentence and keeps the old one struck through in the record', async () => {
    proposeJudgmentChange.mockResolvedValue({ id: 'proposal-1' });
    resolveJudgmentChange.mockResolvedValue({
      page: viewPage({
        currentJudgment: 'Costco holds up in a mild recession.',
        heldHistory: [{ text: CLAIM, until: '2026-10-20T12:00:00.000Z' }]
      })
    });
    openView();
    fireEvent.click(await screen.findByRole('button', { name: 'Revise' }));
    fireEvent.change(screen.getByLabelText('The view, revised'), { target: { value: 'Costco holds up in a mild recession.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hold this instead' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Costco holds up in a mild recession.' })).toBeInTheDocument();
    expect(proposeJudgmentChange).toHaveBeenCalledWith('view-1', 'Costco holds up in a mild recession.');
    expect(resolveJudgmentChange).toHaveBeenCalledWith('view-1', 'proposal-1', 'accept');
    expect(screen.getByText(CLAIM).tagName).toBe('S');
  });

  it('resolves through the verdict path in plain words', async () => {
    recordJudgmentVerdict.mockResolvedValue({
      judgment: viewPage({ verdicts: [{ result: 'held_up', recordedAt: '2026-10-21T12:00:00.000Z' }] }).judgment
    });
    openView();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Held up' }));
    await waitFor(() => expect(recordJudgmentVerdict).toHaveBeenCalledWith({ pageId: 'view-1', expectedClaim: CLAIM, result: 'held_up' }));
    expect(await screen.findByText('Resolved: held up.')).toBeInTheDocument();
  });

  it('writes what would change my mind with an optional date', async () => {
    setJudgmentResolution.mockResolvedValue({
      judgment: viewPage({ resolutionCriteria: 'Two quarters of falling renewals.', resolutionHorizonAt: '2027-06-30T12:00:00.000Z' }).judgment
    });
    openView();
    fireEvent.click(await screen.findByRole('button', { name: 'Say what would change your mind.' }));
    fireEvent.change(screen.getByLabelText('In one line'), { target: { value: 'Two quarters of falling renewals.' } });
    fireEvent.change(screen.getByLabelText(/By when/), { target: { value: '2027-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setJudgmentResolution).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 'view-1',
      expectedClaim: CLAIM,
      criteria: 'Two quarters of falling renewals.',
      horizonAt: expect.stringMatching(/^2027-06-30/)
    })));
    expect(await screen.findByText(/By Jun 30\./)).toBeInTheDocument();
  });

  it('sets a view aside at once, and offers it back for six seconds', async () => {
    jest.useFakeTimers();
    try {
      openView();
      fireEvent.click(await screen.findByRole('button', { name: 'Set aside' }));
      await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith('view-1', {
        judgment: expect.objectContaining({ status: 'parked' })
      }));
      fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(updateWikiPage).toHaveBeenLastCalledWith('view-1', {
        judgment: expect.objectContaining({ status: 'monitoring' })
      }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      fireEvent.click(await screen.findByRole('button', { name: 'Set aside' }));
      await screen.findByRole('button', { name: 'Undo' });
      act(() => { jest.advanceTimersByTime(6000); });
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
      expect(await screen.findByRole('button', { name: 'Pick it back up' })).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('declares the view to the partner', async () => {
    openView();
    await screen.findByRole('heading', { level: 1, name: CLAIM });
    expect(useNoeisSurface).toHaveBeenCalledWith(expect.objectContaining({
      room: 'judgment',
      objectType: 'judgment_claim',
      objectId: 'view-1'
    }));
  });
});
