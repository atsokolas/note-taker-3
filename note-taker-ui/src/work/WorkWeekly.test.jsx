import React from 'react';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import WorkWeekly from './WorkWeekly';
const a = { _id: 'a', id: 'a', clientId: 'a', title: 'Draft the application story', kind: 'task', completed: false, history: [], takenOn: '2026-11-11', folder: 'f' };
const b = { ...a, _id: 'b', id: 'b', clientId: 'b', title: 'Compare program deadlines' };
const priority = { id: 'p', title: 'Apply to accelerators', taskIds: ['a'], status: 'active', reviewed: true, carriedFrom: null };
let records, session, props;
beforeEach(() => {
  records = [{ _id: 'week', revision: 0, workItem: { kind: 'week', plannedOn: '2026-11-16', priorities: [priority] } }];
  session = { weeks: () => records, loading: () => false, error: () => '', saveWeek: jest.fn(async (week, priorities, revision) => { const value = { _id: week, revision: (revision ?? -1) + 1, workItem: { kind: 'week', plannedOn: week, priorities } }; records = [...records.filter(x => x.workItem.plannedOn !== week), value]; return value; }) };
  props = { session, today: '2026-11-16', timeZone: 'UTC', items: [a, b], folders: [{ _id: 'f', name: 'NOEIS' }], notes: [], onAction: jest.fn(), onEdit: jest.fn(), onNew: jest.fn(), onOpen: jest.fn() };
});
test('shows all priorities, original sources, and supports keyboard assignment and removal', async () => {
  render(<WorkWeekly {...props} />);
  expect(screen.getByRole('heading', { name: 'Apply to accelerators' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Draft the application story' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Priority for Compare program deadlines'), { target: { value: 'p' } });
  await waitFor(() => expect(session.saveWeek).toHaveBeenCalledWith('2026-11-16', [{ ...priority, taskIds: ['a', 'b'] }], 0, 'UTC'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Compare program deadlines from priority' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Remove Compare program deadlines from priority' }));
  await waitFor(() => expect(session.saveWeek.mock.calls.at(-1)[1][0].taskIds).toEqual(['a']));
  expect(a.takenOn).toBe('2026-11-11'); expect(a.folder).toBe('f');
});
test('dragging adds one canonical link and completion uses the existing action', async () => {
  render(<WorkWeekly {...props} />);
  const target = screen.getByRole('region', { name: 'Apply to accelerators' });
  fireEvent.drop(target, { dataTransfer: { getData: () => 'b' } });
  await screen.findByRole('button', { name: 'Remove Compare program deadlines from priority' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Compare program deadlines' }));
  expect(props.onAction).toHaveBeenCalledWith('b', { type: 'complete' });
  expect(session.saveWeek.mock.calls[0][1][0].taskIds).toEqual(['a', 'b']);
});
test('new priorities persist and empty input is not saved', async () => {
  render(<WorkWeekly {...props} />);
  fireEvent.submit(screen.getByLabelText('New weekly priority').closest('form'));
  expect(session.saveWeek).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('New weekly priority'), { target: { value: 'Clarify the next decision' } });
  fireEvent.submit(screen.getByLabelText('New weekly priority').closest('form'));
  await screen.findByRole('heading', { name: 'Clarify the next decision' });
  expect(records[0].workItem.priorities).toHaveLength(2);
});
test('rollover happens once, preserves last week and review can defer without completing tasks', async () => {
  records[0].workItem.plannedOn = '2026-11-09'; const old = JSON.stringify(records[0]);
  const { rerender } = render(<WorkWeekly {...props} />);
  await waitFor(() => expect(session.saveWeek).toHaveBeenCalledTimes(1));
  rerender(<WorkWeekly {...props} />);
  expect(JSON.stringify(records[0])).toBe(old);
  fireEvent.click(screen.getByRole('button', { name: 'Review rollover' }));
  fireEvent.click(screen.getByRole('button', { name: 'Defer Apply to accelerators' }));
  await waitFor(() => expect(records[1].workItem.priorities[0].status).toBe('deferred'));
  expect(props.onAction).not.toHaveBeenCalled();
});
test('failed save preserves the proposed plan and retry uses the same revision', async () => {
  session.saveWeek.mockRejectedValueOnce(new Error('Offline. Connect and retry.'));
  render(<WorkWeekly {...props} />);
  fireEvent.change(screen.getByLabelText('Priority for Compare program deadlines'), { target: { value: 'p' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  await screen.findByRole('button', { name: 'Remove Compare program deadlines from priority' });
  expect(session.saveWeek.mock.calls.map(x => x[2])).toEqual([0, 0]);
});
test('history cannot change original tasks or silently alter the past plan', async () => {
  records.unshift({ _id: 'past', revision: 0, workItem: { kind: 'week', plannedOn: '2026-11-09', priorities: [priority] } });
  render(<WorkWeekly {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Previous priority week' }));
  expect(screen.getByRole('checkbox', { name: 'Draft the application story' })).toBeDisabled();
  expect(screen.queryByLabelText('New weekly priority')).toBeNull();
  expect(screen.getByText(/Past weeks keep their plan/)).toBeInTheDocument();
});
test('failed proposals and rename drafts survive leaving the weekly page and returning', async () => {
  let draft = null;
  session.weeklyDraft = () => draft;
  session.setWeeklyDraft = value => { draft = value; };
  session.saveWeek.mockRejectedValueOnce(new Error('Offline'));
  const first = render(<WorkWeekly {...props} />);
  fireEvent.change(screen.getByLabelText('Priority for Compare program deadlines'), { target: { value: 'p' } });
  await screen.findByRole('alert');
  first.unmount();
  const second = render(<WorkWeekly {...props} />);
  expect(screen.getByRole('alert')).toHaveTextContent('ready to retry');
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Manage Apply to accelerators' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Manage Apply to accelerators' }));
  fireEvent.change(screen.getByLabelText('Rename Apply to accelerators'), { target: { value: 'Finish applications' } });
  second.unmount();
  render(<WorkWeekly {...props} />);
  expect(screen.getByLabelText('Rename Apply to accelerators')).toHaveValue('Finish applications');
});
test('current week cannot advance into editable future plans that would suppress rollover', () => {
  render(<WorkWeekly {...props} />);
  expect(screen.getByRole('button', { name: 'Next priority week' })).toBeDisabled();
});
test('conflict review shows task assignments in both versions, not just identical titles', async () => {
  const current = { ...records[0], revision: 2, workItem: { ...records[0].workItem, priorities: [{ ...priority, taskIds: ['b'] }] } };
  session.saveWeek.mockRejectedValueOnce(Object.assign(new Error('Changed elsewhere'), { current }));
  render(<WorkWeekly {...props} />);
  fireEvent.change(screen.getByLabelText('Priority for Compare program deadlines'), { target: { value: 'p' } });
  const alert = await screen.findByRole('alert');
  expect(within(alert).getByText('Saved plan').parentElement).toHaveTextContent('Compare program deadlines');
  expect(within(alert).getByText('Saved plan').parentElement).not.toHaveTextContent('Draft the application story');
  expect(within(alert).getByText('Your proposed plan').parentElement).toHaveTextContent('Draft the application story');
});
test('linking another task cannot silently discard a title being edited', () => {
  render(<WorkWeekly {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Manage Apply to accelerators' }));
  fireEvent.change(screen.getByLabelText('Rename Apply to accelerators'), { target: { value: 'Keep my unfinished title' } });
  fireEvent.change(screen.getByLabelText('Priority for Compare program deadlines'), { target: { value: 'p' } });
  expect(session.saveWeek).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Rename Apply to accelerators')).toHaveValue('Keep my unfinished title');
});
test('an unsent priority title from last week remains editable after Monday rollover', async () => {
  session.weeklyDraft = () => ({ week: '2026-11-09', newTitle: 'Still worth doing' });
  render(<WorkWeekly {...props} />);
  expect(screen.getByLabelText('New weekly priority')).toHaveValue('Still worth doing');
  expect(screen.getByLabelText('New weekly priority')).toBeEnabled();
});
test('an open dashboard advances to the new week without rewriting the prior plan', async () => {
  const { rerender } = render(<WorkWeekly {...props} />);
  const before = JSON.stringify(records[0]);
  rerender(<WorkWeekly {...props} today="2026-11-23" />);
  await waitFor(() => expect(session.saveWeek).toHaveBeenCalledWith('2026-11-23', expect.any(Array), null, 'UTC'));
  expect(screen.getByRole('heading', { name: 'This week' })).toBeInTheDocument();
  expect(JSON.stringify(records[0])).toBe(before);
});
