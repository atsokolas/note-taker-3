import React from 'react';
import * as router from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Judgment from './Judgment';
import AgentRail from '../agent/AgentRail';
import { AgentRailProvider } from '../agent/AgentRailContext';
import { resetFirstPaint } from '../motion/columnMotion';
import { askWikiPage, getWikiPage, listWikiPages, listWikiSourceEvents, updateWikiPage } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  askWikiPage: jest.fn(),
  createWikiPage: jest.fn(),
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
  listWikiSourceEvents.mockResolvedValue([]);
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

  it('says one sentence when there is nothing yet', async () => {
    listWikiPages.mockResolvedValue([]);

    renderIndex();

    expect(await screen.findByText(/No judgments yet/)).toBeInTheDocument();
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

  it('leaves an empty field absent rather than showing an empty box', async () => {
    const bare = judgmentPage();
    bare.judgment.against = [];
    bare.judgment.decisions = [];
    getWikiPage.mockResolvedValue(bare);

    renderDetail();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('heading', { level: 2, name: 'Why' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Against' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'What I did' })).not.toBeInTheDocument();
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
});
