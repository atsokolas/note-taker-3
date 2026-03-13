import React from 'react';
import BrandGradient from '../components/BrandGradient';

const AppShell = ({ leftNav, topBar, children, brandEnergy = true }) => (
  <div className="app-shell-new">
    {leftNav && (
      <aside className="app-shell-new__nav">
        <BrandGradient variant="sidebar" enabled={brandEnergy} />
        <div className="app-shell-new__nav-content">
          {leftNav}
        </div>
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
