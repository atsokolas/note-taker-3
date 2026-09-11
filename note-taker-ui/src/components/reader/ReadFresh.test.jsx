import React, { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ReadFresh, { useReadFresh } from './ReadFresh';

function Reader({ id = 'one', nested = false }) {
  const root = useRef(null);
  const reading = useReadFresh(root, id, 'p');
  return <div style={nested ? { overflowY: 'auto' } : undefined} data-testid="scroll-parent">
    <article ref={root} data-read-fresh={reading.readFresh || undefined}>
      <ReadFresh {...reading} />
      <p>A passage that stays.</p>
    </article>
  </div>;
}

afterEach(() => jest.restoreAllMocks());

it('preserves a visible passage in the actual scroll container in both directions', () => {
  render(<Reader nested />);
  const passage = screen.getByText('A passage that stays.');
  const scroller = screen.getByTestId('scroll-parent');
  Object.defineProperties(scroller, { scrollHeight: { value: 2000 }, clientHeight: { value: 800 } });
  scroller.scrollBy = jest.fn();
  jest.spyOn(passage, 'getBoundingClientRect').mockImplementation(() => ({
    top: passage.closest('article').hasAttribute('data-read-fresh') ? 120 : 300,
    bottom: 340, height: 40
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Read fresh' }));
  expect(scroller.scrollBy).toHaveBeenLastCalledWith({ top: -180, behavior: 'instant' });
  fireEvent.click(screen.getByRole('button', { name: 'Show my work' }));
  expect(scroller.scrollBy).toHaveBeenLastCalledWith({ top: 180, behavior: 'instant' });
  expect(screen.getByText('A passage that stays.')).toBe(passage);
});

it('starts ordinary reading after changing sources, including a return to the first source', () => {
  const view = render(<Reader />);
  fireEvent.click(screen.getByRole('button', { name: 'Read fresh' }));
  view.rerender(<Reader id="two" />);
  expect(screen.getByRole('button', { name: 'Read fresh' })).toHaveAttribute('aria-pressed', 'false');
  view.rerender(<Reader id="one" />);
  expect(screen.getByRole('button', { name: 'Read fresh' })).toHaveAttribute('aria-pressed', 'false');
});
