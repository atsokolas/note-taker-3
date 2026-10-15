import React from 'react';
import * as router from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Judgment from './Judgment';
import { useNoeisSurface } from '../surface/NoeisSurfaceContext';
import {
  createWikiPage,
  getJudgmentLibraryEvidence,
  getWikiPage,
  listReadingProposals,
  listWikiPages,
  proposeJudgmentChange,
  resolveJudgmentChange,
  updateWikiPage
} from '../api/wiki';
import {
  fileJudgmentEvidence,
  fileReadingProposal,
  recordJudgmentVerdict,
  setJudgmentResolution
} from '../api/judgmentResolution';

jest.mock('../surface/NoeisSurfaceContext', () => ({ useNoeisSurface: jest.fn() }));

jest.mock('../api/wiki', () => ({
  createWikiPage: jest.fn(),
  getJudgmentLibraryEvidence: jest.fn(),
  getWikiPage: jest.fn(),
  listReadingProposals: jest.fn(),
  listWikiPages: jest.fn(),
  proposeJudgmentChange: jest.fn(),
  resolveJudgmentChange: jest.fn(),
  updateWikiPage: jest.fn()
}));

jest.mock('../api/judgmentResolution', () => ({
  fileJudgmentEvidence: jest.fn(),
  fileReadingProposal: jest.fn(),
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
  listReadingProposals.mockResolvedValue([]);
  getJudgmentLibraryEvidence.mockResolvedValue({ candidates: [] });
  getWikiPage.mockResolvedValue(viewPage());
  updateWikiPage.mockImplementation(async (_id, updates) => ({ ...viewPage(), judgment: updates.judgment }));
});

describe('the index', () => {
  it('opens the hold form, with an example, when nothing is held', async () => {
    openIndex();
    const field = await screen.findByLabelText('One sentence you think is true.');
    expect(field).toHaveAttribute('placeholder', 'Costco can ride out a recession.');
    expect(screen.getByText(/Noeis reads what you have saved against it/)).toBeInTheDocument();
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

  it('arrives from a wiki disagreement with the sentence ready to say your way', async () => {
    jest.spyOn(router, 'useSearchParams').mockReturnValue([new URLSearchParams({ hold: CLAIM }), jest.fn()]);
    createWikiPage.mockResolvedValue({ _id: 'view-new' });
    updateWikiPage.mockResolvedValue({});
    openIndex();
    const field = await screen.findByLabelText('Your sources disagree about this. Say it the way you hold it.');
    expect(field).toHaveValue(CLAIM);
    fireEvent.change(field, { target: { value: 'Costco members cancel in a real recession.' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith('view-new', {
      judgment: expect.objectContaining({ currentJudgment: 'Costco members cancel in a real recession.' })
    }));
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

  it('opens on its question once the date you set has passed', async () => {
    getWikiPage.mockResolvedValue(viewPage({
      resolutionCriteria: 'Renewals stay above ninety percent through the next downturn.',
      resolutionHorizonAt: '2026-10-01T12:00:00.000Z'
    }));
    openView();
    const ask = await screen.findByRole('group', { name: 'How it turned out' });
    expect(ask).toHaveTextContent(/^You said you would know by Oct 1\. Did it hold up\?/);
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
    fireEvent.click(within(ask).getByRole('button', { name: 'Too early to say' }));
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
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
    // Passages read against the old test are asked for again.
    expect(listReadingProposals).toHaveBeenCalledTimes(2);
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

  describe('the library, read at once', () => {
    const PASSAGE = 'Renewal rates held above ninety percent even as shoppers traded down.';
    const candidate = {
      id: 'highlight:article-4:highlight-7',
      text: PASSAGE,
      sourceLabel: 'Costco and the Membership Moat',
      savedAt: '2026-10-09T12:00:00.000Z'
    };

    it('offers what you already saved and files it where you say', async () => {
      getJudgmentLibraryEvidence.mockResolvedValue({ candidates: [candidate] });
      fileJudgmentEvidence.mockResolvedValue({ judgment: viewPage().judgment });
      openView();
      const region = await screen.findByRole('region', { name: 'Already in your library' });
      expect(getJudgmentLibraryEvidence).toHaveBeenCalledWith('view-1', { limit: 3 });
      const who = within(region).getByRole('link', { name: 'Costco and the Membership Moat' });
      expect(who).toHaveAttribute('href', '/library?articleId=article-4&highlightId=highlight-7');
      expect(who.closest('p')).toHaveTextContent('Costco and the Membership Moat, saved Oct 9:');
      fireEvent.click(within(region).getByRole('button', { name: 'File for' }));
      await waitFor(() => expect(fileJudgmentEvidence).toHaveBeenCalledWith({
        pageId: 'view-1',
        expectedClaim: CLAIM,
        field: 'why',
        articleId: 'article-4',
        highlightId: 'highlight-7',
        quote: PASSAGE
      }));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Already in your library' })).not.toBeInTheDocument());
    });

    it('keeps a passage that is not about the view aside, on the view', async () => {
      getJudgmentLibraryEvidence.mockResolvedValue({ candidates: [candidate] });
      openView();
      fireEvent.click(await screen.findByRole('button', { name: 'Not about this' }));
      await waitFor(() => expect(updateWikiPage).toHaveBeenCalledWith('view-1', {
        judgment: expect.objectContaining({ notAboutIds: [candidate.id] })
      }));
      await waitFor(() => expect(screen.queryByText(PASSAGE)).not.toBeInTheDocument());
    });

    it('is silent when the library has nothing on it', async () => {
      openView();
      await screen.findByRole('heading', { level: 1, name: CLAIM });
      expect(screen.queryByRole('region', { name: 'Already in your library' })).not.toBeInTheDocument();
    });
  });

  describe('reading talks back', () => {
    const QUOTE = 'Executive membership upgrades slowed sharply during the last downturn.';
    const proposal = {
      id: 'judgment-change-proposal:view-1:abc',
      sourceLabel: 'When Bulk Stops Making Sense',
      provenance: { change: 'evidence', stance: 'challenge', after: QUOTE, articleId: 'article-9', author: 'Ben Carlson', publishedAt: '2026-10-01T12:00:00.000Z' }
    };

    it('shows one quiet line per waiting passage, and files it where you say', async () => {
      listReadingProposals.mockResolvedValue([proposal]);
      fileReadingProposal.mockResolvedValue({});
      openView();
      const region = await screen.findByRole('region', { name: 'From your reading' });
      const who = within(region).getByRole('link', { name: 'Ben Carlson' });
      expect(decodeURIComponent(who.getAttribute('href'))).toContain('/library?articleId=article-9#passage=');
      expect(decodeURIComponent(who.getAttribute('href'))).toContain(QUOTE);
      expect(who.closest('p')).toHaveTextContent('Ben Carlson, Oct 1, argues against this:');
      expect(screen.getByText(QUOTE)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'File against' }));
      await waitFor(() => expect(fileReadingProposal).toHaveBeenCalledWith({ pageId: 'view-1', proposalId: proposal.id, field: 'against' }));
      await waitFor(() => expect(screen.queryByText(QUOTE)).not.toBeInTheDocument());
      expect(getWikiPage).toHaveBeenCalledTimes(2);
    });

    it('sets a passage aside as not relevant at once, with six seconds to take it back', async () => {
      jest.useFakeTimers();
      try {
        listReadingProposals.mockResolvedValue([proposal]);
        resolveJudgmentChange.mockResolvedValue({ page: viewPage() });
        openView();
        fireEvent.click(await screen.findByRole('button', { name: 'Not relevant' }));
        expect(screen.queryByText(QUOTE)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(await screen.findByText(QUOTE)).toBeInTheDocument();
        expect(resolveJudgmentChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Not relevant' }));
        act(() => { jest.advanceTimersByTime(6000); });
        await waitFor(() => expect(resolveJudgmentChange).toHaveBeenCalledWith('view-1', proposal.id, 'reject'));
      } finally {
        jest.useRealTimers();
      }
    });

    it('puts a passage that meets a falsifier under what would change your mind, in your words', async () => {
      const met = { ...proposal, provenance: { ...proposal.provenance, falsifier: 'Two quarters of falling renewals.' } };
      listReadingProposals.mockResolvedValue([met]);
      openView();
      const region = await screen.findByRole('region', { name: 'A source meets it' });
      expect(region.closest('.judgment-test')).not.toBeNull();
      expect(region).toHaveTextContent('You said you’d change your mind if “Two quarters of falling renewals.”');
      expect(region).toHaveTextContent('Ben Carlson, Oct 1, meets it:');
      expect(within(region).getByText(QUOTE)).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'From your reading' })).not.toBeInTheDocument();
    });

    it('takes passages read against the old test away at once when the test changes', async () => {
      const met = { ...proposal, provenance: { ...proposal.provenance, falsifier: 'Two quarters of falling renewals.' } };
      listReadingProposals.mockResolvedValueOnce([met]).mockReturnValueOnce(new Promise(() => {}));
      setJudgmentResolution.mockResolvedValue({ judgment: viewPage({ resolutionCriteria: 'Churn above ten percent.' }).judgment });
      openView();
      expect(await screen.findByText(QUOTE)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /what would change your mind|Edit/i }));
      fireEvent.change(screen.getByLabelText('In one line'), { target: { value: 'Churn above ten percent.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.queryByText(QUOTE)).not.toBeInTheDocument());
    });

    it('never lets the first list bring back a passage after the test has changed', async () => {
      const met = { ...proposal, provenance: { ...proposal.provenance, falsifier: 'Two quarters of falling renewals.' } };
      let firstList;
      listReadingProposals
        .mockReturnValueOnce(new Promise((resolve) => { firstList = resolve; }))
        .mockResolvedValueOnce([]);
      setJudgmentResolution.mockResolvedValue({ judgment: viewPage({ resolutionCriteria: 'Churn above ten percent.' }).judgment });
      openView();
      fireEvent.click(await screen.findByRole('button', { name: /what would change your mind|Edit/i }));
      fireEvent.change(screen.getByLabelText('In one line'), { target: { value: 'Churn above ten percent.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(listReadingProposals).toHaveBeenCalledTimes(2));
      await act(async () => { firstList([met]); });
      expect(screen.queryByText(QUOTE)).not.toBeInTheDocument();
    });

    it('keeps a passage set aside out of the list read again while its undo is on offer', async () => {
      listReadingProposals.mockResolvedValue([proposal]);
      resolveJudgmentChange.mockResolvedValue({ page: viewPage() });
      setJudgmentResolution.mockResolvedValue({ judgment: viewPage({ resolutionCriteria: 'Churn above ten percent.' }).judgment });
      openView();
      fireEvent.click(await screen.findByRole('button', { name: 'Not relevant' }));
      fireEvent.click(screen.getByRole('button', { name: /what would change your mind|Edit/i }));
      fireEvent.change(screen.getByLabelText('In one line'), { target: { value: 'Churn above ten percent.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(listReadingProposals).toHaveBeenCalledTimes(2));
      await act(async () => {});
      expect(screen.queryByText(QUOTE)).not.toBeInTheDocument();
    });

    it('takes back a passage set aside only if it still reads against the view', async () => {
      listReadingProposals.mockResolvedValueOnce([proposal]).mockResolvedValue([]);
      setJudgmentResolution.mockResolvedValue({ judgment: viewPage({ resolutionCriteria: 'Churn above ten percent.' }).judgment });
      openView();
      fireEvent.click(await screen.findByRole('button', { name: 'Not relevant' }));
      fireEvent.click(screen.getByRole('button', { name: /what would change your mind|Edit/i }));
      fireEvent.change(screen.getByLabelText('In one line'), { target: { value: 'Churn above ten percent.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(listReadingProposals).toHaveBeenCalledTimes(2));
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(listReadingProposals).toHaveBeenCalledTimes(3));
      await act(async () => {});
      expect(screen.queryByText(QUOTE)).not.toBeInTheDocument();
    });

    it('says nothing when no passage is waiting', async () => {
      openView();
      await screen.findByRole('heading', { level: 1, name: CLAIM });
      expect(screen.queryByRole('region', { name: 'From your reading' })).not.toBeInTheDocument();
    });
  });
});
