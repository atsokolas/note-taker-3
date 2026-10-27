import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import WorkNoteEditor from './WorkNoteEditor';

test('existing writing keeps keyboard closed and retains formatted HTML with safe task links', () => {
  render(<WorkNoteEditor note={{ content: '<p><strong>Recorded words</strong> <a href="https://tasks.example.test/42">Check access</a></p>' }} onChange={() => {}} />);
  const writing = screen.getByRole('textbox', { name: 'Work note writing' });
  expect(writing).not.toHaveFocus(); expect(writing.querySelector('strong')).toHaveTextContent('Recorded words');
  expect(writing.querySelector('a')).toHaveAttribute('href', 'https://tasks.example.test/42');
  expect(screen.queryByText(/Partner|Material/)).toBeNull();
});
test('external URL insertion is explicit and emits canonical HTML and blocks together', () => {
  const changed = jest.fn(); render(<WorkNoteEditor note={{ content: '<p></p>' }} onChange={changed} />);
  fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'https://tasks.example.test/42' } });
  fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));
  expect(screen.getByRole('link', { name: 'https://tasks.example.test/42' })).toBeInTheDocument();
  expect(changed.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({ content: expect.stringContaining('href="https://tasks.example.test/42"'), blocks: expect.any(Array) }));
});

test('assigning stable block identities leaves the caret at the typed position', () => {
  render(<WorkNoteEditor note={{ content: '<p>abcd</p>' }} onChange={() => {}} />);
  const writing = screen.getByRole('textbox', { name: 'Work note writing' });
  const view = writing.editor.view;
  const { TextSelection } = require('@tiptap/pm/state');
  act(() => { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2))); view.dispatch(view.state.tr.insertText('X')); });
  expect(writing).toHaveTextContent('aXbcd'); expect(view.state.selection.from).toBe(3);
});
test('the shared editor remains editable through development StrictMode remounts', () => {
  render(<React.StrictMode><WorkNoteEditor note={{ content: '<p>Keep writing</p>' }} onChange={() => {}} /></React.StrictMode>);
  const writing = screen.getByRole('textbox', { name: 'Work note writing' });
  expect(writing.editor.isDestroyed).toBe(false);
  act(() => writing.editor.commands.insertContent('New '));
  expect(writing).toHaveTextContent('New Keep writing');
});

test('controlled local updates preserve repeated spaces, paragraph breaks and the typed caret', () => {
  function Writing() {
    const [note, setNote] = React.useState({ content: '<p><strong>Recorded words</strong></p>' });
    return <WorkNoteEditor note={note} onChange={patch => setNote(current => ({ ...current, ...patch }))} />;
  }
  render(<Writing />);
  const writing = screen.getByRole('textbox', { name: 'Work note writing' });
  const editor = writing.editor;
  act(() => editor.view.dispatch(editor.state.tr.insertText('Two  spaces ')));
  expect(editor.getText()).toBe('Two  spaces Recorded words');
  expect(editor.state.selection.from).toBe(13);
  act(() => editor.commands.splitBlock());
  act(() => editor.view.dispatch(editor.state.tr.insertText('Next  line ')));
  expect(editor.getText()).toBe('Two  spaces \n\nNext  line Recorded words');
  expect(editor.state.selection.from).toBe(26);
  expect(writing.querySelector('p:last-child strong')).toHaveTextContent('Recorded words');
});
test('a line starting [] or ? leaves the prose on Enter as a follow-up or a question', () => {
  const followUp = jest.fn(); render(<WorkNoteEditor note={{ content: '<p>Notes</p><p>[] Request 2024 cohort churn fri</p>' }} onChange={() => {}} onFollowUp={followUp} />);
  const writing = screen.getByRole('textbox', { name: 'Work note writing' }), view = writing.editor.view;
  act(() => { writing.editor.commands.focus('end'); });
  fireEvent.keyDown(view.dom, { key: 'Enter' });
  expect(followUp).toHaveBeenCalledWith({ kind: 'task', text: 'Request 2024 cohort churn fri' });
  expect(writing).toHaveTextContent('Notes'); expect(writing).not.toHaveTextContent('Request');
  act(() => { view.dispatch(view.state.tr.insertText('? Do the top two renew')); });
  fireEvent.keyDown(view.dom, { key: 'Enter' });
  expect(followUp).toHaveBeenLastCalledWith({ kind: 'question', text: 'Do the top two renew' });
  act(() => { view.dispatch(view.state.tr.insertText('Is this a question? Yes')); });
  fireEvent.keyDown(view.dom, { key: 'Enter' }); expect(followUp).toHaveBeenCalledTimes(2);
});
