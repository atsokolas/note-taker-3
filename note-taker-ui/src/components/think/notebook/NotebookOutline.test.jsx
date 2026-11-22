import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NotebookOutline from './NotebookOutline';

let ids = 0;
const Harness = ({ initial = [], onWriteOut = () => true, written = new Set() }) => {
  const [points, setPoints] = useState(initial);
  return (
    <>
      <NotebookOutline points={points} written={written} createId={() => `n${ids += 1}`} onChange={setPoints} onWriteOut={onWriteOut} onGoTo={() => {}} />
      <output data-testid="outline">{points.map(point => `${'-'.repeat(point.depth)}${point.text}${point.blockId ? '*' : ''}`).join('|')}</output>
    </>
  );
};
const shape = () => screen.getByTestId('outline').textContent;
const point = (text, depth = 0, extra = {}) => ({ id: text, text, depth, folded: false, blockId: '', ...extra });

describe('the Outline rail', () => {
  it('starts an outline and grows it from the keyboard', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start an outline' }));
    const first = screen.getByRole('textbox', { name: 'Point' });
    expect(first).toHaveFocus();
    fireEvent.change(first, { target: { value: 'Keeping' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    const second = screen.getAllByRole('textbox', { name: 'Point' })[1];
    expect(second).toHaveFocus();
    fireEvent.change(second, { target: { value: 'The act' } });
    fireEvent.keyDown(second, { key: 'Tab' });
    expect(shape()).toBe('Keeping|-The act');
    fireEvent.keyDown(second, { key: 'Tab', shiftKey: true });
    expect(shape()).toBe('Keeping|The act');
  });

  it('moves a point with its branch, and folds it', () => {
    render(<Harness initial={[point('A'), point('a1', 1), point('B')]} />);
    const [, , b] = screen.getAllByRole('textbox', { name: 'Point' });
    fireEvent.keyDown(b, { key: 'ArrowUp', altKey: true });
    expect(shape()).toBe('B|A|-a1');
    fireEvent.click(screen.getByRole('button', { name: 'Fold A' }));
    expect(screen.getAllByRole('textbox', { name: 'Point' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Unfold A' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('writes a point out with ⌘↵ and inks it once the heading is in the draft', () => {
    const onWriteOut = jest.fn(() => true);
    const { unmount } = render(<Harness initial={[point('A'), point('a1', 1)]} onWriteOut={onWriteOut} />);
    fireEvent.keyDown(screen.getAllByRole('textbox', { name: 'Point' })[0], { key: 'Enter', metaKey: true });
    expect(onWriteOut.mock.calls[0][0].map(node => node.type)).toEqual(['heading', 'paragraph']);
    expect(shape()).toBe('A*|-a1');
    unmount();
    render(<Harness initial={[point('A', 0, { blockId: 'h1' })]} written={new Set(['h1'])} />);
    expect(screen.getByRole('button', { name: 'Go to it' })).toBeInTheDocument();
  });

  it('removes an empty point with Backspace, but never one with points under it', () => {
    render(<Harness initial={[point('A'), point('', 0)]} />);
    const [a, empty] = screen.getAllByRole('textbox', { name: 'Point' });
    fireEvent.keyDown(empty, { key: 'Backspace' });
    expect(shape()).toBe('A');
    expect(a).toHaveFocus();
  });
});
