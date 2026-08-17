import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SelectionMenu from './SelectionMenu';
import { HIGHLIGHT_COLOR_OPTIONS } from '../../constants/highlightColors';

const baseProps = {
  rect: { top: 200, left: 400, width: 80, height: 18 },
  color: '#ffe082',
  saving: false,
  onColorChange: () => {},
  onHighlight: () => {},
  onAskLibrarian: () => {}
};

describe('SelectionMenu', () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(pointer: fine)',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn()
    }));
  });

  it('returns null when rect is missing', () => {
    const { container } = render(<SelectionMenu {...baseProps} rect={null} />);
    expect(container.firstChild).toBeNull();
  });

  /* Two things you can do to a sentence: keep it, or ask about it. There were
     four buttons and a tag field, which asked you to decide what kind of thing
     the sentence was before you had finished reading the paragraph. */
  it('positions itself above the selection and offers keeping it or asking about it', () => {
    render(<SelectionMenu {...baseProps} />);
    const menu = screen.getByRole('menu');
    // top = max(8, rect.top - 8) = 192; left = rect.left + width/2 = 440
    expect(menu.style.top).toBe('192px');
    expect(menu.style.left).toBe('440px');
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask about this' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2 + HIGHLIGHT_COLOR_OPTIONS.length);
    expect(screen.queryByPlaceholderText(/Tags/i)).toBeNull();
  });

  it('drives --selection-menu-x toward the pointer when motion is allowed', () => {
    render(<SelectionMenu {...baseProps} />);
    const menu = screen.getByRole('menu');
    expect(menu.className).toMatch(/is-magnetic/);

    // Simulate pointer moving right of rect center (440)
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 540, clientY: 200 }));
    });
    // rAF flushes asynchronously — run pending frames
    return new Promise((resolve) => {
      setTimeout(() => {
        const value = menu.style.getPropertyValue('--selection-menu-x');
        // Value lerps toward target; should be a positive px after at least one tick
        expect(value).toMatch(/px$/);
        const numeric = parseFloat(value);
        expect(numeric).toBeGreaterThan(0);
        resolve();
      }, 60);
    });
  });

  it('skips magnetic class when prefers-reduced-motion is set', () => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)' || query === '(pointer: fine)',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn()
    }));
    render(<SelectionMenu {...baseProps} />);
    const menu = screen.getByRole('menu');
    expect(menu.className).not.toMatch(/is-magnetic/);
  });

  it('forwards its outer ref to the parent', () => {
    const ref = React.createRef();
    render(<SelectionMenu {...baseProps} ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current.className).toMatch(/selection-menu/);
  });

  it('invokes action callbacks on click', () => {
    const onHighlight = jest.fn();
    const onAskLibrarian = jest.fn();
    render(<SelectionMenu {...baseProps} onHighlight={onHighlight} onAskLibrarian={onAskLibrarian} />);
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask about this' }));
    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(onAskLibrarian).toHaveBeenCalledTimes(1);
  });
});
