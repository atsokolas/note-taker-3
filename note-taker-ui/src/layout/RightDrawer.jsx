import React from 'react';

const RightDrawer = ({ title = 'Context', open, onToggle, children }) => (
  <aside className={`right-drawer ${open ? 'is-open' : 'is-collapsed'}`} aria-hidden={!open}>
    <button
      type="button"
      className="right-drawer__edge-toggle"
      onClick={() => onToggle?.(!open)}
      aria-expanded={open}
      aria-label={open ? 'Collapse right panel' : 'Expand right panel'}
    >
      <span>{open ? '→' : '←'}</span>
      <span>{title}</span>
    </button>
    {open && (
      <div className="right-drawer__panel">
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
      </div>
    )}
  </aside>
);

export default RightDrawer;
