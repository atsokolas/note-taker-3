import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkItemSource, { WorkSourceHistory } from './WorkItemSource';
import WorkOpenComposer from './WorkOpenComposer';

import { runInNovember2026 } from './testClock';

runInNovember2026();
const origin = { noteId: 'source', blockId: 'passage', notebookName: 'Customers', noteTitle: 'Supplier meeting', day: '2026-11-03', quote: 'They promised six weeks.' };
test('source receipt identifies the original notebook/date and links to the saved passage', () => {
  render(<WorkItemSource origin={origin} quote />);
  expect(screen.getByRole('link', { name: 'From Customers · 3 Nov' })).toHaveAttribute('href', '/work?note=source&block=passage&entry=2026-11-03');
  expect(screen.getByText('They promised six weeks.')).toBeInTheDocument();
});

test('history keeps the captured quote beside the current text of the same block', () => {
  const view = render(<WorkSourceHistory origin={origin} note={{ content: '<p data-block-id="passage">The revised timeline is eight weeks.</p>' }} />);
  expect(screen.getByText('Original words').nextElementSibling).toHaveTextContent(origin.quote);
  expect(screen.getByText('Current line').nextElementSibling).toHaveTextContent('The revised timeline is eight weeks.');
  view.rerender(<WorkSourceHistory origin={origin} note={{ content: '<p data-block-id="neighbor">An unrelated line.</p>' }} />);
  expect(screen.getByText(origin.quote)).toBeVisible();
  expect(screen.getByText('The current line is unavailable.')).toBeVisible();
  expect(screen.queryByText('An unrelated line.')).toBeNull();
});
test('destination notebook selection uses the existing draft and never changes the source', () => {
  const change = jest.fn(), begin = jest.fn();
  const session = { entry: () => ({ folder: 'customers' }), open: { draft: () => ({ title: 'Follow up', kind: 'task', origin }), drafts: () => [], status: () => '', change, begin } };
  render(<WorkOpenComposer noteId="source" session={session} request={{ text: 'Six weeks', origin }} folders={[{ _id: 'customers', name: 'Customers' }, { _id: 'software', name: 'Software team' }, { _id: 'archived', name: 'Archived', archivedAt: 'yesterday' }]} onFinish={() => {}} />);
  expect(begin).toHaveBeenCalledWith('source', 'Six weeks', origin);
  expect(screen.getByText(origin.quote)).toBeVisible();
  fireEvent.change(screen.getByLabelText('To-do notebook'), { target: { value: 'software' } });
  expect(change).toHaveBeenCalledWith('source', { folder: 'software' });
  expect(screen.queryByRole('option', { name: 'Archived' })).toBeNull();
});

test('incomplete and offline source receipts never manufacture an undefined note link or notebook', () => {
  const view = render(<WorkItemSource origin={{ quote: 'Offline words', blockId: 'b' }} />);
  expect(screen.queryByRole('link')).toBeNull(); expect(screen.getByText(/Link appears once saved/)).toBeInTheDocument();
  view.rerender(<WorkItemSource origin={{ ...origin, noteId: 'local-source' }} />);
  expect(screen.queryByRole('link')).toBeNull(); expect(screen.getByText(/From Customers · 3 Nov/)).toBeInTheDocument();
});
