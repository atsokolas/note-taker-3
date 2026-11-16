import React from 'react';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import WorkWeekly from './WorkWeekly';
import WorkNeedsYou from './WorkNeedsYou';
import WorkDayTasks from './WorkDayTasks';
import { needsYou } from './workProjects';
const today = '2026-11-16';
const task = (id, plannedOn) => ({ id, _id: id, clientId: id, kind: 'task', title: id, plannedOn, list: 'next', sortedOn: today, history: [], folder: 'f' });
const items = [task('Today task', today), task('Earlier task', '2026-11-15'), task('Next task', '2026-11-18')];
const folders = [{ _id: 'f', name: 'Launch' }];
function setup() {
  const priorities = [{ id: 'p', title: 'Launch the product', status: 'active', taskIds: [] }];
  const session = { loading: () => false, error: () => '', weeks: () => [{ revision: 0, workItem: { plannedOn: today, priorities } }], saveWeek: jest.fn(async (week, values) => ({ revision: 1, workItem: { plannedOn: week, priorities: values } })) };
  const onAction = jest.fn(), onPlan = jest.fn(), onEdit = jest.fn(), onNew = jest.fn();
  const day = <WorkDayTasks day={today} today={today} items={items} notes={[]} folders={folders} onAction={onAction} onPlan={onPlan} onEdit={onEdit} onNew={onNew} />;
  render(<WorkWeekly session={session} today={today} timeZone="UTC" items={items} notes={[]} folders={folders} onAction={onAction} onEdit={onEdit} onNew={onNew} margin={<WorkNeedsYou needs={needsYou([], [], items, today)} items={items} today={today} notes={[]} folders={folders} onAction={onAction} onEdit={onEdit}>{day}</WorkNeedsYou>} />);
  return { session, onAction, onPlan, onEdit, onNew, rail: within(screen.getByRole('complementary', { name: 'Open to-dos' })) };
}
test('Today, Earlier and Next contain each canonical task once and Earlier starts folded', () => {
  const { rail } = setup();
  expect(rail.getByText('Today’s to-dos').closest('details')).toHaveAttribute('open');
  expect(rail.getByText('Next', { selector: 'summary' }).closest('details')).toHaveAttribute('open');
  const earlier = rail.getByText('Earlier');
  expect(earlier.closest('details')).not.toHaveAttribute('open');
  expect(rail.getByLabelText('Earlier task')).not.toBeVisible();
  fireEvent.click(earlier);
  for (const item of items) expect(rail.getAllByRole('checkbox', { name: item.title })).toHaveLength(1);
  expect(rail.queryByRole('heading', { name: 'Open to-dos' })).not.toBeInTheDocument();
});
test('row menu retains editing, replanning and keyboard assignment without a repeated task tray', async () => {
  const { rail, session, onEdit, onAction } = setup();
  const trigger = rail.getByLabelText('Actions for Next task');
  const menu = within(trigger.closest('details'));
  fireEvent.click(trigger);
  fireEvent.click(menu.getByRole('button', { name: 'Edit to-do' }));
  expect(onEdit).toHaveBeenCalledWith(items[2]);
  fireEvent.click(rail.getByLabelText('Actions for Next task'));
  fireEvent.click(menu.getByRole('button', { name: 'Move to today' }));
  expect(onAction).toHaveBeenCalledWith('Next task', { type: 'plan', plannedOn: today });
  fireEvent.click(rail.getByLabelText('Actions for Next task'));
  fireEvent.change(rail.getByLabelText('Priority for Next task'), { target: { value: 'p' } });
  await waitFor(() => expect(session.saveWeek).toHaveBeenCalledWith(today, [expect.objectContaining({ taskIds: ['Next task'] })], 0, 'UTC'));
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
