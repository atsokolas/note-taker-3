import React from 'react';

const MainSurface = ({ header, actions, children }) => (
  <section className="three-pane__main">
    {(header || actions) && (
      <div className="three-pane__main-header">
        <div>{header}</div>
        {actions && <div className="three-pane__main-actions">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export default MainSurface;
