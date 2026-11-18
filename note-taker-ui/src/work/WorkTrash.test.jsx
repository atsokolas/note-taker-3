import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkTrash from './WorkTrash';
const project = { _id: 'p', name: 'Launch', deleted: { batchId: 'batch', deletedAt: '2026-11-16T12:00:00Z', expiresAt: '2026-11-30T12:00:00Z' } };
const session = { conflict: () => null, status: () => 'Saved' };
test('legacy deleted projects have no automatic erasure even when their old retention date passed', () => {
  render(<WorkTrash projects={[project]} notes={[]} session={session} />);
  expect(screen.getByText('No automatic erasure is scheduled for this deletion.')).toBeInTheDocument();
  expect(screen.queryByText(/Permanently erased on or after/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Restore Launch' })).toBeEnabled();
});
test('consented batches show the exact server deadline and retain restore without promising success after it', () => {
  const restore = jest.fn();
  const consented = { ...project, deleted: { ...project.deleted, autoErase: true, consentVersion: 1, expiresAt: '2020-01-01T13:14:15Z' } };
  const { container } = render(<WorkTrash projects={[consented]} notes={[]} session={session} onRestoreProject={restore} />);
  expect(container.querySelector('time')).toHaveAttribute('dateTime', '2020-01-01T13:14:15Z');
  expect(screen.getByText(/This cannot be undone/)).toHaveTextContent('restoration is only possible if erasure has not started');
  fireEvent.click(screen.getByRole('button', { name: 'Restore Launch' }));
  expect(restore).toHaveBeenCalledWith(consented);
});

test('server-blocked erasure displays a recovery action rather than a deadline promise', () => {
  render(<WorkTrash projects={[{ ...project, deleted: { ...project.deleted, autoErase: true, erasureBlocked: 'membership_changed' } }]} notes={[]} session={session} />);
  expect(screen.getByText('Automatic erasure paused: project membership changed. Restore and review again.')).toBeInTheDocument();
  expect(screen.queryByText(/Permanently erased on or after/)).not.toBeInTheDocument();
});

test('each deleted note says its own rule, and an empty page says nothing is deleted', () => {
  const note = { clientId: 'n', title: 'Pilot call', trashedAt: '2026-11-16T12:00:00Z', body: '' };
  const { rerender } = render(<WorkTrash projects={[]} notes={[note]} session={session} />);
  expect(screen.getByText(/^Deleted .* · Not erased automatically$/)).toBeInTheDocument();
  rerender(<WorkTrash projects={[]} notes={[]} session={session} />);
  expect(screen.getByText('Nothing deleted.')).toBeInTheDocument();
});
