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
    expect(screen.queryByRole('button', { name: 'Delete this passage' })).not.toBeInTheDocument();
    openArrange();
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
      receipt: {
        label: 'Undo moving “The exception is when the downside lands on someone else.”',
        operation: { kind: 'move' }
      },
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
  it.each(['metaKey', 'ctrlKey'])('opens the caret passage with %s+/ and returns focus with Escape', modifier => {
    const prose = document.createElement('div');
    prose.tabIndex = 0;
    document.body.appendChild(prose);
    const focus = jest.fn(() => prose.focus());
    const editor = { view: { dom: prose }, commands: { focus } };
    const onReveal = jest.fn();
    const { unmount } = renderRail({ editor, onReveal });
    try {
      fireEvent.keyDown(document.body, { key: '/', [modifier]: true });
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
      fireEvent.keyDown(prose, { key: '/', [modifier]: true, isComposing: true });
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
      fireEvent.keyDown(prose, { key: '/', [modifier]: true });
      expect(onReveal).toHaveBeenCalledWith(1);
      expect(screen.getByRole('button', { name: 'Move up' })).toHaveFocus();
      prose.addEventListener('keydown', event => event.preventDefault());
      prose.focus();
      fireEvent.keyDown(prose, { key: 'Escape' });
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
      expect(prose).toHaveFocus();
      expect(focus).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      prose.remove();
    }
  });

  it('brackets the paragraph and its attached source, follows reflow, and holds the target while the panel has focus', () => {
    const shell = document.createElement('div');
    shell.className = 'think-notebook-editor__body';
    const prose = document.createElement('div');
    shell.appendChild(prose);
    document.body.appendChild(shell);
    let shellTop = 100;
    let sourceBottom = 360;
    shell.getBoundingClientRect = () => ({ top: shellTop });
    const rects = [
      () => ({ top: shellTop + 10, bottom: shellTop + 50 }),
      () => ({ top: shellTop + 100, bottom: shellTop + 140 }),
      () => ({ top: shellTop + 150, bottom: shellTop + sourceBottom })
    ];
    const editor = {
      state: { doc: { forEach: fn => rects.forEach((_, index) => fn({}, index, index)) } },
      view: { dom: prose, nodeDOM: index => ({ getBoundingClientRect: rects[index] }) }
    };
    const { container, rerender, unmount } = renderRail({ editor });
    try {
      const rail = container.querySelector('[data-notebook-arrangement]');
      expect(rail).toHaveStyle({ top: '100px', '--passage-height': '260px' });
      sourceBottom = 420;
      fireEvent(window, new Event('resize'));
      expect(rail).toHaveStyle({ '--passage-height': '320px' });
      openArrange();
      rerender(<NotebookArrangementRail editor={editor} pieces={pieces} currentPieceIndex={1} enabled />);
      shellTop = 140;
      fireEvent.scroll(window);
      expect(screen.getByRole('group')).toHaveAccessibleName(`This passage: ${pieces[1].label}`);
      expect(rail).toHaveStyle({ top: '100px', '--passage-height': '320px' });
    } finally {
      unmount();
      shell.remove();
    }
  });

});
