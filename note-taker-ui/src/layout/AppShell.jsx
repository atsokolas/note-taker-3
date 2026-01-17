import React from 'react';

const AppShell = ({ topBar, children }) => (
  <div className="app-shell-new">
    {topBar}
    <div className="app-shell-new__body">
      {children}
    </div>
  </div>
);

export default AppShell;
