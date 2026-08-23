import React from 'react';
import * as router from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Judgment from './Judgment';
import AgentRail from '../agent/AgentRail';
import { AgentRailProvider } from '../agent/AgentRailContext';
import { resetFirstPaint } from '../motion/columnMotion';
import { askWikiPage, getJudgmentLibraryEvidence, getWikiPage, listWikiPages, listWikiSourceEvents, updateWikiPage } from '../api/wiki';

jest.mock('../api/articles', () => ({ getArticles: jest.fn(() => Promise.resolve([])) }));

jest.mock('../api/wiki', () => ({
  askWikiPage: jest.fn(),
  createWikiPage: jest.fn(),
  getJudgmentLibraryEvidence: jest.fn(),
  getWikiPage: jest.fn(),
  listWikiPages: jest.fn(),
  listWikiSourceEvents: jest.fn(),
  updateWikiPage: jest.fn()
}));

const judgmentPage = () => ({
  _id: 'wiki-nvidia',
  title: 'NVIDIA',
  sourceRefs: [
    { _id: 'src-1', type: 'external', citationLabel: 'SemiAnalysis', url: 'https://semianalysis.com/capacity' },
    { _id: 'src-2', type: 'external', citationLabel: 'TrendForce', url: 'https://trendforce.com/supply' }
  ],
  judgment: {
    kind: 'thesis',
    governingQuestion: 'Does demand outrun capacity?',
    currentJudgment: 'NVIDIA demand still outruns deliverable capacity.',
    startedAt: '2026-02-14T12:00:00.000Z',
    why: [
      { reasonId: 'why-1', text: 'AI demand keeps compounding faster than new supply.', sourceRefIds: ['src-1'] },
      { reasonId: 'why-2', text: 'Lead times and power constrain what can be delivered.', sourceRefIds: ['src-2'] }
    ],
    against: [{ reasonId: 'against-1', text: 'Hyperscalers are designing more in-house silicon.' }],
    falsifiers: [{ falsifierId: 'f-1', text: 'Confirmed signed capacity converts within 90 days.', status: 'unobserved' }],
    decisions: [{
      decisionId: 'd-1',
      summary: 'Started 1.5%. Won’t add until signed capacity converts.',
      decidedAt: '2026-02-14T12:00:00.000Z',
      status: 'taken',
      reviewAt: '2027-02-14T12:00:00.000Z',
      outcome: {}
    }]
  }
});

const overnightEvent = () => ({
  _id: 'event-1',
  affectedPageIds: ['wiki-nvidia'],
  title: 'A 13F filing was posted',
  summary: 'It doesn’t touch the capacity gap.',
  createdAt: '2026-08-14T04:00:00.000Z'
});

// The rail is mounted beside the column, as it is in the shell. Rendering them
// together is what lets a test assert the whole contract: the agent retrieves
// on one side, the human accepts, and the line appears on the other.
const withRail = (children) => (
  <AgentRailProvider>
    {children}
    <AgentRail />
  </AgentRailProvider>
);

const renderDetail = () => {
  jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'wiki-nvidia' });
  return render(withRail(<Judgment />));
};

const renderIndex = () => {
  jest.spyOn(router, 'useParams').mockReturnValue({});
  return render(withRail(<Judgment />));
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetFirstPaint();
  listWikiPages.mockResolvedValue([]);
  listWikiSourceEvents.mockResolvedValue([]);
  getJudgmentLibraryEvidence.mockResolvedValue({ claim: '', terms: [], candidates: [] });
});

describe('Judgment index', () => {
  it('is a list of claim sentences and nothing else', async () => {
    listWikiPages.mockResolvedValue([
      judgmentPage(),
      { _id: 'plain', title: 'A plain wiki page' }
    ]);

    renderIndex();

    const claim = await screen.findByRole('link', { name: 'NVIDIA demand still outruns deliverable capacity.' });
    expect(claim).toHaveAttribute('href', '/judgment/wiki-nvidia');
    expect(screen.queryByText('A plain wiki page')).not.toBeInTheDocument();
  });

  /* An empty index used to be a composer with a sentence over it, which made
     the product look like a text box. It is a door now: the claim usually comes
     from something you were already reading, so it points back at the paper.
     The composer stays, below. */
  it('offers a door to the paper when there is nothing yet', async () => {
    listWikiPages.mockResolvedValue([]);

    renderIndex();

    expect(await screen.findByText('No claims yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start one from this morning/ }))
      .toHaveAttribute('href', '/wiki');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('Judgment claim', () => {
  it('shows the claim, the four human fields, and the way back', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'NVIDIA demand still outruns deliverable capacity.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← All judgments' })).toHaveAttribute('href', '/judgment');
    expect(screen.getByRole('heading', { level: 2, name: 'Why' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Against' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'I’d change my mind if' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'What I did' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SemiAnalysis' })).toHaveAttribute('href', 'https://semianalysis.com/capacity');
    expect(screen.getByText(/this line doesn’t get edited, only added to/)).toBeInTheDocument();
  });

  /* This used to assert the opposite: an empty field was absent entirely.
     That rule was right about the danger — nothing on this page may be filled
     in with something plausible — and wrong about the remedy. A judgment
     carried out of a tension arrives with two sides written and two sections
     still to write, and hiding those two left a page that promises four things
     showing one. The section is present; what is absent is any line in it. */
  it('shows an empty field as the question it asks, and writes nothing into it', async () => {
    const bare = judgmentPage();
    bare.judgment.against = [];
    bare.judgment.decisions = [];
    getWikiPage.mockResolvedValue(bare);

    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('heading', { level: 2, name: 'Against' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'What I did' })).toBeInTheDocument();
    expect(screen.getByLabelText('What argues against it?')).toHaveValue('');
    expect(document.querySelectorAll('#judgment-field-against .judgment__line')).toHaveLength(0);
    expect(screen.queryByText(/this line doesn’t get edited/)).not.toBeInTheDocument();
  });

  it('keeps the review off the page until the review date has passed', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('heading', { level: 2, name: 'What happened?' })).not.toBeInTheDocument();
  });

  it('arrives with one block when the review date has passed', async () => {
    const due = judgmentPage();
    due.judgment.decisions[0].reviewAt = '2020-01-01T12:00:00.000Z';
    getWikiPage.mockResolvedValue(due);

    renderDetail();

    expect(await screen.findByRole('heading', { level: 2, name: 'What happened?' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing here is filled in until you say what happened/)).toBeInTheDocument();
  });
});

describe('the overnight line', () => {
  it('sits above the claim and writes into Against when accepted', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([overnightEvent()]);
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();

    expect(await screen.findByText(/Overnight: A 13F filing was posted\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Against' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    const [pageId, updates] = updateWikiPage.mock.calls[0];
    expect(pageId).toBe('wiki-nvidia');
    expect(updates.judgment.against.map(line => line.text)).toEqual([
      'Hyperscalers are designing more in-house silicon.',
      'A 13F filing was posted. It doesn’t touch the capacity gap.'
    ]);
    // The lines already on the page are carried forward untouched.
    expect(updates.judgment.why.map(line => line.text)).toEqual([
      'AI demand keeps compounding faster than new supply.',
      'Lead times and power constrain what can be delivered.'
    ]);
    await waitFor(() => expect(screen.queryByText(/Overnight:/)).not.toBeInTheDocument());
  });

  it('writes into Why when the human says Why', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([overnightEvent()]);
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Why' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    expect(updateWikiPage.mock.calls[0][1].judgment.why).toHaveLength(3);
  });

  it('evaporates on Dismiss and writes nothing', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    listWikiSourceEvents.mockResolvedValue([overnightEvent()]);

    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(screen.queryByText(/Overnight:/)).not.toBeInTheDocument());
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('never reads the daily loop, so the morning paper cursor is untouched', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(listWikiSourceEvents).toHaveBeenCalled();
  });
});

describe('the agent rail', () => {
  const answers = (text) => ({
    discussions: [{
      answer: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
    }]
  });

  const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

  it('names where a retrieved line came from, and says so when nothing did', async () => {
    // A retrieved sentence with no source is an assertion. The whole contract
    // is that the agent retrieves rather than knows, so provenance is part of
    // the line — and its absence is worth saying out loud.
    getWikiPage.mockResolvedValue(judgmentPage());
    askWikiPage.mockResolvedValue({
      sourceRefs: [{ _id: 'src-1', citationLabel: 'SemiAnalysis' }],
      discussions: [{
        answer: doc('Supply is catching up faster than the thesis assumes.'),
        citations: [{ sourceRefId: 'src-1' }]
      }]
    });

    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Find something that argues against this' }));

    const rail = screen.getByRole('complementary', { name: 'Agent' });
    expect(await within(rail).findByText('SemiAnalysis')).toBeInTheDocument();
  });

  it('offers the rest of what came back instead of presenting the first as the answer', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    askWikiPage.mockResolvedValue({
      sourceRefs: [{ _id: 'src-1', citationLabel: 'SemiAnalysis' }],
      discussions: [{
        answer: doc('Supply is catching up faster than the thesis assumes.'),
        citations: [{ sourceRefId: 'src-1' }],
        alternatives: [{ answer: doc('Lead times have not moved at all this quarter.') }]
      }]
    });
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Find something that argues against this' }));

    const rail = screen.getByRole('complementary', { name: 'Agent' });
    expect(await within(rail).findByText('Supply is catching up faster than the thesis assumes.')).toBeInTheDocument();
    expect(within(rail).getByText('1 of 2 retrieved')).toBeInTheDocument();

    fireEvent.click(within(rail).getByRole('button', { name: 'Another' }));

    expect(within(rail).getByText('Lead times have not moved at all this quarter.')).toBeInTheDocument();
    expect(within(rail).getByText('2 of 2 retrieved')).toBeInTheDocument();
    // Nothing is written by looking at the next one.
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('is about the claim, and says so before anything is retrieved', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());

    renderDetail();

    const rail = await screen.findByRole('complementary', { name: 'Agent' });
    expect(within(rail).getByText('Agent')).toBeInTheDocument();
    expect(await within(rail).findByText('NVIDIA demand still outruns deliverable capacity.')).toBeInTheDocument();
    expect(within(rail).getByText('Nothing to retrieve until you ask.')).toBeInTheDocument();
    expect(within(rail).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight')).toBeInTheDocument();
    expect(within(rail).getByText('Retrieves. You accept.')).toBeInTheDocument();
  });

  it('runs the column door in the rail and only writes when the human accepts', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    askWikiPage.mockResolvedValue(answers('Supply is catching up faster than the thesis assumes. More context follows.'));
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Find something that argues against this' }));

    const rail = screen.getByRole('complementary', { name: 'Agent' });
    expect(await within(rail).findByText('Supply is catching up faster than the thesis assumes.')).toBeInTheDocument();
    // The retrieved line is in the rail, not the column, and nothing is saved.
    expect(updateWikiPage).not.toHaveBeenCalled();

    fireEvent.click(within(rail).getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    expect(updateWikiPage.mock.calls[0][1].judgment.against.map(line => line.text)).toEqual([
      'Hyperscalers are designing more in-house silicon.',
      'Supply is catching up faster than the thesis assumes.'
    ]);
  });

  it('asks in the human’s own words and lets them choose the field', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    askWikiPage.mockResolvedValue(answers('Packaging capacity is still the binding constraint.'));
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...judgmentPage(), judgment: updates.judgment }));

    renderDetail();

    const rail = await screen.findByRole('complementary', { name: 'Agent' });
    fireEvent.change(within(rail).getByPlaceholderText('Bring evidence, counterevidence, or what moved overnight'), {
      target: { value: 'what did packaging do' }
    });
    fireEvent.click(within(rail).getByRole('button', { name: 'Ask' }));

    await within(rail).findByText('Packaging capacity is still the binding constraint.');
    expect(askWikiPage).toHaveBeenCalledWith('wiki-nvidia', 'what did packaging do');

    fireEvent.click(within(rail).getByRole('button', { name: 'Accept' }));
    fireEvent.click(await within(rail).findByRole('button', { name: 'Why' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalledTimes(1));
    expect(updateWikiPage.mock.calls[0][1].judgment.why).toHaveLength(3);
  });

  it('dismisses a retrieved line without writing anything', async () => {
    getWikiPage.mockResolvedValue(judgmentPage());
    askWikiPage.mockResolvedValue(answers('A line the human does not want.'));

    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Find something that argues against this' }));
    const rail = screen.getByRole('complementary', { name: 'Agent' });
    await within(rail).findByText('A line the human does not want.');

    fireEvent.click(within(rail).getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(within(rail).queryByText('A line the human does not want.')).not.toBeInTheDocument());
    expect(updateWikiPage).not.toHaveBeenCalled();
  });

  it('writes a judgment down without asking the server for a governing question', async () => {
    // The claim is what makes a page a judgment. Sending `kind` as well made
    // the server require a governing question — judgment pages in their older
    // shape are a question being investigated — and refuse the whole thing
    // with a 400. This is the shipped bug that test did not exist to catch.
    const { createWikiPage, updateWikiPage } = require('../api/wiki');
    jest.spyOn(router, 'useParams').mockReturnValue({});
    listWikiPages.mockResolvedValue([]);
    createWikiPage.mockResolvedValue({ _id: 'wiki-new' });
    updateWikiPage.mockResolvedValue({});

    render(<Judgment />);
    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('What do you think is true?'), {
      target: { value: 'Demand still outruns deliverable capacity.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Write it down' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    expect(createWikiPage).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Demand still outruns deliverable capacity.' })
    );
    const [, payload] = updateWikiPage.mock.calls[0];
    expect(payload.judgment.currentJudgment).toBe('Demand still outruns deliverable capacity.');
    expect(payload.judgment.kind).toBeUndefined();
  });

  /* The index needs one sentence and a provenance line per judgment. Asking
     for whole pages pulled every body and every ledger in the corpus down the
     wire to throw almost all of it away, which is why this page took minutes
     to open on a real library. */
  it('asks for a summary of the corpus, not every page in full', async () => {
    jest.spyOn(router, 'useParams').mockReturnValue({});
    listWikiPages.mockResolvedValue([]);
    render(<Judgment />);
    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(listWikiPages).toHaveBeenCalledWith(expect.objectContaining({ summary: 1 }));
  });

});

describe('Evidence from the library', () => {
  const candidate = {
    id: 'highlight:a1:h1',
    kind: 'highlight',
    text: 'Deliverable capacity lags demand by roughly two years.',
    sourceLabel: 'On compute · FT'
  };

  beforeEach(() => {
    getWikiPage.mockResolvedValue(judgmentPage());
  });

  it('is a door, not a panel — nothing is fetched until it is opened', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });
    expect(getJudgmentLibraryEvidence).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Look in your library →' })).toBeInTheDocument();
  });

  it('offers what the library holds, and files the side the reader chooses', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [candidate] });
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));

    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });
    fireEvent.click(screen.getByRole('button', { name: 'Look in your library →' }));

    expect(await screen.findByText(candidate.text)).toBeInTheDocument();
    // The provenance travels with the passage.
    expect(screen.getByText('On compute · FT')).toBeInTheDocument();
    // And the product does not pretend to know which side it falls on.
    expect(screen.getByText('File under')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Against' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    const filed = body.judgment.against[body.judgment.against.length - 1];
    expect(filed).toMatchObject({
      text: candidate.text,
      sourceLabel: 'On compute · FT',
      acceptedFrom: 'highlight:a1:h1'
    });
  });

  it('says plainly when the library has nothing to say about a claim you hold', async () => {
    getJudgmentLibraryEvidence.mockResolvedValue({ claim: 'c', terms: ['capacity'], candidates: [] });
    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });
    fireEvent.click(screen.getByRole('button', { name: 'Look in your library →' }));
    expect(await screen.findByText(/Nothing you have saved speaks to this yet/)).toBeInTheDocument();
  });
});

describe('Parking a judgment, and the lesson it leaves', () => {
  beforeEach(() => {
    getWikiPage.mockResolvedValue(judgmentPage());
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));
  });

  it('asks one question on the way out, and files the answer as a lesson', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });

    fireEvent.click(screen.getByRole('button', { name: 'Park this' }));
    fireEvent.change(screen.getByLabelText('What did holding this teach you?'), {
      target: { value: 'Announced capacity is not delivered capacity.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Park it' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.status).toBe('parked');
    expect(body.judgment.lessons[0]).toMatchObject({
      text: 'Announced capacity is not delivered capacity.',
      closedAs: 'parked'
    });
    // Parking says nothing about whether the claim is true.
    expect(body.judgment.currentJudgment).toBe('NVIDIA demand still outruns deliverable capacity.');
  });

  it('lets you park without a lesson, because sometimes there is not one', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });
    fireEvent.click(screen.getByRole('button', { name: 'Park this' }));
    fireEvent.click(screen.getByRole('button', { name: 'Park it' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.status).toBe('parked');
    expect(body.judgment.lessons).toEqual([]);
  });

  it('says a parked claim is still yours, and offers it back', async () => {
    const parked = judgmentPage();
    parked.judgment.status = 'parked';
    parked.judgment.lessons = [{ lessonId: 'l1', text: 'Power, not silicon.', closedAs: 'parked', at: '2026-08-01T00:00:00.000Z' }];
    getWikiPage.mockResolvedValue(parked);

    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });

    expect(screen.getByText(/It is still yours; you are just not tending it/)).toBeInTheDocument();
    // The lesson reads on the page it came from.
    expect(screen.getByRole('heading', { name: 'What it taught me' })).toBeInTheDocument();
    expect(screen.getByText('Power, not silicon.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pick it back up' }));
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.status).toBe('monitoring');
    expect(body.judgment.parkedAt).toBeNull();
  });
});

describe('The index only raises its voice about what was avoided', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = days => new Date(Date.now() - days * DAY).toISOString();

  it('marks a claim whose arrived evidence has gone unread, and stays silent about the rest', async () => {
    const avoided = judgmentPage();
    avoided._id = 'wiki-avoided';
    avoided.updatedAt = daysAgo(200);
    avoided.judgment.lastReviewedAt = daysAgo(200);

    const quiet = judgmentPage();
    quiet._id = 'wiki-quiet';
    quiet.title = 'Rates';
    quiet.judgment.currentJudgment = 'Rates still matter for asset prices.';
    quiet.updatedAt = daysAgo(200);
    quiet.judgment.lastReviewedAt = daysAgo(200);

    listWikiPages.mockResolvedValue([avoided, quiet]);
    listWikiSourceEvents.mockResolvedValue([
      { _id: 'e1', affectedPageIds: ['wiki-avoided'], sourceUpdatedAt: daysAgo(40) }
    ]);

    renderIndex();

    await screen.findByRole('link', { name: /NVIDIA demand still outruns/ });
    expect(screen.getByText('1 thing arrived about this and is unread')).toBeInTheDocument();

    // The quiet claim gets no mark at all. Nothing arrived; that is not a problem.
    const rows = screen.getAllByRole('listitem');
    const quietRow = rows.find(row => row.textContent.includes('Rates still matter'));
    expect(quietRow.textContent).toBe('Rates still matter for asset prices.');
  });

  it('reads the events alongside the pages rather than after them', async () => {
    listWikiPages.mockResolvedValue([]);
    listWikiSourceEvents.mockResolvedValue([]);
    renderIndex();
    await waitFor(() => expect(listWikiSourceEvents).toHaveBeenCalled());
    expect(listWikiSourceEvents).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
  });

  it('still lists the claims when the events cannot be read', async () => {
    listWikiPages.mockResolvedValue([judgmentPage()]);
    listWikiSourceEvents.mockRejectedValue(new Error('nope'));
    renderIndex();
    expect(await screen.findByRole('link', { name: /NVIDIA demand still outruns/ })).toBeInTheDocument();
  });
});

describe('What a belief rests on', () => {
  const otherClaim = {
    _id: 'wiki-compute',
    title: 'Compute',
    judgment: { currentJudgment: 'Compute stays scarce.' }
  };

  beforeEach(() => {
    getWikiPage.mockResolvedValue(judgmentPage());
    updateWikiPage.mockImplementation(async (_id, body) => ({ ...judgmentPage(), judgment: body.judgment }));
  });

  it('records the edge and the reason, never inferring either', async () => {
    listWikiPages.mockResolvedValue([judgmentPage(), otherClaim]);
    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });

    expect(await screen.findByText('Nothing yet. A belief that stands on its own is fine.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Say what this rests on' }));

    fireEvent.change(screen.getByLabelText('Which belief does this rest on?'), { target: { value: 'wiki-compute' } });
    fireEvent.change(screen.getByLabelText('Why?'), {
      target: { value: 'If compute stops being scarce this stops being true.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'It rests on that' }));

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, body] = updateWikiPage.mock.calls[updateWikiPage.mock.calls.length - 1];
    expect(body.judgment.dependsOn).toHaveLength(1);
    expect(body.judgment.dependsOn[0]).toMatchObject({
      pageId: 'wiki-compute',
      note: 'If compute stops being scarce this stops being true.',
      proposedBy: 'user'
    });
  });

  it('never offers the claim itself as something it rests on', async () => {
    listWikiPages.mockResolvedValue([judgmentPage(), otherClaim]);
    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });
    fireEvent.click(await screen.findByRole('button', { name: 'Say what this rests on' }));

    const select = screen.getByLabelText('Which belief does this rest on?');
    const options = Array.from(select.querySelectorAll('option')).map(option => option.value);
    expect(options).toContain('wiki-compute');
    expect(options).not.toContain('wiki-nvidia');
  });

  it('shows what would be shaken if this claim moved', async () => {
    const dependent = {
      _id: 'wiki-cw',
      title: 'CoreWeave',
      judgment: {
        currentJudgment: 'CoreWeave is undervalued.',
        dependsOn: [{ dependencyId: 'd1', pageId: 'wiki-nvidia', note: 'It prices the scarcity.' }]
      }
    };
    listWikiPages.mockResolvedValue([judgmentPage(), dependent]);
    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });

    expect(await screen.findByRole('heading', { name: 'What rests on this' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CoreWeave is undervalued.' })).toHaveAttribute('href', '/judgment/wiki-cw');
    expect(screen.getByText('It prices the scarcity.')).toBeInTheDocument();
  });

  it('raises what rests on a claim before you park it, without touching them', async () => {
    const dependent = {
      _id: 'wiki-cw',
      title: 'CoreWeave',
      judgment: {
        currentJudgment: 'CoreWeave is undervalued.',
        dependsOn: [{ dependencyId: 'd1', pageId: 'wiki-nvidia', note: 'It prices the scarcity.' }]
      }
    };
    listWikiPages.mockResolvedValue([judgmentPage(), dependent]);
    renderDetail();
    await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ });

    fireEvent.click(await screen.findByRole('button', { name: 'Park this' }));
    expect(screen.getByText(/One belief rests on this/)).toBeInTheDocument();
    expect(screen.getByText(/Parking this does not change them/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Park it' }));
    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    // Only this page was written. The dependent claim is raised, never edited.
    expect(updateWikiPage.mock.calls.every(([id]) => id === 'wiki-nvidia')).toBe(true);
  });

  it('still reads the claim when the rest of the corpus cannot be loaded', async () => {
    listWikiPages.mockRejectedValue(new Error('nope'));
    renderDetail();
    expect(await screen.findByRole('heading', { name: /NVIDIA demand still outruns/ })).toBeInTheDocument();
  });
});

describe('The drift, above the claims', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = days => new Date(Date.now() - days * DAY).toISOString();
  const many = (topic, days, count) => Array.from({ length: count }, (_, i) => ({
    _id: `${topic}${days}${i}`, createdAt: daysAgo(days), folder: { _id: topic, name: topic }
  }));

  it('draws where the reading has been going, at the top of the index', async () => {
    const { getArticles } = require('../api/articles');
    getArticles.mockResolvedValue([...many('Capacity', 70, 5), ...many('Power', 4, 5)]);
    listWikiPages.mockResolvedValue([judgmentPage()]);

    renderIndex();

    expect(await screen.findByText('Where your reading is going')).toBeInTheDocument();
    // Above the claims it produced: this is the weather, not another claim.
    const drift = document.querySelector('.drift');
    const list = document.querySelector('.judgment__index');
    expect(drift.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still lists the claims when the reading cannot be read', async () => {
    const { getArticles } = require('../api/articles');
    getArticles.mockRejectedValue(new Error('nope'));
    listWikiPages.mockResolvedValue([judgmentPage()]);
    renderIndex();
    expect(await screen.findByRole('link', { name: /NVIDIA demand still outruns/ })).toBeInTheDocument();
  });
});

describe('The index while it is still loading', () => {
  /* "No claims yet" appeared on every visit for the seconds the request took,
     to an account with a dozen claims. The software describing its own latency
     as a fact about the reader. */
  it('does not say you have no claims before it knows', async () => {
    let release;
    listWikiPages.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    listWikiSourceEvents.mockResolvedValue([]);

    renderIndex();

    expect(await screen.findByText('Reading back what you hold…')).toBeInTheDocument();
    expect(screen.queryByText('No claims yet.')).not.toBeInTheDocument();

    await act(async () => { release([judgmentPage()]); });
    expect(await screen.findByRole('link', { name: /NVIDIA demand still outruns/ })).toBeInTheDocument();
    expect(screen.queryByText('Reading back what you hold…')).not.toBeInTheDocument();
  });

  it('still says so once it knows the index really is empty', async () => {
    listWikiPages.mockResolvedValue([]);
    listWikiSourceEvents.mockResolvedValue([]);
    renderIndex();
    expect(await screen.findByText('No claims yet.')).toBeInTheDocument();
  });
});
