jest.mock('react-router-dom', () => { global.TextEncoder = require('util').TextEncoder; global.TextDecoder = require('util').TextDecoder; return jest.requireActual('react-router'); });
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkNotes from './WorkNotes';
import api from '../api';
import { forgetWorkSession } from './workSessions';
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, clearStoredTokens: jest.fn() }));
let records, folders, openTheme;
const original = '<p>Two sites can support the pilot.</p><p>Keep these authored words.</p>';
beforeEach(() => {
  forgetWorkSession('owner'); localStorage.clear(); localStorage.setItem('token', `x.${btoa(JSON.stringify({ id: 'owner' }))}.x`); jest.clearAllMocks(); openTheme = jest.fn();
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
  render(<MemoryRouter initialEntries={['/think?context=work&date=2026-10-26&note=note' + scope]}><WorkNotes appearance={{ theme: 'light', onOpen: openTheme }} /></MemoryRouter>);
  const shelf = await screen.findByRole('complementary');
  fireEvent.click(await within(shelf).findByRole('button', { name: /Fieldwell · pilot follow-up/ }));
  return screen.findByRole('textbox', { name: 'Work note writing' });
};
test('calendar modes retain the real editor, pending prose and caret; written day and meeting date stay distinct', async () => {
  const writing = await open(); const editor = writing.editor;
  act(() => editor.view.dispatch(editor.state.tr.insertText('New '))); const caret = editor.state.selection.from;
  fireEvent.click(screen.getByRole('button', { name: 'Hide', exact: true }));
  expect(screen.getByRole('button', { name: 'Hide', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('textbox', { name: 'Work note writing' }).editor).toBe(editor); expect(editor.state.selection.from).toBe(caret); expect(writing).toHaveTextContent('New Two sites');
  fireEvent.click(screen.getByRole('button', { name: 'Week', exact: true })); expect(editor.state.selection.from).toBe(caret);
  expect(document.querySelector('.work-dated')).toHaveTextContent('Written Monday 26 Oct'); expect(screen.getByLabelText('Occurred on')).toHaveValue('2026-10-23');
  fireEvent.click(screen.getByRole('button', { name: /Change theme/ })); expect(openTheme).toHaveBeenCalledTimes(1);
});
test('completing a follow-up produces one dated top record and Undo restores the same item without changing prose', async () => {
  await open(); const section = screen.getByRole('region', { name: 'Follow-ups & open questions' });
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
test('planning a new note question is explicit and retains its note identity in the day', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Add a follow-up or question' }));
  const dialog = await screen.findByRole('dialog', { name: 'New Work item' }); fireEvent.change(within(dialog).getByLabelText('Item'), { target: { value: 'Which site is ready first?' } });
  fireEvent.change(within(dialog).getByLabelText('Kind'), { target: { value: 'question' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'Save item' }));
  await waitFor(() => expect(records.some(x => x.title === 'Which site is ready first?')).toBe(true));
  const saved = records.find(x => x.title === 'Which site is ready first?'); expect(saved.workItem.noteId).toBe('note'); expect(saved.workItem.plannedOn || null).toBe(null);
});
test('filing linked items reports a partial failure honestly and Undo restores each previous folder', async () => {
  await open(); const put = api.put.getMockImplementation();
  api.put.mockImplementation(async (path, body) => { if (path.endsWith('/task') && body.folder === 'g') throw Error('offline'); return put(path, body); });
  fireEvent.change(screen.getByLabelText('Notebook'), { target: { value: 'g' } });
  const dialog = await screen.findByRole('dialog', { name: 'Move note' }); fireEvent.click(within(dialog).getByRole('checkbox'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Move note', exact: true }));
  await waitFor(() => expect(screen.getByText(/Some filing changes need sync or review/)).toBeInTheDocument());
  expect(screen.queryByText('Note filed. Dates and writing kept.')).toBeNull(); expect(records.find(x => x._id === 'note').content).toBe(original);
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  await waitFor(() => expect(records.find(x => x._id === 'note').folder).toBe('f'));
  expect(records.find(x => x._id === 'task').folder).toBe('f');
});
test('date-arrow navigation is confined to the calendar and commands open an explicit day picker', async () => {
  await open(); const monday = screen.getByRole('button', { name: 'Monday 26 Oct', exact: true });
  fireEvent.keyDown(monday, { key: 'ArrowRight' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tuesday 27 Oct', exact: true })).toHaveAttribute('aria-pressed', 'true'));
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  fireEvent.click(await screen.findByRole('button', { name: 'Go to day', exact: true }));
  const picker = await screen.findByRole('dialog', { name: 'Go to day', exact: true });
  fireEvent.change(within(picker).getByLabelText('Day'), { target: { value: '2026-10-23' } });
  fireEvent.click(within(picker).getByRole('button', { name: 'Open day', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Friday 23 Oct', exact: true })).toHaveAttribute('aria-pressed', 'true'));
  expect(records.find(x => x._id === 'note').content).toBe(original);
});
