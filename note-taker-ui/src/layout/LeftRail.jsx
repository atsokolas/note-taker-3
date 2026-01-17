import React from 'react';

const LeftRail = ({ children, collapsed }) => (
  <aside className={`three-pane__left ${collapsed ? 'is-collapsed' : ''}`}>
    {children}
  </aside>
);

export default LeftRail;
