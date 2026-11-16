import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkDayTasks from './WorkDayTasks';
const today = '2026-11-16';
const task = { id: 'task', _id: 'task', clientId: 'local-task', kind: 'task', title: 'Write the application', plannedOn: today };
const props = { day: today, today, items: [task], notes: [], folders: [], onAction: jest.fn(), onEdit: jest.fn(), onOpen: jest.fn(), onPlan: jest.fn(), onNew: jest.fn() };

test('today starts expanded, folds with its draft intact, and uses existing task actions', () => {
  render(<WorkDayTasks {...props} />);
  const summary = screen.getByText('Today’s to-dos');
  expect(summary.closest('details')).toHaveAttribute('open');
  const input = screen.getByRole('textbox', { name: 'Add a line' });
  fireEvent.change(input, { target: { value: 'Call the founder' } });
  fireEvent.click(summary);
  expect(summary.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(summary);
  expect(input).toHaveValue('Call the founder');
  fireEvent.submit(input.closest('form'));
  expect(props.onPlan).toHaveBeenCalledWith('Call the founder');
  fireEvent.click(screen.getByRole('checkbox', { name: task.title }));
  expect(props.onAction).toHaveBeenCalledWith('local-task', { type: 'complete' });
});
