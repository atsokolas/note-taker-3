jest.mock('react-router-dom', () => { global.TextEncoder = require('util').TextEncoder; global.TextDecoder = require('util').TextDecoder; return jest.requireActual('react-router'); });
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkNotes from './WorkNotes';
import { WorkDayClose } from './WorkActions';
import { weekDays } from './workPlannerModel';
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
    if (path.includes('/weeks/')) {
      const day = path.split('/').at(-1), current = records.find(record => record.workItem?.kind === 'week' && record.workItem.plannedOn === day);
      const saved = { _id: current?._id || day, revision: (current?.revision ?? -1) + 1, workItem: { kind: 'week', plannedOn: day, priorities: body.priorities } };
      if (current) records.splice(records.indexOf(current), 1, saved); else records.push(saved);
      return { data: saved };
    }
    const list = path.includes('/folders/') ? folders : records, index = list.findIndex(x => x._id === path.split('/').pop()), current = list[index];
    if (body.expectedRevision !== current.revision) throw { response: { status: 409, data: { current } } };
    const next = { ...current, ...body, revision: current.revision + 1 };
    if (current.workItem) next.workItem = { ...current.workItem, ...body.workItem, history: [...(current.workItem.history || []), ...(body.workActions || []).map(event => ({ ...event, recordedAt: new Date().toISOString() }))] };
    if (body.archived !== undefined) next.archivedAt = body.archived ? new Date().toISOString() : null;
    delete next.workActions; list[index] = next; return { data: next };
  });
});
const work = view => render(<MemoryRouter initialEntries={[`/work?view=${view}`]}><WorkNotes /></MemoryRouter>);
const rail = () => within(screen.getByRole('complementary', { name: 'Work notes' }));

test('legacy action links open the appropriate list and only show that list', async () => {
  for (const [view, name] of [['needs', 'To sort'], ['outstanding', 'Next'], ['waiting', 'Waiting on'], ['someday', 'Someday'], ['upcoming', 'Upcoming']]) {
    const { unmount } = work(view);
    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Action lists' })).getAllByRole('button', { pressed: true })).toHaveLength(1);
    unmount();
  }
});


test('sorting a note follow-up saves the person on the same record', async () => {
  work('needs');
  const list = within(await screen.findByRole('region', { name: 'To sort' }));
  fireEvent.change(await list.findByRole('combobox', { name: 'List for Confirm service-training dates' }), { target: { value: 'waiting' } });
  const person = list.getByRole('textbox', { name: 'Who is Confirm service-training dates waiting on?' });
  fireEvent.change(person, { target: { value: 'Ana' } });
  fireEvent.blur(person);
  await waitFor(() => expect(records.find(x => x._id === 'task').workItem).toMatchObject({ list: 'waiting', waitingOn: 'Ana', noteId: 'note' }));
  expect(records[0].content).toBe(original);
});

test('reopens a completed line from the ledger and puts focus back on its own to-do', async () => {
  const task = records.find(record => record._id === 'task');
  task.workItem.history = [{ operationId: 'closed-once', type: 'complete', actionAt: new Date().toISOString() }];
  work('review');
  fireEvent.click(await screen.findByText('Done this week'));
  const reopen = await screen.findByRole('button', { name: `Reopen ${task.title}` });
  expect(screen.queryByRole('checkbox', { name: new RegExp(task.title) })).toBeNull();
  reopen.focus();
  fireEvent.click(reopen);
  const checkbox = await screen.findByRole('checkbox', { name: new RegExp(task.title) });
  expect(checkbox).not.toBeChecked();
  expect(checkbox).toHaveFocus();
  expect(reopen).not.toBeInTheDocument();
  await waitFor(() => expect(records.find(record => record._id === 'task').workItem.history.map(event => event.type)).toEqual(['complete', 'reopen']));
});

test('the finished ledger keeps the original passage link beside a completed task', async () => {
  const task = records.find(record => record._id === 'task');
  const day = task.takenOn;
  task.workItem.origin = { noteId: 'note', blockId: 'pilot-words', day, noteTitle: records[0].title, notebookName: folders[0].name };
  task.workItem.history = [{ operationId: 'closed-once', type: 'complete', actionAt: new Date().toISOString() }];
  work('review');
  fireEvent.click(await screen.findByText('Done this week'));
  const ledger = (await screen.findByRole('button', { name: `Reopen ${task.title}` })).closest('dl');
  expect(within(ledger).getByRole('link', { name: /From Customer discovery/ })).toHaveAttribute('href', `/work?note=note&block=pilot-words&entry=${day}`);
});

test('Today on a new line plans it for today and leaves it sorted', async () => {
  work('needs');
  const list = within(await screen.findByRole('region', { name: 'To sort' }));
  fireEvent.click(await list.findByLabelText('Actions for Confirm service-training dates'));
  fireEvent.click(list.getByRole('button', { name: 'Move to today' }));
  const today = new Date().toISOString().slice(0, 10);
  await waitFor(() => expect(records.find(x => x._id === 'task').workItem).toMatchObject({ list: 'next', sortedOn: today, history: [expect.objectContaining({ type: 'plan', plannedOn: today })] }));
});

test('one typed line with @name lands in Owed to you, and Nudge drafts a message from it', async () => {
  work('today');
  fireEvent.click(await screen.findByRole('button', { name: 'Add to-do' }));
  const line = await screen.findByRole('textbox', { name: 'Add a line' });
  fireEvent.change(line, { target: { value: '@Priya data room access' } }); fireEvent.submit(line.closest('form'));
  await waitFor(() => expect(records.at(-1)).toMatchObject({ title: 'data room access', workItem: { kind: 'task', list: 'waiting', waitingOn: 'Priya' } }));
  fireEvent.click(rail().getByRole('button', { name: /Actions/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Waiting on' }));
  const owed = within(screen.getByRole('region', { name: 'Waiting on' }));
  expect(await owed.findByRole('textbox', { name: 'Who is data room access waiting on?' })).toHaveValue('Priya');
  const nudgeMenu = owed.getByLabelText('Actions for The pilot numbers');
  fireEvent.click(nudgeMenu);
  fireEvent.click(within(nudgeMenu.closest('details')).getByRole('button', { name: 'Draft a nudge' }));
  expect(screen.getByText('Hi Mira, any news on the pilot numbers? No rush if it’s in hand.')).toBeInTheDocument();
});

test('completing an action offers undo and restores the same item', async () => {
  work('needs');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Confirm service-training dates' }));
  expect(await screen.findByText('Confirm service-training dates completed.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByRole('checkbox', { name: 'Confirm service-training dates' })).not.toBeChecked();
});

test('a project untouched for three weeks is Gone quiet, and Pause sets it aside', async () => {
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  folders.push({ _id: 'p', name: 'Pricing', kind: 'project', revision: 0, updatedAt: old });
  records.push({ _id: 'price', revision: 0, title: 'Annual discount', project: 'p', takenOn: old.slice(0, 10), updatedAt: old, workItem: { kind: 'task', list: 'next', sortedOn: old.slice(0, 10), priority: 0, history: [] } });
  work('review');
  fireEvent.click(await screen.findByText('Inactive projects and tasks'));
  expect(within(screen.getByRole('main')).getByRole('button', { name: 'Pricing' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Pause project' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/work-notes/folders/p', expect.objectContaining({ paused: true }), expect.anything()));
});

test('a note with Mira shows what Mira owes you in its margin', async () => {
  render(<MemoryRouter initialEntries={['/work?note=note']}><WorkNotes /></MemoryRouter>);
  fireEvent.click(await within(await screen.findByRole('complementary', { name: 'Work notes' })).findByRole('button', { name: 'Customer discovery' }));
  fireEvent.click(await within(screen.getByRole('complementary', { name: 'Work notes' })).findByRole('button', { name: /Fieldwell/ }));
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
  fireEvent.click((await screen.findByRole('button', { name: 'Draft a weekly recap' })));
  expect(await screen.findByText('Agreed the pilot sites. · Fieldwell, 9 Nov')).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/api/work-notes/week-edition', expect.anything(), expect.anything());
  fireEvent.click(rail().getByRole('button', { name: 'Review' }));
  expect(await screen.findByRole('button', { name: 'Open weekly recap' })).toBeInTheDocument();
});

test('a quiet week says so, and a failed draft keeps the page in place', async () => {
  const post = api.post.getMockImplementation();
  let answer = async () => ({ data: { silence: 'No Work entries between 5 Nov and 11 Nov. Nothing to draft.' } });
  api.post.mockImplementation(async (path, body) => path.endsWith('/week-edition') ? answer() : post(path, body));
  work('review');
  fireEvent.click((await screen.findByRole('button', { name: 'Draft a weekly recap' })));
  expect(await screen.findByText('No Work entries between 5 Nov and 11 Nov. Nothing to draft.')).toHaveAttribute('role', 'status');
  answer = async () => { throw { response: { status: 502, data: { error: 'Claude could not draft the week just now. Your notes are unchanged. Try again.' } } }; };
  fireEvent.click((await screen.findByRole('button', { name: 'Draft a weekly recap' })));
  expect(await screen.findByText('Claude could not draft the week just now. Your notes are unchanged. Try again.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Weekly review', level: 1 })).toBeInTheDocument();
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

test('Someday returns an item to To sort on its review date', async () => {
  const date = records[1].takenOn;
  records[1].workItem = { ...records[1].workItem, list: 'someday', returnOn: date };
  work('someday');
  const list = await screen.findByRole('region', { name: 'Someday' });
  expect(within(list).queryByText('Confirm service-training dates')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /To sort/ }));
  const unsorted = await screen.findByRole('region', { name: 'To sort' });
  expect(await within(unsorted).findByRole('checkbox', { name: 'Confirm service-training dates' })).toBeInTheDocument();
});

test('Next keeps scheduled actions reachable behind one disclosure', async () => {
  const day = records[1].takenOn;
  records[1].workItem = { ...records[1].workItem, list: 'next', plannedOn: day };
  work('actions&list=next');
  await screen.findByRole('region', { name: 'Next' });
  const scheduled = await screen.findByText('Scheduled');
  expect(screen.getByLabelText('Confirm service-training dates')).not.toBeVisible();
  fireEvent.click(scheduled);
  expect(screen.getByRole('checkbox', { name: 'Confirm service-training dates' })).toBeVisible();
});

test('Next shows the linked priority once on the canonical task row', async () => {
  const day = records[1].takenOn;
  records[1].workItem.list = 'next';
  records.push({ _id: 'week', revision: 0, title: 'Week', workItem: { kind: 'week', plannedOn: weekDays(day)[0], priorities: [{ id: 'p', title: 'Ship the pilot', taskIds: ['task'], status: 'active', reviewed: true }] } });
  work('actions&list=next');
  const list = within(await screen.findByRole('region', { name: 'Next' }));
  expect(await list.findAllByRole('checkbox', { name: 'Confirm service-training dates' })).toHaveLength(1);
  expect(within(list.getByRole('region', { name: 'Ship the pilot' })).getByRole('checkbox', { name: 'Confirm service-training dates' })).toBeInTheDocument();
  fireEvent.click(list.getByRole('button', { name: 'Ship the pilot' }));
  expect(await screen.findByRole('region', { name: 'Ship the pilot' })).toHaveTextContent('Confirm service-training dates');
});

test('a Next row offers one way to plan it for today', async () => {
  const today = new Date().toISOString().slice(0, 10);
  records.push({ _id: 'next-once', revision: 0, title: 'Plan me once', takenOn: today, workItem: { kind: 'task', list: 'next', sortedOn: today, history: [] } });
  work('actions');
  const menu = (await screen.findByLabelText('Actions for Plan me once')).closest('details');
  expect(within(menu).getAllByRole('button').map(button => button.textContent).filter(label => /today/i.test(label))).toEqual(['Move to today', 'Make today’s focus']);
});

test('a Friday waiting follow-up opens on Monday with its source, due date and priority', async () => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-11-20T18:00:00Z'));
  const task = records.find(record => record._id === 'owed');
  const origin = { noteId: 'note', blockId: 'pilot-words', day: '2026-11-18', noteTitle: records[0].title, notebookName: folders[0].name };
  task.takenOn = '2026-11-18';
  task.workItem = { ...task.workItem, noteId: 'note', dueOn: '2026-11-24', sortedOn: '2026-11-18', origin };
  records.push({ _id: 'week', revision: 0, workItem: { kind: 'week', plannedOn: '2026-11-16', priorities: [{ id: 'p', title: 'Ship the pilot', taskIds: ['owed'], status: 'active', reviewed: true }] } });
  try {
    const { unmount } = work('review');
    fireEvent.click(await screen.findByText('Waiting on', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'I have it' }));
    const title = screen.getByRole('textbox', { name: 'Next action' });
    fireEvent.change(title, { target: { value: 'Check the pilot numbers' } });
    fireEvent.submit(title.form);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Monday' }));
    const checkbox = await screen.findByRole('checkbox', { name: 'Check the pilot numbers' });
    expect(checkbox).toHaveFocus();
    expect(screen.getByText('Planned Friday')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ship the pilot' })).toBeInTheDocument();
    expect(screen.getByText('Due Tue 24 Nov')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /From Customer discovery/ })).toHaveAttribute('href', '/work?note=note&block=pilot-words&entry=2026-11-18');
    expect(records.find(record => record._id === 'owed')).toMatchObject({ title: 'Check the pilot numbers', workItem: { list: 'next', waitingOn: '', dueOn: '2026-11-24', origin, history: [expect.objectContaining({ type: 'plan', plannedOn: '2026-11-23' })] } });
    unmount();
    forgetWorkSession('owner');
    jest.setSystemTime(new Date('2026-11-23T18:00:00Z'));
    work('today');
    expect(await screen.findByRole('checkbox', { name: 'Check the pilot numbers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ship the pilot' })).toBeInTheDocument();
    await waitFor(() => expect(records.find(record => record.workItem?.kind === 'week' && record.workItem.plannedOn === '2026-11-23').workItem.priorities[0].taskIds).toEqual(['owed']));
  } finally {
    jest.useRealTimers();
  }
});

test('Everything nests to-dos under this week’s priorities, keeps the rest in their lists, and edits each field in place', async () => {
  const day = records[1].takenOn;
  records[1].workItem.list = 'next';
  records.push({ _id: 'week', revision: 0, title: 'Week', workItem: { kind: 'week', plannedOn: weekDays(day)[0], priorities: [{ id: 'p', title: 'Ship the pilot', taskIds: ['task', 'owed'], status: 'active', reviewed: true }, { id: 'q', title: 'Hire a lead', taskIds: [], status: 'active', reviewed: true }] } },
    { _id: 'loose', revision: 0, title: 'Book the offsite', takenOn: day, workItem: { kind: 'task', list: 'someday', sortedOn: day, history: [] } });
  work('actions');
  const everything = within(await screen.findByRole('region', { name: 'Everything' }));
  const pilot = within(await everything.findByRole('region', { name: 'Ship the pilot' }));
  expect(pilot.getAllByRole('checkbox').map(box => box.getAttribute('aria-label'))).toEqual(['Confirm service-training dates', 'The pilot numbers']);
  expect(pilot.getByRole('combobox', { name: 'List for The pilot numbers' })).toHaveValue('waiting');
  expect(pilot.getByRole('textbox', { name: 'Who is The pilot numbers waiting on?' })).toHaveValue('Mira');
  expect(within(everything.getByRole('region', { name: 'Hire a lead' })).getByText('Drag a to-do here.')).toBeInTheDocument();
  expect(within(everything.getByRole('region', { name: 'Someday' })).getByRole('checkbox', { name: 'Book the offsite' })).toBeInTheDocument();
  expect(everything.queryByRole('region', { name: 'Next' })).toBeNull();

  const person = pilot.getByRole('textbox', { name: 'Who is The pilot numbers waiting on?' });
  person.focus();
  fireEvent.change(person, { target: { value: 'Ana' } });
  fireEvent.keyDown(person, { key: 'Enter' });
  fireEvent.change(pilot.getByLabelText('Due date for Confirm service-training dates'), { target: { value: '2026-12-01' } });
  const title = pilot.getByRole('textbox', { name: 'Rename Confirm service-training dates' });
  fireEvent.change(title, { target: { value: 'Confirm the training dates' } });
  fireEvent.blur(title);
  await waitFor(() => expect(records.find(x => x._id === 'owed').workItem).toMatchObject({ list: 'waiting', waitingOn: 'Ana' }));
  await waitFor(() => expect(records.find(x => x._id === 'task')).toMatchObject({ title: 'Confirm the training dates', workItem: { dueOn: '2026-12-01', noteId: 'note' } }));
  fireEvent.change(everything.getByRole('combobox', { name: 'List for Book the offsite' }), { target: { value: 'next' } });
  await waitFor(() => expect(records.find(x => x._id === 'loose').workItem).toMatchObject({ list: 'next' }));
  const next = await within(screen.getByRole('region', { name: 'Everything' })).findByRole('region', { name: 'Next' });
  expect(within(next).getByRole('checkbox', { name: 'Book the offsite' })).toBeInTheDocument();
});

test('an in-place title keeps its words while an IME is composing, and saves on a deliberate Enter', async () => {
  work('needs');
  const title = await screen.findByRole('textbox', { name: 'Rename Confirm service-training dates' });
  title.focus();
  fireEvent.change(title, { target: { value: '研修の日程を確認' } });
  fireEvent.keyDown(title, { key: 'Enter', isComposing: true });
  expect(title).toHaveFocus();
  fireEvent.keyDown(title, { key: 'Enter' });
  await waitFor(() => expect(records.find(x => x._id === 'task').title).toBe('研修の日程を確認'));
});
