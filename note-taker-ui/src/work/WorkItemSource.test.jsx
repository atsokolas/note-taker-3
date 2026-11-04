import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkItemSource from './WorkItemSource';
import WorkOpenComposer from './WorkOpenComposer';
const origin = { noteId: 'source', blockId: 'passage', notebookName: 'Customers', noteTitle: 'Supplier meeting', day: '2026-11-03', quote: 'They promised six weeks.' };
test('source receipt identifies the original notebook/date and links to the saved passage', () => {
  render(<WorkItemSource origin={origin} quote />);
  expect(screen.getByRole('link', { name: 'From Customers · 3 Nov 2026' })).toHaveAttribute('href', '/work?note=source&block=passage');
  expect(screen.getByText('They promised six weeks.')).toBeInTheDocument();
});
test('destination notebook selection uses the existing draft and never changes the source', () => {
  const change = jest.fn(), begin = jest.fn();
  const session = { entry: () => ({ folder: 'customers' }), open: { draft: () => ({ title: 'Follow up', kind: 'task' }), drafts: () => [], status: () => '', change, begin } };
  render(<WorkOpenComposer noteId="source" session={session} request={{ text: 'Six weeks', origin }} folders={[{ _id: 'customers', name: 'Customers' }, { _id: 'software', name: 'Software team' }, { _id: 'archived', name: 'Archived', archivedAt: 'yesterday' }]} onFinish={() => {}} />);
  expect(begin).toHaveBeenCalledWith('source', 'Six weeks', origin);
  fireEvent.change(screen.getByLabelText('Follow-up notebook'), { target: { value: 'software' } });
  expect(change).toHaveBeenCalledWith('source', { folder: 'software' });
  expect(screen.queryByRole('option', { name: 'Archived' })).toBeNull();
});

test('incomplete and offline source receipts never manufacture an undefined note link or notebook', () => {
  const view = render(<WorkItemSource origin={{ quote: 'Offline words', blockId: 'b' }} />);
  expect(screen.queryByRole('link')).toBeNull(); expect(screen.getByText(/Source pending sync/)).toBeInTheDocument();
  view.rerender(<WorkItemSource origin={{ ...origin, noteId: 'local-source' }} />);
  expect(screen.queryByRole('link')).toBeNull(); expect(screen.getByText(/From Customers · 3 Nov 2026/)).toBeInTheDocument();
});
