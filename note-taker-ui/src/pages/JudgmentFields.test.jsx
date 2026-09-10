import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import Judgment from './Judgment';
import { getCompanyDossierJudgmentReview, getJudgmentLibraryEvidence, getWikiPage, listWikiSourceEvents, updateWikiPage } from '../api/wiki';
import { recordClaimFalsifiability } from '../api/dailyLoop';

jest.mock('../api/articles', () => ({ getArticles: jest.fn(() => Promise.resolve([])) }));

jest.mock('../api/dailyLoop', () => ({
  recordClaimFalsifiability: jest.fn(() => Promise.resolve({}))
}));

jest.mock('../api/wiki', () => ({
  askWikiPage: jest.fn(),
  createWikiPage: jest.fn(),
  getCompanyDossierJudgmentReview: jest.fn(() => Promise.resolve(null)),
  getJudgmentLibraryEvidence: jest.fn(() => Promise.resolve({ claim: '', terms: [], candidates: [] })),
  getWikiPage: jest.fn(),
  listCompanyDossierJudgmentReviews: jest.fn(() => Promise.resolve([])),
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

/* The four kinds are blocks now, not tabs: you open the one you mean to
   write in, and its field appears there. */
const INVITATION = {
  Why: 'Add a reason…',
  Against: 'Add counterevidence…',
  Change: 'Add a test…',
  Did: 'Record what you did…'
};

const choose = (kind) => {
  fireEvent.click(screen.getByRole('button', { name: INVITATION[kind] }));
};

describe('updates on an opened judgment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    getWikiPage.mockResolvedValue(page());
    listWikiSourceEvents.mockResolvedValue([]);
    getCompanyDossierJudgmentReview.mockResolvedValue(null);
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: '', terms: [], candidates: [] });
  });

  it('holds the prior still, with the four blocks under it', async () => {
    renderCase();
    expect(await screen.findByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('What you hold')).toHaveValue('A written process improves judgment.');
    expect(screen.getByText('Process still loses half the bets.')).toBeInTheDocument();
    /* What a line rests on is said once, by the mark after it. */
    expect(screen.getByLabelText('Source 1: Everyone Has a Process')).toHaveTextContent('[1]');
    expect(screen.queryByText('Everyone Has a Process')).not.toBeInTheDocument();

    /* All four are on screen at once, so an empty side reads as an absence
       rather than as a tab nobody opened. */
    ['Why you believe it', 'What would change your mind', 'What argues against it', 'What you did about it']
      .forEach(label => expect(screen.getByRole('region', { name: label })).toBeInTheDocument());
  });

  /* At rest the page is record, not form: nothing on it looks like a field
     until you ask for one. */
  it('carries no field until a block is opened', async () => {
    renderCase();
    await screen.findByLabelText('Title');
    expect(screen.queryByLabelText('Why do you believe it?')).not.toBeInTheDocument();

    choose('Why');
    expect(screen.getByLabelText('Why do you believe it?')).toBeInTheDocument();
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
    getCompanyDossierJudgmentReview.mockResolvedValue(null);
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: '', terms: [], candidates: [] });
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

  /* A line that would not save is still the writer's. It stays in the field,
     with the reason it did not land. */
  it('keeps the words in the field when the save fails', async () => {
    updateWikiPage.mockRejectedValue(new Error('That line was not saved. It is still only on this screen.'));
    renderCase();
    await screen.findByLabelText('Title');
    choose('Why');
    const input = screen.getByLabelText('Why do you believe it?');
    fireEvent.change(input, { target: { value: 'Process still loses half the bets twice.' } });
    fireEvent.blur(input);

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not saved/);
    expect(input).toHaveValue('Process still loses half the bets twice.');
  });
});

describe('a saved line is never held hostage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    getWikiPage.mockResolvedValue(page());
    listWikiSourceEvents.mockResolvedValue([]);
    getCompanyDossierJudgmentReview.mockResolvedValue(null);
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: '', terms: [], candidates: [] });
  });

  it('settles the line even when recording its criteria fails', async () => {
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
    recordClaimFalsifiability.mockRejectedValue(new Error('offline'));
    renderCase();
    await screen.findByLabelText('Title');
    choose('Change');
    const input = screen.getByLabelText('What would change your mind?');
    fireEvent.change(input, { target: { value: 'Two quarters of falling margin.' } });
    fireEvent.blur(input);

    // The sentence is committed, so the composer must let go of it.
    await waitFor(() => expect(input).toHaveValue(''));
    expect(await screen.findByText('Two quarters of falling margin.')).toBeInTheDocument();
    expect(recordClaimFalsifiability).toHaveBeenCalled();
  });
});

/**
 * Where a line goes, and how much of it you see.
 */
describe('the shape of a block', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    getWikiPage.mockResolvedValue(page());
    listWikiSourceEvents.mockResolvedValue([]);
    getCompanyDossierJudgmentReview.mockResolvedValue(null);
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: '', terms: [], candidates: [] });
  });

  /* A block rests as its newest sentence, and everything older is behind one
     door. Four blocks then read as four sentences. */
  it('rests as its newest sentence, with the rest behind one door', async () => {
    const many = page();
    many.judgment.why = [
      { reasonId: 'w1', text: 'The older reason.' },
      { reasonId: 'w2', text: 'The newer reason.' }
    ];
    getWikiPage.mockResolvedValue(many);
    renderCase();
    await screen.findByLabelText('Title');

    const why = screen.getByRole('region', { name: 'Why you believe it' });
    expect(within(why).getByText('The newer reason.')).toBeInTheDocument();
    expect(within(why).queryByText('The older reason.')).not.toBeInTheDocument();

    const door = within(why).getByRole('button', { name: 'and one earlier' });
    expect(door).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(door);

    expect(within(why).getByText('The older reason.')).toBeInTheDocument();
    /* Newest first, so the line you just wrote is still the one on top. */
    const written = within(why).getAllByText(/reason\./);
    expect(written[0]).toHaveTextContent('The newer reason.');
    expect(written[1]).toHaveTextContent('The older reason.');

    fireEvent.click(within(why).getByRole('button', { name: 'Fold' }));
    expect(within(why).queryByText('The older reason.')).not.toBeInTheDocument();
  });

  /* A door that opens onto nothing is worse than no door. */
  it('shows no door when the block holds one short line', async () => {
    renderCase();
    await screen.findByLabelText('Title');

    const why = screen.getByRole('region', { name: 'Why you believe it' });
    expect(within(why).getByText('Process still loses half the bets.')).toBeInTheDocument();
    expect(within(why).queryByRole('button', { name: /earlier|Fold|in full/ })).toBeNull();
  });

  /* The field sits above the lines it will join, so what you write appears
     directly under where you wrote it. */
  it('opens the field above the lines, not beneath them', async () => {
    renderCase();
    await screen.findByLabelText('Title');
    choose('Why');

    const why = screen.getByRole('region', { name: 'Why you believe it' });
    const field = within(why).getByLabelText('Why do you believe it?');
    const firstLine = within(why).getByText(/Process still loses half the bets/);
    expect(field.compareDocumentPosition(firstLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /* Not a box and not a button: the block's next sentence, which becomes a
     field only when it is reached for. */
  it('carries no field until the ghost line is reached for', async () => {
    renderCase();
    await screen.findByLabelText('Title');

    expect(screen.queryByLabelText('Why do you believe it?')).not.toBeInTheDocument();
    choose('Why');
    expect(screen.getByLabelText('Why do you believe it?')).toBeInTheDocument();
  });
});

/**
 * Where you stand, in one sentence — so a reader learns what the case is made
 * of without counting the blocks themselves.
 */
describe('the standing line', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    listWikiSourceEvents.mockResolvedValue([]);
    getCompanyDossierJudgmentReview.mockResolvedValue(null);
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: '', terms: [], candidates: [] });
  });

  it('spells what the belief is made of, in words rather than a scoreboard', async () => {
    const made = page();
    made.judgment.bornAt = '2026-03-14T12:00:00.000Z';
    made.judgment.against = [{ text: 'One objection.' }, { text: 'Another objection.' }];
    made.judgment.falsifiers = [{ falsifierId: 'f1', text: 'A cheaper model ships.', observableSignal: 'MMLU per dollar halves.' }];
    getWikiPage.mockResolvedValue(made);
    renderCase();
    await screen.findByLabelText('Title');

    expect(screen.getByText(/Held since March 14/)).toBeInTheDocument();
    expect(screen.getByText(/One reason, two objections, one test\./)).toBeInTheDocument();
  });

  /* Unknown is not zero: an empty case says nothing rather than reporting
     that it holds no reasons, no objections and no tests. */
  it('says nothing about a case with nothing in it', async () => {
    const bare = page();
    bare.judgment.why = [];
    getWikiPage.mockResolvedValue(bare);
    renderCase();
    await screen.findByLabelText('Title');

    expect(screen.queryByText(/no reasons/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 reasons/)).not.toBeInTheDocument();
  });
});

/**
 * A warning that names no way out is a complaint.
 */
describe('a test nothing is watching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    listWikiSourceEvents.mockResolvedValue([]);
    getCompanyDossierJudgmentReview.mockResolvedValue(null);
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: '', terms: [], candidates: [] });
  });

  const unwatched = () => {
    const held = page();
    held.judgment.falsifiers = [{ falsifierId: 'f1', text: 'A cheaper model ships.', observableSignal: '' }];
    return held;
  };

  it('says so, and opens the form that fixes it', async () => {
    getWikiPage.mockResolvedValue(unwatched());
    renderCase();
    await screen.findByLabelText('Title');
    /* Said once, in the sentence that says where you stand — the block used
       to announce it a second time. */
    expect(screen.getByText(/Nothing is watching it/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Name a signal' }));
    expect(await screen.findByLabelText('I would change my mind if')).toBeInTheDocument();
  });

  /* A test with a signal is watched, and the page stays quiet about it. */
  it('stays quiet when a signal is named', async () => {
    const watched = page();
    watched.judgment.falsifiers = [{ falsifierId: 'f1', text: 'A cheaper model ships.', observableSignal: 'MMLU per dollar halves.' }];
    getWikiPage.mockResolvedValue(watched);
    renderCase();
    await screen.findByLabelText('Title');
    expect(screen.queryByText(/Nothing is watching this/)).not.toBeInTheDocument();
  });
});
