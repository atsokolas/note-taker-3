import React from 'react';
import BrandGradient from '../components/BrandGradient';

const AppShell = ({ leftNav, topBar, children, brandEnergy = true }) => (
  <div className={`app-shell-new app-shell-new--stitch ${leftNav ? 'app-shell-new--with-nav' : 'app-shell-new--navless'}`}>
    <a className="app-shell-new__skip-link" href="#main-content">Skip to content</a>
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
      <div id="main-content" className="app-shell-new__body" tabIndex="-1">
        {children}
      </div>
    </div>
  </div>
);

export default AppShell;
