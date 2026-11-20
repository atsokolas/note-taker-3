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

test('closes a week through the existing plan and only shows acknowledged Monday work', async () => {
  session.flush = jest.fn().mockResolvedValue(true);
  props.onAction.mockReturnValue('plan-op');
  const { rerender } = render(<WorkWeekly {...props} today="2026-11-20" />);
  const review = screen.getByText('Close the week · 2 to review').closest('details');
  fireEvent.click(within(review).getByText('Close the week · 2 to review'));
  const plans = await within(review).findAllByRole('button', { name: 'Plan for Monday' });
  plans[0].focus();
  let finish;
  session.flush.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  fireEvent.click(plans[0]);
  expect(props.onAction).toHaveBeenCalledWith('a', { type: 'plan', plannedOn: '2026-11-23' });
  const pending = { ...a, plannedOn: '2026-11-23', plan: { operationId: 'plan-op', actionAt: '2026-11-20T16:00:00Z', pending: true } };
  rerender(<WorkWeekly {...props} today="2026-11-20" items={[pending, b]} />);
  expect(within(review).queryByRole('region', { name: 'Monday starts here' })).toBeNull();
  const saved = { ...pending, plan: { ...pending.plan, pending: false } };
  rerender(<WorkWeekly {...props} today="2026-11-20" items={[saved, b]} />);
  await act(async () => finish(true));
  const row = within(review).getByRole('heading', { name: a.title }).closest('li');
  expect(within(row).getByRole('status')).toHaveTextContent('Planned for Mon 23 Nov');
  expect(plans[1]).toHaveFocus();
  expect(within(review).getByRole('region', { name: 'Monday starts here' })).toHaveTextContent(a.title);
  fireEvent.click(within(row).getByRole('button', { name: 'Undo' }));
  expect(props.onAction).toHaveBeenLastCalledWith('a', { type: 'undo', undoOf: 'plan-op' });
  await act(async () => {});
});

test('retries the same operation from its row and leaves intervening focus alone', async () => {
  let finish;
  session.flush = jest.fn().mockResolvedValueOnce(false).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  props.onAction.mockReturnValue('plan-op');
  const { rerender } = render(<WorkWeekly {...props} today="2026-11-20" />);
  const summary = screen.getByText('Close the week · 2 to review');
  fireEvent.click(summary);
  const row = (await screen.findAllByRole('button', { name: 'Plan for Monday' }))[0].closest('li');
  const plan = within(row).getByRole('button', { name: 'Plan for Monday' });
  plan.focus();
  fireEvent.click(plan);
  const retry = await within(row).findByRole('button', { name: 'Retry sync' });
  expect(retry).toHaveFocus();
  fireEvent.click(retry);
  summary.focus();
  rerender(<WorkWeekly {...props} today="2026-11-20" items={[{ ...a, plannedOn: '2026-11-23', plan: { operationId: 'plan-op' } }, b]} />);
  await act(async () => finish(true));
  expect(within(row).getByRole('status')).toHaveTextContent('Planned for Mon 23 Nov');
  expect(summary).toHaveFocus();
  expect(props.onAction).toHaveBeenCalledTimes(1);
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
  fireEvent.click(screen.getByRole('button', { name: 'Add priority', exact: true }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Review last week' }));
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
  fireEvent.click(screen.getByLabelText('Manage Apply to accelerators'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rename' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
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
  fireEvent.click(screen.getByLabelText('Manage Apply to accelerators')); fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
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

test('creates a to-do inside a priority using one canonical task and then links it', async () => {
  session.capture = jest.fn(() => 'draft-task');
  session.edit = jest.fn();
  session.flush = jest.fn(async () => true);
  session.entry = jest.fn(() => ({ _id: 'new-task' }));
  render(<WorkWeekly {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add to-do to Apply to accelerators' }));
  fireEvent.change(screen.getByLabelText('New to-do for Apply to accelerators'), { target: { value: 'Send the application' } });
  fireEvent.submit(screen.getByLabelText('New to-do for Apply to accelerators').closest('form'));
  await waitFor(() => expect(session.saveWeek).toHaveBeenCalledWith('2026-11-16', [{ ...priority, taskIds: ['a', 'new-task'] }], 0, 'UTC'));
  expect(session.capture).toHaveBeenCalledTimes(1);
  expect(session.capture).toHaveBeenCalledWith(expect.objectContaining({ title: 'Send the application', workItem: { kind: 'task' } }));
});

test('accepts a task drag from the daily page, not only the weekly tray', async () => {
  render(<WorkWeekly {...props} />);
  const target = screen.getByRole('region', { name: 'Apply to accelerators' });
  fireEvent.dragOver(target, { dataTransfer: { types: ['application/x-noeis-week-task'] } });
  expect(target).toHaveClass('is-drop-target');
  fireEvent.drop(target, { dataTransfer: { getData: () => 'b' } });
  await waitFor(() => expect(session.saveWeek).toHaveBeenCalled());
});

test('retrying a failed inline to-do save reuses its captured task', async () => {
  session.capture = jest.fn(() => 'draft-task'); session.edit = jest.fn();
  session.flush = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  session.entry = jest.fn(() => ({ _id: 'new-task' }));
  render(<WorkWeekly {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add to-do to Apply to accelerators' }));
  const field = screen.getByLabelText('New to-do for Apply to accelerators');
  fireEvent.change(field, { target: { value: 'Send once' } }); fireEvent.submit(field.closest('form'));
  await screen.findByText('That did not save.');
  expect(field).toHaveValue('Send once'); expect(session.saveWeek).not.toHaveBeenCalled();
  fireEvent.submit(field.closest('form'));
  await waitFor(() => expect(session.saveWeek).toHaveBeenCalledTimes(1));
  expect(session.capture).toHaveBeenCalledTimes(1);
});

test('an inline to-do draft survives opening a note and returning', () => {
  let draft = null; session.weeklyDraft = () => draft; session.setWeeklyDraft = value => { draft = value; };
  const first = render(<WorkWeekly {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add to-do to Apply to accelerators' }));
  fireEvent.change(screen.getByLabelText('New to-do for Apply to accelerators'), { target: { value: 'Keep this draft' } });
  first.unmount(); render(<WorkWeekly {...props} />);
  expect(screen.getByLabelText('New to-do for Apply to accelerators')).toHaveValue('Keep this draft');
});

test('review cannot hide an inline to-do draft and a removed target leaves recovery visible', async () => {
  records[0].workItem.priorities[0] = { ...priority, carriedFrom: '2026-11-09', reviewed: false };
  const { rerender } = render(<WorkWeekly {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review last week' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add to-do to Apply to accelerators' }));
  fireEvent.change(screen.getByLabelText('New to-do for Apply to accelerators'), { target: { value: 'Keep me' } });
  expect(screen.getByRole('button', { name: 'Drop Apply to accelerators' })).toBeDisabled();
  records[0].workItem.priorities = [];
  rerender(<WorkWeekly {...props} />);
  expect(screen.getByLabelText('Unassigned to-do')).toHaveValue('Keep me');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(screen.queryByLabelText('Unassigned to-do')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Previous priority week' }));
  expect(screen.getByText(/Past weeks keep their plan/)).toBeInTheDocument();
});

test('priorities start expanded and folding keeps the task draft without saving data', () => {
  render(<WorkWeekly {...props} />);
  const toggle = screen.getByRole('button', { name: priority.title });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById(toggle.getAttribute('aria-controls'))).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: `Add to-do to ${priority.title}` }));
  const input = screen.getByLabelText(`New to-do for ${priority.title}`);
  fireEvent.change(input, { target: { value: 'Keep this draft' } });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(input).not.toBeVisible();
  expect(screen.queryByRole('checkbox', { name: a.title })).not.toBeInTheDocument();
  expect(session.saveWeek).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  expect(input).toBeVisible();
  expect(input).toHaveValue('Keep this draft');
});

test('Rename opens a collapsed priority so its editor is reachable', () => {
  render(<WorkWeekly {...props} />);
  const toggle = screen.getByRole('button', { name: priority.title });
  fireEvent.click(toggle);
  fireEvent.click(screen.getByLabelText(`Manage ${priority.title}`)); fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByLabelText(`Rename ${priority.title}`)).toBeVisible();
});


test('priority composer opens on demand, cancels cleanly, and returns focus', async () => {
  render(<WorkWeekly {...props} />);
  expect(screen.queryByLabelText('New weekly priority')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add priority', exact: true }));
  expect(screen.getByLabelText('New weekly priority')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('New weekly priority'), { target: { value: 'Not this week' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(screen.queryByLabelText('New weekly priority')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add priority', exact: true })).toHaveFocus());
  expect(session.saveWeek).not.toHaveBeenCalled();
});

test('closure follows saved task completion, and reopening restores the count', () => {
  const { rerender } = render(<WorkWeekly {...props} />);
  expect(screen.getByRole('status')).toHaveTextContent('0/1 done');
  rerender(<WorkWeekly {...props} items={[{ ...a, completed: true, pending: true }, b]} />);
  expect(screen.getByRole('status')).toHaveTextContent('1/1 done · saving');
  expect(screen.queryByText('Every linked to-do is done.')).not.toBeInTheDocument();
  rerender(<WorkWeekly {...props} items={[{ ...a, completed: true }, b]} />);
  expect(screen.getByRole('status')).toHaveTextContent('Every linked to-do is done.');
  expect(session.saveWeek).not.toHaveBeenCalled();
  rerender(<WorkWeekly {...props} />);
  expect(screen.getByRole('status')).toHaveTextContent('0/1 done');
});

test('empty and unavailable tasks never claim a completed priority', () => {
  records[0].workItem.priorities = [{ ...priority, taskIds: [] }, { ...priority, id: 'missing', title: 'Keep the unavailable task', taskIds: ['gone'] }];
  render(<WorkWeekly {...props} />);
  expect(screen.queryByText('Every linked to-do is done.')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('0/1 done');
});
test('a priority keeps its actions in one ··· menu with Remove priority last', async () => {
  render(<WorkWeekly {...props} />);
  const menu = screen.getByLabelText('Manage Apply to accelerators').closest('details');
  expect(within(menu).getAllByRole('button').map(button => button.textContent)).toEqual(['Rename', 'Complete priority', 'Move to next week', 'Remove priority']);
  fireEvent.click(within(menu).getByRole('button', { name: 'Remove priority' }));
  await waitFor(() => expect(session.saveWeek.mock.calls.at(-1)[1][0]).toMatchObject({ id: 'p', status: 'dropped' }));
});
test('another priority waits while one title is being edited', () => {
  records[0].workItem.priorities = [priority, { ...priority, id: 'q', title: 'Ship the landing page', taskIds: [] }];
  render(<WorkWeekly {...props} />);
  const menu = title => screen.getByLabelText(`Manage ${title}`).closest('details');
  fireEvent.click(within(menu('Apply to accelerators')).getByRole('button', { name: 'Rename' }));
  fireEvent.change(screen.getByLabelText('Rename Apply to accelerators'), { target: { value: 'Unsaved title' } });
  within(menu('Ship the landing page')).getAllByRole('button').forEach(button => expect(button).toBeDisabled());
});
