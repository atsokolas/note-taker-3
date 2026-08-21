import { renderHook, act } from '@testing-library/react';
import useTextSelection from './useTextSelection';

/* The menu would not go away. Every failure path in captureSelection was a
   bare `return`, so a collapsed selection — a plain click anywhere in the
   article — left the previous selection standing: same position, same text.
   The menu could then offer to save a sentence you were no longer looking at. */

const makeContainer = () => {
  const container = document.createElement('div');
  container.innerHTML = '<p>Some article text worth selecting here.</p>';
  document.body.appendChild(container);
  return container;
};

const selectionOver = (node, text) => ({
  rangeCount: 1,
  toString: () => text,
  removeAllRanges: jest.fn(),
  getRangeAt: () => ({
    commonAncestorContainer: node,
    startContainer: node.firstChild,
    startOffset: 0,
    getBoundingClientRect: () => ({ top: 200, left: 100, width: 300, height: 20 })
  })
});

describe('useTextSelection', () => {
  let container;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); jest.restoreAllMocks(); });

  const setup = () => renderHook(() => useTextSelection({
    containerRef: { current: container },
    menuRef: { current: null }
  }));

  const mouseUp = () => act(() => {
    container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('opens on a real selection', () => {
    const { result } = setup();
    jest.spyOn(window, 'getSelection').mockReturnValue(selectionOver(container, 'worth selecting'));
    mouseUp();
    expect(result.current.selectionState.isOpen).toBe(true);
    expect(result.current.selectionState.text).toBe('worth selecting');
  });

  it('closes when the selection collapses to a click', () => {
    const { result } = setup();
    jest.spyOn(window, 'getSelection').mockReturnValue(selectionOver(container, 'worth selecting'));
    mouseUp();
    expect(result.current.selectionState.isOpen).toBe(true);

    // A plain click: the range is still there, but there is no text in it.
    window.getSelection.mockReturnValue(selectionOver(container, ''));
    mouseUp();
    expect(result.current.selectionState.isOpen).toBe(false);
    expect(result.current.selectionState.text).toBe('');
    expect(result.current.selectionState.rect).toBeNull();
  });

  it('closes when the selection goes away entirely', () => {
    const { result } = setup();
    jest.spyOn(window, 'getSelection').mockReturnValue(selectionOver(container, 'worth selecting'));
    mouseUp();

    window.getSelection.mockReturnValue({ rangeCount: 0 });
    mouseUp();
    expect(result.current.selectionState.isOpen).toBe(false);
  });

  it('closes when the selection moves outside the article', () => {
    const { result } = setup();
    jest.spyOn(window, 'getSelection').mockReturnValue(selectionOver(container, 'worth selecting'));
    mouseUp();

    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    window.getSelection.mockReturnValue(selectionOver(elsewhere, 'something else entirely'));
    mouseUp();
    expect(result.current.selectionState.isOpen).toBe(false);
    elsewhere.remove();
  });

  it('never leaves a stale rect behind a closed menu', () => {
    const { result } = setup();
    jest.spyOn(window, 'getSelection').mockReturnValue(selectionOver(container, 'worth selecting'));
    mouseUp();
    window.getSelection.mockReturnValue(selectionOver(container, ''));
    mouseUp();
    expect(result.current.selectionState).toEqual({ isOpen: false, text: '', rect: null, anchor: null });
  });
});
