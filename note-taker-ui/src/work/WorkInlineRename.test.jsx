import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkInlineRename from './WorkInlineRename';
import WorkProjectActions from './WorkProjectActions';

test('inline rename selects the current name, saves a trimmed name and cancels without saving', () => {
  const onSave = jest.fn(), onCancel = jest.fn();
  render(<WorkInlineRename value="BMS 5.0" label="Project name" onSave={onSave} onCancel={onCancel} />);
  const input = screen.getByRole('textbox', { name: 'Project name' });
  expect(input).toHaveFocus(); expect(input.selectionEnd).toBe(7);
  fireEvent.change(input, { target: { value: ' BMS 6.0 ' } });
  fireEvent.submit(input.closest('form'));
  expect(onSave).toHaveBeenCalledWith('BMS 6.0');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(onCancel).toHaveBeenCalledTimes(1); expect(onSave).toHaveBeenCalledTimes(1);
});

test('a blank or busy rename cannot submit', () => {
  const save = jest.fn();
  const { rerender } = render(<WorkInlineRename value=" " label="Name" onSave={save} onCancel={() => {}} />);
  fireEvent.submit(screen.getByRole('textbox').closest('form'));
  expect(save).not.toHaveBeenCalled();
  rerender(<WorkInlineRename value="Name" label="Name" onSave={save} onCancel={() => {}} busy />);
  expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
});

test('project actions use one vocabulary and only request deletion, never mutate records', () => {
  const record = { _id: 'bms', name: 'BMS 5.0' }, onAction = jest.fn(), onOpen = jest.fn();
  render(<WorkProjectActions record={record} onAction={onAction} onOpen={onOpen} />);
  const trigger = screen.getByLabelText('Actions for project BMS 5.0');
  for (const [label, action] of [['Rename', 'rename'], ['Edit description', 'description'], ['Delete project', 'delete']]) {
    fireEvent.click(trigger); fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onAction).toHaveBeenLastCalledWith(record, action);
  }
  fireEvent.click(trigger); fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
  expect(onOpen).toHaveBeenCalledWith('bms');
  expect(record).toEqual({ _id: 'bms', name: 'BMS 5.0' });
});

test('the project header mounts the shared inline editor without a modal', () => {
  const { WorkProject } = require('./WorkProjects.jsx');
  const save = jest.fn(), cancel = jest.fn();
  render(<WorkProject record={{ _id: 'p', name: 'BMS 5.0', createdAt: '2026-11-16T12:00:00Z' }} notes={[]} items={[]} today="2026-11-16" renaming onRenameSave={save} onRenameCancel={cancel} onSave={jest.fn()} />);
  const input = screen.getByRole('textbox', { name: 'Project name' });
  fireEvent.change(input, { target: { value: 'BMS 6.0' } });
  fireEvent.submit(input.closest('form'));
  expect(save).toHaveBeenCalledWith('BMS 6.0');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel rename' }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});


test('leaving project inline rename returns keyboard focus to the action trigger', () => {
  const { WorkProject } = require('./WorkProjects.jsx');
  const props = { record: { _id: 'p', name: 'Project' }, notes: [], items: [], today: '2026-11-16', onEdit: jest.fn(), onRenameSave: jest.fn(), onRenameCancel: jest.fn(), onSave: jest.fn() };
  const { rerender } = render(<WorkProject {...props} renaming />);
  expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus();
  rerender(<WorkProject {...props} renaming={false} />);
  expect(screen.getByLabelText('Actions for project Project')).toHaveFocus();
});
