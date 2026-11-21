import React from 'react';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import WorkWeekly from './WorkWeekly';

import WorkDayTasks from './WorkDayTasks';
const today = '2026-11-16';
const task = (id, plannedOn) => ({ id, _id: id, clientId: id, kind: 'task', title: id, plannedOn, list: 'next', sortedOn: today, history: [], folder: 'f' });
const items = [task('Today task', today), task('Earlier task', '2026-11-15'), task('Next task', null)];
const folders = [{ _id: 'f', name: 'Launch' }];
function setup() {
  const priorities = [{ id: 'p', title: 'Launch the product', status: 'active', taskIds: [] }];
  const session = { loading: () => false, error: () => '', weeks: () => [{ revision: 0, workItem: { plannedOn: today, priorities } }], saveWeek: jest.fn(async (week, values) => ({ revision: 1, workItem: { plannedOn: week, priorities: values } })) };
  const onAction = jest.fn(), onPlan = jest.fn(), onEdit = jest.fn(), onNew = jest.fn();
  const day = <WorkDayTasks day={today} today={today} items={items} notes={[]} folders={folders} onAction={onAction} onPlan={onPlan} onEdit={onEdit} onNew={onNew} />;
  render(<WorkWeekly session={session} showPlan={false} today={today} timeZone="UTC" items={items} notes={[]} folders={folders} onAction={onAction} onEdit={onEdit} onNew={onNew}>{day}</WorkWeekly>);
  return { session, onAction, onPlan, onEdit, onNew, rail: within(document.querySelector('.work-day-tasks')) };
}
test('Today shows only its planned work and keeps earlier to-dos folded', () => {
  const { rail } = setup();
  expect(rail.getByText('To-dos').closest('details')).toHaveAttribute('open');
  const earlier = rail.getByText('Earlier to-dos');
  expect(earlier.closest('details')).not.toHaveAttribute('open');
  expect(rail.getByLabelText('Earlier task')).not.toBeVisible();
  fireEvent.click(earlier);
  for (const item of items.slice(0, 2)) expect(rail.getAllByRole('checkbox', { name: item.title })).toHaveLength(1);
  expect(rail.queryByText('Next task')).not.toBeInTheDocument();
});
test('row menu retains editing, replanning and keyboard assignment without a repeated task tray', async () => {
  const { rail, session, onEdit, onAction } = setup();
  fireEvent.click(rail.getByText('Earlier to-dos'));
  const trigger = rail.getByLabelText('Actions for Earlier task');
  const menu = within(trigger.closest('details'));
  fireEvent.click(trigger);
  fireEvent.click(menu.getByRole('button', { name: 'Edit to-do' }));
  expect(onEdit).toHaveBeenCalledWith(items[1]);
  fireEvent.click(rail.getByLabelText('Actions for Earlier task'));
  fireEvent.click(menu.getByRole('button', { name: 'Move to today' }));
  expect(onAction).toHaveBeenCalledWith('Earlier task', { type: 'plan', plannedOn: today });
  fireEvent.click(rail.getByLabelText('Actions for Earlier task'));
  fireEvent.change(rail.getByLabelText('Priority for Earlier task'), { target: { value: 'p' } });
  await waitFor(() => expect(session.saveWeek).toHaveBeenCalledWith(today, [expect.objectContaining({ taskIds: ['Earlier task'] })], 0, 'UTC'));
});
test('one add affordance reveals the natural-language composer and retains full details', () => {
  const { rail, onPlan, onNew } = setup();
  expect(rail.queryByRole('textbox', { name: 'Add a line' })).not.toBeInTheDocument();
  fireEvent.click(rail.getByRole('button', { name: 'Add to-do' }));
  const input = rail.getByRole('textbox', { name: 'Add a line' });
  fireEvent.change(input, { target: { value: '@Sam the deck tomorrow' } });
  fireEvent.submit(input.form);
  expect(onPlan).toHaveBeenCalledWith('@Sam the deck tomorrow');
  fireEvent.click(rail.getByRole('button', { name: 'Add to-do' }));
  fireEvent.click(rail.getByRole('button', { name: 'More details' }));
  expect(onNew).toHaveBeenCalledWith({ plannedOn: today });
});
