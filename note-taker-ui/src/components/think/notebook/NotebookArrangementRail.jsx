import React from 'react';
import { QuietButton } from '../../ui';

const NotebookArrangementRail = ({
  pieces = [],
  currentPieceIndex = 0,
  asidePieces = [],
  receipt = null,
  enabled = false,
  onMove,
  onUndo,
  onSetAside,
  onRestore,
  onDeletePiece
}) => {
  const current = pieces[currentPieceIndex] || null;
  const canMoveUp = enabled && currentPieceIndex > 0;
  const canMoveDown = enabled && currentPieceIndex < pieces.length - 1;

  return (
    <section className="notebook-arrangement" aria-label="Arrange this essay">
      <div className="notebook-arrangement__intro">
        <p className="notebook-arrangement__kicker">Arrangement</p>
        <p className="notebook-arrangement__copy">
          {current
            ? `This passage: ${current.label}`
            : 'Place the caret in a passage to move it.'}
        </p>
      </div>
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
          onClick={() => onSetAside?.(currentPieceIndex)}
        >
          Try without this passage
        </QuietButton>
        <QuietButton
          disabled={!enabled || !current}
          onClick={() => onDeletePiece?.(currentPieceIndex)}
        >
          Delete this passage
        </QuietButton>
        {receipt ? (
          <QuietButton onClick={onUndo}>
            {receipt.label}
          </QuietButton>
        ) : null}
      </div>
      {pieces.length ? (
        <ol className="notebook-arrangement__pieces">
          {pieces.map((piece) => (
            <li
              key={`${piece.startIndex}:${piece.label}`}
              className={piece.pieceIndex === currentPieceIndex ? 'is-current' : ''}
            >
              {piece.label}
            </li>
          ))}
        </ol>
      ) : null}
      {asidePieces.length ? (
        <div className="notebook-arrangement__aside" aria-label="Passages set aside">
          <p className="notebook-arrangement__kicker">Set aside</p>
          {asidePieces.map((piece) => (
            <QuietButton
              key={piece.id}
              onClick={() => onRestore?.(piece.id)}
            >
              {`Bring back: ${piece.label}`}
            </QuietButton>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default NotebookArrangementRail;
