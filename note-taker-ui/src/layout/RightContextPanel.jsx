import React from 'react';

const RightContextPanel = ({ title = 'Context', open, onToggle, children }) => (
  <aside className={`three-pane__right ${open ? '' : 'is-collapsed'}`} aria-hidden={!open}>
    {open && (
      <>
        <div className="three-pane__right-header">
          <span>{title}</span>
          {onToggle && (
            <button type="button" className="topbar__button" onClick={() => onToggle(false)}>
              Collapse
            </button>
          )}
        </div>
        <div className="three-pane__right-body">
          {children}
        </div>
      </>
    )}
  </aside>
);

export default RightContextPanel;
