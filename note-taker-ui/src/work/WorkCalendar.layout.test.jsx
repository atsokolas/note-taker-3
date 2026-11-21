import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import WorkCalendar from './WorkCalendar';
const props = { page: true, day: '2026-11-04', today: '2026-11-04', mode: 'compact', notes: [], query: '', folders: [], projects: [], drag: () => ({}), onMode: jest.fn(), onDay: jest.fn(), onOpen: jest.fn(), onStart: jest.fn(), onEdit: jest.fn(), onAction: jest.fn(), onNew: jest.fn(), onPlan: jest.fn(), margin: null };
test('Today leads with a dated editorial heading, appointments and priorities; dashboard sections start expanded', () => {
  render(<WorkCalendar {...props} items={[{ id: 'old', clientId: 'old', kind: 'task', title: 'Earlier promise', plannedOn: '2026-11-03', completed: false }, { id: 'new', clientId: 'new', kind: 'task', title: 'Today’s proposal', plannedOn: '2026-11-04', completed: false }]} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  expect(screen.getByText('Wed 4 Nov')).toHaveAttribute('datetime', '2026-11-04');
  expect(within(screen.getByRole('region', { name: 'Today’s to-dos' })).getByRole('checkbox', { name: 'Today’s proposal' })).toBeInTheDocument();
  const summary = screen.getByText('Earlier to-dos');
  expect(summary.closest('details').open).toBe(false);
  expect(screen.getByRole('complementary', { name: 'Notes' })).toBeInTheDocument();
  fireEvent.click(summary); expect(summary.closest('details').open).toBe(true);
  fireEvent.click(screen.getByLabelText('Actions for Earlier promise'));
  fireEvent.click(screen.getByRole('button', { name: 'Move to today' }));
  expect(props.onAction).toHaveBeenCalledWith('old', { type: 'plan', plannedOn: '2026-11-04' });
});

test('meeting countdown uses the selected Work timezone rather than the device clock', () => {
  jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-04T14:50:00Z'));
  const mounted = render(<WorkCalendar {...props} timeZone="America/Chicago" items={[{ id: 'call', clientId: 'call', kind: 'appointment', title: 'Customer call', plannedOn: '2026-11-04', startTime: '09:00', endTime: '09:30' }]} />);
  expect(screen.getByRole('button', { name: /Customer call.*in 10 min/ })).toBeInTheDocument();
  mounted.unmount(); jest.useRealTimers();
});
