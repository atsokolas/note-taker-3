import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import NotebookBoard from './NotebookBoard';
import { getNotebookBoard, moveNotebookEntry } from '../../../api/notebook';
import { settleIntoWiki } from '../../../api/wiki';

jest.mock('../../../api/notebook', () => ({
  clearNotebookCache: jest.fn(),
  getNotebookBoard: jest.fn(),
  moveNotebookEntry: jest.fn()
}));
jest.mock('../../../api/wiki', () => ({ settleIntoWiki: jest.fn() }));

const day = 24 * 60 * 60 * 1000;
const rows = () => [
  { _id: 'a', title: 'On moats', updatedAt: new Date(Date.now() - 2 * day).toISOString(), createdAt: new Date(Date.now() - 12 * day).toISOString() },
  { _id: 'b', title: 'Pricing power', updatedAt: new Date(Date.now() - 50 * day).toISOString() },
  { _id: 'c', title: 'Essay draft', board: { stage: 'in_progress' }, workingState: { nextTimeLine: { text: 'Start from the Costco renewal rate.' } } }
];

const renderBoard = async (props = {}) => {
  const onOpen = jest.fn();
  const onView = jest.fn();
  await act(async () => {
    render(<NotebookBoard view="board" onView={onView} onOpen={onOpen} onClose={() => {}} {...props} />);
  });
  return { onOpen, onView };
};

beforeEach(() => {
  getNotebookBoard.mockResolvedValue(rows());
  moveNotebookEntry.mockImplementation(async (_id, change) => ({
    ...(change.stage ? { stage: change.stage, movedAt: new Date().toISOString() } : {}),
    ...(change.archived !== undefined ? { archivedAt: change.archived ? new Date().toISOString() : null } : {})
  }));
});

test('files every note under where it stands, with the next-time line on work in progress', async () => {
  await renderBoard();
  const ideas = screen.getByRole('region', { name: 'Ideas' });
  expect(within(ideas).getByText('On moats')).toBeInTheDocument();
  const progress = screen.getByRole('region', { name: 'In progress' });
  expect(within(progress).getByText('Next: Start from the Costco renewal rate.')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Done' })).getByText('Nothing finished yet.')).toBeInTheDocument();
  expect(screen.getByText('2 ideas · 1 in progress · 0 done')).toBeInTheDocument();
});

test('moving a note to Done from the menu files it and gives a receipt that can be undone', async () => {
  await renderBoard();
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Move “On moats”'), { target: { value: 'done' } });
  });
  expect(moveNotebookEntry).toHaveBeenCalledWith('a', { stage: 'done' });
  expect(within(screen.getByRole('region', { name: 'Done' })).getByText('On moats')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(/“On moats” is done\. Begun .+, 12 days in the making\./);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Undo' })); });
  expect(moveNotebookEntry).toHaveBeenLastCalledWith('a', { stage: 'idea' });
  expect(within(screen.getByRole('region', { name: 'Ideas' })).getByText('On moats')).toBeInTheDocument();
});

test('Done offers to settle the note into Wiki, and only settles when asked', async () => {
  settleIntoWiki.mockResolvedValueOnce({ page: { _id: 'page-1', title: 'On moats', sourceRefs: [] }, resettled: false });
  await renderBoard();
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Move “On moats”'), { target: { value: 'done' } });
  });
  expect(settleIntoWiki).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Settle into Wiki' })); });
  expect(settleIntoWiki).toHaveBeenCalledWith('notebook', 'a');
  expect(screen.getByRole('status')).toHaveTextContent('“On moats” settled in Wiki.');
  expect(screen.getByRole('link', { name: 'Open the page' })).toHaveAttribute('href', '/wiki/read/page-1');
});

test('a refused settle says what to fix on the board', async () => {
  settleIntoWiki.mockRejectedValueOnce({ response: { data: { error: 'Nothing is written here yet. Write the thought, then settle it.' } } });
  await renderBoard();
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Move “On moats”'), { target: { value: 'done' } });
  });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Settle into Wiki' })); });
  expect(screen.getByRole('status')).toHaveTextContent('Nothing is written here yet. Write the thought, then settle it.');
  expect(screen.queryByRole('link', { name: 'Open the page' })).not.toBeInTheDocument();
});

test('a move the server refuses puts the card back', async () => {
  moveNotebookEntry.mockRejectedValueOnce(new Error('offline'));
  await renderBoard();
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Move “Essay draft”'), { target: { value: 'done' } });
  });
  expect(within(screen.getByRole('region', { name: 'In progress' })).getByText('Essay draft')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('“Essay draft” did not move. Try again.');
});

test('dragging a card onto a column moves it there', async () => {
  await renderBoard();
  const card = screen.getByText('On moats').closest('li');
  const data = { value: '', setData(_type, value) { this.value = value; }, getData() { return this.value; } };
  fireEvent.dragStart(card, { dataTransfer: data });
  await act(async () => {
    fireEvent.drop(screen.getByRole('region', { name: 'In progress' }), { dataTransfer: data });
  });
  expect(moveNotebookEntry).toHaveBeenCalledWith('a', { stage: 'in_progress' });
});

test('ideas gone a month without a word are offered for the archive, then wait there', async () => {
  const { onOpen } = await renderBoard();
  expect(screen.getByText(/One idea has gone a month or more without a word/)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Set it aside' })); });
  expect(moveNotebookEntry).toHaveBeenCalledWith('b', { archived: true });
  expect(screen.getByRole('button', { name: 'Archive · 1' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('On moats'));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
});

test('the archive groups what was set down and restores it to the board', async () => {
  getNotebookBoard.mockResolvedValue([
    { _id: 'e', title: 'Old essay', board: { stage: 'done', archivedAt: new Date().toISOString() } },
    { _id: 'f', title: 'Cold idea', board: { stage: 'idea', archivedAt: new Date().toISOString() } }
  ]);
  await renderBoard({ view: 'archive' });
  expect(within(screen.getByRole('region', { name: 'Finished' })).getByText('Old essay')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Ideas set aside' })).getByText('Cold idea')).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(within(screen.getByRole('region', { name: 'Finished' })).getByRole('button', { name: 'Restore' }));
  });
  expect(moveNotebookEntry).toHaveBeenCalledWith('e', { archived: false });
  expect(screen.queryByRole('region', { name: 'Finished' })).not.toBeInTheDocument();
});

test('a writer with no notes yet is told where a new one goes', async () => {
  getNotebookBoard.mockResolvedValue([]);
  await renderBoard();
  expect(within(screen.getByRole('region', { name: 'Ideas' })).getByText('Nothing written yet. A new note starts here.')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Done' })).queryByText('Nothing finished yet.')).not.toBeInTheDocument();
});
