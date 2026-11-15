import React, { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import WorkNoteEditor from './WorkNoteEditor';
import { entryDay } from './workNoteEntries';
import { noteTitle } from './workSession';

function Journal({ initial = {}, today = '2026-11-04', changed = () => {} }) {
  const [note, setNote] = useState(initial);
  return <WorkNoteEditor note={note} today={today} onChange={patch => { changed(patch); setNote(current => ({ ...current, ...patch })); }} />;
}
const writing = () => screen.getByRole('textbox', { name: 'Work note writing' });
const date = day => fireEvent.change(screen.getByLabelText('Meeting entry date'), { target: { value: day } });
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add dated entry' }));
const type = words => act(() => writing().editor.commands.insertContent(words));

test('opening legacy rich writing and midnight rollover do not date, rewrite or save it', () => {
  const changed = jest.fn();
  const { rerender } = render(<Journal initial={{ content: '<p><strong>Supplier said six weeks.</strong></p>' }} changed={changed} />);
  expect(writing().querySelector('strong')).toHaveTextContent('Supplier said six weeks.');
  expect(screen.queryByRole('navigation', { name: 'Meeting dates' })).toBeNull();
  rerender(<Journal initial={{}} today="2026-11-05" changed={changed} />);
  expect(screen.getByLabelText('Meeting entry date')).toHaveValue('2026-11-05');
  expect(changed).not.toHaveBeenCalled();
  date('2026-10-20');
  rerender(<Journal today="2026-11-06" changed={changed} />);
  expect(screen.getByLabelText('Meeting entry date')).toHaveValue('2026-10-20');
});

test('explicitly dates existing words without replacing their formatting or changing note metadata', () => {
  const changed = jest.fn();
  render(<Journal initial={{ content: '<p data-block-id="original"><strong>Supplier said six weeks.</strong></p>', takenOn: '2026-01-01', occurredOn: '2026-02-01' }} changed={changed} />);
  date('2026-10-20'); fireEvent.click(screen.getByRole('button', { name: 'Date existing writing' }));
  expect(writing().firstChild).toHaveTextContent('20 October 2026');
  expect(writing().querySelector('strong')).toHaveTextContent('Supplier said six weeks.');
  const saved = changed.mock.calls.at(-1)[0];
  expect(saved.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'heading', level: 2, text: '20 October 2026' }), expect.objectContaining({ id: 'original', text: 'Supplier said six weeks.' })]));
  expect(Object.keys(saved).sort()).toEqual(['blocks', 'content']);
});

test('appends meetings and continues an existing date in its own section without duplicating headers', () => {
  render(<Journal />); add(); type('Supplier promised six weeks.');
  expect(writing().firstChild.tagName).toBe('H2');
  date('2026-11-11'); add(); type('Customer needs four weeks.');
  const dates = within(screen.getByRole('navigation', { name: 'Meeting dates' })).getAllByRole('option').slice(1);
  expect(dates.map(option => option.textContent)).toEqual(['11 November 2026', '4 November 2026']);
  date('2026-11-04'); fireEvent.click(screen.getByRole('button', { name: 'Continue this entry' })); type(' Ask about capacity.');
  expect(writing().querySelectorAll('h2')).toHaveLength(2);
  expect(writing().querySelector('h2 + p')).toHaveTextContent('Supplier promised six weeks. Ask about capacity.');
  expect(writing().lastChild).toHaveTextContent('Customer needs four weeks.');
  fireEvent.change(screen.getByLabelText('Go to meeting date'), { target: { value: '2026-11-11' } });
  expect(writing().editor.state.selection.$from.parent.textContent).toBe('11 November 2026');
});

test('dates and writing survive saved HTML reload and blocks-only recovery with no writes on mount', () => {
  const changed = jest.fn(); const first = render(<Journal changed={changed} />);
  add(); type('Promised six weeks.');
  date('2025-11-04'); add(); type('Last year they said four.');
  const saved = changed.mock.calls.at(-1)[0]; first.unmount(); changed.mockClear();
  const reloaded = render(<Journal initial={saved} changed={changed} />);
  expect(screen.getByRole('navigation', { name: 'Meeting dates' }).querySelectorAll('option')).toHaveLength(3);
  expect(writing()).toHaveTextContent('Promised six weeks.'); expect(changed).not.toHaveBeenCalled();
  reloaded.unmount();
  render(<Journal initial={{ blocks: saved.blocks }} changed={changed} />);
  expect(screen.getByRole('option', { name: '4 November 2025' })).toBeInTheDocument();
  expect(writing()).toHaveTextContent('Last year they said four.'); expect(changed).not.toHaveBeenCalled();
});

test('the index follows date correction, undo and heading removal rather than keeping stale metadata', () => {
  render(<Journal initial={{ content: '<h2>4 November 2026</h2><p>Their first answer.</p>' }} />);
  const editor = writing().editor;
  act(() => editor.view.dispatch(editor.state.tr.insertText('5 November 2026', 1, 16)));
  expect(screen.getByRole('option', { name: '5 November 2026' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '4 November 2026' })).toBeNull();
  act(() => editor.commands.undo());
  expect(screen.getByRole('option', { name: '4 November 2026' })).toBeInTheDocument();
  act(() => editor.chain().setTextSelection(1).setParagraph().run());
  expect(screen.queryByRole('navigation', { name: 'Meeting dates' })).toBeNull();
  expect(writing()).toHaveTextContent('Their first answer.');
});

test('repeating a heading-only date creates a place to write and empty dates cannot submit', () => {
  render(<Journal initial={{ content: '<h2>4 November 2026</h2>' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue this entry' })); type('Now there are words.');
  expect(writing().querySelector('p')).toHaveTextContent('Now there are words.');
  expect(writing().querySelectorAll('h2')).toHaveLength(1);
  date(''); expect(screen.getByRole('button', { name: 'Add dated entry' })).toBeDisabled();
});

test.each([['29 February 2024', '2024-02-29'], ['29 February 2025', ''], ['2026-11-04', '2026-11-04'], ['Supplier update', ''], ['4 Nov 2026', '2026-11-04'], ['4 november 2026', '2026-11-04']])('recognizes an unambiguous calendar date: %s', (label, expected) => expect(entryDay(label)).toBe(expected));


test('date headings do not replace the supplier or customer words used as an untitled note name', () => {
  const content = '<h2>4 November 2026</h2><p>Supplier said six weeks.</p>';
  expect(noteTitle({ content })).toBe('Supplier said six weeks.');
  expect(noteTitle({ content, blocks: [{ type: 'heading', level: 2, text: '4 November 2026' }, { type: 'paragraph', text: 'Supplier said six weeks.' }] })).toBe('Supplier said six weeks.');
  expect(noteTitle({ title: 'ACME', content })).toBe('ACME');
  expect(noteTitle({ content: '<h2>4 November 2026</h2><p></p>' })).toBe('Untitled note');
});
