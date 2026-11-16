import React, { useState } from 'react';
import WorkItemForm from './WorkItemForm';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkDayTasks from './WorkDayTasks';
const today = '2026-11-16';
const task = { id: 'task', _id: 'task', clientId: 'local-task', kind: 'task', title: 'Write the application', plannedOn: today };
const props = { day: today, today, items: [task], notes: [], folders: [], onAction: jest.fn(), onEdit: jest.fn(), onOpen: jest.fn(), onPlan: jest.fn(), onNew: jest.fn() };

test('today starts expanded, folds with its draft intact, and uses existing task actions', () => {
  render(<WorkDayTasks {...props} />);
  const summary = screen.getByText('Today’s to-dos');
  expect(summary.closest('details')).toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Add to-do' }));
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


test('More details carries the exact typed title into the full editable form', () => {
  function Flow() {
    const [defaults, setDefaults] = useState(null);
    return defaults ? <WorkItemForm defaults={defaults} notes={[]} folders={[]} occupiedPriorities={() => []} onSave={() => {}} onClose={() => {}} /> : <WorkDayTasks {...props} onNew={setDefaults} />;
  }
  render(<Flow />);
  fireEvent.click(screen.getByRole('button', { name: 'Add to-do' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Add a line' }), { target: { value: 'Ask Sam about the deck tomorrow' } });
  fireEvent.click(screen.getByRole('button', { name: 'More details' }));
  expect(screen.getByRole('textbox', { name: 'Item' })).toHaveValue('Ask Sam about the deck tomorrow');
  expect(screen.getByLabelText('Planned day')).toHaveValue(today);
  fireEvent.change(screen.getByRole('textbox', { name: 'Item' }), { target: { value: 'Ask Sam about the final deck' } });
  expect(screen.getByRole('textbox', { name: 'Item' })).toHaveValue('Ask Sam about the final deck');
});

test('a rejected submission keeps the line and prevents repeated capture while pending', async () => {
  let reject;
  const onPlan = jest.fn(() => new Promise((resolve, fail) => { reject = fail; }));
  render(<WorkDayTasks {...props} onPlan={onPlan} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add to-do' }));
  const input = screen.getByRole('textbox', { name: 'Add a line' });
  fireEvent.change(input, { target: { value: 'Keep my line' } });
  fireEvent.submit(input.form); fireEvent.submit(input.form);
  expect(onPlan).toHaveBeenCalledTimes(1);
  expect(input).toBeDisabled();
  await act(async () => reject(new Error('Offline. Retry when connected.')));
  expect(screen.getByRole('alert')).toHaveTextContent('Offline');
  expect(input).toHaveValue('Keep my line');
  expect(input).toBeEnabled();
  onPlan.mockResolvedValueOnce(true);
  fireEvent.submit(input.form);
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Add a line' })).not.toBeInTheDocument());
});

test('an explicit unsuccessful result retains the draft', () => {
  render(<WorkDayTasks {...props} onPlan={() => false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add to-do' }));
  const input = screen.getByRole('textbox', { name: 'Add a line' });
  fireEvent.change(input, { target: { value: 'Not saved yet' } }); fireEvent.submit(input.form);
  expect(input).toHaveValue('Not saved yet');
  expect(screen.getByRole('alert')).toHaveTextContent('Your line is still here');
});
