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

const passageOffsetPx = (editor, piece) => {
  if (!editor || !piece) return 0;
  const shell = editorShell(editor);
  if (!shell?.getBoundingClientRect) return 0;
  const doc = editor.state?.doc;
  let pos = null;
  if (typeof doc?.forEach === 'function') {
    doc.forEach((_node, offset, index) => {
      if (index === piece.startIndex) pos = offset + 1;
    });
  }
  let passageTop = 0;
  try {
    if (Number.isInteger(pos) && editor.view?.coordsAtPos) {
      const coords = editor.view.coordsAtPos(pos);
      if (Number.isFinite(coords?.top)) passageTop = coords.top;
    }
  } catch (_err) {
    passageTop = 0;
  }
  if (!passageTop && Number.isInteger(pos) && editor.view?.nodeDOM) {
    const node = editor.view.nodeDOM(pos);
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    if (el?.getBoundingClientRect) passageTop = el.getBoundingClientRect().top;
  }
  const shellRect = shell.getBoundingClientRect();
  return Math.max(0, passageTop - shellRect.top + (shell.scrollTop || 0));
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
  const [top, setTop] = useState(0);
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
      setTop(0);
      setTrackedIndex(null);
      return undefined;
    }
    const sync = () => {
      const shell = editorShell(editor);
      const offsets = pieces.map((piece) => passageOffsetPx(editor, piece));
      const caretIndex = Number.isInteger(currentPieceIndex) && pieces[currentPieceIndex]
        ? currentPieceIndex
        : null;
      const nextIndex = followSelection && Number.isInteger(caretIndex)
        ? caretIndex
        : pieceIndexNearOffset(offsets, readingOffsetPx(shell));
      setTrackedIndex(Number.isInteger(nextIndex) ? nextIndex : caretIndex);
      const raw = Number.isInteger(nextIndex) ? (offsets[nextIndex] || 0) : 0;
      const maxTop = Math.max(0, (shell?.scrollHeight || shell?.clientHeight || 0) - MARK_SIZE_PX);
      setTop(Math.max(0, Math.min(raw, maxTop || raw)));
    };
    sync();
    const prose = editor?.view?.dom;
    const shell = editorShell(editor);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, { passive: true, capture: true });
    prose?.addEventListener?.('scroll', sync, { passive: true });
    shell?.addEventListener?.('scroll', sync, { passive: true });
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      prose?.removeEventListener?.('scroll', sync);
      shell?.removeEventListener?.('scroll', sync);
    };
  }, [showMark, editor, pieces, currentPieceIndex, followSelection]);

  useEffect(() => {
    if (showMark) return undefined;
    setOpen(false);
    return undefined;
  }, [showMark]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (!showMark) return null;

  const label = tracked?.label || (asidePieces.length ? 'Passages set aside' : 'This passage');
  const markName = `Arrange this passage: ${label}`;

  const holdSelection = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const toggleOpen = (event) => {
    event.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next) onReveal?.(Number.isInteger(trackedIndex) ? trackedIndex : undefined);
  };

  return (
    <div
      ref={rootRef}
      className={`notebook-arrangement${motionOk ? ' is-motion' : ''}${open ? ' is-open' : ''}`}
      data-notebook-arrangement="mark"
      style={{ top }}
      onMouseDown={holdSelection}
    >
      <button
        type="button"
        className="notebook-arrangement__mark"
        aria-label={markName}
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
