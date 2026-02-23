import React from 'react';

const AppShell = ({ leftNav, topBar, children }) => (
  <div className="app-shell-new">
    {leftNav && (
      <aside className="app-shell-new__nav">
        {leftNav}
      </aside>
    )}
    <div className="app-shell-new__main">
      {topBar}
      <div className="app-shell-new__body">
        {children}
      </div>
    </div>
  </div>
);

export default AppShell;
