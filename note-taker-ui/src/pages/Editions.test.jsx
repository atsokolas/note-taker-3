import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Editions from './Editions';
import * as api from '../api/editions';
import backendApi from '../api';
let mockId;
let mockSearch;
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => mockNavigate, useParams: () => ({ id: mockId }),
  useSearchParams: () => [new URLSearchParams(mockSearch)]
}));
jest.mock('../api/editions');
jest.mock('../api', () => ({ get: jest.fn().mockResolvedValue({ data: { content: '<p>Saved source.</p>' } }) }));
jest.mock('../components/editions/editionReadingState', () => ({
  ...jest.requireActual('../components/editions/editionReadingState'),
  readEditionLocal: jest.fn()
}));
const readingState = require('../components/editions/editionReadingState');
const item = { itemId: 'one', title: 'A useful distinction', finding: 'Being informed is different from being able to use information.', boundary: 'One study cannot establish a universal rule.', sourceLabel: 'Research', url: 'https://example.com/source', section: 'ideas', filedBy: 'Jarvis' };
const edition = { _id: 'e1', profile: 'weekend', profileLabel: 'Weekend Readings', title: 'Weekend Readings', number: 2, windowStart: '2026-09-01', windowEnd: '2099-09-07', sections: [{ key: 'ideas', label: 'Ideas' }, { key: 'limits', label: 'Counterevidence' }], items: [item] };
beforeEach(() => {
  jest.clearAllMocks(); mockId = 'e1'; mockSearch = '';
  readingState.readEditionLocal.mockReturnValue(null);
  backendApi.get.mockResolvedValue({ data: { content: '<p>Saved source.</p>' } });
  api.listEditions.mockResolvedValue([edition]); api.getEdition.mockResolvedValue(edition);
  api.getEditionThoughts.mockResolvedValue([]); api.getEditionShare.mockResolvedValue({ shared: false });
  api.getEditionInbox.mockResolvedValue({ items: [], remaining: 0 });
  api.setEditionItemState.mockResolvedValue({});
  api.getEditionHeld.mockResolvedValue({ held: null });
  window.scrollTo = jest.fn();
});
it('powers through what is new one finding at a time, narrowed to a paper', async () => {
  mockId = undefined;
  mockSearch = 'power=1&paper=weekend';
  api.getEditionInbox.mockResolvedValue({
    items: [
      { ...item, editionId: 'e1', profileLabel: 'Weekend Readings', issueLabel: 'Edition', number: 3 },
      { ...item, itemId: 'two', title: 'A second arrival', editionId: 'e1', profileLabel: 'Weekend Readings', issueLabel: 'Edition', number: 3 }
    ],
    remaining: 0
  });
  render(<Editions />);
  expect(await screen.findByRole('heading', { name: item.title })).toBeVisible();
  expect(screen.getByText(item.boundary)).toBeVisible();
  expect(screen.getByText('1 of 2')).toBeVisible();
  expect(api.getEditionInbox).toHaveBeenCalledWith({ cursor: '', limit: 40, view: 'power', paper: 'weekend', by: '' });
  expect(screen.getByRole('link', { name: /The original/ })).toHaveAttribute('href', item.url);
  fireEvent.keyDown(document, { key: 'e' });
  await waitFor(() => expect(api.setEditionItemState).toHaveBeenCalledWith('e1', 'one', 'opened'));
  expect(await screen.findByRole('heading', { name: 'A second arrival' })).toBeVisible();
  expect(screen.getByText('2 of 2')).toBeVisible();
  fireEvent.keyDown(document, { key: 'e' });
  expect(await screen.findByRole('heading', { name: 'All caught up.' })).toBeVisible();
});
it('powers through a source two agents read, showing each reading', async () => {
  mockId = undefined;
  mockSearch = 'power=1';
  api.getEditionInbox.mockResolvedValue({
    items: [{
      ...item, editionId: 'e1', profileLabel: 'Weekend Readings', filedByRuntime: 'openclaw',
      readings: [{ filedBy: 'Codex', filedByRuntime: 'codex', finding: 'A second view.', boundary: 'Its own limit.', note: '' }]
    }],
    remaining: 0
  });
  render(<Editions />);
  expect(await screen.findByText('A second view.')).toBeVisible();
  expect(screen.getByText(item.finding)).toBeVisible();
  expect(screen.getByText('Filed independently by two hands.')).toBeVisible();
});
it('opens the finding and its boundary, and preserves empty sections', async () => {
  render(<Editions />);
  expect(await screen.findByText(item.finding)).toBeVisible();
  expect(screen.getByText(item.boundary)).toBeVisible();
  expect(screen.getByText('Nothing filed under Counterevidence in this issue.')).toBeVisible();
  expect(api.getEditionInbox).not.toHaveBeenCalled();
});
it('says which silence an empty section is', async () => {
  const sections = [...edition.sections, { key: 'context', label: 'Context' }];
  api.getEdition.mockResolvedValue({
    ...edition,
    sections,
    silences: [
      { key: 'limits', label: 'Counterevidence', state: 'checked', by: [{ label: 'OpenClaw · Jarvis', runtime: 'openclaw' }, { label: 'My laptop', runtime: 'codex' }] },
      { key: 'context', label: 'Context', state: 'unreported', by: [] }
    ]
  });
  render(<Editions />);
  await screen.findByText(item.finding);
  const looked = screen.getByText(/looked; nothing met the bar\./);
  /* The marks' initials are aria-hidden; the names read as a sentence. */
  expect(looked).toHaveTextContent(/OpenClaw and Cx ?Codex looked; nothing met the bar\./);
  expect(screen.getByText('Not reported this issue.')).toBeVisible();
  expect(screen.queryByText(/Nothing filed under/)).toBeNull();
});
const issueFive = () => {
  const fixture = require('../../../design-mockups/editions-many-hands/this-week-in-ai.json');
  const keyOf = label => fixture.paper.sections.find(section => section.label === label).key;
  const sections = fixture.paper.sections;
  const runIssue = row => ({
    _id: `twia-${row.issue}`,
    profile: 'this_week_in_ai',
    profileLabel: fixture.paper.title,
    issueLabel: 'Issue',
    number: row.issue,
    windowStart: row.window.split('/')[0],
    windowEnd: row.window.split('/')[1],
    sections,
    filings: Object.entries(row.counts).flatMap(([label, count]) => Array.from({ length: count }, () => (
      { section: keyOf(label), filedBy: 'Codex Wiki account grounding audit', filedByRuntime: '', saved: false }
    ))),
    silences: []
  });
  const run = fixture.run.map(runIssue);
  const five = fixture.issue5;
  const silences = [{ key: keyOf('Infrastructure & systems'), label: 'Infrastructure & systems', state: 'checked', by: [{ label: 'OpenClaw', runtime: 'openclaw' }] }];
  run[4].silences = silences;
  run[4].filings.push({ section: keyOf('Evaluation & counterevidence'), filedBy: 'Claude', filedByRuntime: 'claude-code', filedAt: '2026-10-06T12:00:00Z', saved: true });
  const opened = {
    ...run[4],
    _id: 'twia-5',
    standfirst: five.standfirst,
    writtenBy: five.writtenBy,
    throughLine: five.throughLine,
    silences,
    items: [
      ...five.items.map((row, index) => ({ ...row, itemId: `i${index}`, section: keyOf(row.section), url: `https://arxiv.org/abs/${index}` })),
      { ...five.items[1], itemId: 'claude', title: 'A second source on recovery', url: 'https://arxiv.org/abs/9', section: keyOf('Evaluation & counterevidence'), filedBy: 'Claude', filedByRuntime: 'claude-code', filedAt: '2026-10-06T12:00:00Z', savedArticleId: 'kept' }
    ]
  };
  api.listEditions.mockResolvedValue(run);
  api.getEdition.mockResolvedValue(opened);
  return { five, run };
};
it('reads This Week in AI as a run, newest first, with what each issue held', async () => {
  mockId = undefined; mockSearch = 'paper=this_week_in_ai';
  issueFive();
  render(<Editions />);
  expect(await screen.findByRole('heading', { name: 'This Week in AI', level: 1 })).toBeVisible();
  const issues = screen.getAllByRole('link', { name: /^Issue \d/ });
  expect(issues[0]).toHaveAttribute('href', '/editions/twia-5');
  expect(screen.getByRole('img', { name: 'Models & methods: 1 filed; Infrastructure & systems: looked, nothing met the bar; Evaluation & counterevidence: 2 filed' })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Models & methods: 3 filed; Infrastructure & systems: 1 filed; Evaluation & counterevidence: 1 filed' })).toBeVisible();
  const scale = screen.getByRole('navigation', { name: 'Where you are in Editions' });
  expect(within(scale).getByText('This Week in AI')).toHaveAttribute('aria-current', 'location');
  /* One paper is the whole stand, so there is no wider view to step out to. */
  expect(within(scale).queryByRole('link', { name: 'Your papers' })).toBeNull();
  expect(screen.queryByText(/Sunday 28/)).toBeNull();
});
it('opens Issue 5 headline first, in short, and narrows it to one hand from a quiet menu', async () => {
  mockId = 'twia-5';
  const { five } = issueFive();
  render(<Editions />);
  expect(await screen.findByText(five.items[0].finding)).toBeVisible();
  expect(screen.getByRole('heading', { level: 1, name: 'This Week in AI' })).toBeVisible();
  expect(screen.getByText(five.standfirst)).toBeVisible();
  expect(screen.getByText('Issue 5 · covers Sep 28 – Oct 4')).toBeVisible();
  expect(screen.getByText(/^3 findings · about (a minute|\d minutes)$/)).toBeVisible();
  const short = screen.getByRole('region', { name: 'In short' });
  expect(within(short).getAllByRole('link').map(link => link.textContent)).toEqual([
    `01${five.items[0].title}`, `02${five.items[1].title}`, '03A second source on recovery'
  ]);
  expect(within(short).getByText('Infrastructure & systems')).toBeVisible();
  expect(within(short).getByText(/looked; nothing met the bar\./)).toHaveTextContent(/OpenClaw looked; nothing met the bar\./);
  fireEvent.change(screen.getByRole('combobox', { name: /Filed by/ }), { target: { value: 'claude-code' } });
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/twia-5?by=claude-code', { replace: true });
});
it('shows only one hand’s filings and says what it hid', async () => {
  mockId = 'twia-5'; mockSearch = 'by=claude-code';
  const { five } = issueFive();
  render(<Editions />);
  expect(await screen.findByRole('heading', { name: 'A second source on recovery' })).toBeVisible();
  expect(screen.queryByText(five.items[0].finding)).toBeNull();
  expect(screen.getByText(/2 findings by other hands hidden while you read Claude’s\./)).toBeVisible();
  /* The closing receipt still counts the whole issue. */
  expect(screen.getByText(/^You kept 1 of 3\./)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/twia-5', { replace: true });
});
it('stands every paper on one line, with what is new and the way back in', async () => {
  mockId = undefined;
  issueFive();
  api.listEditions.mockResolvedValue([
    { ...edition, items: undefined, newCount: 2, standfirst: 'A weekend of reading.' },
    { ...edition, _id: 'ai', profile: 'ai', profileLabel: 'This Week in AI', items: undefined, newCount: 0 }
  ]);
  readingState.readEditionLocal.mockImplementation((issueId) => (issueId === 'last' ? { issueId: 'e1', itemId: 'one', title: 'A useful distinction' } : null));
  render(<Editions />);
  expect(await screen.findByRole('heading', { name: 'Your papers' })).toBeVisible();
  expect(screen.getByText('2 new findings across 1 paper.')).toBeVisible();
  expect(screen.getByRole('link', { name: /Weekend Readings/ })).toHaveAttribute('href', '/editions?paper=weekend');
  expect(screen.getByText('2 new')).toBeVisible();
  expect(screen.getByRole('link', { name: /Back to where you stopped/ })).toHaveAttribute('href', '/editions/e1?item=one');
  expect(screen.getByRole('link', { name: /Power through/ })).toHaveAttribute('href', '/editions?power=1');
  fireEvent.keyDown(document, { key: ']' });
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions?paper=weekend');
});
it('zooms from an issue to a finding and its source, and steps back out', async () => {
  render(<Editions />);
  await screen.findByText(item.finding);
  fireEvent.keyDown(document, { key: 'j' });
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/e1?item=one', { replace: false });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions?paper=weekend');
});
it('counts a finding read only once the reader stays on it', async () => {
  mockSearch = 'item=one';
  Element.prototype.scrollIntoView = jest.fn();
  jest.useFakeTimers();
  render(<Editions />);
  await screen.findByText(item.finding);
  act(() => { jest.advanceTimersByTime(1000); });
  expect(api.setEditionItemState).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(3000); });
  expect(api.setEditionItemState).toHaveBeenCalledWith('e1', 'one', 'opened');
  jest.useRealTimers();
});
it('counts no time while the tab is hidden', async () => {
  mockSearch = 'item=one';
  Element.prototype.scrollIntoView = jest.fn();
  jest.useFakeTimers();
  const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  render(<Editions />);
  await screen.findByText(item.finding);
  act(() => { jest.advanceTimersByTime(10000); });
  expect(api.setEditionItemState).not.toHaveBeenCalled();
  hidden.mockReturnValue(false);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); jest.advanceTimersByTime(4000); });
  expect(api.setEditionItemState).toHaveBeenCalledWith('e1', 'one', 'opened');
  hidden.mockRestore();
  jest.useRealTimers();
});
it('does not turn a Later finding back into read', async () => {
  mockSearch = 'item=one';
  Element.prototype.scrollIntoView = jest.fn();
  api.getEdition.mockResolvedValue({ ...edition, items: [{ ...item, readerStatus: 'later' }] });
  jest.useFakeTimers();
  render(<Editions />);
  await screen.findByText(item.finding);
  act(() => { jest.advanceTimersByTime(5000); });
  expect(api.setEditionItemState).not.toHaveBeenCalled();
  jest.useRealTimers();
});
it('gives a finding the page to itself, the issue a step back and the next a step on', async () => {
  mockSearch = 'item=one';
  const two = { ...item, itemId: 'two', plain: 'A second plain line.', finding: 'A second finding.', title: 'Second' };
  api.getEdition.mockResolvedValue({ ...edition, items: [item, two] });
  render(<Editions />);
  await screen.findByText(item.finding);
  expect(screen.getByText('Finding 1 of 2')).toBeVisible();
  expect(screen.queryByText(two.finding)).toBeNull();
  expect(screen.getByRole('link', { name: 'Edition 2 · Weekend Readings' })).toHaveAttribute('href', '/editions/e1');
  fireEvent.click(screen.getByRole('button', { name: 'Next: A second plain line. →' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/e1?item=two', { replace: true });
});
it('sets a finding aside with Not for me, and Undo brings it back', async () => {
  api.setEditionItemState.mockImplementation(async (_id, itemId, status) => ({ itemId, readerStatus: status, edition: { ...edition, items: [{ ...item, readerStatus: status }] } }));
  render(<Editions />);
  await screen.findByText(item.finding);
  fireEvent.click(screen.getByRole('button', { name: 'Not for me' }));
  expect(await screen.findByText(`Set aside: ${item.title}`, { exact: false })).toBeVisible();
  expect(screen.queryByText(item.finding)).toBeNull();
  expect(api.setEditionItemState).toHaveBeenCalledWith('e1', 'one', 'dismissed');
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText(item.finding)).toBeVisible();
  expect(api.setEditionItemState).toHaveBeenLastCalledWith('e1', 'one', 'new');
});
it('ends with what you kept and what comes next', async () => {
  const closed = { ...edition, windowStart: '2026-09-01', windowEnd: '2026-09-07', items: [item, { ...item, itemId: 'two', title: 'Second', finding: 'Another finding.' }] };
  api.getEdition.mockResolvedValue(closed); api.listEditions.mockResolvedValue([closed]);
  render(<Editions />); await screen.findByText(item.finding);
  expect(screen.getByText('That’s the whole issue.')).toBeVisible();
  expect(screen.getByText('Edition 3 covers Sep 8 – 14')).toBeVisible();
  api.saveEditionItem.mockResolvedValue({ edition: { ...closed, items: [{ ...item, savedArticleId: 'article' }, closed.items[1]] }, readable: true });
  fireEvent.click(within(document.getElementById('edition-item-one')).getByRole('button', { name: 'Keep' }));
  expect(await screen.findByText('You kept 1 of 2. That’s the whole issue.')).toBeVisible();
});
it('does not insert new filings until Show, even when Keep returns the newer issue', async () => {
  jest.useFakeTimers();
  render(<Editions />); await act(async () => {});
  const newer = { ...edition, items: [{ ...item, itemId: 'two', title: 'An arrival' }, item] };
  api.getEdition.mockResolvedValue(newer);
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(screen.queryByRole('heading', { name: 'An arrival' })).toBeNull();
  api.saveEditionItem.mockResolvedValue({ edition: { ...newer, items: newer.items.map(i => i.itemId === 'one' ? { ...i, savedArticleId: 'article' } : i) }, readable: false });
  fireEvent.click(screen.getByRole('button', { name: 'Keep' })); await act(async () => {});
  expect(screen.getByRole('link', { name: '✓ Kept in your Library' })).toHaveAttribute('href', '/articles/article');
  expect(screen.getByText(/Saved the link/)).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'An arrival' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '1 finding added · Show' }));
  expect(screen.getByRole('heading', { name: 'An arrival' })).toBeVisible();
  jest.useRealTimers();
});
it('Source opens as its own power, with a URL', async () => {
  render(<Editions />); await screen.findByText(item.finding);
  fireEvent.click(screen.getByRole('button', { name: 'Read the source' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/e1?item=one&source=1', undefined);
});
it('opens the source beside a finding when the URL says so', async () => {
  mockSearch = 'item=one&source=1';
  render(<Editions />); await screen.findByText(item.finding);
  expect(await screen.findByText(/Readable article text is not available/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open original ↗' })).toHaveAttribute('href', item.url);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close side view' }), { key: 'Escape' });
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/e1?item=one', undefined);
});
it('Later calls the real API and a partial failure remains actionable', async () => {
  api.saveEditionItemLater.mockResolvedValue({ placed: false, edition: { ...edition, items: [{ ...item, savedArticleId: 'article' }] } });
  render(<Editions />); await screen.findByText(item.finding);
  fireEvent.click(within(document.getElementById('edition-item-one')).getByRole('button', { name: 'Later' }));
  expect(await screen.findByText(/Later did not complete/)).toBeVisible();
  expect(api.saveEditionItemLater).toHaveBeenCalledWith('e1', 'one');
  expect(screen.getByText(item.finding)).toBeVisible();
});
it('resolves a direct issue older than the stand limit', async () => {
  mockId = 'old'; api.getEdition.mockResolvedValue({ ...edition, _id: 'old', profile: 'older', title: 'Older paper', profileLabel: 'Older paper' });
  render(<Editions />); expect(await screen.findByRole('heading', { name: 'Older paper', level: 1 })).toBeVisible();
});
it('does not let a poll started before Keep restore an older Library state', async () => {
  jest.useFakeTimers();
  render(<Editions />); await act(async () => {});
  let finishPoll;
  api.getEdition.mockReturnValue(new Promise(resolve => { finishPoll = resolve; }));
  await act(async () => { jest.advanceTimersByTime(60000); });
  api.saveEditionItem.mockResolvedValue({ edition: { ...edition, items: [{ ...item, savedArticleId: 'article' }] }, readable: true });
  fireEvent.click(screen.getByRole('button', { name: 'Keep' })); await act(async () => {});
  await act(async () => finishPoll({ ...edition, throughLine: 'A new editorial line.' }));
  fireEvent.click(screen.getByRole('button', { name: 'This issue has an update · Show' }));
  expect(screen.getByRole('link', { name: '✓ Kept in your Library' })).toBeVisible();
  jest.useRealTimers();
});
it('prints the reader’s layer: the plain line, the figures, a checked passage, and an honest note for one that is not', async () => {
  const layered = {
    ...item,
    plain: 'Debate gets better when each agent picks how closely to look.',
    sourceKind: 'preprint',
    confidence: 'moderate',
    figures: [{ label: 'accuracy gain', value: '1.5–3.2%' }],
    passage: 'improved accuracy by 1.5–3.2%',
    passageCheck: 'found'
  };
  const missing = { ...item, itemId: 'two', section: 'limits', title: 'A misquote', passage: 'words the source never said', passageCheck: 'missing', filedBy: 'Codex job', filedByRuntime: 'codex' };
  api.getEdition.mockResolvedValue({ ...edition, headline: 'Debate gains; recovery lags.', items: [layered, missing] });
  render(<Editions />);
  expect(await screen.findByRole('heading', { level: 2, name: 'Debate gets better when each agent picks how closely to look.' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 1, name: 'Debate gains; recovery lags.' })).toBeVisible();
  const margin = within(document.getElementById('edition-item-one')).getByRole('complementary', { name: 'About this finding' });
  expect(within(margin).getByText(item.title)).toBeVisible();
  expect(within(margin).getByText('Research preprint. Not yet peer reviewed.')).toBeVisible();
  expect(within(margin).getByText('A real signal, not a settled fact.')).toBeVisible();
  expect(screen.getByText('1.5–3.2%')).toBeVisible();
  expect(screen.getByText('accuracy gain')).toBeVisible();
  expect(screen.getByText('improved accuracy by 1.5–3.2%').tagName).toBe('BLOCKQUOTE');
  expect(screen.getByText(/quoted a passage the source does not contain/)).toBeVisible();
  expect(screen.queryByText('words the source never said')).toBeNull();
});
it('names the one highlight you already hold, but only for the finding in focus', async () => {
  mockSearch = 'item=one';
  api.getEditionHeld.mockResolvedValue({ held: { highlightId: 'h1', text: 'Using information is a skill.', articleId: 'a1', articleTitle: 'On practice' } });
  render(<Editions />);
  expect(await screen.findByRole('link', { name: '“Using information is a skill.”' })).toHaveAttribute('href', '/articles/a1');
  expect(api.getEditionHeld).toHaveBeenCalledTimes(1);
  expect(api.getEditionHeld).toHaveBeenCalledWith('e1', 'one');
});
it('says what became of the last watch list, and keeps the paper’s threads at the run', async () => {
  const before = { ...edition, _id: 'before', number: 1, windowStart: '2026-08-25', windowEnd: '2026-08-31', watchNext: ['A replication', 'A price cut'] };
  const after = { ...edition, number: 2, watchNext: ['A second lab'], followUps: [{ watch: 'A replication', status: 'happened', note: 'Two labs, same result.' }] };
  api.getEdition.mockResolvedValue(after);
  api.listEditions.mockResolvedValue([after, before]);
  const { unmount } = render(<Editions />);
  expect(await screen.findByRole('heading', { name: 'Since Edition 1' })).toBeVisible();
  expect(screen.getByText('Two labs, same result.')).toBeVisible();
  unmount();
  mockId = undefined; mockSearch = 'paper=weekend';
  render(<Editions />);
  const watching = await screen.findByRole('region', { name: 'What this paper is watching' });
  expect(within(watching).getAllByRole('link').map(link => link.textContent)).toEqual(['A second lab', 'A price cut', 'A replication']);
  expect(within(watching).getByText('Settled')).toBeVisible();
});

