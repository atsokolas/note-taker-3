import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SelectionMenu from './SelectionMenu';

const baseProps = {
  rect: { top: 200, left: 400, width: 80, height: 18 },
  color: '#ffe082',
  tagInput: '',
  saving: false,
  onColorChange: () => {},
  onTagInputChange: () => {},
  onHighlight: () => {},
  onAddConcept: () => {},
  onAddDump: () => {},
  onAddNotebook: () => {},
  onAddQuestion: () => {}
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

  it('positions itself above the selection rect and renders core actions', () => {
    render(<SelectionMenu {...baseProps} />);
    const menu = screen.getByRole('menu');
    // top = max(8, rect.top - 8) = 192; left = rect.left + width/2 = 440
    expect(menu.style.top).toBe('192px');
    expect(menu.style.left).toBe('440px');
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notebook' })).toBeInTheDocument();
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
    const onAddConcept = jest.fn();
    render(<SelectionMenu {...baseProps} onHighlight={onHighlight} onAddConcept={onAddConcept} />);
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Concept' }));
    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(onAddConcept).toHaveBeenCalledTimes(1);
  });
});
