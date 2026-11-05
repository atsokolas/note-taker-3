import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkShelf from './WorkShelf';

const notes = Array.from({ length: 6 }, (_, i) => ({ clientId: `n${i}`, title: `Note ${i}`, folder: i === 1 ? { _id: 'f' } : 'f', project: i === 1 ? { _id: 'p' } : 'p', takenOn: '2026-11-04' }));
const props = { notes, folders: [{ _id: 'f', name: 'Meetings' }], projects: [{ _id: 'p', name: 'Launch' }, { _id: 'paused', name: 'Later', pausedAt: '2026-11-01' }], lists: { waiting: [], someday: [] }, current: () => false, drag: () => ({}), onScope: jest.fn(), onOpen: jest.fn(), onQuery: jest.fn(), onDropNote: jest.fn(), timeZone: 'UTC', day: '2026-11-04', query: '', place: null, view: 'today' };

test('folders and projects disclose all children independently with native keyboard controls', () => {
  render(<WorkShelf {...props} />);
  expect(screen.queryByRole('button', { name: /Note 5/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Expand folders' }));
  const expand = screen.getByRole('button', { name: 'Expand Meetings' });
  expand.focus(); userEvent.keyboard('{Enter}');
  expect(expand).toHaveAttribute('aria-expanded', 'true');
  expect(within(screen.getByRole('list', { name: 'Notes in Meetings' })).getAllByRole('button')).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'Expand Launch' }));
  const children = screen.getByRole('list', { name: 'Notes in Launch' });
  fireEvent.click(within(children).getByRole('button', { name: /Note 1/ }));
  expect(props.onOpen).toHaveBeenCalledWith('n1');
  fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
  expect(props.onScope).toHaveBeenCalledWith('project', 'p');
  expand.focus(); userEvent.keyboard(' ');
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('list', { name: 'Notes in Meetings' })).toBeNull();
  expect(screen.getByRole('list', { name: 'Notes in Launch' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
});

test('current child reveals its parents on reload and search exposes matches beyond four notes', () => {
  const { rerender } = render(<WorkShelf {...props} current={note => note.clientId === 'n5'} />);
  expect(screen.getAllByRole('button', { name: /Note 5/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Expand folders' }));
  expect(screen.getAllByRole('button', { name: /Note 5/ })).toHaveLength(2);
  expect(screen.getAllByRole('button', { current: 'page' })).toHaveLength(2);
  rerender(<WorkShelf {...props} query="Note 5" />);
  expect(screen.getAllByRole('button', { name: /Note 5/ })).toHaveLength(2);
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

test('a note outside projects reveals its folder instead of leaving its selection hidden', () => {
  render(<WorkShelf {...props} notes={notes.map(note => ({ ...note, project: null }))} current={note => note.clientId === 'n0'} />);
  expect(screen.getByRole('button', { name: 'Collapse folders' })).toHaveAttribute('aria-expanded', 'true');
  expect(within(screen.getByRole('list', { name: 'Notes in Meetings' })).getByRole('button', { name: /Note 0/ })).toHaveAttribute('aria-current', 'page');
});

test('Projects and Notes collapse independently without losing nested folders, selection or orphan records', () => {
  const folders = [{ _id: 'parent', name: 'Customers' }, { _id: 'f', name: 'Meetings', parentFolderId: 'parent' }, { _id: 'orphan', name: 'Research', parentFolderId: 'missing' }];
  render(<WorkShelf {...props} folders={folders} current={note => note.clientId === 'n0'} />);
  fireEvent.click(screen.getByRole('button', { name: 'Expand folders' }));
  const branch = screen.getByRole('list', { name: 'Places in Customers' });
  expect(within(branch).getByRole('button', { name: 'Meetings' })).toBeInTheDocument();
  expect(within(branch).getByRole('button', { name: /Note 0/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Research' })).toBeInTheDocument();
  const toggle = screen.getByRole('button', { name: 'Collapse folders' });
  toggle.focus(); userEvent.keyboard('{Enter}');
  expect(screen.queryByRole('button', { name: 'Meetings' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument();
  userEvent.keyboard(' '); expect(screen.getByRole('button', { name: 'Meetings' })).toBeInTheDocument();
});

test('cyclic legacy places stay reachable and the notebook filter uses existing navigation', () => {
  render(<WorkShelf {...props} folders={[{ _id: 'a', name: 'A', parentFolderId: 'b' }, { _id: 'b', name: 'B', parentFolderId: 'a' }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Expand folders' }));
  expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand A' }));
  expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('More'));
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by notebook' }), { target: { value: 'b' } });
  expect(props.onScope).toHaveBeenCalledWith('folder', 'b');
});
