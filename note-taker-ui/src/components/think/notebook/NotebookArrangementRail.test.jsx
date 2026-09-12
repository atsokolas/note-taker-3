import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NotebookArrangementRail from './NotebookArrangementRail';

const pieces = [
  { startIndex: 0, endIndex: 0, pieceIndex: 0, label: 'Recoverable mistakes stay with the person who can reverse them.' },
  { startIndex: 1, endIndex: 2, pieceIndex: 1, label: 'The exception is when the downside lands on someone else.' }
];

const renderRail = (props = {}) => render(
  <NotebookArrangementRail
    followSelection
    pieces={pieces}
    currentPieceIndex={1}
    enabled
    {...props}
  />
);

const openArrange = (name = /Arrange this passage/) => {
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('NotebookArrangementRail', () => {
  it('stays a small mark until it is opened, with no persistent bar or piece list', () => {
    const { rerender } = render(
      <NotebookArrangementRail
        pieces={pieces}
        currentPieceIndex={1}
        enabled
      />
    );

    const mark = screen.getByRole('button', {
      name: 'Arrange this passage: Recoverable mistakes stay with the person who can reverse them.'
    });
    expect(mark.closest('[data-notebook-arrangement]')).toHaveAttribute('data-notebook-arrangement', 'mark');
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    expect(screen.queryByText('Arrangement')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    rerender(
      <NotebookArrangementRail
        followSelection
        pieces={pieces}
        currentPieceIndex={1}
        enabled
      />
    );

    expect(screen.getByRole('button', {
      name: 'Arrange this passage: The exception is when the downside lands on someone else.'
    })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    expect(screen.queryByText(pieces[0].label)).not.toBeInTheDocument();
  });

  it('opens on-demand arrange actions for the tracked passage', () => {
    const onMove = jest.fn();
    const onSetAside = jest.fn();
    const onDeletePiece = jest.fn();
    const onReveal = jest.fn();
    renderRail({
      onMove,
      onSetAside,
      onDeletePiece,
      onReveal
    });

    openArrange();
    expect(onReveal).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try without this passage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete this passage' }));

    expect(onMove).toHaveBeenCalledWith('up', 1);
    expect(onSetAside).toHaveBeenCalledWith(1);
    expect(onDeletePiece).toHaveBeenCalledWith(1);
  });

  it('keeps named undo and bring-back inside the opened panel', () => {
    const onUndo = jest.fn();
    const onRestore = jest.fn();
    renderRail({
      currentPieceIndex: 0,
      asidePieces: [{ id: 'aside-1', label: 'The exception is when the downside lands on someone else.' }],
      receipt: { label: 'Undo moving “The exception is when the downside lands on someone else.”' },
      onUndo,
      onRestore
    });

    expect(screen.queryByRole('button', {
      name: 'Undo moving “The exception is when the downside lands on someone else.”'
    })).not.toBeInTheDocument();

    openArrange(/Arrange this passage: Recoverable mistakes/);
    fireEvent.click(screen.getByRole('button', {
      name: 'Undo moving “The exception is when the downside lands on someone else.”'
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Bring back: The exception is when the downside lands on someone else.'
    }));
    expect(onUndo).toHaveBeenCalled();
    expect(onRestore).toHaveBeenCalledWith('aside-1');
  });

  it('closes the panel on Escape without leaving a bar on the essay', () => {
    renderRail();
    openArrange();
    expect(screen.getByRole('button', { name: 'Move up' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: 'Arrange this passage: The exception is when the downside lands on someone else.'
    })).toBeInTheDocument();
  });
});
