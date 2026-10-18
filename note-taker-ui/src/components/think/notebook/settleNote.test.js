import { settleNote } from './settleNote';
import { settleNotebookEntry } from '../../../api/notebook';

jest.mock('../../../api/notebook', () => ({ settleNotebookEntry: jest.fn() }));

const systemStatus = () => ({ setLatestReceipt: jest.fn() });
const page = (sourceRefs) => ({ _id: 'page-1', title: 'Why moats erode', sourceRefs });

test('the receipt says the page is new and what its quotes became', async () => {
  settleNotebookEntry.mockResolvedValueOnce({ page: page([{}, {}]), resettled: false });
  const status = systemStatus();
  expect(await settleNote('note-1', status)).toEqual({ settledIn: { _id: 'page-1', title: 'Why moats erode' }, resettled: false });
  expect(status.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
    title: '“Why moats erode” settled in Wiki',
    summary: 'Its 2 quoted passages are cited and open where they came from.',
    status: 'completed',
    href: '/wiki/read/page-1'
  }));
});

test('settling again says it is a revision, and a note without quotes says so', async () => {
  settleNotebookEntry.mockResolvedValueOnce({ page: page([]), resettled: true });
  const status = systemStatus();
  await settleNote('note-1', status);
  expect(status.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
    title: '“Why moats erode” revised in Wiki',
    summary: 'A new revision; the earlier words stay in the page history. No quoted passages to cite.'
  }));
});

test('a refusal is the server’s line, and no receipt claims otherwise', async () => {
  settleNotebookEntry.mockRejectedValueOnce({ response: { data: { error: 'Give this note a title before it settles.' } } });
  const status = systemStatus();
  expect(await settleNote('note-1', status)).toEqual({ refusal: 'Give this note a title before it settles.' });
  settleNotebookEntry.mockRejectedValueOnce(new Error('offline'));
  expect(await settleNote('note-1', status)).toEqual({ refusal: 'The note did not settle. Try again.' });
  expect(status.setLatestReceipt).not.toHaveBeenCalled();
});
