import React from 'react';

const RightDrawer = ({ title = 'Context', open, onToggle, children }) => (
  <aside className={`right-drawer ${open ? 'is-open' : 'is-collapsed'}`} aria-hidden={!open}>
    <button
      type="button"
      className="right-drawer__edge-toggle"
      onClick={() => onToggle?.(!open)}
      aria-expanded={open}
      aria-label={open ? 'Collapse right panel' : 'Expand right panel'}
      title={open ? `Collapse ${title}` : `Open ${title}`}
    >
      <span className="right-drawer__edge-toggle-icon" aria-hidden="true">{open ? '›' : '‹'}</span>
      <span className="right-drawer__edge-toggle-label">{title}</span>
    </button>
    {open && (
      <div className="right-drawer__panel">
        <div className="three-pane__right-header">
          <span className="right-drawer__title">{title}</span>
          {onToggle && (
            <button
              type="button"
              className="right-drawer__header-icon"
              onClick={() => onToggle(false)}
              aria-label={`Collapse ${title}`}
              title={`Collapse ${title}`}
            >
              ‹
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
