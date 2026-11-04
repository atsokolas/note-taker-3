jest.mock('react-router-dom', () => { global.TextEncoder = require('util').TextEncoder; global.TextDecoder = require('util').TextDecoder; return jest.requireActual('react-router'); });
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkNotes from './WorkNotes';
import { WorkDayClose } from './WorkOutstanding.jsx';
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
const rail = () => within(screen.getByRole('navigation', { name: 'Outstanding' }));

test('Outstanding sits in the rail under the folders and counts what is open and who owes you', async () => {
  work('today');
  await waitFor(() => expect(rail().getByRole('button', { name: /Outstanding/ })).toHaveTextContent('Outstanding2'));
  expect(rail().getByRole('button', { name: /Waiting on/ })).toHaveTextContent('Waiting on1');
  fireEvent.click(rail().getByRole('button', { name: /Outstanding/ }));
  expect(await screen.findByRole('heading', { name: 'Outstanding' })).toBeInTheDocument();
  expect(screen.getByText('2 things outstanding. One came from your notes and isn’t sorted yet.')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Work folders' })).toBeInTheDocument();
});

test('a new line from a note is sorted onto Waiting on with the person, on the same record', async () => {
  work('outstanding');
  const fresh = within(await screen.findByRole('region', { name: 'New from your notes' }));
  expect(fresh.getByText('From Fieldwell · pilot follow-up')).toBeInTheDocument();
  fireEvent.click(fresh.getByRole('button', { name: 'Waiting on…' }));
  fireEvent.change(fresh.getByRole('textbox', { name: 'Who is Confirm service-training dates waiting on?' }), { target: { value: 'Ana' } });
  fireEvent.click(fresh.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(records.find(x => x._id === 'task').workItem).toMatchObject({ list: 'waiting', waitingOn: 'Ana', noteId: 'note' }));
});

test('one typed line with @name lands on Waiting on, and Nudge drafts a message from it', async () => {
  work('outstanding');
  const line = await screen.findByRole('textbox', { name: 'Add something outstanding' });
  fireEvent.change(line, { target: { value: '@Priya data room access' } }); fireEvent.submit(line.closest('form'));
  await waitFor(() => expect(records.at(-1)).toMatchObject({ title: 'data room access', workItem: { kind: 'task', list: 'waiting', waitingOn: 'Priya' } }));
  fireEvent.click(rail().getByRole('button', { name: /Waiting on/ }));
  expect(await screen.findByText('2 people owe you something. Mira’s has waited longest.')).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('heading', { name: 'Mira' }).closest('section')).getByRole('button', { name: 'Nudge' }));
  expect(screen.getByText('Hi Mira, any news on the pilot numbers? No rush if it’s in hand.')).toBeInTheDocument();
});

test('ticking a line draws it through and keeps it a moment with Undo', async () => {
  work('outstanding');
  fireEvent.click(within(await screen.findByRole('region', { name: 'New from your notes' })).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(document.querySelector('.is-struck')).toHaveTextContent('Confirm service-training dates'));
  expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
});

test('a note with Mira shows what Mira owes you in its margin', async () => {
  render(<MemoryRouter initialEntries={['/work?note=note']}><WorkNotes /></MemoryRouter>);
  fireEvent.click(await within(await screen.findByRole('complementary')).findByRole('button', { name: 'Customer discovery' }));
  fireEvent.click(await within(screen.getByRole('complementary')).findByRole('button', { name: /Fieldwell/ }));
  const owed = within(await screen.findByRole('region', { name: 'Owed to you' }));
  expect(owed.getByRole('heading', { name: 'Mira owes you' })).toBeInTheDocument(); expect(owed.getByText('The pilot numbers')).toBeInTheDocument();
});

test('the weekly review shows only what needs you and remembers when it was done', async () => {
  work('review');
  expect(await screen.findByRole('heading', { name: 'Weekly review' })).toBeInTheDocument();
  expect(screen.getByText('Inbox is clear.')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Next step for Launch planning' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark this week reviewed' }));
  expect(await screen.findByText('Reviewed today. Everything below is as you left it.')).toBeInTheDocument();
  expect(rail().getByRole('button', { name: /Weekly review/ })).toHaveTextContent('Weekly reviewdone');
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
