import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SelectionMenu from './SelectionMenu';

const baseProps = {
  rect: { top: 200, left: 400, width: 80, height: 18 },
  saving: false,
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

  /* The menu is positioned from range.getBoundingClientRect(), which is in
     viewport coordinates. .article-reader carries a backdrop-filter, and a
     filtered element becomes the containing block for its own position: fixed
     descendants — so a menu rendered inside the reader was offset by the whole
     article above the selection. It must leave the reader's subtree. */
  it('escapes the reader subtree so viewport coordinates mean the viewport', () => {
    const reader = document.createElement('div');
    reader.className = 'article-reader';
    document.body.appendChild(reader);

    render(<SelectionMenu {...baseProps} />, { container: reader });

    const menu = document.querySelector('.selection-menu');
    expect(menu).toBeInTheDocument();
    expect(reader.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);

    reader.remove();
  });

  it('anchors clear of the selection it was given, not on top of it', () => {
    render(<SelectionMenu {...baseProps} rect={{ top: 537, left: 748, width: 630, height: 20 }} />);
    const menu = document.querySelector('.selection-menu');
    expect(menu.style.top).toBe('507px');
    expect(menu.style.left).toBe('1063px');
    expect(menu.className).not.toContain('selection-menu--below');
  });

  /* Pinned above a selection near the top of the window, the menu used to be
     clamped to top: 8 and land on the words it was about. */
  it('flips below the selection when there is no room above it', () => {
    render(<SelectionMenu {...baseProps} rect={{ top: 20, left: 748, width: 630, height: 20 }} />);
    const menu = document.querySelector('.selection-menu');
    expect(menu.className).toContain('selection-menu--below');
    expect(menu.style.top).toBe('70px');
  });

  it('returns null when rect is missing', () => {
    const { container } = render(<SelectionMenu {...baseProps} rect={null} />);
    expect(container.firstChild).toBeNull();
  });

  /* Two things you can do to a sentence: keep it, or ask about it. There were
     once four buttons and a tag field, which asked you to decide what kind of
     thing the sentence was before you had finished reading the paragraph. */
  it('positions itself above the selection and offers keeping it or asking about it', () => {
    render(<SelectionMenu {...baseProps} />);
    const menu = screen.getByRole('menu');
    // top = max(8, rect.top - 8) = 192; left = rect.left + width/2 = 440
    expect(menu.style.top).toBe('170px');
    expect(menu.style.left).toBe('440px');
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask about this' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Tags/i)).toBeNull();
  });

  /* The inks are for a reader who keeps a taxonomy of their own. They come
     after the two actions, because choosing a colour is the rarer thing. */
  it('offers five inks, and keeps in the default when none is chosen', () => {
    const onHighlight = jest.fn();
    render(<SelectionMenu {...baseProps} onHighlight={onHighlight} />);

    const inks = screen.getAllByRole('button', { name: /^Highlight in / });
    expect(inks).toHaveLength(5);
    expect(inks.map(ink => ink.getAttribute('title')))
      .toEqual(['Yellow', 'Peach', 'Sage', 'Sky', 'Lilac']);

    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    expect(onHighlight).toHaveBeenCalledWith();

    fireEvent.click(screen.getByRole('button', { name: 'Highlight in sage' }));
    expect(onHighlight).toHaveBeenLastCalledWith('#cfe3b4');
  });

  it('will not offer an ink while a save is already in flight', () => {
    render(<SelectionMenu {...baseProps} saving />);
    screen.getAllByRole('button', { name: /^Highlight in / })
      .forEach(ink => expect(ink).toBeDisabled());
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
