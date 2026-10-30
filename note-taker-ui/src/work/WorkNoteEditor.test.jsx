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
test.each(['[] Request 2024 cohort churn fri', '? Do the top two renew'])('ordinary Enter continues writing without converting %s', text => {
  const changed = jest.fn(), makeOpen = jest.fn(); render(<WorkNoteEditor note={{ content: `<p>${text}</p>` }} onChange={changed} onMakeOpen={makeOpen} />);
  const writing = screen.getByRole('textbox', { name: 'Work note writing' }); act(() => writing.editor.commands.focus('end'));
  fireEvent.keyDown(writing, { key: 'Enter' });
  expect(makeOpen).not.toHaveBeenCalled(); expect(writing).toHaveTextContent(text);
  expect(writing.editor.state.doc.childCount).toBe(2);
});
const startOpen = (content, select) => {
  const makeOpen = jest.fn(), changed = jest.fn(); render(<WorkNoteEditor note={{ content }} onChange={changed} onMakeOpen={makeOpen} />);
  const writing = screen.getByRole('textbox', { name: 'Work note writing' }), editor = writing.editor;
  act(() => select(editor)); const before = editor.getJSON();
  fireEvent.click(screen.getAllByRole('button', { name: 'Make Open', hidden: true }).at(-1));
  expect(editor.getJSON()).toEqual(before); expect(changed).not.toHaveBeenCalled();
  return { editor, makeOpen };
};
test('Make Open uses selected words literally and returns the mapped writing selection', () => {
  const { editor, makeOpen } = startOpen('<p>Ask tomorrow 2pm about scope.</p>', editor => editor.commands.setTextSelection({ from: 1, to: 17 }));
  expect(makeOpen).toHaveBeenCalledWith(expect.objectContaining({ text: 'Ask tomorrow 2pm', returnToWriting: expect.any(Function) }));
  act(() => editor.view.dispatch(editor.state.tr.insertText('New ', 1)));
  act(() => makeOpen.mock.calls[0][0].returnToWriting());
  expect(editor.state.selection.from).toBe(5); expect(editor.state.selection.to).toBe(21); expect(editor.view.dom).toHaveFocus();
});
test('Make Open at a nested bullet captures only its own paragraph', () => {
  const { makeOpen } = startOpen('<ul><li><p>Parent</p><ul><li><p>Nested words</p><ul><li><p>Descendant</p></li></ul></li></ul></li></ul>', editor => {
    let at; editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === 'Nested words') at = pos; });
    editor.commands.setTextSelection(at + 3);
  });
  expect(makeOpen.mock.calls[0][0].text).toBe('Nested words');
});
test('one multi-block selection becomes one complete editable title', () => {
  const { makeOpen } = startOpen('<p>First  line</p><p>Second line</p>', editor => editor.commands.selectAll());
  expect(makeOpen).toHaveBeenCalledTimes(1); expect(makeOpen.mock.calls[0][0].text).toBe('First  line\nSecond line');
});
test('Make Open does nothing during IME composition or on an empty paragraph', () => {
  const makeOpen = jest.fn(); render(<WorkNoteEditor note={{ content: '<p>Composing</p>' }} onChange={() => {}} onMakeOpen={makeOpen} />);
  const writing = screen.getByRole('textbox', { name: 'Work note writing' });
  fireEvent.compositionStart(writing); fireEvent.click(screen.getAllByRole('button', { name: 'Make Open', hidden: true }).at(-1));
  expect(makeOpen).not.toHaveBeenCalled(); fireEvent.compositionEnd(writing);
  act(() => writing.editor.commands.clearContent()); fireEvent.click(screen.getAllByRole('button', { name: 'Make Open', hidden: true }).at(-1));
  expect(makeOpen).not.toHaveBeenCalled();
});
