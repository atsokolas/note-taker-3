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

  const captureSelection = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const rawText = selection.toString();
    const trimmedText = rawText.trim();
    if (trimmedText.length < minLength) return;

    const rect = range.getBoundingClientRect();
    const anchor = buildAnchor(container, range, rawText);

    setSelectionState({
      isOpen: true,
      text: trimmedText,
      rect,
      anchor
    });
  }, [containerRef, minLength]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseUp = (event) => {
      if (menuRef?.current && menuRef.current.contains(event.target)) return;
      captureSelection();
    };
    const handleKeyUp = () => captureSelection();
    const handleScroll = () => clearSelection();

    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('keyup', handleKeyUp);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [captureSelection, clearSelection, containerRef, menuRef]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef?.current && menuRef.current.contains(event.target)) return;
      if (containerRef.current && containerRef.current.contains(event.target)) return;
      clearSelection();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [clearSelection, containerRef, menuRef]);

  return { selectionState, clearSelection };
};

export default useTextSelection;
