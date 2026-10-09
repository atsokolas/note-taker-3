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
  jest.clearAllMocks(); mockId = undefined; mockSearch = '';
  readingState.readEditionLocal.mockReturnValue(null);
  backendApi.get.mockResolvedValue({ data: { content: '<p>Saved source.</p>' } });
  api.listEditions.mockResolvedValue([edition]); api.getEdition.mockResolvedValue(edition);
  api.getEditionThoughts.mockResolvedValue([]); api.getEditionShare.mockResolvedValue({ shared: false });
  api.getEditionInbox.mockResolvedValue({ items: [], remaining: 0 });
  api.setEditionItemState.mockResolvedValue({});
});
it('opens the newest issue while retaining only the remembered publication', async () => {
  const old = { ...edition, _id: 'old', number: 1, windowStart: '2026-08-01', windowEnd: '2026-08-07' };
  const current = { ...edition, _id: 'current', number: 3, windowStart: '2026-09-13', windowEnd: '2099-09-19' };
  readingState.readEditionLocal.mockImplementation((issueId) => issueId === 'last'
    ? { issueId: 'old', profile: edition.profile, itemId: 'one' }
    : null);
  api.listEditions.mockResolvedValue([current, old]);
  api.getEdition.mockImplementation(async issueId => issueId === 'current' ? current : old);
  render(<Editions />);
  await screen.findByText(item.finding);
  expect(api.getEdition).toHaveBeenCalledWith('current');
  expect(screen.getByRole('button', { name: 'Edition 3' })).toHaveAttribute('aria-current', 'page');
});

it('offers a newly filed issue without pulling the reader out of the one open', async () => {
  const open = { ...edition, windowStart: '2026-09-13', windowEnd: '2026-09-19' };
  const fresh = {
    ...open,
    _id: 'fresh',
    number: 4,
    windowStart: '2026-09-20',
    windowEnd: '2026-09-26',
    updatedAt: '2026-09-27T10:02:38.987Z'
  };
  api.listEditions
    .mockResolvedValueOnce([open])
    .mockResolvedValueOnce([fresh, open]);
  api.getEdition.mockImplementation(async issueId => issueId === 'fresh' ? fresh : open);
  render(<Editions />);
  await screen.findByText(item.finding);
  fireEvent(document, new Event('visibilitychange'));
  expect(await screen.findByText('Just filed · Weekend Readings')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Open Edition 4 →' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/fresh');
});

it('powers through full arrivals without clearing untouched findings', async () => {
  mockSearch = 'power=1';
  api.getEditionInbox.mockResolvedValue({
    items: [{
      ...item, editionId: 'e1', profileLabel: 'Weekend Readings', issueLabel: 'Edition', number: 3
    }],
    remaining: 0
  });
  render(<Editions />);
  expect(await screen.findByRole('heading', { name: item.title })).toBeVisible();
  expect(screen.getByText(item.boundary)).toBeVisible();
  expect(api.getEditionInbox).toHaveBeenCalledWith({ cursor: '', limit: 40, view: 'power' });
  await waitFor(() => expect(document.querySelector('.power-item')).toHaveClass('is-active'));
  fireEvent.keyDown(document, { key: 'e' });
  await waitFor(() => expect(api.setEditionItemState).toHaveBeenCalledWith('e1', 'one', 'opened'));
  expect(await screen.findByRole('heading', { name: 'All caught up.' })).toBeVisible();
});
it('opens the finding and its boundary, preserves empty sections, and keeps global arrivals outside the paper', async () => {
  render(<Editions />);
  expect(await screen.findByText(item.finding)).toBeVisible();
  expect(screen.getByText(item.boundary)).toBeVisible();
  expect(screen.getByText('Nothing filed under Counterevidence in this issue.')).toBeVisible();
  expect(api.getEditionInbox).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'New arrivals' }));
  const panel = screen.getByRole('dialog', { name: 'New arrivals' });
  expect(panel.closest('[data-testid="edition-read"]')).toBeNull();
  expect(await within(panel).findByText('No new items')).toBeVisible();
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
it('switches publications and dated issues through stable issue URLs', async () => {
  const old = { ...edition, _id: 'old', number: 1, windowStart: '2026-08-01' };
  api.listEditions.mockResolvedValue([edition, old, { ...edition, _id: 'ai', profile: 'ai', profileLabel: 'This Week in AI' }]);
  render(<Editions />); await screen.findByText(item.finding);
  fireEvent.click(screen.getByRole('button', { name: 'This Week in AI' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/ai');
  fireEvent.click(screen.getByRole('button', { name: 'Edition 1' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/old');
  fireEvent.click(screen.getByRole('button', { name: 'Edition 2, Counterevidence: nothing filed' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/editions/e1?section=limits');
});
it('reads Issue 5 of This Week in AI off the shelf, and seats a second hand at the desk', async () => {
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
  mockId = 'twia-5';
  api.listEditions.mockResolvedValue(run);
  api.getEdition.mockResolvedValue(opened);
  render(<Editions />);
  expect(await screen.findByText(five.items[0].finding)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Issue 5' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Issue 5, Infrastructure & systems: looked, nothing met the bar' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Issue 5, Evaluation & counterevidence: 2 filed, also filed by Claude' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Issue 1, Models & methods: 3 filed' })).toBeVisible();
  const desk = screen.getByRole('list', { name: 'The desk' });
  expect(within(desk).getByText('Usually files every column')).toBeVisible();
  expect(within(desk).getByText('Filed Oct 6 · Kept by you: 1 of 1')).toBeVisible();
  expect(screen.getByText('Standfirst by the editor')).toBeVisible();
});
it('marks a column only for the hands that filed into it, and counts a Keep on the desk at once', async () => {
  const read = { ...item, filedByRuntime: 'openclaw', readings: [{ filedBy: 'Claude', filedByRuntime: 'claude-code', finding: 'A second view.', boundary: 'Its limit.' }] };
  const other = { ...item, itemId: 'two', section: 'limits', finding: 'A finding Codex filed.', filedBy: 'Codex', filedByRuntime: 'codex' };
  const opened = { ...edition, items: [read, other] };
  api.listEditions.mockResolvedValue([{ ...edition, items: undefined, filings: [read, other].map(({ section, filedBy, filedByRuntime }) => ({ section, filedBy, filedByRuntime, saved: false })) }]);
  api.getEdition.mockResolvedValue(opened);
  render(<Editions />); await screen.findByText(item.finding);
  const ideas = document.getElementById('edition-section-ideas');
  expect(ideas.querySelectorAll('.reading-section-label__marks [role="img"]')).toHaveLength(1);
  const desk = screen.getByRole('list', { name: 'The desk' });
  expect(within(desk).getAllByText(/Kept by you: 0 of 1/)).toHaveLength(2);
  api.saveEditionItem.mockResolvedValue({ edition: { ...opened, items: [{ ...read, savedArticleId: 'article' }, other] }, readable: true });
  fireEvent.click(within(document.getElementById('edition-item-one')).getByRole('button', { name: 'Keep in Library' }));
  await waitFor(() => expect(within(screen.getByRole('list', { name: 'The desk' })).getAllByText(/Kept by you: 1 of 1/)).toHaveLength(1));
});
it('prints no desk for a paper one agent keeps', async () => {
  render(<Editions />); await screen.findByText(item.finding);
  expect(screen.queryByRole('list', { name: 'The desk' })).toBeNull();
  expect(screen.queryByText('Standfirst by the editor')).toBeNull();
});
it('does not insert new filings until Show, even when Keep returns the newer issue', async () => {
  jest.useFakeTimers();
  render(<Editions />); await act(async () => {});
  const newer = { ...edition, items: [{ ...item, itemId: 'two', title: 'An arrival' }, item] };
  api.getEdition.mockResolvedValue(newer);
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(screen.queryByRole('heading', { name: 'An arrival' })).toBeNull();
  api.saveEditionItem.mockResolvedValue({ edition: { ...newer, items: newer.items.map(i => i.itemId === 'one' ? { ...i, savedArticleId: 'article' } : i) }, readable: false });
  fireEvent.click(screen.getByRole('button', { name: 'Keep in Library' })); await act(async () => {});
  expect(screen.getByRole('link', { name: '✓ In your Library' })).toHaveAttribute('href', '/articles/article');
  expect(screen.getByText(/Saved the link/)).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'An arrival' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '1 finding added · Show' }));
  expect(screen.getByRole('heading', { name: 'An arrival' })).toBeVisible();
  jest.useRealTimers();
});
it('Source uses an honest fallback and Escape returns focus to its control', async () => {
  render(<Editions />); await screen.findByText(item.finding);
  const source = screen.getByRole('button', { name: 'Source', exact: true });
  fireEvent.click(source);
  expect(screen.getByText(/Readable article text is not available/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open original ↗' })).toHaveAttribute('href', item.url);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close side view' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(source).toHaveFocus();
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
  fireEvent.click(screen.getByRole('button', { name: 'Keep in Library' })); await act(async () => {});
  await act(async () => finishPoll({ ...edition, throughLine: 'A new editorial line.' }));
  fireEvent.click(screen.getByRole('button', { name: 'This issue has an update · Show' }));
  expect(screen.getByRole('link', { name: '✓ In your Library' })).toBeVisible();
  jest.useRealTimers();
});
