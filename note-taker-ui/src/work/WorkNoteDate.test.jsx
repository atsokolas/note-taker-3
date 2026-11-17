import React from 'react';
import { render, screen } from '@testing-library/react';
import WorkNoteDate from './WorkNoteDate';

test('capture date uses its recorded zone and stays fixed across edits and rollover', () => {
  const note = { capturedAt: '2026-11-04T00:30:00Z', timeZone: 'America/Los_Angeles', occurredOn: '2025-01-01', content: 'My words' };
  const { container, rerender } = render(<WorkNoteDate note={note} />);
  expect(screen.getByLabelText(/^Written on/)).toHaveAttribute('datetime', '2026-11-03');
  expect(screen.getByText('Tuesday 3 November 2026')).toBeInTheDocument();
  rerender(<WorkNoteDate note={{ ...note, title: 'Edited', occurredOn: '2027-01-01', updatedAt: '2027-01-02T12:00:00Z' }} />);
  expect(container.querySelectorAll('time')).toHaveLength(1);
  expect(screen.getByLabelText(/^Written on/)).toHaveAttribute('datetime', '2026-11-03');
  expect(note.content).toBe('My words');
});

test('legacy timestamps use UTC and meeting-only notes get no invented creation date', () => {
  const { rerender } = render(<WorkNoteDate note={{ createdAt: '2020-12-31T23:30:00Z' }} />);
  expect(screen.getByLabelText(/^Written on/)).toHaveAttribute('datetime', '2020-12-31');
  rerender(<WorkNoteDate note={{ occurredOn: '2020-12-01', content: '<p>1 December 2020</p>' }} />);
  expect(screen.queryByLabelText(/^Written on/)).toBeNull();
});
