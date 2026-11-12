jest.mock('react-router-dom', () => { global.TextEncoder = require('util').TextEncoder; global.TextDecoder = require('util').TextDecoder; return jest.requireActual('react-router'); });
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkNotes from './WorkNotes';
import AddToProject from './AddToProject';
import { FRIDAYS, decisionsIn, entriesOf, fade, hillOn, project, projects } from './workProjects';
import api from '../api';
import { forgetWorkSession } from './workSessions';
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, clearStoredTokens: jest.fn() }));

const today = new Date().toISOString().slice(0, 10);
const ago = days => new Date(Date.now() - days * 86400000).toISOString();
let records, folders;
beforeEach(() => {
  forgetWorkSession('owner'); localStorage.clear(); localStorage.setItem('token', `x.${btoa(JSON.stringify({ id: 'owner' }))}.x`); jest.clearAllMocks();
  folders = [{ _id: 'm', name: 'Meetings', kind: 'folder', revision: 0 },
    { _id: 'f', name: 'Fund II diligence', kind: 'project', revision: 0, brief: '', links: [{ kind: 'wiki', id: 'w1', title: 'Acme Analytics' }] },
    { _id: 'h', name: 'Hiring', kind: 'project', revision: 0, updatedAt: ago(40) },
    { _id: 'o', name: 'Office move', kind: 'project', revision: 0, pausedAt: ago(3) }];
  records = [{ _id: 'call', revision: 0, title: 'Call with Priya', content: '<p>Churn looks fine.</p><p>Decided: we ask for the 2024 cohort.</p>', folder: 'm', project: 'f', takenOn: today, timeZone: 'UTC', occurredOn: today },
    { _id: 'ask', revision: 0, title: 'Ask Priya for the churn file', takenOn: today, workItem: { kind: 'task', noteId: 'call', priority: 0, history: [] } },
    { _id: 'owed', revision: 0, title: 'The data room login', project: 'f', takenOn: today, workItem: { kind: 'task', list: 'waiting', waitingOn: 'Priya', sortedOn: today, priority: 0, history: [] } },
    { _id: 'bands', revision: 0, title: 'Send Sam the comp bands', project: 'h', takenOn: '2026-01-05', updatedAt: ago(40), workItem: { kind: 'task', list: 'next', sortedOn: '2026-01-05', priority: 0, history: [] } }];
  api.get.mockImplementation(async path => path.endsWith('/projects') ? { data: folders.filter(x => x.kind === 'project') } : { data: { entries: records.filter(x => !x.workItem), items: records.filter(x => x.workItem), folders } });
  api.post.mockImplementation(async (path, body) => { const record = { ...body, _id: 'new-' + records.length, revision: 0 }; records.push(record); return { data: record }; });
  api.put.mockImplementation(async (path, body) => {
    const list = path.includes('/folders/') ? folders : records, index = list.findIndex(x => x._id === path.split('/').pop()), current = list[index];
    if (body.expectedRevision !== current.revision) throw { response: { status: 409, data: { current } } };
    const next = { ...current, ...body, revision: current.revision + 1 };
    if (body.archived !== undefined) next.archivedAt = body.archived ? new Date().toISOString() : null;
    if (body.paused !== undefined) next.pausedAt = body.paused ? new Date().toISOString() : null;
    if (current.workItem) next.workItem = { ...current.workItem, ...body.workItem, history: [...(current.workItem.history || []), ...(body.workActions || []).map(event => ({ ...event, recordedAt: new Date().toISOString() }))] };
    delete next.workActions; list[index] = next; return { data: next };
  });
});
const work = query => render(<MemoryRouter initialEntries={[`/work?${query}`]}><WorkNotes /></MemoryRouter>);

test('a project is read from the notes that are part of it, whatever their folder: a line follows its note in, waiting and decisions are derived', () => {
  const notes = records.filter(x => !x.workItem).map(note => ({ ...note, clientId: note._id }));
  const items = records.filter(x => x.workItem).map(item => ({ ...item, ...item.workItem, id: item._id, clientId: item._id }));
  const fund = project(folders[1], notes, items, today);
  expect(fund.next.map(line => line.title)).toEqual(['Ask Priya for the churn file']);
  expect(fund.waiting.map(line => line.waitingOn)).toEqual(['Priya']);
  expect(fund.decisions.map(decision => decision.text)).toEqual(['We ask for the 2024 cohort.']);
  expect(decisionsIn({ content: '<p>decided: keep it</p><p>We decided nothing</p>' })).toEqual(['Keep it']);
  expect(entriesOf({ takenOn: '2026-11-02', content: '<p>Kickoff.</p><h2>9 November 2026</h2><p>Priya says mostly there.</p><p>Churn looks worse.</p><h2>12 November 2026</h2>' }).map(({ day, text }) => [day, text])).toEqual([['2026-11-02', 'Kickoff.'], ['2026-11-09', 'Priya says mostly there. Churn looks worse.']]);
  const grouped = projects(folders.slice(1), notes, items, today);
  expect([grouped.active.map(item => item.name), grouped.paused.map(item => item.name)]).toEqual([['Fund II diligence', 'Hiring'], ['Office move']]);
  expect([fade(grouped.active[0]), fade(grouped.active[1])]).toEqual([0, 3]);
});

test('the hill is read from a project’s own lines: up as questions are answered, down as follow-ups are done', () => {
  const line = (kind, done, on = '2026-11-02') => ({ kind, takenOn: on, completed: Boolean(done), completedAt: done ? `${done}T12:00:00Z` : null });
  expect(hillOn([], '2026-11-12')).toBe(0);
  const lines = [line('question', '2026-11-05'), line('question', null), line('task', null), line('task', null)];
  expect(hillOn(lines, '2026-11-12')).toBe(0.25);
  expect(hillOn(lines, '2026-11-04')).toBe(0);
  lines[1] = line('question', '2026-11-10'); lines[2] = line('task', '2026-11-11');
  expect([hillOn(lines, '2026-11-10'), hillOn(lines, '2026-11-12')]).toEqual([0.5, 0.75]);
  expect(hillOn([line('task', null), line('question', null, '2026-11-20')], '2026-11-12')).toBe(0.5);
  expect(FRIDAYS('2026-11-12')).toEqual(['2026-10-23', '2026-10-30', '2026-11-06']);
  expect(FRIDAYS('2026-11-14')).toEqual(['2026-10-30', '2026-11-06', '2026-11-13']);
});

test('Projects shows where each one stands on one hill and six weeks of days, and a marked day opens', async () => {
  work('view=projects');
  expect(await screen.findByRole('img', { name: /Fund II diligence: making it happen\./ })).toBeInTheDocument();
  const weeks = within(screen.getByRole('region', { name: 'Six weeks' }));
  expect(weeks.queryByText('Office move')).toBeInTheDocument();
  fireEvent.click(weeks.getAllByRole('button', { name: new RegExp(`^Fund II diligence, `) }).at(-1));
  expect(await screen.findByRole('heading', { name: 'Today', level: 1 })).toBeInTheDocument();
});

test('Projects lists every project and Everything open unfolds them, from the rail or the keyboard', async () => {
  work('view=today');
  fireEvent.click(await within(screen.getByRole('navigation', { name: 'Projects' })).findByRole('button', { name: /Projects/ }));
  expect(await screen.findByRole('heading', { name: 'Projects', level: 1 })).toBeInTheDocument();
  expect(screen.getByText(/Fund II diligence is waiting on Priya\. Hiring has gone quiet\./)).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Paused' })).getByRole('button', { name: 'Office move' })).toBeInTheDocument();
  expect(screen.queryByText('Priya owes you the data room login')).toBeNull();
  fireEvent.keyDown(document, { key: 'e' });
  expect(await screen.findByText('Priya owes you the data room login')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Acme Analytics' })).toHaveAttribute('href', '/wiki/read/w1');
  fireEvent.click(screen.getByRole('button', { name: 'Projects', pressed: false }));
  fireEvent.keyDown(document, { key: 'j' }); fireEvent.keyDown(document, { key: 'j' }); fireEvent.keyDown(document, { key: 'Enter' });
  expect(await screen.findByRole('heading', { name: 'Hiring', level: 1 })).toBeInTheDocument();
});

test('a project page reads the same way every time: log, next with what is owed, schedule, decided and kept', async () => {
  records.push({ _id: 'ic', revision: 0, title: 'IC', project: 'f', takenOn: today, workItem: { kind: 'appointment', plannedOn: today, startTime: '10:00', priority: 0, history: [] } });
  records.push({ _id: 'memo', revision: 0, title: 'Send the IC memo', project: 'f', takenOn: '2026-01-02', workItem: { kind: 'task', plannedOn: '2026-01-02', dueOn: '2999-01-04', priority: 0, history: [] } });
  work('view=project&folder=f');
  const page = within(await screen.findByRole('region', { name: 'Fund II diligence' }));
  expect(page.getByText('2 things open, waiting on Priya, last touched today.')).toBeInTheDocument();
  expect(within(page.getByRole('region', { name: 'Log' })).getByRole('button', { name: /Call with Priya.*Churn looks fine\. Decided: we ask for the 2024 cohort\./ })).toBeInTheDocument();
  const next = within(page.getByRole('region', { name: 'Next' }));
  expect(next.getByText('Ask Priya for the churn file')).toBeInTheDocument();
  expect(next.getByText('Priya owes you the data room login')).toBeInTheDocument();
  expect(within(page.getByRole('region', { name: 'Schedule' })).getByText(/10:00 IC/)).toBeInTheDocument();
  expect(within(page.getByRole('region', { name: 'Schedule' })).getByText(/Send the IC memo/)).toHaveTextContent(/due$/);
  expect(within(page.getByRole('region', { name: 'Decided' })).getByText('We ask for the 2024 cohort.')).toBeInTheDocument();
  expect(within(page.getByRole('region', { name: 'Kept' })).getByRole('link', { name: 'Acme Analytics' })).toBeInTheDocument();
  for (const gone of ['Waiting on', 'Notes', 'Decisions', 'From the rest of Noeis']) expect(page.queryByRole('region', { name: gone })).toBeNull();
});

test('the Monday question is answered once a week and the answer reads in the log', async () => {
  work('view=project&folder=f');
  const page = within(await screen.findByRole('region', { name: 'Fund II diligence' }));
  const answer = page.getByRole('textbox', { name: 'What would move Fund II diligence this week?' });
  fireEvent.change(answer, { target: { value: 'Get the churn file.' } }); fireEvent.submit(answer.closest('form'));
  await waitFor(() => expect(folders[1].checkIns).toEqual([{ on: today, text: 'Get the churn file.' }]));
  expect(await page.findByText(/Answered/)).toBeInTheDocument();
  expect(page.queryByRole('textbox', { name: 'What would move Fund II diligence this week?' })).toBeNull();
  expect(within(page.getByRole('region', { name: 'Log' })).getByRole('button', { name: /Monday check-in.*Get the churn file\./ })).toBeInTheDocument();
});

test('a project page keeps its brief and state through back-to-back saves, and asks for a closing line when done', async () => {
  work('view=project&folder=f');
  const page = within(await screen.findByRole('region', { name: 'Fund II diligence' }));
  const brief = page.getByRole('textbox', { name: 'What Fund II diligence is' });
  fireEvent.change(brief, { target: { value: 'IC memo with a yes or no.' } }); fireEvent.blur(brief);
  fireEvent.click(page.getByRole('button', { name: 'Paused' }));
  await waitFor(() => expect(folders[1]).toMatchObject({ brief: 'IC memo with a yes or no.', pausedAt: expect.any(String) }));
  fireEvent.click(page.getByRole('button', { name: 'Done' }));
  fireEvent.change(page.getByRole('textbox', { name: 'One line on how it ended' }), { target: { value: 'We passed.' } });
  fireEvent.click(page.getByRole('button', { name: 'Mark done' }));
  await waitFor(() => expect(folders[1]).toMatchObject({ closingLine: 'We passed.', archivedAt: expect.any(String) }));
  expect(await screen.findByText('We passed.', { selector: 'blockquote' })).toBeInTheDocument();
});

test('a note in a folder joins a project from its place line, and folders stay folders', async () => {
  work('view=today&note=call');
  const place = within(await screen.findByRole('group', { name: 'Where this note lives' }));
  expect(place.getByRole('button', { name: 'Meetings' })).toBeInTheDocument();
  expect(place.getByRole('button', { name: 'Fund II diligence' })).toBeInTheDocument();
  fireEvent.click(place.getByRole('button', { name: 'Change project' }));
  fireEvent.click(place.getByRole('button', { name: 'Hiring' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/work-notes/call', expect.objectContaining({ folder: 'm', project: 'h' }), expect.anything()));
  expect(within(screen.getByRole('navigation', { name: 'Work folders' })).queryByRole('button', { name: 'Hiring' })).toBeNull();
});

test('Add to project keeps an article with a project without touching the article', async () => {
  render(<AddToProject kind="article" id="a1" title="SaaS churn benchmarks" />);
  fireEvent.click(screen.getByRole('button', { name: 'Add to project' }));
  const menu = within(await screen.findByRole('dialog', { name: 'Add to project' }));
  fireEvent.change(menu.getByRole('textbox', { name: 'Find a project' }), { target: { value: 'hir' } });
  fireEvent.keyDown(menu.getByRole('textbox', { name: 'Find a project' }), { key: 'Enter' });
  expect(await screen.findByRole('status')).toHaveTextContent('Added to Hiring.');
  expect(api.put).toHaveBeenCalledWith('/api/work-notes/folders/h', expect.objectContaining({ links: [{ kind: 'article', id: 'a1', title: 'SaaS churn benchmarks' }], expectedRevision: 0 }));
});
