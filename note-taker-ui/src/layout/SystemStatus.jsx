import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildSystemStatusButtonLabel,
  buildSystemStatusLiveMessage,
  getSystemStatusTone,
  hasSystemStatusActivity
} from '../system/systemStatusModel';
import './system-status.css';

const SystemStatusPopover = ({ open, anchorRef, popoverRef, children }) => {
  const [style, setStyle] = useState({});

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return undefined;

    const updatePosition = () => {
      const rect = anchorRef.current.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
        zIndex: 220
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="system-status__popover topbar__menu-popover topbar__menu-popover--portal"
      style={style}
      role="region"
      aria-label="System status details"
      data-testid="system-status-popover"
    >
      {children}
    </div>,
    document.body
  );
};

const SystemStatus = ({
  backgroundWork = null,
  latestReceipt = null,
  recentReceipts = [],
  onClearRecentReceipts = null,
  recoverableFailure = null,
  onRetryFailure = null
}) => {
  const state = useMemo(() => ({
    backgroundWork,
    latestReceipt,
    recoverableFailure
  }), [backgroundWork, latestReceipt, recoverableFailure]);

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const popoverRef = useRef(null);
  const tone = getSystemStatusTone(state);
  const liveMessage = buildSystemStatusLiveMessage(state);
  const buttonLabel = buildSystemStatusButtonLabel(state);
  const shortLabel = useMemo(() => {
    if (recoverableFailure) return 'Needs review';
    if (backgroundWork) return backgroundWork.label;
    if (latestReceipt) return latestReceipt.title;
    return '';
  }, [backgroundWork, latestReceipt, recoverableFailure]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (popoverRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!hasSystemStatusActivity(state)) return null;

  return (
    <div
      className={`system-status system-status--${tone}`}
      data-testid="system-status"
      data-tone={tone}
      ref={menuRef}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
        <button
          type="button"
          className={`system-status__trigger topbar__icon-button ${open ? 'is-open' : ''}`.trim()}
          aria-label={buttonLabel}
          aria-expanded={open}
          aria-haspopup="true"
          title={liveMessage}
          data-testid="system-status-trigger"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="system-status__dot" aria-hidden="true" />
          <span className="system-status__label" aria-hidden="true">{shortLabel}</span>
        </button>
        <SystemStatusPopover open={open} anchorRef={menuRef} popoverRef={popoverRef}>
          {recoverableFailure ? (
            <section className="system-status__section system-status__section--failure" role="status">
              <p className="system-status__section-kicker">Recoverable failure</p>
              <p className="system-status__section-title">{recoverableFailure.stage}</p>
              <p className="system-status__section-body">{recoverableFailure.message}</p>
              {recoverableFailure.retryable !== false && onRetryFailure ? (
                <button
                  type="button"
                  className="system-status__retry"
                  onClick={() => {
                    onRetryFailure();
                    setOpen(false);
                  }}
                >
                  Retry
                </button>
              ) : null}
            </section>
          ) : null}
          {backgroundWork ? (
            <section className="system-status__section system-status__section--working" role="status">
              <p className="system-status__section-kicker">Background work</p>
              <p className="system-status__section-title">{backgroundWork.label}</p>
              {backgroundWork.stage ? (
                <p className="system-status__section-body">{backgroundWork.stage}</p>
              ) : null}
            </section>
          ) : null}
          {latestReceipt ? (
            <section className="system-status__section system-status__section--receipt" role="status">
              <p className="system-status__section-kicker">Latest receipt</p>
              <p className="system-status__section-title">{latestReceipt.title}</p>
              <p className="system-status__section-body">{latestReceipt.summary}</p>
              {latestReceipt.href ? (
                <a className="system-status__link" href={latestReceipt.href}>
                  View details
                </a>
              ) : null}
            </section>
          ) : null}
          {recentReceipts.length > 0 ? (
            <section
              className="system-status__section system-status__section--recent"
              aria-label="Recent activity"
              data-testid="system-status-recent-activity"
            >
              <div className="system-status__section-header">
                <p className="system-status__section-kicker">Recent activity</p>
                {onClearRecentReceipts ? (
                  <button
                    type="button"
                    className="system-status__clear"
                    onClick={onClearRecentReceipts}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              <ul className="system-status__recent-list">
                {recentReceipts.map((receipt, index) => {
                  const key = receipt.id || `${receipt.title}-${index}`;
                  return (
                    <li key={key} className="system-status__recent-item">
                      {receipt.href ? (
                        <a className="system-status__recent-link" href={receipt.href}>
                          <span className="system-status__recent-title">{receipt.title}</span>
                          {receipt.summary ? (
                            <span className="system-status__recent-summary">{receipt.summary}</span>
                          ) : null}
                        </a>
                      ) : (
                        <>
                          <span className="system-status__recent-title">{receipt.title}</span>
                          {receipt.summary ? (
                            <span className="system-status__recent-summary">{receipt.summary}</span>
                          ) : null}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </SystemStatusPopover>
    </div>
  );
};

export default SystemStatus;
