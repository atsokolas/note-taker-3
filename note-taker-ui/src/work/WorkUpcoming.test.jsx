import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import WorkUpcoming from './WorkUpcoming';

const item = (id, patch) => ({ id, clientId: id, title: id, kind: 'task', completed: false, ...patch });
const props = { today: '2026-11-04', folders: [{ _id: 'f', name: 'Customers' }], projects: [], query: '', onDay: jest.fn(), onStart: jest.fn(), onEdit: jest.fn(), onAction: jest.fn(), onNew: jest.fn() };
test('Upcoming groups real future plans and due dates, keeps appointments in time order and preserves actions', () => {
  const items = [item('Afternoon meeting', { kind: 'appointment', plannedOn: '2026-11-05', startTime: '14:00', endTime: '14:30', folder: 'f' }), item('Morning meeting', { kind: 'appointment', plannedOn: '2026-11-05', startTime: '09:00', endTime: '10:00' }), item('Send proposal', { dueOn: '2026-11-05' }), item('Later', { plannedOn: '2026-11-10' }), item('Done', { plannedOn: '2026-11-05', completed: true }), item('Margin', { kind: 'jot', plannedOn: '2026-11-05' }), item('Past', { plannedOn: '2026-11-03' })];
  const before = JSON.stringify(items); render(<WorkUpcoming {...props} items={items} />);
  const day = screen.getByRole('region', { name: '5 November 2026' });
  expect(within(day).getAllByRole('button').filter(button => button.textContent.includes('meeting')).map(button => button.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Morning meeting'), expect.stringContaining('Afternoon meeting')]));
  expect(day.textContent.indexOf('Morning meeting')).toBeLessThan(day.textContent.indexOf('Afternoon meeting'));
  expect(screen.queryByText('Done')).toBeNull(); expect(screen.queryByText('Past')).toBeNull(); expect(screen.queryByText('Margin')).toBeNull();
  fireEvent.click(within(day).getByRole('checkbox', { name: 'Send proposal' })); expect(props.onAction).toHaveBeenCalledWith('Send proposal', { type: 'complete' });
  fireEvent.click(within(day).getByRole('button', { name: /09:00–10:00.*Morning meeting/ })); expect(props.onStart).toHaveBeenCalledWith(items[1]);
  fireEvent.click(within(day).getByRole('button', { name: 'Thursday 5 November' })); expect(props.onDay).toHaveBeenCalledWith('2026-11-05');
  expect(JSON.stringify(items)).toBe(before);
});
test('Upcoming search and empty states never invent planned records', () => {
  const { rerender } = render(<WorkUpcoming {...props} items={[]} />);
  expect(screen.getByText('Nothing planned ahead.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Plan something' })); expect(props.onNew).toHaveBeenCalled();
  rerender(<WorkUpcoming {...props} query="no match" items={[item('Call Mira', { plannedOn: '2026-11-05' })]} />);
  expect(screen.getByText('No upcoming work matches this phrase.')).toBeInTheDocument();
});

test('Upcoming surfaces an earlier due date before a later plan', () => {
  render(<WorkUpcoming {...props} items={[item('Proposal', { dueOn: '2026-11-05', plannedOn: '2026-11-10' })]} />);
  expect(within(screen.getByRole('region', { name: '5 November 2026' })).getByRole('checkbox', { name: 'Proposal' })).toBeInTheDocument();
  expect(screen.getByText('Due Thursday 5 Nov')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '10 November 2026' })).toBeNull();
});
