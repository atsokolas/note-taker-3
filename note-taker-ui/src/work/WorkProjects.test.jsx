jest.mock('react-router-dom', () => { global.TextEncoder = require('util').TextEncoder; global.TextDecoder = require('util').TextDecoder; return jest.requireActual('react-router'); });
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkNotes from './WorkNotes';
import AddToProject from './AddToProject';
import { decisionsIn, fade, project, projects } from './workProjects';
import api from '../api';
import { forgetWorkSession } from './workSessions';
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, clearStoredTokens: jest.fn() }));

const today = new Date().toISOString().slice(0, 10);
const ago = days => new Date(Date.now() - days * 86400000).toISOString();
let records, folders;
beforeEach(() => {
  forgetWorkSession('owner'); localStorage.clear(); localStorage.setItem('token', `x.${btoa(JSON.stringify({ id: 'owner' }))}.x`); jest.clearAllMocks();
  folders = [{ _id: 'f', name: 'Fund II diligence', revision: 0, brief: '', links: [{ kind: 'wiki', id: 'w1', title: 'Acme Analytics' }] },
    { _id: 'h', name: 'Hiring', revision: 0, updatedAt: ago(40) },
    { _id: 'o', name: 'Office move', revision: 0, pausedAt: ago(3) }];
  records = [{ _id: 'call', revision: 0, title: 'Call with Priya', content: '<p>Churn looks fine.</p><p>Decided: we ask for the 2024 cohort.</p>', folder: 'f', takenOn: today, timeZone: 'UTC', occurredOn: today },
    { _id: 'ask', revision: 0, title: 'Ask Priya for the churn file', takenOn: today, workItem: { kind: 'task', noteId: 'call', priority: 0, history: [] } },
    { _id: 'owed', revision: 0, title: 'The data room login', folder: 'f', takenOn: today, workItem: { kind: 'task', list: 'waiting', waitingOn: 'Priya', sortedOn: today, priority: 0, history: [] } },
    { _id: 'bands', revision: 0, title: 'Send Sam the comp bands', folder: 'h', takenOn: '2026-01-05', updatedAt: ago(40), workItem: { kind: 'task', list: 'next', sortedOn: '2026-01-05', priority: 0, history: [] } }];
  api.get.mockImplementation(async path => path.endsWith('/folders') ? { data: folders } : { data: { entries: records.filter(x => !x.workItem), items: records.filter(x => x.workItem), folders } });
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

test('a project is read from its notes: a line follows its note in, waiting and decisions are derived', () => {
  const notes = records.filter(x => !x.workItem).map(note => ({ ...note, clientId: note._id }));
  const items = records.filter(x => x.workItem).map(item => ({ ...item, ...item.workItem, id: item._id, clientId: item._id }));
  const fund = project(folders[0], notes, items, today);
  expect(fund.next.map(line => line.title)).toEqual(['Ask Priya for the churn file']);
  expect(fund.waiting.map(line => line.waitingOn)).toEqual(['Priya']);
  expect(fund.decisions.map(decision => decision.text)).toEqual(['We ask for the 2024 cohort.']);
  expect(decisionsIn({ content: '<p>decided: keep it</p><p>We decided nothing</p>' })).toEqual(['Keep it']);
  const grouped = projects(folders, notes, items, today);
  expect([grouped.active.map(item => item.name), grouped.paused.map(item => item.name)]).toEqual([['Fund II diligence', 'Hiring'], ['Office move']]);
  expect([fade(grouped.active[0]), fade(grouped.active[1])]).toEqual([0, 3]);
});

test('Projects lists every project and Everything open unfolds them, from the rail or the keyboard', async () => {
  work('view=today');
  fireEvent.click(await within(screen.getByRole('navigation', { name: 'Work projects' })).findByRole('button', { name: 'Projects' }));
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

test('a project page keeps its brief, shows decisions and notes, and asks for a closing line when done', async () => {
  work('view=folder&folder=f');
  const page = within(await screen.findByRole('region', { name: 'Fund II diligence' }));
  expect(page.getByText('1 thing open, waiting on Priya, last touched today.')).toBeInTheDocument();
  expect(within(page.getByRole('region', { name: 'Decisions' })).getByText('We ask for the 2024 cohort.')).toBeInTheDocument();
  expect(within(page.getByRole('region', { name: 'Notes' })).getByRole('button', { name: /Call with Priya/ })).toBeInTheDocument();
  const brief = page.getByRole('textbox', { name: 'What Fund II diligence is' });
  fireEvent.change(brief, { target: { value: 'IC memo with a yes or no.' } }); fireEvent.blur(brief);
  await waitFor(() => expect(folders[0].brief).toBe('IC memo with a yes or no.'));
  fireEvent.click(page.getByRole('button', { name: 'Done' }));
  fireEvent.change(page.getByRole('textbox', { name: 'One line on how it ended' }), { target: { value: 'We passed.' } });
  fireEvent.click(page.getByRole('button', { name: 'Mark done' }));
  await waitFor(() => expect(folders[0]).toMatchObject({ closingLine: 'We passed.', archivedAt: expect.any(String) }));
  expect(await screen.findByText('We passed.', { selector: 'blockquote' })).toBeInTheDocument();
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
