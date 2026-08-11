import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MOBILE_DRAWER_QUERY = '(max-width: 1240px)';
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

const useMobileDrawer = () => {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia(MOBILE_DRAWER_QUERY).matches
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(MOBILE_DRAWER_QUERY);
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, []);

  return isMobile;
};

const RightDrawer = ({ title = 'Context', open, onToggle, children }) => {
  const isMobile = useMobileDrawer();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const wasMobileOpenRef = useRef(false);
  const titleId = useId();
  const safeTitle = String(title || 'Context').trim() || 'Context';
  const mobileOpen = Boolean(isMobile && mobileSheetOpen);

  const close = useCallback(() => {
    if (isMobile) {
      setMobileSheetOpen(false);
      return;
    }
    onToggle?.(false);
  }, [isMobile, onToggle]);

  useEffect(() => {
    if (!isMobile) setMobileSheetOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!mobileOpen) {
      if (wasMobileOpenRef.current) triggerRef.current?.focus();
      wasMobileOpenRef.current = false;
      return undefined;
    }

    wasMobileOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const firstFocusable = dialogRef.current?.querySelector(focusableSelector);
    (firstFocusable || dialogRef.current)?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll(focusableSelector) || []);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
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

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [close, mobileOpen]);

  if (isMobile) {
    const mobileDrawer = (
      <aside className={`right-drawer right-drawer--mobile ${mobileOpen ? 'is-open' : 'is-collapsed'}`} style={{ display: 'block', position: 'fixed', right: '16px', bottom: '16px', zIndex: 40 }}>
        {!mobileOpen ? (
          <button
            ref={triggerRef}
            type="button"
            className="right-drawer__mobile-trigger"
            onClick={() => setMobileSheetOpen(true)}
            aria-expanded="false"
            aria-haspopup="dialog"
            aria-controls={titleId}
            aria-label={`Open ${safeTitle}`}
            data-testid="agent-context-trigger"
          >
            Open {safeTitle}
          </button>
        ) : null}
        {mobileOpen ? (
          <div
            className="right-drawer__mobile-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 41, background: 'rgba(0, 0, 0, 0.45)' }}
          >
            <section
              ref={dialogRef}
              id={titleId}
              className="right-drawer__mobile-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${titleId}-title`}
              tabIndex="-1"
              data-testid="agent-context-sheet"
              style={{ position: 'absolute', right: 0, bottom: 0, left: 0, maxHeight: 'min(82vh, 48rem)', overflowY: 'auto', background: 'var(--vellum-panel, #fff)', padding: '20px' }}
            >
              <div className="three-pane__right-header">
                <h2 id={`${titleId}-title`} className="right-drawer__title">{safeTitle}</h2>
                <button
                  type="button"
                  className="right-drawer__header-icon"
                  onClick={close}
                  aria-label={`Close ${safeTitle}`}
                >
                  Close
                </button>
              </div>
              <div className="three-pane__right-body">{children}</div>
            </section>
          </div>
        ) : null}
      </aside>
    );
    return typeof document === 'undefined' ? mobileDrawer : createPortal(mobileDrawer, document.body);
  }

  return (
    <aside className={`right-drawer ${open ? 'is-open' : 'is-collapsed'}`}>
      <button
        ref={triggerRef}
        type="button"
        className="right-drawer__edge-toggle"
        onClick={() => onToggle?.(!open)}
        aria-expanded={open}
        aria-label={open ? 'Collapse right panel' : 'Expand right panel'}
        title={open ? `Collapse ${safeTitle}` : `Open ${safeTitle}`}
      >
        <span className="right-drawer__edge-toggle-icon" aria-hidden="true">{open ? '‹' : '›'}</span>
        <span className="right-drawer__edge-toggle-label">{safeTitle}</span>
      </button>
      {open ? (
        <div className="right-drawer__panel">
          <div className="three-pane__right-header">
            <span className="right-drawer__title">{safeTitle}</span>
            {onToggle ? (
              <button type="button" className="right-drawer__header-icon" onClick={close} aria-label={`Collapse ${safeTitle}`} title={`Collapse ${safeTitle}`}>
                ‹
              </button>
            ) : null}
          </div>
          <div className="three-pane__right-body">{children}</div>
        </div>
      ) : null}
    </aside>
  );
};

export default RightDrawer;
