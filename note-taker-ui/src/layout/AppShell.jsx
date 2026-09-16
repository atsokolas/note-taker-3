import React, { useEffect, useRef, useState } from 'react';
import BrandGradient from '../components/BrandGradient';

// The rail is rendered here, beside the routed column, so that changing routes
// changes the column and nothing else. Mounting it inside a page would make it
// arrive and leave with that page, which is precisely what it must not do.
const AppShell = ({
  leftNav,
  topBar,
  children,
  rightRail = null,
  brandEnergy = true,
  surface = null,
  agentOnDemand = false
}) => {
  const [agentOpen, setAgentOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia?.('(max-width: 1080px)').matches);
  const onDemand = Boolean(agentOnDemand) || surface?.room === 'library' || compact;
  const showAgentTrigger = onDemand && !agentOnDemand;
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 1080px)');
    const change = () => setCompact(Boolean(media?.matches));
    const open = () => setAgentOpen(true);
    media?.addEventListener('change', change);
    window.addEventListener('noeis:open-agent', open);
    return () => { media?.removeEventListener('change', change); window.removeEventListener('noeis:open-agent', open); };
  }, []);
  const triggerRef = useRef(null);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!agentOpen || !onDemand) return undefined;
    const focusTarget = drawerRef.current?.querySelector('input, button, a, [tabindex="0"]');
    focusTarget?.focus();
    const containDrawerFocus = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        setAgentOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(drawerRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', containDrawerFocus);
    return () => window.removeEventListener('keydown', containDrawerFocus);
  }, [agentOpen, onDemand]);

  const closeAgent = () => {
    setAgentOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div
      className={`app-shell-new app-shell-new--stitch ${onDemand ? 'app-shell-new--agent-on-demand' : ''} ${leftNav ? 'app-shell-new--with-nav' : 'app-shell-new--navless'}`}
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
              {showAgentTrigger ? (
                <button
                  ref={triggerRef}
                  type="button"
                  className="agent-rail-drawer__trigger"
                  aria-expanded={agentOpen}
                  aria-controls="noeis-agent-drawer"
                  onClick={() => setAgentOpen(true)}
                >
                  {surface?.room === 'library' ? 'Ask about this' : 'Agent'}
                </button>
              ) : null}
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
                  inert={onDemand && !agentOpen ? true : undefined}
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
