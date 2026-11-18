import React, { useState } from 'react';
import WorkItemForm from './WorkItemForm';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkDayTasks from './WorkDayTasks';
import { WorkTaskAssignment } from './WorkPlanItem';
import { runInNovember2026 } from './testClock';

runInNovember2026();
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

test('the follow-up panel plans a day from the week strip and shows which priority slots are taken', () => {
  const onSave = jest.fn();
  render(<WorkItemForm item={{ id: 'i', kind: 'task', title: 'Get the matrix from Maulik', priority: 0 }} today="2026-11-16" defaults={{}} notes={[]} folders={[]} occupiedPriorities={() => [2]} onSave={onSave} onClose={() => {}} />);
  expect(screen.queryByRole('radiogroup', { name: 'Kind' })).toBeNull();
  expect(screen.getByRole('radio', { name: '1' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Wed 18 Nov' }));
  expect(screen.getByRole('button', { name: 'Wed 18 Nov' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Planned day')).toHaveValue('2026-11-18');
  expect(screen.getByRole('radio', { name: '2' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: '1' }));
  expect(screen.getByText('2 of 3 used')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ plannedOn: '2026-11-18', priority: 1, dueOn: '' }));
});

test('Earlier leaves out a to-do already listed under a weekly priority', () => {
  const linked = { ...task, id: 'linked', _id: 'linked', clientId: 'local-linked', title: 'Send the deck', plannedOn: '2026-11-12' };
  const loose = { ...task, id: 'loose', _id: 'loose', clientId: 'local-loose', title: 'Book the room', plannedOn: '2026-11-13' };
  render(<WorkTaskAssignment.Provider value={{ priorities: [{ id: 'p', title: 'Raise', taskIds: ['linked'] }], disabled: false, link: jest.fn() }}><WorkDayTasks {...props} items={[task, linked, loose]} /></WorkTaskAssignment.Provider>);
  const earlier = screen.getByRole('region', { name: 'Carried from earlier' });
  expect(earlier).toHaveTextContent('Book the room');
  expect(earlier).not.toHaveTextContent('Send the deck');
});
