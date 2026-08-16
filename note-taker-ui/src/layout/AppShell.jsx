import React from 'react';
import BrandGradient from '../components/BrandGradient';

// The rail is rendered here, beside the routed column, so that changing routes
// changes the column and nothing else. Mounting it inside a page would make it
// arrive and leave with that page, which is precisely what it must not do.
const AppShell = ({ leftNav, topBar, children, rightRail = null, brandEnergy = true }) => (
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
      <div
        id="main-content"
        className={`app-shell-new__body${rightRail ? ' app-shell-new__body--railed' : ''}`}
        tabIndex="-1"
      >
        <div className="app-shell-new__column">{children}</div>
        {rightRail}
      </div>
    </div>
  </div>
);

export default AppShell;
