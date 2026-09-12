import React, { useLayoutEffect, useState } from 'react';
import { QuietButton } from '../../ui';

const passageOffsetPx = (editor, piece) => {
  if (!editor || !piece) return 0;
  const prose = editor.view?.dom;
  const shell = typeof prose?.closest === 'function'
    ? prose.closest('.think-notebook-editor__body')
    : null;
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

const NotebookArrangementRail = ({
  editor = null,
  visible = false,
  pieces = [],
  currentPieceIndex = null,
  asidePieces = [],
  receipt = null,
  enabled = false,
  onMove,
  onUndo,
  onSetAside,
  onRestore,
  onDeletePiece
}) => {
  const [top, setTop] = useState(0);
  const current = Number.isInteger(currentPieceIndex)
    ? (pieces[currentPieceIndex] || null)
    : null;
  const canMoveUp = enabled && Number.isInteger(currentPieceIndex) && currentPieceIndex > 0;
  const canMoveDown = enabled
    && Number.isInteger(currentPieceIndex)
    && currentPieceIndex < pieces.length - 1;
  const showBar = visible && Boolean(current || asidePieces.length || receipt);

  useLayoutEffect(() => {
    if (!showBar || !current) {
      setTop(0);
      return undefined;
    }
    const sync = () => setTop(passageOffsetPx(editor, current));
    sync();
    const prose = editor?.view?.dom;
    window.addEventListener('resize', sync);
    prose?.addEventListener?.('scroll', sync, { passive: true });
    return () => {
      window.removeEventListener('resize', sync);
      prose?.removeEventListener?.('scroll', sync);
    };
  }, [showBar, editor, current]);

  if (!showBar) return null;

  return (
    <div
      className="notebook-arrangement"
      role="toolbar"
      aria-label={current ? `This passage: ${current.label}` : 'Passages set aside'}
      data-notebook-arrangement="bar"
      style={{ top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {current ? (
        <p className="notebook-arrangement__label">{current.label}</p>
      ) : null}
      <div className="notebook-arrangement__controls">
        <QuietButton
          disabled={!canMoveUp}
          onClick={() => onMove?.('up')}
        >
          Move up
        </QuietButton>
        <QuietButton
          disabled={!canMoveDown}
          onClick={() => onMove?.('down')}
        >
          Move down
        </QuietButton>
        <QuietButton
          disabled={!enabled || !current}
          aria-label="Try without this passage"
          onClick={() => onSetAside?.(currentPieceIndex)}
        >
          Try without
        </QuietButton>
        <QuietButton
          disabled={!enabled || !current}
          aria-label="Delete this passage"
          onClick={() => onDeletePiece?.(currentPieceIndex)}
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
  );
};

export default NotebookArrangementRail;
