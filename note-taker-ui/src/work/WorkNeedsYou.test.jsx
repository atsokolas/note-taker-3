jest.mock('react-router-dom', () => { global.TextEncoder = require('util').TextEncoder; global.TextDecoder = require('util').TextDecoder; return jest.requireActual('react-router'); });
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkNotes from './WorkNotes';
import { WorkDayClose, morning } from './WorkNeedsYou.jsx';
import WorkCalendar from './WorkCalendar';
import api from '../api';
import { forgetWorkSession } from './workSessions';
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, clearStoredTokens: jest.fn() }));
let records, folders;
const original = '<p>Two sites can support the pilot.</p><p>Keep these authored words.</p>';
beforeEach(() => {
  forgetWorkSession('owner'); localStorage.clear(); localStorage.setItem('token', `x.${btoa(JSON.stringify({ id: 'owner' }))}.x`); jest.clearAllMocks();
  folders = [{ _id: 'f', name: 'Customer discovery', revision: 0 }, { _id: 'g', name: 'Launch planning', revision: 0 }];
  const today = new Date().toISOString().slice(0, 10);
  records = [{ _id: 'note', revision: 0, title: 'Fieldwell · pilot follow-up', content: original, folder: 'f', takenOn: today, timeZone: 'UTC', occurredOn: today, withText: 'Mira Chen' },
    { _id: 'task', revision: 0, title: 'Confirm service-training dates', folder: 'f', takenOn: today, workItem: { kind: 'task', noteId: 'note', priority: 0, history: [] } },
    { _id: 'owed', revision: 0, title: 'The pilot numbers', folder: 'f', takenOn: today, workItem: { kind: 'task', list: 'waiting', waitingOn: 'Mira', sortedOn: today, priority: 0, history: [] } }];
  api.get.mockImplementation(async () => ({ data: { entries: records.filter(x => !x.workItem), items: records.filter(x => x.workItem), folders } }));
  api.post.mockImplementation(async (path, body) => {
    if (path.endsWith('/folders')) { const folder = { _id: 'empty', revision: 0, name: body.name }; folders.push(folder); return { data: folder }; }
    const record = { ...body, _id: 'new-' + records.length, revision: 0 }; records.push(record); return { data: record };
  });
  api.put.mockImplementation(async (path, body) => {
    const list = path.includes('/folders/') ? folders : records, index = list.findIndex(x => x._id === path.split('/').pop()), current = list[index];
    if (body.expectedRevision !== current.revision) throw { response: { status: 409, data: { current } } };
    const next = { ...current, ...body, revision: current.revision + 1 };
    if (current.workItem) next.workItem = { ...current.workItem, ...body.workItem, history: [...(current.workItem.history || []), ...(body.workActions || []).map(event => ({ ...event, recordedAt: new Date().toISOString() }))] };
    if (body.archived !== undefined) next.archivedAt = body.archived ? new Date().toISOString() : null;
    delete next.workActions; list[index] = next; return { data: next };
  });
});
const work = view => render(<MemoryRouter initialEntries={[`/work?view=${view}`]}><WorkNotes /></MemoryRouter>);
const rail = () => within(screen.getByRole('complementary'));

test('Today is the home: its margin is Needs you, the rail counts it, and old Needs you and Outstanding links open it', async () => {
  for (const view of ['needs', 'outstanding']) {
    const { unmount } = work(view);
    await waitFor(() => expect(rail().getByRole('button', { name: /Today/ })).toHaveTextContent('Today2'));
    expect(rail().queryByRole('button', { name: /Needs you/ })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Today', level: 1 })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByRole('region', { name: 'Owed to you' })).toBeInTheDocument();
    unmount();
  }
});

test('the morning sentence says the day and crosses out each part as it is done', () => {
  const needs = { waiting: [{ title: 'The data room login', waitingOn: 'Priya', sortedOn: '2026-11-04' }], fresh: [{}, {}], silent: [{ name: 'Pricing' }] };
  const items = [
    { kind: 'appointment', title: 'Call with Priya', plannedOn: '2026-11-13', startTime: '10:00', endTime: '10:45' },
    { kind: 'appointment', title: 'Jo', plannedOn: '2026-11-13', startTime: '15:30', endTime: '16:00' },
    { kind: 'task', title: 'Draft the risk section', plannedOn: '2026-11-13', oneThingOn: '2026-11-13', completed: true },
    { kind: 'task', title: 'Send Sam the bands', plannedOn: '2026-11-13' }];
  expect(morning(items, needs, '2026-11-13', '11:00')).toEqual([
    { text: 'Call with Priya at 10:00.', done: true }, { text: 'Jo at 15:30.', done: false },
    { text: 'Your one thing: draft the risk section.', done: true }, { text: 'One more line is planned.', done: false },
    { text: 'Priya has owed you the data room login for 9 days.' }, { text: '2 lines from your notes need a place.' },
    { text: 'Pricing has gone quiet.' }, { text: 'It’s Friday: read the week back.' }]);
  const next = { kind: 'task', title: 'Call the auditor', plannedOn: '2026-11-13', oneThingOn: '2026-11-13' };
  expect(morning([...items, next], { ...needs, oneThing: next }, '2026-11-13', '11:00')).toContainEqual({ text: 'Your one thing: call the auditor.', done: undefined });
  expect(morning([], { waiting: [], fresh: [], silent: [] }, '2026-11-12', '09:00')).toEqual([{ text: 'A clear day, and nothing needs you.' }]);
});

test('a new line from a note is sorted onto Waiting on with the person, on the same record', async () => {
  work('needs');
  const fresh = within(await screen.findByRole('region', { name: /New from your notes/ }));
  expect(fresh.getByText('From Fieldwell · pilot follow-up')).toBeInTheDocument();
  fireEvent.click(fresh.getByRole('button', { name: 'Waiting on…' }));
  fireEvent.change(fresh.getByRole('textbox', { name: 'Who is Confirm service-training dates waiting on?' }), { target: { value: 'Ana' } });
  fireEvent.click(fresh.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(records.find(x => x._id === 'task').workItem).toMatchObject({ list: 'waiting', waitingOn: 'Ana', noteId: 'note' }));
});

test('Today on a new line plans it for today and leaves it sorted', async () => {
  work('needs');
  fireEvent.click(within(await screen.findByRole('region', { name: /New from your notes/ })).getByRole('button', { name: 'Today' }));
  const today = new Date().toISOString().slice(0, 10);
  await waitFor(() => expect(records.find(x => x._id === 'task').workItem).toMatchObject({ list: 'next', sortedOn: today, history: [expect.objectContaining({ type: 'plan', plannedOn: today })] }));
});

test('one typed line with @name lands in Owed to you, and Nudge drafts a message from it', async () => {
  work('needs');
  const line = await screen.findByRole('textbox', { name: 'Add a line' });
  fireEvent.change(line, { target: { value: '@Priya data room access' } }); fireEvent.submit(line.closest('form'));
  await waitFor(() => expect(records.at(-1)).toMatchObject({ title: 'data room access', workItem: { kind: 'task', list: 'waiting', waitingOn: 'Priya' } }));
  const owed = within(screen.getByRole('region', { name: 'Owed to you' }));
  expect(await owed.findByText('Priya owes you data room access')).toBeInTheDocument();
  fireEvent.click(owed.getAllByRole('button', { name: 'Nudge' })[0]);
  expect(screen.getByText('Hi Mira, any news on the pilot numbers? No rush if it’s in hand.')).toBeInTheDocument();
});

test('ticking a line draws it through and keeps it a moment with Undo', async () => {
  work('needs');
  fireEvent.click(within(await screen.findByRole('region', { name: /New from your notes/ })).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(document.querySelector('.is-struck')).toHaveTextContent('Confirm service-training dates'));
  expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
});

test('a project untouched for three weeks is Gone quiet, and Pause sets it aside', async () => {
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  folders.push({ _id: 'p', name: 'Pricing', kind: 'project', revision: 0, updatedAt: old });
  records.push({ _id: 'price', revision: 0, title: 'Annual discount', project: 'p', takenOn: old.slice(0, 10), updatedAt: old, workItem: { kind: 'task', list: 'next', sortedOn: old.slice(0, 10), priority: 0, history: [] } });
  work('needs');
  const quiet = within(await screen.findByRole('region', { name: 'Gone quiet' }));
  expect(quiet.getByText('Untouched for 4 weeks. Next: Annual discount.')).toBeInTheDocument();
  fireEvent.click(quiet.getByRole('button', { name: 'Pause' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/work-notes/folders/p', expect.objectContaining({ paused: true }), expect.anything()));
});

test('a note with Mira shows what Mira owes you in its margin', async () => {
  render(<MemoryRouter initialEntries={['/work?note=note']}><WorkNotes /></MemoryRouter>);
  fireEvent.click(await within(await screen.findByRole('complementary')).findByRole('button', { name: 'Customer discovery' }));
  fireEvent.click(await within(screen.getByRole('complementary')).findByRole('button', { name: /Fieldwell/ }));
  const owed = within(await screen.findByRole('region', { name: 'Owed to you' }));
  expect(owed.getByRole('heading', { name: 'Mira owes you' })).toBeInTheDocument(); expect(owed.getByText('The pilot numbers')).toBeInTheDocument();
});

test('the check-in reads the week back as a new Work note, and offers the one it already holds', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const draft = { _id: 'week', revision: 0, title: 'Week of 5–11 Nov 2026', tags: ['work-edition'], occurredOn: today, takenOn: today, timeZone: 'UTC', folder: null, content: '<p>Drafted by Claude from 2 entries in 1 note.</p><h2>What got done</h2><ul><li><p>Agreed the pilot sites. · Fieldwell, 9 Nov</p></li></ul>' };
  const post = api.post.getMockImplementation();
  api.post.mockImplementation(async (path, body) => {
    if (!path.endsWith('/week-edition')) return post(path, body);
    expect(body).toMatchObject({ through: today, timeZone: expect.any(String), operationId: expect.any(String) });
    records.push(draft); return { data: { note: draft } };
  });
  work('review');
  await screen.findByText('Confirm service-training dates');
  expect(screen.getByText('Only Claude reads these notes, and the draft stays here in Work.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Read the week back' }));
  expect(await screen.findByText('Agreed the pilot sites. · Fieldwell, 9 Nov')).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/api/work-notes/week-edition', expect.anything(), expect.anything());
  fireEvent.click(rail().getByRole('button', { name: /Today/ }));
  expect(await screen.findByText(/Week of 5–11 Nov 2026 is drafted\./)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open it' })).toBeInTheDocument();
});

test('a quiet week says so, and a failed draft keeps the page in place', async () => {
  const post = api.post.getMockImplementation();
  let answer = async () => ({ data: { silence: 'No Work entries between 5 Nov and 11 Nov. Nothing to draft.' } });
  api.post.mockImplementation(async (path, body) => path.endsWith('/week-edition') ? answer() : post(path, body));
  work('needs');
  await screen.findByText('Confirm service-training dates');
  fireEvent.click(screen.getByRole('button', { name: 'Read the week back' }));
  expect(await screen.findByText('No Work entries between 5 Nov and 11 Nov. Nothing to draft.')).toHaveAttribute('role', 'status');
  answer = async () => { throw { response: { status: 502, data: { error: 'Claude could not draft the week just now. Your notes are unchanged. Try again.' } } }; };
  fireEvent.click(screen.getByRole('button', { name: 'Read the week back' }));
  expect(await screen.findByText('Claude could not draft the week just now. Your notes are unchanged. Try again.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Today', level: 1 })).toBeInTheDocument();
});

test('closing the day moves what is left to tomorrow, Monday or Someday, and says how tomorrow starts', () => {
  const onAction = jest.fn(), onSort = jest.fn();
  render(<WorkDayClose today="2026-10-29" onAction={onAction} onSort={onSort} items={[
    { id: 'a', clientId: 'a', kind: 'task', title: 'Reply to the auditor', plannedOn: '2026-10-29' },
    { id: 'b', clientId: 'b', kind: 'appointment', title: 'Lunch with Ana', plannedOn: '2026-10-30', startTime: '12:30' },
    { id: 'c', clientId: 'c', kind: 'task', title: 'Draft the job post', plannedOn: '2026-10-30' }]} />);
  expect(screen.getByText('One thing from today is still open.')).toBeInTheDocument();
  expect(screen.getByText('Tomorrow starts with Lunch with Ana at 12:30 and draft the job post.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Monday' })); expect(onAction).toHaveBeenLastCalledWith('a', { type: 'plan', plannedOn: '2026-11-02' });
  fireEvent.click(screen.getByRole('button', { name: 'Someday' })); expect(onSort).toHaveBeenLastCalledWith('a', { list: 'someday', sortedOn: '2026-10-29', returnOn: null });
});

test('moving the last line leaves the closing sentence on the page', () => {
  const lines = [{ id: 'a', clientId: 'a', kind: 'task', title: 'Reply to the auditor', plannedOn: '2026-10-29' }];
  const { rerender } = render(<WorkDayClose today="2026-10-29" onAction={() => {}} onSort={() => {}} items={lines} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
  rerender(<WorkDayClose today="2026-10-29" onAction={() => {}} onSort={() => {}} items={[{ ...lines[0], plannedOn: '2026-10-30' }]} />);
  expect(screen.getByText('Today is closed.')).toBeInTheDocument();
  expect(screen.getByText('Tomorrow starts with reply to the auditor.')).toBeInTheDocument();
});

test('a line set aside for someday is not carried on the day page until its day comes back', () => {
  const note = { _id: 'n', clientId: 'n', takenOn: '2026-10-26' };
  const line = { id: 'a', clientId: 'a', kind: 'task', title: 'Plan the offsite', noteId: 'n', list: 'someday', returnOn: '2026-11-03' };
  const calendar = today => <WorkCalendar page day={today} today={today} mode="day" onMode={() => {}} onDay={() => {}} items={[line]} notes={[note]} query="" folders={[]} drag={() => ({})} onOpen={() => {}} onStart={() => {}} onEdit={() => {}} onAction={() => {}} onNew={() => {}} onPlan={() => {}} margin={null} />;
  const { rerender } = render(calendar('2026-10-29'));
  expect(screen.queryByRole('region', { name: 'Carried from earlier' })).toBeNull();
  rerender(calendar('2026-11-03'));
  expect(within(screen.getByRole('region', { name: 'Carried from earlier' })).getByText('Plan the offsite')).toBeInTheDocument();
});
