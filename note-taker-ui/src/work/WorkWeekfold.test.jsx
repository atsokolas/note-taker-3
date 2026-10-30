jest.mock('react-router-dom', () => { global.TextEncoder = require('util').TextEncoder; global.TextDecoder = require('util').TextDecoder; return jest.requireActual('react-router'); });
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkNotes from './WorkNotes';
import api from '../api';
import { forgetWorkSession } from './workSessions';
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, clearStoredTokens: jest.fn() }));
let records, folders;
const original = '<p>Two sites can support the pilot.</p><p>Keep these authored words.</p>';
beforeEach(() => {
  forgetWorkSession('owner'); localStorage.clear(); localStorage.setItem('token', `x.${btoa(JSON.stringify({ id: 'owner' }))}.x`); jest.clearAllMocks();
  folders = [{ _id: 'f', name: 'Customer discovery', revision: 0 }, { _id: 'g', name: 'Launch planning', revision: 0 }];
  records = [{ _id: 'note', revision: 0, title: 'Fieldwell · pilot follow-up', content: original, folder: 'f', takenOn: '2026-10-26', timeZone: 'UTC', occurredOn: '2026-10-23', withText: 'Mira Chen' }, { _id: 'task', revision: 0, title: 'Confirm service-training dates', folder: 'f', workItem: { kind: 'task', noteId: 'note', plannedOn: '2026-10-26', priority: 1, history: [] } }];
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
const open = async (scope = '') => {
  render(<MemoryRouter initialEntries={['/think?context=work&date=2026-10-26&note=note' + scope]}><WorkNotes /></MemoryRouter>);
  const shelf = await screen.findByRole('complementary');
  fireEvent.click(await within(shelf).findByRole('button', { name: /Fieldwell · pilot follow-up/ }));
  return screen.findByRole('textbox', { name: 'Work note writing' });
};
const today = () => render(<MemoryRouter initialEntries={['/work?date=2026-10-26']}><WorkNotes /></MemoryRouter>);
test('an open note keeps the week line with its written day marked, and its meeting date stays distinct', async () => {
  await open();
  expect(screen.getByRole('button', { name: 'Monday 26 Oct', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('group', { name: 'Where this note lives' })).toHaveTextContent('In Customer discovery, written Monday 26 Oct, with Mira Chen.'); expect(screen.getByLabelText('Occurred on')).toHaveValue('2026-10-23');
  fireEvent.click(screen.getByRole('button', { name: 'Tuesday 27 Oct', exact: true }));
  expect(await screen.findByRole('heading', { name: 'Tuesday 27 October' })).toBeInTheDocument(); expect(screen.queryByRole('textbox', { name: 'Work note writing' })).toBeNull();
});
test('a note written in another week brings its own week onto the line', async () => {
  render(<MemoryRouter initialEntries={['/work?date=2026-11-09']}><WorkNotes /></MemoryRouter>);
  const shelf = within(await screen.findByRole('complementary')); fireEvent.click(await shelf.findByRole('button', { name: 'Customer discovery' }));
  fireEvent.click(await shelf.findByRole('button', { name: /Fieldwell · pilot follow-up/ }));
  expect(await screen.findByRole('button', { name: 'Monday 26 Oct', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('dragging a note onto a place in the rail shows it arriving there, and the drop files it like the place line', async () => {
  today(); const written = within(await screen.findByRole('region', { name: 'Written Monday' })).getByRole('button', { name: /Fieldwell/ });
  const dataTransfer = { setData: jest.fn(), getData: () => '', setDragImage: jest.fn() };
  fireEvent.dragStart(written, { dataTransfer });
  const place = within(screen.getByRole('complementary')).getByRole('button', { name: 'Launch planning' }).parentElement;
  fireEvent.dragOver(place, { dataTransfer });
  expect(place.parentElement).toHaveTextContent('Launch planningFieldwell · pilot follow-up');
  fireEvent.drop(place, { dataTransfer });
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Move note' })).getByRole('button', { name: 'Move note' }));
  expect(await screen.findByText('Filed in Launch planning.')).toBeInTheDocument();
  await waitFor(() => expect(records.find(x => x._id === 'note').folder).toBe('g')); expect(records.find(x => x._id === 'task').folder).toBe('f');
});
test('completing a follow-up produces one dated top record and Undo restores the same item without changing prose', async () => {
  await open(); const section = screen.getByRole('region', { name: 'Open' });
  fireEvent.click(within(section).getByRole('checkbox', { name: 'Confirm service-training dates' }));
  const completed = await screen.findByRole('region', { name: 'Completed follow-ups' }); expect(completed).toHaveTextContent('Confirm service-training dates');
  await waitFor(() => expect(records.find(x => x._id === 'task').workItem.history).toHaveLength(1));
  expect(records.find(x => x._id === 'note').content).toBe(original);
  fireEvent.click(within(completed).getByRole('button', { name: 'Undo', exact: true }));
  await waitFor(() => expect(records.find(x => x._id === 'task').workItem.history).toHaveLength(2));
  expect(within(section).getByRole('checkbox', { name: 'Confirm service-training dates' })).not.toBeChecked(); expect(records.filter(x => x._id === 'task')).toHaveLength(1);
});
test('new note inherits folder scope; creating an empty folder never moves the open note', async () => {
  await open('&view=folder&folder=f'); fireEvent.click(screen.getByRole('button', { name: 'New note', exact: true }));
  const writing = screen.getByRole('textbox', { name: 'Work note writing' }); act(() => writing.editor.commands.insertContent('Scoped writing'));
  fireEvent.click(screen.getByRole('button', { name: 'Sync now', exact: true }));
  await waitFor(() => expect(records.find(x => x.content?.includes('Scoped writing'))?.folder).toBe('f'));
  fireEvent.click(screen.getByRole('button', { name: 'New folder', exact: true })); const dialog = await screen.findByRole('dialog', { name: 'New folder' });
  fireEvent.change(within(dialog).getByLabelText('Folder name'), { target: { value: 'Supplier conversations' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Create folder' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(await screen.findByRole('heading', { name: 'Supplier conversations' })).toBeInTheDocument(); expect(screen.queryByRole('textbox', { name: 'Work note writing' })).toBeNull(); expect(records.find(x => x.content?.includes('Scoped writing')).folder).toBe('f');
});
test('a new folder from the place line is where the open note goes', async () => {
  await open('&view=folder&folder=f'); fireEvent.click(screen.getByRole('button', { name: 'New note', exact: true }));
  const writing = screen.getByRole('textbox', { name: 'Work note writing' }); act(() => writing.editor.commands.insertContent('Placed writing'));
  fireEvent.click(screen.getByRole('button', { name: 'Sync now', exact: true }));
  await waitFor(() => expect(records.find(x => x.content?.includes('Placed writing'))?.folder).toBe('f'));
  const place = screen.getByRole('group', { name: 'Where this note lives' }); fireEvent.click(within(place).getAllByRole('button')[0]);
  fireEvent.click(within(place).getByRole('button', { name: 'a new folder' })); const dialog = await screen.findByRole('dialog', { name: 'New folder' });
  fireEvent.change(within(dialog).getByLabelText('Folder name'), { target: { value: 'Supplier conversations' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Create folder' }));
  expect(await screen.findByText('Filed in Supplier conversations.')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Where this note lives' })).toHaveTextContent(/^In Supplier conversations, written/);
  expect(records.find(x => x.content?.includes('Placed writing')).folder).not.toBe('f');
});
test('planning a new note question is explicit and retains its note identity in the day', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Add a follow-up' }));
  const dialog = await screen.findByRole('dialog', { name: 'New Work item' }); fireEvent.change(within(dialog).getByLabelText('Item'), { target: { value: 'Which site is ready first?' } });
  fireEvent.change(within(dialog).getByLabelText('Kind'), { target: { value: 'question' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Save item' }));
  await waitFor(() => expect(records.some(x => x.title === 'Which site is ready first?')).toBe(true));
  const saved = records.find(x => x.title === 'Which site is ready first?'); expect(saved.workItem.noteId).toBe('note'); expect(saved.workItem.plannedOn || null).toBe(null);
});
test('filing linked items reports a partial failure honestly and Undo restores each previous folder', async () => {
  await open(); const put = api.put.getMockImplementation();
  api.put.mockImplementation(async (path, body) => { if (path.endsWith('/task') && body.folder === 'g') throw Error('offline'); return put(path, body); });
  const place = screen.getByRole('group', { name: 'Where this note lives' });
  fireEvent.click(within(place).getByRole('button', { name: 'Customer discovery' })); fireEvent.click(within(place).getByRole('button', { name: 'Launch planning' }));
  const dialog = await screen.findByRole('dialog', { name: 'Move note' }); fireEvent.click(within(dialog).getByRole('checkbox'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Move note', exact: true }));
  await waitFor(() => expect(screen.getByText(/Some filing changes need sync or review/)).toBeInTheDocument());
  expect(screen.queryByText('Filed in Launch planning.')).toBeNull(); expect(records.find(x => x._id === 'note').content).toBe(original);
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  await waitFor(() => expect(records.find(x => x._id === 'note').folder).toBe('f'));
  expect(records.find(x => x._id === 'task').folder).toBe('f');
});
test('arrow keys move between days in the week', async () => {
  today(); const monday = await screen.findByRole('button', { name: 'Monday 26 Oct', exact: true });
  fireEvent.keyDown(monday, { key: 'ArrowRight' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tuesday 27 Oct', exact: true })).toHaveAttribute('aria-pressed', 'true'));
});
test.each(['task', 'appointment'])('standalone %s conflicts open both versions rather than a save dead end', async kind => {
  records.push({ _id: 'standalone', revision: 0, title: 'Standalone work', content: '', workItem: { kind, plannedOn: '2026-10-26', startTime: '15:00', endTime: '15:30', history: [] } });
  today(); fireEvent.click(await screen.findByRole('button', { name: 'Week', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: kind === 'appointment' ? 'Edit appointment Standalone work' : 'Edit Standalone work', exact: true }));
  const form = await screen.findByRole('dialog', { name: kind === 'appointment' ? 'Edit appointment' : 'Edit follow-up' });
  api.put.mockRejectedValueOnce({ response: { status: 409, data: { current: { ...records.find(x => x._id === 'standalone'), revision: 1, title: 'Other device version' } } } });
  fireEvent.change(within(form).getByLabelText('Item'), { target: { value: 'My version' } }); fireEvent.click(within(form).getByRole('button', { name: 'Save item' }));
  const review = await screen.findByRole('dialog', { name: 'Review both item versions' }); expect(review).toHaveTextContent('Other device version'); expect(review).toHaveTextContent('My version');
  fireEvent.click(within(review).getByRole('button', { name: 'Use saved version' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
test('concurrent day margins remain discoverable, and a conflicting margin offers both versions', async () => {
  records.push(...['First margin', 'Second margin'].map((content, index) => ({ _id: 'margin-' + index, revision: 0, title: '', content, workItem: { kind: 'jot', plannedOn: '2026-10-26', history: [] } })));
  today(); fireEvent.click(await screen.findByText('Day margin', { selector: 'summary' }));
  const margin = document.querySelector('.work-day-margin');
  expect(within(margin).getByLabelText('Notes for this day')).toHaveValue('First margin');
  fireEvent.click(within(margin).getByRole('button', { name: 'Margin 2', exact: true })); expect(within(margin).getByLabelText('Notes for this day')).toHaveValue('Second margin');
  api.put.mockRejectedValueOnce({ response: { status: 409, data: { current: { ...records.find(x => x._id === 'margin-1'), revision: 1, content: 'Remote margin version' } } } });
  fireEvent.change(within(margin).getByLabelText('Notes for this day'), { target: { value: 'Local margin version' } }); fireEvent.click(within(margin).getByRole('button', { name: 'Sync margin', exact: true }));
  fireEvent.click(await within(margin).findByRole('button', { name: 'Review both versions' }));
  const review = await screen.findByRole('dialog', { name: 'Review both item versions' }); expect(review).toHaveTextContent('Remote margin version'); expect(review).toHaveTextContent('Local margin version');
});
test('a semantically rejected action stays in review and can use the saved version', async () => {
  await open(); const section = screen.getByRole('region', { name: 'Open' });
  fireEvent.click(within(section).getByRole('checkbox', { name: 'Confirm service-training dates' }));
  const complete = await screen.findByRole('region', { name: 'Completed follow-ups' });
  await waitFor(() => expect(records.find(x => x._id === 'task').revision).toBe(1));
  const remote = { ...records.find(x => x._id === 'task'), revision: 2 };
  api.put.mockRejectedValue({ response: { status: 409, data: { error: 'This item changed. Review its latest history before undoing.', current: remote } } });
  fireEvent.click(within(complete).getByRole('button', { name: 'Undo', exact: true }));
  fireEvent.click(await within(section).findByRole('button', { name: 'Review both versions' }));
  const review = await screen.findByRole('dialog', { name: 'Review both item versions' });
  fireEvent.click(within(review).getByRole('button', { name: 'Apply my changes after review' }));
  await waitFor(() => expect(within(review).getByRole('alert')).toHaveTextContent('Review its latest history'));
  fireEvent.click(within(review).getByRole('button', { name: 'Use saved version' })); expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: 'Completed follow-ups' })).toHaveTextContent('Confirm service-training dates');
});
test('review resolution stays locked while its accepted change is being acknowledged', async () => {
  await open(); const current = records.find(x => x._id === 'task'), remote = { ...current, revision: 1, title: 'Other device wording' };
  fireEvent.click(within(screen.getByRole('region', { name: 'Open' })).getByRole('button', { name: 'Edit Confirm service-training dates', exact: true }));
  const form = await screen.findByRole('dialog', { name: 'Edit follow-up' });
  fireEvent.change(within(form).getByLabelText('Item'), { target: { value: 'My reviewed wording' } });
  api.put.mockRejectedValueOnce({ response: { status: 409, data: { current: remote } } });
  fireEvent.click(within(form).getByRole('button', { name: 'Save item', exact: true }));
  const review = await screen.findByRole('dialog', { name: 'Review both item versions' });
  let acknowledge; api.put.mockImplementationOnce((_, body) => new Promise(resolve => { acknowledge = () => { const data = { ...current, revision: 2, workItem: { ...current.workItem, history: (body.workActions || []).map(action => ({ ...action, recordedAt: new Date().toISOString() })) } }; records[records.findIndex(x => x._id === 'task')] = data; resolve({ data }); }; }));
  fireEvent.click(within(review).getByRole('button', { name: 'Apply my changes after review' }));
  expect(within(review).getByRole('button', { name: 'Use saved version' })).toBeDisabled();
  expect(within(review).getByRole('button', { name: 'Keep both for now' })).toBeDisabled();
  fireEvent.keyDown(document, { key: 'Escape' }); expect(review).toBeInTheDocument();
  await waitFor(() => expect(acknowledge).toEqual(expect.any(Function)));
  await act(async () => acknowledge());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
test('a previous API version pauses Work and Retry opens the same note once its matching server arrives', async () => {
  api.get.mockResolvedValueOnce({ data: { entries: records.filter(x => !x.workItem), folders } });
  render(<MemoryRouter initialEntries={['/think?context=work&note=note']}><WorkNotes /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Work is updating', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Work note writing' })).toBeNull(); expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry Work', exact: true }));
  expect(await screen.findByRole('textbox', { name: 'Work note writing' })).toHaveTextContent('Keep these authored words.');
  expect(records.find(x => x._id === 'note').content).toBe(original);
});
test('authentication recovery remains available if the matching server arrives after the token expires', async () => {
  api.get.mockResolvedValueOnce({ data: { entries: [], folders: [] } });
  render(<MemoryRouter initialEntries={['/think?context=work']}><WorkNotes /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Work is updating', exact: true });
  api.get.mockRejectedValueOnce({ response: { status: 401, data: { error: 'Token expired' } } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry Work', exact: true }));
  const signIn = await screen.findByRole('button', { name: 'Sign in to sync', exact: true });
  expect(screen.getByRole('button', { name: 'Retry Work', exact: true })).toBeDisabled();
  fireEvent.click(signIn); expect(await screen.findByRole('textbox', { name: /username/i })).toBeVisible();
});
test('a day reads as one page: its follow-ups, what it was written, and earlier open work that can move to it', async () => {
  render(<MemoryRouter initialEntries={['/work?date=2026-10-26']}><WorkNotes /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Monday 26 October' })).toBeInTheDocument();
  const page = () => document.querySelector('.work-day-page');
  expect(await within(page()).findByRole('checkbox', { name: 'Confirm service-training dates' })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Written Monday' })).getByRole('button', { name: /Fieldwell · pilot follow-up.*Customer discovery/ })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'depot' } }); expect(screen.queryByRole('region', { name: 'Written Monday' })).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
  expect(screen.queryByRole('region', { name: 'Carried from earlier' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tuesday 27 Oct', exact: true }));
  const carried = await screen.findByRole('region', { name: 'Carried from earlier' });
  expect(within(carried).getByRole('button', { name: 'Fieldwell · pilot follow-up' })).toBeInTheDocument();
  fireEvent.click(within(carried).getByRole('button', { name: 'Move to Tuesday' }));
  await waitFor(() => expect(records.find(x => x._id === 'task').workItem.history.at(-1)).toMatchObject({ type: 'plan', plannedOn: '2026-10-27' }));
  expect(screen.queryByRole('region', { name: 'Carried from earlier' })).toBeNull();
  expect(await within(page()).findByRole('checkbox', { name: 'Confirm service-training dates From Mon 26' })).toBeInTheDocument();
});
test('one typed line plans an appointment, and a [] line in a note becomes its follow-up', async () => {
  today();
  fireEvent.change(await screen.findByLabelText('Plan something'), { target: { value: 'IC meeting 2pm' } });
  fireEvent.submit(screen.getByLabelText('Plan something').form);
  await waitFor(() => expect(records.find(x => x.title === 'IC meeting')?.workItem).toMatchObject({ kind: 'appointment', plannedOn: '2026-10-26', startTime: '14:00', endTime: '14:30' }));
  const rail = screen.getByRole('complementary'); fireEvent.click(within(rail).getByRole('button', { name: 'Customer discovery' })); fireEvent.click(within(rail).getByRole('button', { name: /Fieldwell · pilot follow-up/ }));
  const writing = await screen.findByRole('textbox', { name: 'Work note writing' });
  act(() => { writing.editor.commands.focus('end'); writing.editor.commands.splitBlock(); writing.editor.commands.insertContent('[] Call Mira about training'); });
  fireEvent.keyDown(writing.editor.view.dom, { key: 'Enter' });
  expect(within(screen.getByRole('region', { name: 'Open' })).getByText('Call Mira about training')).toBeInTheDocument();
  await waitFor(() => expect(records.find(x => x.title === 'Call Mira about training')?.workItem).toMatchObject({ kind: 'task', noteId: 'note' }));
  expect(writing).not.toHaveTextContent('Call Mira');
});
test('a meeting starts its note, continuing last time’s note of the same name, dated the meeting’s day, with what is still open', async () => {
  records.push({ _id: 'meeting', revision: 0, title: 'Fieldwell · pilot follow-up', folder: 'f', withText: 'Mira Chen', workItem: { kind: 'appointment', plannedOn: '2026-10-29', startTime: '10:00', endTime: '10:30', history: [] } });
  api.post.mockImplementationOnce(async (path, body) => { const record = { _id: 'next', revision: 0, title: '', content: '', folder: 'f', occurredOn: body.occurredOn, continuesFromEntryId: 'note', continuationBridge: { entryId: 'note', title: 'Fieldwell · pilot follow-up', text: 'Ask about the second site' } }; records.push(record); return { data: record }; });
  render(<MemoryRouter initialEntries={['/work?date=2026-10-29']}><WorkNotes /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /10:00 Fieldwell · pilot follow-up · Start the note/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/work-notes/note/continue', expect.objectContaining({ expectedRevision: 0 }), expect.anything()));
  expect(await screen.findByLabelText('Note title')).toHaveValue('Fieldwell · pilot follow-up');
  expect(screen.getByText('Ask about the second site')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Open' })).getByText('Confirm service-training dates')).toBeInTheDocument();
  await waitFor(() => expect(records.find(x => x._id === 'meeting').workItem.noteId).toBe('next'));
  await waitFor(() => expect(records.find(x => x._id === 'next').occurredOn).toBe('2026-10-29'));
});
