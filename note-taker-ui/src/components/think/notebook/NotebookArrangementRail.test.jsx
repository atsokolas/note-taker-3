import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NotebookArrangementRail from './NotebookArrangementRail';

const pieces = [
  { startIndex: 0, endIndex: 0, pieceIndex: 0, label: 'Recoverable mistakes stay with the person who can reverse them.' },
  { startIndex: 1, endIndex: 2, pieceIndex: 1, label: 'The exception is when the downside lands on someone else.' }
];

describe('NotebookArrangementRail', () => {
  it('stays off the page until the caret is in a passage', () => {
    const { rerender } = render(
      <NotebookArrangementRail
        visible={false}
        pieces={pieces}
        currentPieceIndex={1}
        enabled
      />
    );

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.queryByText('Arrangement')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    rerender(
      <NotebookArrangementRail
        visible
        pieces={pieces}
        currentPieceIndex={1}
        enabled
      />
    );

    const bar = screen.getByRole('toolbar', {
      name: 'This passage: The exception is when the downside lands on someone else.'
    });
    expect(bar).toHaveAttribute('data-notebook-arrangement', 'bar');
    expect(screen.queryByText('Arrangement')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(pieces[0].label)).not.toBeInTheDocument();
  });

  it('applies move, set-aside, and delete to the caret passage', () => {
    const onMove = jest.fn();
    const onSetAside = jest.fn();
    const onDeletePiece = jest.fn();
    render(
      <NotebookArrangementRail
        visible
        pieces={pieces}
        currentPieceIndex={1}
        enabled
        onMove={onMove}
        onSetAside={onSetAside}
        onDeletePiece={onDeletePiece}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try without this passage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete this passage' }));

    expect(onMove).toHaveBeenCalledWith('up');
    expect(onSetAside).toHaveBeenCalledWith(1);
    expect(onDeletePiece).toHaveBeenCalledWith(1);
  });

  it('keeps named undo and bring-back on the same bar', () => {
    const onUndo = jest.fn();
    const onRestore = jest.fn();
    render(
      <NotebookArrangementRail
        visible
        pieces={pieces}
        currentPieceIndex={0}
        asidePieces={[{ id: 'aside-1', label: 'The exception is when the downside lands on someone else.' }]}
        receipt={{ label: 'Undo moving “The exception is when the downside lands on someone else.”' }}
        enabled
        onUndo={onUndo}
        onRestore={onRestore}
      />
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'Undo moving “The exception is when the downside lands on someone else.”'
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Bring back: The exception is when the downside lands on someone else.'
    }));
    expect(onUndo).toHaveBeenCalled();
    expect(onRestore).toHaveBeenCalledWith('aside-1');
  });
});
