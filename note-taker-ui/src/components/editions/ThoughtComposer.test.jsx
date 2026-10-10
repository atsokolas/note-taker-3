import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThoughtComposer, { useEditionThoughts } from './ThoughtComposer';
import { getEditionThoughts, saveEditionThought } from '../../api/editions';
import { readEditionLocal, writeEditionLocal } from './editionReadingState';
import { articleParagraphs } from './SourcePeek';
jest.mock('../../api/editions', () => ({ getEditionThoughts: jest.fn(), saveEditionThought: jest.fn() }));
const tokenFor = id => `a.${btoa(JSON.stringify({ id }))}.b`;
beforeEach(() => { localStorage.clear(); localStorage.setItem('token', tokenFor('owner')); jest.clearAllMocks(); });
it('keeps selected context with a private thought and clears its recoverable draft only after success', async () => {
  const onSaved = jest.fn();
  saveEditionThought.mockResolvedValue({ itemId: 'i', content: 'Worth keeping', quote: 'Selected passage', revision: 1 });
  render(<ThoughtComposer editionId="e" itemId="i" quote="Selected passage" label="Your thought" thoughts={[]} onSaved={onSaved} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Worth keeping' } });
  expect(readEditionLocal('e', 'draft:i').content).toBe('Worth keeping');
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(saveEditionThought).toHaveBeenCalledWith('e', { itemId: 'i', content: 'Worth keeping', quote: 'Selected passage', revision: 0 });
  expect(readEditionLocal('e', 'draft:i')).toBeNull();
});
it('does not discard a draft on a conflicting or failed save', async () => {
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere');
  expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
  expect(readEditionLocal('e', 'draft:i').content).toBe('Keep this draft');
});
it('isolates device drafts and resume positions across accounts', () => {
  writeEditionLocal('e', 'place', { itemId: 'private' });
  localStorage.setItem('token', tokenFor('other'));
  expect(readEditionLocal('e', 'place')).toBeNull();
  localStorage.setItem('token', tokenFor('owner'));
  expect(readEditionLocal('e', 'place').itemId).toBe('private');
});
it('renders source text safely, excluding executable or hidden payloads', () => {
  expect(articleParagraphs('<p>A real paragraph.</p><script>bad()</script><style>hide</style><iframe>secret</iframe><p><img src=x onerror=bad()>Next.</p>')).toEqual(['A real paragraph.', 'Next.']);
});

const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function Harness({ editionId = 'e', itemId = 'i', quote = '' }) {
  const state = useEditionThoughts(editionId);
  return <ThoughtComposer {...state} itemId={itemId} quote={quote} label="Your thought" />;
}
it('tells the truth when storage fails, and does not discard words on failed conflict reload', async () => {
  const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  const reload = jest.fn().mockRejectedValue(new Error('offline'));
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  const view = render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} reload={reload} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Only in this editor' } });
  expect(screen.getByRole('status')).toHaveTextContent('Draft not stored');
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('safe');
  expect(screen.queryByRole('button', { name: 'Use saved version instead' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not load'));
  expect(screen.getByRole('textbox')).toHaveValue('Only in this editor');
  expect(screen.getByRole('button', { name: 'Download draft' })).toBeEnabled();
  storage.mockRestore();
  view.unmount();
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} />);
  expect(screen.getByRole('textbox')).toHaveValue('');
});
it('shows both versions before explicit replacement and preserves stored words during a pending reload', async () => {
  getEditionThoughts.mockResolvedValueOnce([{ itemId: 'i', content: 'Old saved', revision: 1 }]);
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Old saved'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My local words' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  await screen.findByRole('alert');
  const incoming = deferred();
  getEditionThoughts.mockReturnValueOnce(incoming.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  expect(readEditionLocal('e', 'draft:i').content).toBe('My local words');
  incoming.resolve([{ itemId: 'i', content: 'Other session words', revision: 2 }]);
  await screen.findByRole('region', { name: 'Choose a thought version' });
  expect(screen.getByText('My local words', { selector: 'p' })).toBeInTheDocument();
  expect(screen.getByText('Other session words')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('My local words');
  fireEvent.click(screen.getByRole('button', { name: 'Use saved version instead' }));
  expect(screen.getByRole('textbox')).toHaveValue('Other session words');
  expect(readEditionLocal('e', 'draft:i')).toBeNull();
});
it('rebases only by choice and a second conflict still preserves the local draft', async () => {
  getEditionThoughts.mockResolvedValue([{ itemId: 'i', content: 'Their words', revision: 3 }]);
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Their words'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep mine' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  await screen.findByRole('region', { name: 'Choose a thought version' });
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing my draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  await screen.findByRole('alert');
  expect(saveEditionThought).toHaveBeenLastCalledWith('e', expect.objectContaining({ content: 'Keep mine', revision: 3 }));
  expect(readEditionLocal('e', 'draft:i').content).toBe('Keep mine');
});
it('close/reopen restores a stored conflicted draft', async () => {
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  const view = render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Reopen me' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  await screen.findByRole('alert'); view.unmount();
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} />);
  expect(screen.getByRole('textbox')).toHaveValue('Reopen me');
});
it('does not clear another account draft when an old save finishes after switching', async () => {
  const pending = deferred(); saveEditionThought.mockReturnValue(pending.promise);
  const onSaved = jest.fn();
  const props = { editionId: 'e', itemId: 'i', label: 'Your thought', thoughts: [], onSaved };
  const view = render(<ThoughtComposer {...props} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Owner private' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  localStorage.setItem('token', tokenFor('other')); writeEditionLocal('e', 'draft:i', { content: 'Other private', revision: 0 });
  view.rerender(<ThoughtComposer {...props} />);
  pending.resolve({ itemId: 'i', content: 'Owner private', revision: 1 });
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Other private'));
  expect(onSaved).not.toHaveBeenCalled();
  expect(readEditionLocal('e', 'draft:i').content).toBe('Other private');
});
it('ignores late loads on issue and account switches', async () => {
  const old = deferred(); getEditionThoughts.mockReturnValueOnce(old.promise).mockResolvedValue([]);
  const view = render(<Harness />);
  view.rerender(<Harness editionId="other-issue" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save thought' })).toBeDisabled());
  old.resolve([{ itemId: 'i', content: 'Wrong issue', revision: 1 }]);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  const oldAccount = deferred(); getEditionThoughts.mockReturnValueOnce(oldAccount.promise);
  view.rerender(<Harness editionId="third-issue" />);
  localStorage.setItem('token', tokenFor('other')); view.rerender(<Harness editionId="third-issue" />);
  oldAccount.resolve([{ itemId: 'i', content: 'Wrong account', revision: 1 }]);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
});
it('does not offer replacement when the saved thought disappeared', async () => {
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} reload={jest.fn().mockResolvedValue([])} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep missing target draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' })); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not load'));
  expect(screen.queryByRole('button', { name: 'Use saved version instead' })).toBeNull();
  expect(screen.getByRole('textbox')).toHaveValue('Keep missing target draft');
});
it('offers recovery when both reading and writing device storage are denied', async () => {
  const read = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Memory only' } });
  expect(screen.getByRole('status')).toHaveTextContent('Draft not stored');
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('safe');
  expect(screen.getByRole('textbox')).toHaveValue('Memory only');
  expect(screen.getByRole('button', { name: 'Copy draft' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Download draft' })).toBeEnabled();
  read.mockRestore(); write.mockRestore();
});
it('reports that a device draft could not clear after explicit saved-version choice', async () => {
  getEditionThoughts.mockResolvedValue([{ itemId: 'i', content: 'Their version', revision: 2 }]);
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Their version'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Stored local' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' })); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  await screen.findByRole('region', { name: 'Choose a thought version' });
  const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  fireEvent.click(screen.getByRole('button', { name: 'Use saved version instead' }));
  expect(screen.getByRole('textbox')).toHaveValue('Their version');
  expect(screen.getByRole('status')).toHaveTextContent('device draft could not be cleared');
  expect(readEditionLocal('e', 'draft:i').content).toBe('Stored local'); storage.mockRestore();
});
it('a failed clipboard copy leaves the draft and download option available', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } });
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Copy these exact words.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Copy draft' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Copy did not succeed');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy these exact words.');
  expect(screen.getByRole('textbox')).toHaveValue('Copy these exact words.');
  expect(screen.getByRole('button', { name: 'Download draft' })).toBeEnabled();
  delete navigator.clipboard;
});

it('freezes an unchanged save attempt before a conflict review updates the saved rows', async () => {
  getEditionThoughts.mockResolvedValueOnce([{ itemId: 'i', content: 'Original saved words', revision: 1 }])
    .mockResolvedValueOnce([{ itemId: 'i', content: 'Other session words', revision: 2 }]);
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Original saved words'));
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  await screen.findByRole('region', { name: 'Choose a thought version' });
  expect(screen.getByRole('textbox')).toHaveValue('Original saved words');
  expect(screen.getByText('Original saved words', { selector: 'p' })).toBeInTheDocument();
  expect(screen.getByText('Other session words')).toBeInTheDocument();
  expect(readEditionLocal('e', 'draft:i').content).toBe('Original saved words');
});
it.each(['offline', 'missing'])('invalidates a previous incoming choice when a second review is %s', async reason => {
  const reload = jest.fn().mockResolvedValueOnce([{ itemId: 'i', content: 'Incoming words', revision: 2 }]);
  if (reason === 'offline') reload.mockRejectedValueOnce(new Error('offline'));
  else reload.mockResolvedValueOnce([]);
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} reload={reload} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' })); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  await screen.findByRole('region', { name: 'Choose a thought version' });
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not load'));
  expect(screen.queryByRole('button', { name: 'Use saved version instead' })).toBeNull();
  expect(screen.getByRole('textbox')).toHaveValue('My draft');
});
it('does not label newer memory-only words copied when an older clipboard request completes', async () => {
  const pending = deferred();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn(() => pending.promise) } });
  const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Old copy' } });
  fireEvent.click(screen.getByRole('button', { name: 'Copy draft' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New memory-only words' } });
  await act(async () => pending.resolve());
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Old copy');
  expect(screen.getByRole('status')).toHaveTextContent('Draft not stored');
  storage.mockRestore(); delete navigator.clipboard;
});
it('does not begin recovery actions after an account switch before rerender', async () => {
  const reload = jest.fn();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn() } });
  const create = jest.fn(); URL.createObjectURL = create;
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} reload={reload} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Owner words' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' })); await screen.findByRole('alert');
  localStorage.setItem('token', tokenFor('other'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled(); delete navigator.clipboard; delete URL.createObjectURL;
});

it.each(['Incoming saved quote', ''])('adopts the whole saved version, including quote %j, until another passage is explicitly selected', async incomingQuote => {
  getEditionThoughts.mockResolvedValue([{ itemId: 'i', content: 'Saved words', quote: incomingQuote, revision: 2 }]);
  saveEditionThought.mockRejectedValueOnce({ response: { status: 409 } })
    .mockResolvedValue({ itemId: 'i', content: 'Saved words', quote: incomingQuote, revision: 3 });
  const view = render(<Harness quote="Different selected passage" />);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Saved words'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' })); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Review saved version' }));
  await screen.findByRole('region', { name: 'Choose a thought version' });
  fireEvent.click(screen.getByRole('button', { name: 'Use saved version instead' }));
  expect(screen.queryByText('Different selected passage')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved privately'));
  expect(saveEditionThought).toHaveBeenLastCalledWith('e', { itemId: 'i', content: 'Saved words', quote: incomingQuote, revision: 2 });
  view.rerender(<Harness quote="New explicit selection" />);
  expect(screen.getByText('New explicit selection')).toBeInTheDocument();
});
