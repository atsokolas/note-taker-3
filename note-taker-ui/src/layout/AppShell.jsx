import React, { useEffect, useRef, useState } from 'react';
import BrandGradient from '../components/BrandGradient';

// The rail is rendered here, beside the routed column, so that changing routes
// changes the column and nothing else. Mounting it inside a page would make it
// arrive and leave with that page, which is precisely what it must not do.
const AppShell = ({ leftNav, topBar, children, rightRail = null, brandEnergy = true, surface = null }) => {
  const [agentOpen, setAgentOpen] = useState(false);
  const triggerRef = useRef(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!agentOpen) return undefined;
    const focusTarget = drawerRef.current?.querySelector('input, button, a, [tabindex="0"]');
    focusTarget?.focus();
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setAgentOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [agentOpen]);

  const closeAgent = () => {
    setAgentOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div
      className={`app-shell-new app-shell-new--stitch ${leftNav ? 'app-shell-new--with-nav' : 'app-shell-new--navless'}`}
      data-noeis-surface={surface?.room || undefined}
      data-noeis-object-type={surface?.objectType || undefined}
      data-noeis-object-id={surface?.objectId || undefined}
    >
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
          {rightRail ? (
            <>
              <button
                ref={triggerRef}
                type="button"
                className="agent-rail-drawer__trigger"
                aria-expanded={agentOpen}
                aria-controls="noeis-agent-drawer"
                onClick={() => setAgentOpen(true)}
              >
                Agent
              </button>
              <div
                id="noeis-agent-drawer"
                className="agent-rail-drawer"
                data-open={agentOpen ? 'true' : 'false'}
              >
                <button
                  type="button"
                  className="agent-rail-drawer__backdrop"
                  aria-label="Close agent"
                  onClick={closeAgent}
                />
                <div
                  ref={drawerRef}
                  className="agent-rail-drawer__sheet"
                  role={agentOpen ? 'dialog' : undefined}
                  aria-modal={agentOpen || undefined}
                  aria-label={agentOpen ? 'Agent context' : undefined}
                >
                  <button
                    type="button"
                    className="agent-rail-drawer__close"
                    onClick={closeAgent}
                  >
                    Close
                  </button>
                  {rightRail}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AppShell;
