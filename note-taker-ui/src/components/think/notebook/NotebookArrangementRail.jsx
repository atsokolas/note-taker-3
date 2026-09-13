import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QuietButton } from '../../ui';
import { useFinePointer, usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import { pieceIndexNearOffset } from '../../../utils/notebookArrangement';

const MARK_SIZE_PX = 28;

const editorShell = (editor) => {
  const prose = editor?.view?.dom;
  if (typeof prose?.closest !== 'function') return null;
  return prose.closest('.think-notebook-editor__body');
};

// Measure the same grouped passage that Move/Try without operate on. A source
// attached to a paragraph belongs inside the bracket too.
const measurePassages = (editor, pieces) => {
  const shell = editorShell(editor);
  const rects = [];
  editor?.state?.doc?.forEach?.((node, offset, index) => {
    rects[index] = editor.view.nodeDOM?.(offset)?.getBoundingClientRect?.();
  });
  const origin = shell ? shell.getBoundingClientRect().top - (shell.scrollTop || 0) : 0;
  return pieces.map(piece => {
    const nodes = rects.slice(piece.startIndex, piece.endIndex + 1).filter(Boolean);
    if (!shell || !nodes.length) return { top: 0, height: MARK_SIZE_PX };
    const top = Math.min(...nodes.map(rect => rect.top));
    const bottom = Math.max(...nodes.map(rect => rect.bottom));
    return { top: Math.max(0, top - origin), height: Math.max(MARK_SIZE_PX, bottom - top) };
  });
};

const readingOffsetPx = (shell) => {
  if (!shell?.getBoundingClientRect) return 0;
  const rect = shell.getBoundingClientRect();
  const line = Math.min(window.innerHeight * 0.28, 140);
  return Math.max(0, line - rect.top + (shell.scrollTop || 0));
};

const ArrangeMarkIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
    <circle cx="5" cy="4" r="1.15" fill="currentColor" />
    <circle cx="11" cy="4" r="1.15" fill="currentColor" />
    <circle cx="5" cy="8" r="1.15" fill="currentColor" />
    <circle cx="11" cy="8" r="1.15" fill="currentColor" />
    <circle cx="5" cy="12" r="1.15" fill="currentColor" />
    <circle cx="11" cy="12" r="1.15" fill="currentColor" />
  </svg>
);

const NotebookArrangementRail = ({
  editor = null,
  followSelection = false,
  pieces = [],
  currentPieceIndex = null,
  asidePieces = [],
  receipt = null,
  enabled = false,
  onReveal,
  onMove,
  onUndo,
  onSetAside,
  onRestore,
  onDeletePiece
}) => {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [bounds, setBounds] = useState({ top: 0, height: MARK_SIZE_PX });
  const keyboardOpenRef = useRef(false);
  const markRef = useRef(null);
  const [placeAbove, setPlaceAbove] = useState(false);
  const [trackedIndex, setTrackedIndex] = useState(
    Number.isInteger(currentPieceIndex) ? currentPieceIndex : null
  );
  const reducedMotion = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const motionOk = !reducedMotion && finePointer;
  const tracked = Number.isInteger(trackedIndex) ? (pieces[trackedIndex] || null) : null;
  const canMoveUp = enabled && Number.isInteger(trackedIndex) && trackedIndex > 0;
  const canMoveDown = enabled
    && Number.isInteger(trackedIndex)
    && trackedIndex < pieces.length - 1;
  const showMark = pieces.length > 0 || asidePieces.length > 0 || Boolean(receipt);

  useLayoutEffect(() => {
    if (!showMark) {
      setBounds({ top: 0, height: MARK_SIZE_PX });
      setTrackedIndex(null);
      return undefined;
    }
    const sync = () => {
      const shell = editorShell(editor);
      const positions = measurePassages(editor, pieces);
      const offsets = positions.map(position => position.top);
      const caretIndex = Number.isInteger(currentPieceIndex) && pieces[currentPieceIndex]
        ? currentPieceIndex
        : null;
      const nextIndex = open && !followSelection && pieces[trackedIndex]
        ? trackedIndex
        : followSelection && Number.isInteger(caretIndex)
        ? caretIndex
        : pieceIndexNearOffset(offsets, readingOffsetPx(shell));
      setTrackedIndex(Number.isInteger(nextIndex) ? nextIndex : caretIndex);
      const next = positions[nextIndex] || { top: 0, height: MARK_SIZE_PX };
      setBounds(previous => previous.top === next.top && previous.height === next.height ? previous : next);
    };
    sync();
    const prose = editor?.view?.dom;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    if (prose) observer?.observe(prose);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, { passive: true, capture: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [showMark, editor, pieces, currentPieceIndex, followSelection, open, trackedIndex]);

  useEffect(() => {
    if (showMark) return undefined;
    setOpen(false);
    return undefined;
  }, [showMark]);

  useEffect(() => {
    if (!enabled || !showMark) return undefined;
    const onKey = event => {
      if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
      const inEditor = editor?.view?.dom?.contains(event.target);
      const inControls = rootRef.current?.contains(event.target);
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
        && event.key === '/' && (inEditor || inControls)) {
        event.preventDefault();
        event.stopPropagation();
        if (open) {
          setOpen(false);
          editor?.commands?.focus();
        } else {
          keyboardOpenRef.current = true;
          if (Number.isInteger(currentPieceIndex)) setTrackedIndex(currentPieceIndex);
          setOpen(true);
          onReveal?.(currentPieceIndex);
        }
      } else if (open && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        if (keyboardOpenRef.current) editor?.commands?.focus();
        else markRef.current?.focus();
      }
    };
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [editor, enabled, showMark, open, currentPieceIndex, onReveal]);

  useLayoutEffect(() => {
    if (open && keyboardOpenRef.current) {
      rootRef.current?.querySelector('.notebook-arrangement__controls button:not(:disabled)')?.focus();
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPlaceAbove(false);
      return undefined;
    }
    const panel = rootRef.current?.querySelector('.notebook-arrangement__panel');
    const mark = rootRef.current?.querySelector('.notebook-arrangement__mark');
    if (!panel || !mark) return undefined;
    const markRect = mark.getBoundingClientRect();
    const roomBelow = window.innerHeight - markRect.bottom;
    const nextAbove = panel.offsetHeight + 12 > roomBelow && markRect.top > panel.offsetHeight;
    setPlaceAbove(nextAbove);
    return undefined;
  }, [open, bounds.top, trackedIndex, receipt, asidePieces]);

  if (!showMark) return null;

  const label = tracked?.label || (asidePieces.length ? 'Passages set aside' : 'This passage');
  const markName = `Arrange this passage: ${label}`;

  const holdSelection = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const toggleOpen = (event) => {
    event.stopPropagation();
    keyboardOpenRef.current = false;
    const next = !open;
    setOpen(next);
    if (next) onReveal?.(Number.isInteger(trackedIndex) ? trackedIndex : undefined);
  };

  return (
    <div
      ref={rootRef}
      className={`notebook-arrangement${motionOk ? ' is-motion' : ''}${open ? ' is-open' : ''}${placeAbove ? ' is-above' : ''}`}
      data-notebook-arrangement="mark"
      style={{ top: bounds.top, '--passage-height': `${bounds.height}px` }}
      onMouseDown={holdSelection}
    >
      {tracked ? <span className="notebook-arrangement__bracket" aria-hidden="true" /> : null}
      <button
        ref={markRef}
        type="button"
        className="notebook-arrangement__mark"
        aria-label={markName}
        aria-keyshortcuts="Meta+/ Control+/"
        title="Arrange passage (⌘/ · Ctrl+/)"
        aria-expanded={open}
        aria-controls="notebook-arrangement-panel"
        onClick={toggleOpen}
      >
        <ArrangeMarkIcon />
      </button>
      {open ? (
        <div
          id="notebook-arrangement-panel"
          className="notebook-arrangement__panel"
          role="group"
          aria-label={tracked ? `This passage: ${tracked.label}` : 'Passages set aside'}
        >
          {tracked ? (
            <p className="notebook-arrangement__label">{tracked.label}</p>
          ) : null}
          <small className="notebook-arrangement__shortcut">⌘/ · Ctrl+/ <span>to open · Esc to return</span></small>
          <div className="notebook-arrangement__controls">
            <QuietButton
              disabled={!canMoveUp}
              onClick={() => onMove?.('up', trackedIndex)}
            >
              Move up
            </QuietButton>
            <QuietButton
              disabled={!canMoveDown}
              onClick={() => onMove?.('down', trackedIndex)}
            >
              Move down
            </QuietButton>
            <QuietButton
              disabled={!enabled || !tracked}
              aria-label="Try without this passage"
              onClick={() => onSetAside?.(trackedIndex)}
            >
              Try without
            </QuietButton>
            <QuietButton
              disabled={!enabled || !tracked}
              aria-label="Delete this passage"
              onClick={() => onDeletePiece?.(trackedIndex)}
            >
              Delete
            </QuietButton>
            {receipt ? (
              <QuietButton onClick={onUndo}>
                {receipt.label}
              </QuietButton>
            ) : null}
            {asidePieces.map((piece) => (
              <QuietButton
                key={piece.id}
                onClick={() => onRestore?.(piece.id)}
              >
                {`Bring back: ${piece.label}`}
              </QuietButton>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NotebookArrangementRail;
