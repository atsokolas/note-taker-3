import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import WorkNoteEditor from './WorkNoteEditor';

const content = '<h1 data-block-id="h1">Supplier</h1><p data-block-id="intro">Context stays.</p><h2 data-block-id="h2">3 November 2026</h2><p data-block-id="promise">Six weeks.</p><h3 data-block-id="h3">Follow-up</h3><p data-block-id="detail">Ask the team.</p><h2 data-block-id="next">4 November 2026</h2><p data-block-id="last">Four weeks.</p>';
const writing = () => screen.getByRole('textbox', { name: 'Work note writing' });
const contents = () => { fireEvent.click(screen.getByText('Contents')); return screen.getByRole('navigation', { name: 'Table of contents' }); };
beforeEach(() => localStorage.clear());
test('contents reflects heading levels; folding keeps complete HTML, blocks and undo history intact', () => {
  const changed = jest.fn(); render(<WorkNoteEditor note={{ _id: 'outline', content }} onChange={changed} />);
  const editor = writing().editor, original = editor.getHTML(), outline = contents();
  fireEvent.click(within(outline).getByRole('button', { name: 'Collapse section 3 November 2026' }));
  expect(writing().querySelector('[data-block-id="promise"]')).not.toBeVisible();
  expect(writing().querySelector('[data-block-id="h3"]')).not.toBeVisible();
  expect(writing().querySelector('[data-block-id="next"]')).toBeVisible();
  expect(editor.getHTML()).toBe(original); expect(changed).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Go to meeting date'), { target: { value: '2026-11-03' } });
  expect(writing().querySelector('[data-block-id="promise"]')).toBeVisible();
  expect(editor.state.selection.$from.parent.textContent).toBe('3 November 2026');
  fireEvent.change(screen.getByLabelText('Collapse heading level'), { target: { value: '1' } });
  expect(writing().querySelector('[data-block-id="last"]')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show all writing' }));
  expect(writing().querySelector('[data-block-id="last"]')).toBeVisible();
  expect(editor.getHTML()).toBe(original); expect(changed).not.toHaveBeenCalled();
});
test('fold preferences survive reload by stable heading identity and a source link reveals its passage', () => {
  const changed = jest.fn(), view = render(<WorkNoteEditor note={{ _id: 'source', content }} onChange={changed} />);
  contents(); fireEvent.click(screen.getByRole('button', { name: 'Collapse section Supplier' })); view.unmount();
  const next = render(<WorkNoteEditor note={{ _id: 'source', content }} onChange={changed} />);
  expect(writing().querySelector('[data-block-id="promise"]')).not.toBeVisible(); next.unmount();
  render(<WorkNoteEditor note={{ _id: 'source', content }} sourceBlock="promise" onChange={changed} />);
  expect(writing().querySelector('[data-block-id="promise"]')).toBeVisible();
  expect(writing().editor.state.doc.textBetween(writing().editor.state.selection.from, writing().editor.state.selection.to)).toBe('Six weeks.');
  expect(changed).not.toHaveBeenCalled();
});
test('heading styles edit the ordinary document and contents follows edits and keyboard selection into folded writing', () => {
  render(<WorkNoteEditor note={{ content: '<p data-block-id="one">Plan</p><p data-block-id="two">Details</p>' }} onChange={() => {}} />);
  act(() => writing().editor.commands.setTextSelection(1));
  fireEvent.change(screen.getByLabelText('Text style'), { target: { value: '1' } });
  expect(writing().firstChild.tagName).toBe('H1'); const outline = contents();
  fireEvent.click(within(outline).getByRole('button', { name: 'Collapse section Plan' }));
  expect(writing().lastChild).not.toBeVisible();
  act(() => writing().editor.commands.setTextSelection(writing().editor.state.doc.content.size - 1));
  expect(writing().lastChild).toBeVisible();
  act(() => writing().editor.commands.insertContent(' added'));
  expect(writing()).toHaveTextContent('Details added');
});
test('a removed source passage opens the note with an honest fallback', () => {
  render(<WorkNoteEditor note={{ content: '<p>Updated writing.</p>' }} sourceBlock="missing" onChange={() => {}} />);
  expect(screen.getByRole('status')).toHaveTextContent('The original passage has changed. Its source note is open.');
  expect(writing()).toHaveTextContent('Updated writing.');
});

test('folding a long note never serializes hidden content away and undo still edits the complete document', () => {
  const content = Array.from({ length: 80 }, (_, index) => `<h2 data-block-id="h-${index}">Topic ${index + 1}</h2><p data-block-id="p-${index}">Original words ${index + 1}.</p>`).join('');
  const changed = jest.fn(); render(<WorkNoteEditor note={{ _id: 'long', content }} onChange={changed} />);
  const editor = writing().editor; act(() => { editor.commands.setTextSelection(editor.state.doc.content.size - 1); editor.commands.insertContent(' Added.'); });
  contents(); fireEvent.change(screen.getByLabelText('Collapse heading level'), { target: { value: '2' } });
  expect(writing().querySelectorAll('[hidden]')).toHaveLength(80);
  expect(editor.getHTML()).toContain('Original words 80. Added.');
  act(() => editor.commands.undo());
  expect(editor.getHTML()).toContain('Original words 80.'); expect(editor.getHTML()).not.toContain('Added.');
  expect(changed.mock.calls.at(-1)[0].blocks.filter(block => block.type === 'paragraph')).toHaveLength(80);
});

test('a date header folds its own entry, shares the outline fold and survives reload', () => {
  const view = render(<WorkNoteEditor note={{ _id: 'dated', content }} onChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse entry 3 November 2026' }));
  expect(writing().querySelector('[data-block-id="promise"]')).not.toBeVisible();
  expect(writing().querySelector('[data-block-id="h3"]')).not.toBeVisible();
  expect(writing().querySelector('[data-block-id="last"]')).toBeVisible();
  expect(within(contents()).getByRole('button', { name: 'Expand section 3 November 2026' })).toHaveAttribute('aria-expanded', 'false');
  view.unmount(); render(<WorkNoteEditor note={{ _id: 'dated', content }} onChange={() => {}} />);
  const toggle = screen.getByRole('button', { name: 'Expand entry 3 November 2026' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(writing().querySelector('[data-block-id="promise"]')).toBeVisible();
  expect(writing().editor.getHTML()).not.toContain('work-entry-toggle');
});
