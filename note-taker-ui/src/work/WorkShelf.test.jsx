import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkShelf from './WorkShelf';

const notes = Array.from({ length: 6 }, (_, i) => ({ clientId: `n${i}`, title: `Note ${i}`, folder: i === 1 ? { _id: 'f' } : 'f', project: i === 1 ? { _id: 'p' } : 'p', takenOn: '2026-11-04' }));
const props = { notes, folders: [{ _id: 'f', name: 'Meetings' }], projects: [{ _id: 'p', name: 'Launch' }, { _id: 'paused', name: 'Later', pausedAt: '2026-11-01' }], needs: { total: 3, hills: { p: 0.3 } }, current: () => false, drag: () => ({}), onScope: jest.fn(), onOpen: jest.fn(), onQuery: jest.fn(), onDropNote: jest.fn(), timeZone: 'UTC', day: '2026-11-04', query: '', place: null, view: 'today' };

test('the rail is Today, Projects and Notes, and a note is listed once, in its folder', () => {
  render(<WorkShelf {...props} />);
  expect(within(screen.getByRole('navigation', { name: 'Work navigation' })).getAllByRole('button').map(button => button.textContent)).toEqual(['Today3']);
  fireEvent.click(screen.getByRole('button', { name: /Today/ }));
  expect(props.onScope).toHaveBeenCalledWith('today');
  for (const gone of ['Upcoming', 'Outstanding', 'More', 'All notes']) expect(screen.queryByText(gone)).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('list', { name: 'Notes in Launch' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Expand Launch' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
  expect(props.onScope).toHaveBeenCalledWith('project', 'p');
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Still figuring it out.' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
  expect(props.onScope).toHaveBeenCalledWith('notes');
});

test('folders disclose their notes with native keyboard controls', () => {
  render(<WorkShelf {...props} />);
  expect(screen.queryByRole('button', { name: /Note 5/ })).toBeNull();
  const expand = screen.getByRole('button', { name: 'Expand Meetings' });
  expand.focus(); userEvent.keyboard('{Enter}');
  expect(expand).toHaveAttribute('aria-expanded', 'true');
  expect(within(screen.getByRole('list', { name: 'Notes in Meetings' })).getAllByRole('button')).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: /Note 1/ }));
  expect(props.onOpen).toHaveBeenCalledWith('n1');
  expand.focus(); userEvent.keyboard(' ');
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('list', { name: 'Notes in Meetings' })).toBeNull();
});

test('the current note reveals its folder on reload and search exposes matches beyond four notes', () => {
  const { rerender } = render(<WorkShelf {...props} current={note => note.clientId === 'n5'} />);
  expect(screen.getAllByRole('button', { name: /Note 5/ })).toHaveLength(1);
  expect(screen.getByRole('button', { name: /Note 5/ })).toHaveAttribute('aria-current', 'page');
  rerender(<WorkShelf {...props} query="Note 5" />);
  expect(screen.getAllByRole('button', { name: /Note 5/ })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /Note 0/ })).toBeNull();
});

test('the active project alone marks the current page in the Projects navigation', () => {
  const { rerender } = render(<WorkShelf {...props} view="project" place="p" />);
  const navigation = screen.getByRole('navigation', { name: 'Projects' });
  expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(navigation.querySelector('[aria-current="page"]')).toHaveTextContent('Launch');
  rerender(<WorkShelf {...props} view="projects" />);
  expect(within(navigation).getByRole('button', { name: /Projects/ })).toHaveAttribute('aria-current', 'page');
});

test('Projects and Notes collapse independently without losing nested folders, selection or orphan records', () => {
  const folders = [{ _id: 'parent', name: 'Customers' }, { _id: 'f', name: 'Meetings', parentFolderId: 'parent' }, { _id: 'orphan', name: 'Research', parentFolderId: 'missing' }];
  render(<WorkShelf {...props} folders={folders} current={note => note.clientId === 'n0'} />);
  const branch = screen.getByRole('list', { name: 'Places in Customers' });
  expect(within(branch).getByRole('button', { name: 'Meetings' })).toBeInTheDocument();
  expect(within(branch).getByRole('button', { name: /Note 0/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Research' })).toBeInTheDocument();
  const toggle = screen.getByRole('button', { name: 'Collapse notes' });
  toggle.focus(); userEvent.keyboard('{Enter}');
  expect(screen.queryByRole('button', { name: 'Meetings' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument();
  userEvent.keyboard(' '); expect(screen.getByRole('button', { name: 'Meetings' })).toBeInTheDocument();
});

test('cyclic legacy places stay reachable', () => {
  render(<WorkShelf {...props} folders={[{ _id: 'a', name: 'A', parentFolderId: 'b' }, { _id: 'b', name: 'B', parentFolderId: 'a' }]} />);
  expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand A' }));
  expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
});
