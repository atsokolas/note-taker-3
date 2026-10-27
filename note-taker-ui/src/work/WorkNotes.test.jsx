import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WorkNotes from './WorkNotes';
import api from '../api';
import { forgetWorkSession } from './workSessions';
import { draftKey } from './workSession';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return { useNavigate: () => jest.fn(), useSearchParams: () => {
    const [search, setSearch] = React.useState(() => global.window.location.search);
    const set = React.useCallback(next => setSearch(new URLSearchParams(next).toString()), []);
    React.useEffect(() => { const moved = () => setSearch(global.window.location.search); global.window.addEventListener('popstate', moved); return () => global.window.removeEventListener('popstate', moved); }, []);
    return [new URLSearchParams(search), set];
  } };
});
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, clearStoredTokens: jest.fn(() => global.localStorage.removeItem('token')) }));
jest.mock('./WorkNoteEditor', () => ({ note, onChange, fresh }) => <textarea aria-label="Work note writing" autoFocus={fresh} value={note.content || ''} onChange={e => onChange({ content: e.target.value })} />);
const deviceWords = () => JSON.stringify(Object.entries(localStorage).filter(([key]) => key.startsWith(draftKey('owner'))));
const source = { _id: 'a', title: 'Charging windows', content: 'Original account', folder: 'f', revision: 2, occurredOn: '2026-10-26', withText: 'Mira', workingState: { revision: 2, nextTimeLine: { text: '  Check the window.\n', target: null } } };
const older = { ...source, _id: 'b', title: 'Smaller depot', occurredOn: '2026-10-12', workingState: { revision: 1, nextTimeLine: { text: '' } } };
const open = async () => { render(<WorkNotes />); await within(screen.getByRole('complementary')).findByRole('button', { name: /Charging windows/ }); fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /Charging windows/ })); };
beforeEach(() => {
  forgetWorkSession('owner'); forgetWorkSession('other'); jest.clearAllMocks(); window.history.replaceState({}, '', '/think?context=work&date=2026-10-26'); localStorage.clear(); localStorage.setItem('token', `x.${btoa(JSON.stringify({ id: 'owner' }))}.x`);
  api.get.mockResolvedValue({ data: { entries: [source, older], items: [], folders: [{ _id: 'f', name: 'Pilot' }] } });
  api.put.mockImplementation(async (_, body) => ({ data: { ...source, ...body, revision: body.expectedRevision + 1 } }));
  api.post.mockImplementation(async (path, body) => ({ data: path.endsWith('/continue') ? { _id: 'c', title: '', content: '', folder: 'f', occurredOn: '2026-11-02', revision: 0, continuesFromEntryId: 'a', continuationBridge: { entryId: 'a', title: source.title, occurredOn: source.occurredOn, text: source.workingState.nextTimeLine.text } } : { _id: 'new', ...body, revision: 0 } }));
});
test('opens Work without personal rooms; search and inbox are scoped', async () => {
  await open(); expect(screen.queryByText('Partner')).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'smaller' } });
  expect(within(screen.getByRole('complementary')).queryByRole('button', { name: /Charging windows/ })).toBeNull(); expect(screen.getByRole('button', { name: /Smaller depot/ })).toBeInTheDocument();
  expect(api.get.mock.calls.every(([path]) => path.startsWith('/api/work-notes'))).toBe(true);
});
test('new note is untitled and untouched capture closes without creating anything', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: 'New note' }));
  expect(screen.getByRole('textbox', { name: 'Work note writing' })).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' }); expect(api.post).not.toHaveBeenCalled();
});
test('source confirmation names exact title, date, with text and line; Escape cancels', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: /Continue this note/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Continue from this note' });
  expect(within(sheet).getByText('Charging windows')).toBeInTheDocument(); expect(within(sheet).getByText(/Monday 26 Oct/)).toHaveTextContent('Mira');
  expect(sheet.querySelector('blockquote').textContent).toBe(source.workingState.nextTimeLine.text);
  fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(api.post).not.toHaveBeenCalled();
});
test('choose another replaces the sheet; no note exists before explicit confirmation', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: /Continue this note/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Choose another note' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Smaller depot/ }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1); expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Continue →' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/work-notes/b/continue', expect.objectContaining({ expectedRevision: 2 }), expect.anything()));
});
test('confirm creates one fresh page with immutable line outside editable prose and original intact', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: /Continue this note/ }));
  const confirm = await screen.findByRole('button', { name: 'Continue →' }); fireEvent.click(confirm); fireEvent.click(confirm);
  await screen.findByText('Last time’s line'); expect(api.post).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox', { name: 'Work note writing' })).toHaveValue('');
  expect(screen.getByText('Check the window.')).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /Charging windows.*26 Oct/ }));
  expect(screen.getByRole('textbox', { name: 'Work note writing' })).toHaveValue('Original account');
});
test('changed source asks for re-review and a new explicit confirmation', async () => {
  api.post.mockRejectedValueOnce({ response: { status: 409, data: { current: { ...source, revision: 3, workingState: { revision: 3, nextTimeLine: { text: 'Changed line' } } } } } });
  await open(); fireEvent.click(screen.getByRole('button', { name: /Continue this note/ })); fireEvent.click(await screen.findByRole('button', { name: 'Continue →' }));
  expect(await screen.findByText(/source changed/i)).toBeInTheDocument(); expect(within(screen.getByRole('dialog')).getByText('Changed line')).toBeInTheDocument(); expect(api.post).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Continue →' })); await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[1][1].expectedRevision).toBe(3); expect(api.post.mock.calls[1][1].operationId).not.toBe(api.post.mock.calls[0][1].operationId);
});
test('filing changes only metadata and leaves occurrence date intact', async () => {
  await open(); fireEvent.change(screen.getByLabelText('Notebook'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  await waitFor(() => expect(api.put).toHaveBeenCalled()); expect(api.put.mock.calls[0][1]).toMatchObject({ folder: null, occurredOn: '2026-10-26', content: 'Original account' });
});
test('storage failure keeps page open with copy and recovery choices', async () => {
  await open(); const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Unsaved' } });
  fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Today' }));
  expect(screen.getByRole('dialog', { name: 'Keep your writing' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download recovery' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Stay' })); set.mockRestore();
});

test('development StrictMode remount still loads and edits Work notes', async () => {
  render(<React.StrictMode><WorkNotes /></React.StrictMode>);
  fireEvent.click(await screen.findByRole('button', { name: /Charging windows/ }));
  expect(screen.getByRole('textbox', { name: 'Work note writing' })).toHaveValue('Original account');
});
test('cancelling changed-source review does not rebase an unseen body onto a newer revision', async () => {
  api.post.mockRejectedValueOnce({ response: { status: 409, data: { current: { ...source, revision: 3, content: 'Other device body', workingState: { revision: 3, nextTimeLine: { text: 'New return line' } } } } } });
  await open(); fireEvent.click(screen.getByRole('button', { name: /Continue this note/ })); fireEvent.click(await screen.findByRole('button', { name: 'Continue →' }));
  await screen.findByText(/source changed/i); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('textbox', { name: 'Work note writing' })).toHaveValue('Original account');
  fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Still my version' } }); fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  await waitFor(() => expect(api.put).toHaveBeenCalled()); expect(api.put.mock.calls[0][1].expectedRevision).toBe(2);
});
test('conflict review presents server prose without exposing stored HTML markup', async () => {
  await open(); api.put.mockRejectedValue({ response: { status: 409, data: { current: { ...source, revision: 3, content: '<p>Other device <strong>words</strong>.</p>' } } } });
  fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Local version' } }); fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  await screen.findByText('Both versions are kept. Your version remains in the editor.');
  fireEvent.click(screen.getByText('Review the server version'));
  const details = screen.getByText('Review the server version').closest('details');
  expect(details.textContent).toContain('Other device words'); expect(details.textContent).not.toContain('<p>'); expect(details.textContent).not.toContain('<strong>');
});

test('pending continuation recovery takes priority over a quick-capture arrival', async () => {
  localStorage.setItem(`${draftKey('owner')}:continuation`, JSON.stringify({ source, operationId: 'pending', occurredOn: '2026-10-26' }));
  window.history.replaceState({}, '', '/think?context=work&capture=1');
  render(<WorkNotes />);
  await screen.findByRole('dialog', { name: 'Continue from this note' });
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.queryByRole('dialog', { name: 'Work inbox · private' })).toBeNull(); expect(api.post).not.toHaveBeenCalled();
});
test('Cancel and reopening Continue restore the uncertain request and prevent choosing a new source', async () => {
  api.post.mockRejectedValueOnce(new Error('lost reply'));
  await open(); fireEvent.click(screen.getByRole('button', { name: /Continue this note:/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Continue →' })); await screen.findByText('lost reply');
  const original = api.post.mock.calls[0][1].operationId;
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'smaller' } });
  fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /Smaller depot/ }));
  fireEvent.click(screen.getByRole('button', { name: /Continue this note:/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Continue from this note' });
  expect(within(dialog).getByText('Charging windows')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Choose another note' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue →' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[1][1].operationId).toBe(original);
});
test('account lock truthfully retains memory-only writing and unlocks when its original owner returns', async () => {
  await open(); const originalSet = Storage.prototype.setItem;
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (key.startsWith(draftKey('owner'))) throw new Error('quota'); originalSet.call(this, key, value);
  });
  fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Only in this page' } });
  localStorage.setItem('token', `x.${btoa(JSON.stringify({ id: 'other' }))}.x`);
  fireEvent(window, new StorageEvent('storage', { key: 'token' }));
  expect(screen.getByText(/not saved on this device/i)).toBeInTheDocument();
  expect(screen.queryByDisplayValue('Only in this page')).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign in to the original account' })).toBeInTheDocument();
  set.mockRestore(); localStorage.setItem('token', `x.${btoa(JSON.stringify({ id: 'owner' }))}.renewed`);
  fireEvent(window, new StorageEvent('storage', { key: 'token' }));
  expect(await screen.findByDisplayValue('Only in this page')).toBeInTheDocument();
});

test('existing inline login restores original-owner memory with refreshed captured credentials', async () => {
  await open(); const originalSet = Storage.prototype.setItem;
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (key.startsWith(draftKey('owner'))) throw new Error('quota'); originalSet.call(this, key, value);
  });
  fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Recover these words' } });
  localStorage.setItem('token', `x.${btoa(JSON.stringify({ id: 'other' }))}.x`);
  fireEvent(window, new StorageEvent('storage', { key: 'token' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to the original account' }));
  expect(screen.queryByDisplayValue('Recover these words')).toBeNull(); expect(screen.queryByText('Register here')).toBeNull();
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'fictional-owner' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fictional-test-password' } });
  const renewed = `x.${btoa(JSON.stringify({ id: 'owner', exp: 9999999999 }))}.renewed`;
  api.post.mockResolvedValueOnce({ data: { token: renewed } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  expect(await screen.findByDisplayValue('Recover these words')).toBeInTheDocument();
  set.mockRestore(); fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  expect(api.put.mock.calls[0][2].headers.Authorization).toBe(`Bearer ${renewed}`);
});

const expired = { response: { status: 401, data: { error: 'Token expired' } } };
const renewedToken = `x.${btoa(JSON.stringify({ id: 'owner', exp: 9999999999 }))}.renewed`;
const login = async (response = { data: { token: renewedToken } }) => {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'fictional-owner' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fictional-password' } });
  api.post.mockResolvedValueOnce(response);
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
};
test.each([false, true])('same-owner expiry offers existing login and preserves exact writing (storage failure: %s)', async failedStorage => {
  await open(); const originalSet = Storage.prototype.setItem;
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (failedStorage && key.startsWith(draftKey('owner'))) throw new Error('quota'); originalSet.call(this, key, value);
  });
  try {
    const words = '  Exact writing.\nAnother line.  ';
    fireEvent.change(screen.getByLabelText('Work note writing'), { target: { value: words } });
    api.put.mockRejectedValueOnce(expired); fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to sync' }));
    expect(screen.queryByDisplayValue(words)).toBeNull();
    await login(); expect(await screen.findByLabelText('Work note writing')).toHaveValue(words);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put.mock.calls[1][1].content).toBe(words);
    expect(api.put.mock.calls[1][2].headers.Authorization).toBe(`Bearer ${renewedToken}`);
    await screen.findByText('Saved');
  } finally { set.mockRestore(); }
});
test('failed and wrong-owner expiry logins hide retained writing until the original owner returns', async () => {
  await open(); fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Private retained words' } });
  api.put.mockRejectedValueOnce(expired); fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to sync' }));
  api.post.mockRejectedValueOnce({ response: { data: { error: 'Incorrect password' } } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'fictional-owner' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fictional-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' })); await screen.findByText('Incorrect password');
  expect(screen.queryByDisplayValue('Private retained words')).toBeNull();
  await login({ data: { token: `x.${btoa(JSON.stringify({ id: 'other' }))}.other` } });
  await screen.findByText(/That is a different account/); expect(screen.queryByDisplayValue('Private retained words')).toBeNull();
  expect(api.put).toHaveBeenCalledTimes(1);
  await login(); expect(await screen.findByDisplayValue('Private retained words')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' })); await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
  expect(api.put.mock.calls[1][2].headers.Authorization).toBe(`Bearer ${renewedToken}`);
});
test('initial-load expiry has an actionable login and reloads the shelf after authentication', async () => {
  api.get.mockRejectedValueOnce(expired); render(<WorkNotes />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to sync' })); await login();
  expect(await screen.findByRole('button', { name: /Charging windows/ })).toBeInTheDocument();
  expect(api.get.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${renewedToken}`);
});
test('Continue expiry opens login without a second dialog and retains the operation for retry', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: /Continue this note:/ }));
  api.post.mockRejectedValueOnce(expired); fireEvent.click(await screen.findByRole('button', { name: 'Continue →' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to sync' })); expect(screen.queryByRole('dialog')).toBeNull();
  await login(); const dialog = await screen.findByRole('dialog', { name: 'Continue from this note' });
  expect(screen.getAllByRole('dialog')).toHaveLength(1); fireEvent.click(within(dialog).getByRole('button', { name: 'Continue →' }));
  await screen.findByText('Last time’s line');
  const requests = api.post.mock.calls.filter(([path]) => path.endsWith('/continue'));
  expect(requests[1][1].operationId).toBe(requests[0][1].operationId);
  expect(requests[1][2].headers.Authorization).toBe(`Bearer ${renewedToken}`);
});
test('Quick Work note from the palette opens a fresh note when Work is already open', async () => {
  await open(); expect(screen.queryByRole('dialog', { name: 'Work inbox · private' })).toBeNull();
  act(() => { window.history.pushState({}, '', '/work?capture=1'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(await screen.findByRole('dialog', { name: 'Work inbox · private' })).toBeInTheDocument();
  expect(screen.getByLabelText('Work note writing')).toHaveValue('');
});
test('quick-capture create expiry recovers through one surface with the same writing and operation', async () => {
  window.history.replaceState({}, '', '/think?context=work&capture=1'); render(<WorkNotes />);
  await screen.findByRole('dialog', { name: 'Work inbox · private' });
  fireEvent.change(screen.getByLabelText('Work note writing'), { target: { value: 'Quick exact words' } });
  api.post.mockRejectedValueOnce(expired);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to sync' }, { timeout: 2000 }));
  expect(screen.queryByRole('dialog')).toBeNull(); await login();
  const dialog = await screen.findByRole('dialog', { name: 'Work inbox · private' });
  expect(screen.getAllByRole('dialog')).toHaveLength(1); expect(screen.getByLabelText('Work note writing')).toHaveValue('Quick exact words');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sync now' }));
  await waitFor(() => expect(api.post.mock.calls.filter(([path]) => path === '/api/work-notes')).toHaveLength(2));
  const requests = api.post.mock.calls.filter(([path]) => path === '/api/work-notes');
  expect(requests[1][1].operationId).toBe(requests[0][1].operationId);
  expect(requests[1][2].headers.Authorization).toBe(`Bearer ${renewedToken}`);
});
test('leaving under storage failure offers a copy before anything is discarded', async () => {
  await open(); const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockResolvedValue() } });
  try {
    fireEvent.change(screen.getByLabelText('Work note writing'), { target: { value: 'Only memory words' } });
    fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Today' }));
    const dialog = screen.getByRole('dialog', { name: 'Keep your writing' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy writing' })); await screen.findByText('Writing copied.');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Only memory words'));
    fireEvent.click(screen.getByRole('button', { name: 'Stay' })); expect(screen.getByLabelText('Work note writing')).toHaveValue('Only memory words');
  } finally { set.mockRestore(); }
});
