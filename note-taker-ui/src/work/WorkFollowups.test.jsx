import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkFollowups from './WorkFollowups';

const renderNote = (session, props = {}) => <WorkFollowups note={{ _id: 'note', clientId: 'note' }} session={session} folders={[]} timeZone="UTC" onAction={() => {}} {...props}>{makeOpen => <button onClick={() => makeOpen({ text: 'Ask for the schedule', origin: { blockId: 'passage' } })}>Make Open</button>}</WorkFollowups>;
const fixture = () => ({ entry: () => ({ folder: null }), items: () => [], pending: () => [], conflict: () => null, open: { draft: () => ({ intent: 'draft', title: '' }), status: () => '', drafts: () => [], begin: jest.fn(), cancel: () => true } });

test('a new conflict reveals recovery even when pending work was manually collapsed', () => {
  const session = fixture();
  session.items = () => [{ _id: 'task', clientId: 'task', title: 'Confirm dates', workItem: { kind: 'task', noteId: 'note', history: [] } }];
  session.pending = () => [['task']]; session.status = () => 'Sync pending';
  const view = render(renderNote(session));
  const disclosure = screen.getByRole('region', { name: 'Open' }).querySelector('details');
  expect(disclosure.open).toBe(true); fireEvent.click(disclosure.querySelector('summary'));
  expect(disclosure.open).toBe(false);
  session.conflict = () => ({ revision: 2 }); view.rerender(renderNote(session));
  expect(disclosure.open).toBe(true);
  expect(screen.getByRole('button', { name: 'Review both versions' })).toBeVisible();
});

test('a new draft error reveals retained writing after the reader collapsed an existing draft', () => {
  const session = fixture(); session.open.draft = () => ({ intent: 'draft', title: 'Keep these words', kind: 'task' });
  const view = render(renderNote(session));
  const disclosure = screen.getByRole('region', { name: 'Open' }).querySelector('details');
  fireEvent.click(disclosure.querySelector('summary')); expect(disclosure.open).toBe(false);
  session.open.status = () => 'This page could not save your writing'; view.rerender(renderNote(session));
  expect(disclosure.open).toBe(true);
  expect(screen.getByRole('textbox', { name: 'Open item title' })).toHaveValue('Keep these words');
  expect(screen.getByRole('alert')).toHaveTextContent('could not save');
});
