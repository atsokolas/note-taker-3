import { useCallback, useEffect, useState } from 'react';

/**
 * @typedef {Object} SelectionAnchor
 * @property {string} text
 * @property {string} prefix
 * @property {string} suffix
 * @property {number} [startOffsetApprox]
 */

/**
 * @typedef {Object} SelectionState
 * @property {boolean} isOpen
 * @property {string} text
 * @property {DOMRect | null} rect
 * @property {SelectionAnchor | null} anchor
 */

const buildAnchor = (container, range, rawText) => {
  const containerText = container.innerText || container.textContent || '';
  const trimmedText = rawText.trim();
  if (!trimmedText) return null;

  const leadingWhitespace = rawText.length - rawText.trimStart().length;
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const baseOffset = preRange.toString().length;
  const startOffset = baseOffset + leadingWhitespace;
  const endOffset = startOffset + trimmedText.length;

  const prefix = containerText.slice(Math.max(0, startOffset - 30), startOffset);
  const suffix = containerText.slice(endOffset, endOffset + 30);

  return {
    text: trimmedText,
    prefix,
    suffix,
    startOffsetApprox: startOffset
  };
};

/**
 * @param {Object} params
 * @param {React.RefObject<HTMLElement>} params.containerRef
 * @param {React.RefObject<HTMLElement>} params.menuRef
 * @param {number} [params.minLength]
 */
/* Whether an event started inside the menu.

   Both guards below used to ask only `menuRef.current.contains(target)`. That
   is one ref away from being wrong: if the ref is not populated at the moment
   the event fires — a portal that has not attached yet, a browser that orders
   mousedown differently — the guard falls through and the selection is cleared
   before the click on Highlight ever runs its handler. The menu vanishes and
   nothing is saved, which is exactly what that failure looks like from the
   outside.

   The DOM already knows the answer and does not need a ref to say so. */
const startedInsideMenu = (event, menuRef) => {
  const target = event?.target;
  if (!target) return false;
  if (menuRef?.current?.contains?.(target)) return true;
  return Boolean(target.closest?.('.selection-menu'));
};

const useTextSelection = ({ containerRef, menuRef, minLength = 3 }) => {
  const [selectionState, setSelectionState] = useState(/** @type {SelectionState} */ ({
    isOpen: false,
    text: '',
    rect: null,
    anchor: null
  }));

  const clearSelection = useCallback(() => {
    setSelectionState({ isOpen: false, text: '', rect: null, anchor: null });
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }, []);

  /* Every one of these used to be a bare `return`, which left the previous
     selection standing: the menu kept its old position and its old text.
     Click anywhere else in the article and it did not go away, because a
     collapsed selection failed the length check and returned without saying
     so. Worse, the menu could then be offering to save a sentence you were no
     longer looking at.

     There is no state here worth preserving. If there is no selection to act
     on, the menu closes. */
  const close = useCallback(() => {
    setSelectionState(current => (current.isOpen
      ? { isOpen: false, text: '', rect: null, anchor: null }
      : current));
  }, []);

  const captureSelection = useCallback(() => {
    const container = containerRef.current;
    /* Unmounting, not deselecting. */
    if (!container) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return close();

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return close();

    const rawText = selection.toString();
    const trimmedText = rawText.trim();
    if (trimmedText.length < minLength) return close();

    const rect = range.getBoundingClientRect();
    const anchor = buildAnchor(container, range, rawText);

    return setSelectionState({
      isOpen: true,
      text: trimmedText,
      rect,
      anchor
    });
  }, [close, containerRef, minLength]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseUp = (event) => {
      if (startedInsideMenu(event, menuRef)) return;
      captureSelection();
    };
    const handleKeyUp = () => captureSelection();
    const handleScroll = () => clearSelection();

    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('keyup', handleKeyUp);
    container.addEventListener('scroll', handleScroll);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('keyup', handleKeyUp);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [captureSelection, clearSelection, containerRef, menuRef]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (startedInsideMenu(event, menuRef)) return;
      if (containerRef.current && containerRef.current.contains(event.target)) return;
      clearSelection();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [clearSelection, containerRef, menuRef]);

  return { selectionState, clearSelection };
};

export default useTextSelection;
