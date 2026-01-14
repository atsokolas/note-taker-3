import React from 'react';
import WorkspaceShell from '../../layouts/WorkspaceShell';

// Bug fix: Context must stay in the grid column so it never overlays the reader.
// Layout invariant: Context is a column, never a layer.
const LibraryShell = ({
  left,
  main,
  right,
  rightOpen,
  onToggleRight,
  leftOpen,
  onToggleLeft,
  leftToggleLabel,
  className,
  rightToggleLabel,
  persistRightOpen,
  actions
}) => (
  <WorkspaceShell
    title="Library"
    subtitle="Reading room for your saved work."
    eyebrow="Mode"
    left={left}
    main={main}
    right={right}
    rightTitle="Context"
    defaultRightOpen
    rightOpen={rightOpen}
    onToggleRight={onToggleRight}
    rightToggleLabel={rightToggleLabel}
    persistRightOpen={persistRightOpen}
    leftOpen={leftOpen}
    onToggleLeft={onToggleLeft}
    leftToggleLabel={leftToggleLabel}
    actions={actions}
    className={className}
  />
);

export default LibraryShell;
