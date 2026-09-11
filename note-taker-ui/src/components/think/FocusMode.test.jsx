import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FocusMode, { FOCUS_MODE_KEY, THINK_FOCUS_CLASS } from './FocusMode';
import { THINK_WRITING_CLASS } from './editor/useThinkWritingActivity';

describe('holding the rails away', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.classList.remove(THINK_WRITING_CLASS, THINK_FOCUS_CLASS);
  });

  /* The mark says which way the press goes: a measure with the rails still
     beside it, or a measure they have retreated from. */
  it('starts with the rails where they have always been', () => {
    render(<FocusMode />);
    expect(screen.getByRole('button', { name: 'Focus mode' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.body.classList.contains(THINK_FOCUS_CLASS)).toBe(false);
  });

  it('takes them away, and gives them back', () => {
    render(<FocusMode />);
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    expect(document.body.classList.contains(THINK_FOCUS_CLASS)).toBe(true);
    expect(screen.getByRole('button', { name: 'Exit focus mode' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Exit focus mode' }));
    expect(document.body.classList.contains(THINK_FOCUS_CLASS)).toBe(false);
  });

  /* A preference you have to restate every morning is not a preference. */
  it('is remembered', () => {
    const { unmount } = render(<FocusMode />);
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    unmount();

    render(<FocusMode />);
    expect(screen.getByRole('button', { name: 'Exit focus mode' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.body.classList.contains(THINK_FOCUS_CLASS)).toBe(true);
  });

  it('reads a held preference written before it mounted', () => {
    window.localStorage.setItem(FOCUS_MODE_KEY, '1');
    render(<FocusMode />);
    expect(document.body.classList.contains(THINK_FOCUS_CLASS)).toBe(true);
  });

  it('keeps manual focus independent of typing and clears it when leaving Think', () => {
    const { unmount } = render(<FocusMode inRail />);
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    document.body.classList.add(THINK_WRITING_CLASS);
    document.body.classList.remove(THINK_WRITING_CLASS);
    expect(document.body.classList.contains(THINK_FOCUS_CLASS)).toBe(true);

    unmount();
    expect(document.body.classList.contains(THINK_FOCUS_CLASS)).toBe(false);
    expect(window.localStorage.getItem(FOCUS_MODE_KEY)).toBe('1');
  });

  /* Writing holds the same class for its own reasons. Leaving Think while
     focus mode is off must not pull the rails off someone mid-sentence. */
  it('only takes back what it put there', () => {
    const { unmount } = render(<FocusMode />);
    document.body.classList.add(THINK_WRITING_CLASS);
    unmount();
    expect(document.body.classList.contains(THINK_WRITING_CLASS)).toBe(true);
  });

  it('survives a browser that refuses to remember anything', () => {
    const real = window.localStorage.getItem;
    window.localStorage.getItem = () => { throw new Error('denied'); };
    expect(() => render(<FocusMode />)).not.toThrow();
    expect(screen.getByRole('button', { name: 'Focus mode' })).toBeInTheDocument();
    window.localStorage.getItem = real;
  });
});
