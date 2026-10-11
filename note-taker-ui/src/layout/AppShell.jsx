import React, { useCallback, useEffect, useRef, useState } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ⌘J (Ctrl+J elsewhere) asks, as ⌘K finds. */
export const isPartnerShortcut = event => (
  (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && String(event.key).toLowerCase() === 'j'
);

// The Partner is rendered here, beside the routed column, so that changing
// routes changes the column and nothing else: its conversation stays. It is a
// sheet you open, with its button or ⌘J, in every room.
const AppShell = ({
  leftNav,
  topBar,
  children,
  partner = null,
  surface = null
}) => {
  const [partnerOpen, setPartnerOpen] = useState(false);
  const isOpen = useRef(false);
  isOpen.current = partnerOpen;
  const triggerRef = useRef(null);
  const sheetRef = useRef(null);
  const returnFocus = useRef(null);

  const openPartner = useCallback(() => {
    if (isOpen.current) return;
    returnFocus.current = document.activeElement;
    setPartnerOpen(true);
  }, []);

  const closePartner = useCallback(() => {
    setPartnerOpen(false);
    const target = returnFocus.current?.isConnected ? returnFocus.current : triggerRef.current;
    window.requestAnimationFrame(() => target?.focus?.());
  }, []);

  useEffect(() => {
    if (!partner) return undefined;
    const onKeyDown = (event) => {
      if (!isPartnerShortcut(event)) return;
      event.preventDefault();
      if (isOpen.current) closePartner();
      else openPartner();
    };
    window.addEventListener('noeis:open-agent', openPartner);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('noeis:open-agent', openPartner);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [closePartner, openPartner, partner]);

  useEffect(() => {
    if (!partnerOpen) return undefined;
    sheetRef.current?.querySelector('input')?.focus();
    const containFocus = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        closePartner();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(sheetRef.current?.querySelectorAll(FOCUSABLE) || [])];
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
    window.addEventListener('keydown', containFocus);
    return () => window.removeEventListener('keydown', containFocus);
  }, [closePartner, partnerOpen]);

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
          <div className="app-shell-new__nav-content">
            {leftNav}
          </div>
        </aside>
      )}
      <div className="app-shell-new__main">
        {topBar}
        <div id="main-content" className="app-shell-new__body" tabIndex="-1">
          <div className="app-shell-new__column">{children}</div>
          {partner ? (
            <>
              <button
                ref={triggerRef}
                type="button"
                className="agent-rail-drawer__trigger"
                aria-expanded={partnerOpen}
                aria-controls="noeis-partner"
                aria-keyshortcuts="Meta+J Control+J"
                title="Partner · ⌘J"
                onClick={openPartner}
              >
                Partner
              </button>
              <div id="noeis-partner" className="agent-rail-drawer" data-open={partnerOpen ? 'true' : 'false'}>
                <button
                  type="button"
                  className="agent-rail-drawer__backdrop"
                  aria-label="Close Partner"
                  tabIndex={-1}
                  onClick={closePartner}
                />
                <div
                  ref={sheetRef}
                  className="agent-rail-drawer__sheet"
                  role={partnerOpen ? 'dialog' : undefined}
                  aria-modal={partnerOpen || undefined}
                  aria-label={partnerOpen ? 'Partner' : undefined}
                  inert={partnerOpen ? undefined : true}
                >
                  <button type="button" className="agent-rail-drawer__close" onClick={closePartner}>Close</button>
                  {partner}
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
