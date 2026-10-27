jest.mock('react-router-dom', () => { global.TextEncoder = require('util').TextEncoder; global.TextDecoder = require('util').TextDecoder; return jest.requireActual('react-router'); });
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TextSelection } from '@tiptap/pm/state';
import WorkNotes from './WorkNotes';
import api from '../api';
import { forgetWorkSession } from './workSessions';

jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, clearStoredTokens: jest.fn(() => global.localStorage.removeItem('token')) }));
const token = (id, suffix = 'old') => `x.${btoa(JSON.stringify({ id }))}.${suffix}`;
const original = { _id: 'note', title: 'Field notes', content: '<p>Cached <strong>words</strong></p>', blocks: [], folder: null, occurredOn: '2026-10-26', withText: '', revision: 2 };
const remote = { ...original, content: '<p>Other device <strong>words</strong> <a href="https://tasks.example.test/42">task</a></p>', revision: 3 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let server;
beforeEach(() => {
  forgetWorkSession('owner'); forgetWorkSession('other'); localStorage.clear(); jest.clearAllMocks();
  localStorage.setItem('token', token('owner')); server = { ...original };
  api.get.mockImplementation(async () => ({ data: { entries: [server], items: [], folders: [] } }));
  api.post.mockResolvedValue({ data: { token: token('owner', 'renewed') } });
  api.put.mockImplementation(async (_, body) => {
    if (body.expectedRevision !== server.revision) throw { response: { status: 409, data: { current: server } } };
    server = { ...server, ...body, revision: server.revision + 1 }; return { data: server };
  });
});
const open = async () => {
  render(<MemoryRouter initialEntries={['/think?context=work&date=2026-10-26']}><WorkNotes /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Field notes/ }));
  return screen.getByRole('textbox', { name: 'Work note writing' });
};
const reauthenticate = async () => {
  const refresh = deferred(); api.get.mockReturnValueOnce(refresh.promise);
  localStorage.setItem('token', token('other')); fireEvent(window, new StorageEvent('storage', { key: 'token' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to the original account' }));
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'fictional-owner' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fictional-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  await screen.findByRole('textbox', { name: 'Work note writing' });
  return refresh;
};
const typeAt = (writing, position, text) => act(() => {
  const view = writing.editor.view;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)).insertText(text));
});
test('reauth refresh makes the accepted remote document visible before the next write uses its revision', async () => {
  await open(); const refresh = await reauthenticate();
  const writing = screen.getByRole('textbox', { name: 'Work note writing' });
  expect(writing).toHaveTextContent('Cached words');
  server = { ...remote }; await act(async () => refresh.resolve({ data: { entries: [server], items: [], folders: [] } }));
  const visibleBeforeTyping = writing.innerHTML;
  expect(api.put).not.toHaveBeenCalled();
  typeAt(writing, 1, 'Next '); fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  await screen.findByText('Saved');
  expect(server.content).toContain('Next Other device'); expect(server.content).not.toContain('Cached');
  expect(visibleBeforeTyping).toContain('Other device'); expect(visibleBeforeTyping).toContain('<strong>words</strong>');
  expect(visibleBeforeTyping).toContain('href="https://tasks.example.test/42"');
  expect(api.put.mock.calls[0][1].expectedRevision).toBe(3);
  expect(api.put.mock.calls[0][2].headers.Authorization).toBe(`Bearer ${token('owner', 'renewed')}`);
});
test('typing before deferred refresh retains its old base and conflicts instead of overwriting remote prose', async () => {
  await open(); const refresh = await reauthenticate();
  const writing = screen.getByRole('textbox', { name: 'Work note writing' });
  typeAt(writing, 1, 'Local '); const selection = writing.editor.state.selection.from;
  server = { ...remote }; await act(async () => refresh.resolve({ data: { entries: [server], items: [], folders: [] } }));
  expect(writing).toHaveTextContent('Local Cached words'); expect(writing.editor.state.selection.from).toBe(selection);
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  await screen.findByText('Both versions are kept. Your version remains in the editor.');
  expect(screen.getByRole('textbox', { name: 'Work note writing' })).toHaveTextContent('Local Cached words');
  expect(server.content).toBe(remote.content); expect(api.put.mock.calls[0][1].expectedRevision).toBe(2);
});
test('metadata acknowledgement preserves the editor instance, rich text and caret', async () => {
  const writing = await open(); typeAt(writing, 3, 'X');
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' })); await screen.findByText('Saved');
  const editor = writing.editor; const selection = editor.state.selection.from; const document = editor.getJSON();
  fireEvent.change(screen.getByLabelText('With'), { target: { value: 'Mira' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' })); await waitFor(() => expect(server.withText).toBe('Mira'));
  expect(writing.editor).toBe(editor); expect(editor.state.selection.from).toBe(selection); expect(editor.getJSON()).toEqual(document);
});
test('typing during an in-flight save keeps the newest prose, formatting and caret through both receipts', async () => {
  const writing = await open(); const firstSave = deferred();
  api.put.mockImplementationOnce(async (_, body) => { await firstSave.promise; server = { ...server, ...body, revision: 3 }; return { data: server }; });
  typeAt(writing, 3, 'X'); fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  typeAt(writing, 4, 'Y'); const editor = writing.editor; const selection = editor.state.selection.from;
  await act(async () => firstSave.resolve()); await screen.findByText('Saved');
  expect(writing).toHaveTextContent('CaXYched words'); expect(writing.querySelector('strong')).toHaveTextContent('words');
  expect(writing.editor).toBe(editor); expect(editor.state.selection.from).toBe(selection); expect(server.content).toContain('CaXYched');
  expect(api.put.mock.calls[1][1].expectedRevision).toBe(3);
});

test.each(['none', 'insert', 'delete', 'mark', 'split'])('Undo/Redo after remote acceptance cannot revive cached prose (prior acknowledged edit: %s)', async prior => {
  await open(); const refresh = await reauthenticate();
  const writing = screen.getByRole('textbox', { name: 'Work note writing' });
  const editor = writing.editor;
  if (prior !== 'none') {
    act(() => {
      const view = editor.view;
      if (prior === 'insert') view.dispatch(view.state.tr.insertText('Earlier '));
      if (prior === 'delete') view.dispatch(view.state.tr.delete(1, 4));
      if (prior === 'mark') view.dispatch(view.state.tr.addMark(1, 7, editor.schema.marks.italic.create()));
      if (prior === 'split') editor.chain().setTextSelection(4).splitBlock().run();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' })); await screen.findByText('Saved');
  }
  const acceptedRevision = server.revision + 1;
  server = { ...remote, revision: acceptedRevision };
  await act(async () => refresh.resolve({ data: { entries: [server], items: [], folders: [] } }));
  expect(writing.editor).toBe(editor); expect(writing).toHaveTextContent('Other device words task');
  typeAt(writing, 1, 'Next ');
  act(() => editor.commands.undo());
  // Follow Undo through the real session save, not only the editor's document.
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' })); await screen.findByText('Saved');
  expect(server.content).toContain('Other device'); expect(server.content).not.toContain('Cached'); expect(server.content).not.toContain('Next');
  expect(api.put.mock.calls.at(-1)[1].expectedRevision).toBe(acceptedRevision);
  act(() => editor.commands.redo()); expect(writing).toHaveTextContent('Next Other device words task');
  act(() => editor.commands.undo()); expect(writing).toHaveTextContent('Other device words task');
  // Mapped older history may contain an empty event, but it must never restore a stale document.
  act(() => editor.commands.undo()); expect(writing).toHaveTextContent('Other device words task');
  expect(writing.querySelector('a')).toHaveAttribute('href', 'https://tasks.example.test/42');
  expect(writing.querySelector('strong')).toHaveTextContent('words');
});
