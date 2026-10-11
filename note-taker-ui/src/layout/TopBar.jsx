import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import FocusMode from '../components/think/FocusMode';
import { namesAThinkObject } from '../pages/thinkNotesModel';
import SystemStatus from './SystemStatus';
import { goToKeyFor } from '../navigation/appNavigation';

const TopBarMenuPopover = ({
  open,
  anchorRef,
  popoverRef,
  children,
  className = '',
  testId,
  id,
  ariaLabel,
  onKeyDown
}) => {
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
      id={id}
      ref={popoverRef}
      className={`topbar__menu-popover topbar__menu-popover--portal ${className}`.trim()}
      style={style}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      data-testid={testId}
    >
      {children}
    </div>,
    document.body
  );
};

const TopBar = ({
  rightSlot,
  primaryNav = [],
  utilityNav = [],
  secondaryNav = [],
  searchMode = 'field',
  onSearchOpen = null,
  accountMenuItems = [],
  className = '',
  systemStatus = null,
  onSystemStatusRetry = null,
  routeLocation = null
}) => {
  const routerLocation = useLocation();
  const location = routeLocation || routerLocation;
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const morePopoverRef = useRef(null);
  const accountMenuRef = useRef(null);
  const accountPopoverRef = useRef(null);
  const showMoreMenu = secondaryNav.length > 0 || utilityNav.length > 0;
  const showAccountMenu = accountMenuItems.length > 0;

  /* The rails are a Think idea, so the control appears only where there are
     rails to send away. */
  const onThink = String(location.pathname || '').startsWith('/think');
  const onNotebook = onThink && !namesAThinkObject(location.search) && !new URLSearchParams(location.search).get('explorationId');

  const isNavItemActive = useMemo(() => (item) => {
    if (typeof item.match === 'function') {
      return item.match(location);
    }
    return location.pathname === item.to;
  }, [location]);

  const openSearch = () => onSearchOpen?.();

  useEffect(() => {
    if (!moreOpen && !accountOpen) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (moreMenuRef.current?.contains(target)) return;
      if (morePopoverRef.current?.contains(target)) return;
      if (accountMenuRef.current?.contains(target)) return;
      if (accountPopoverRef.current?.contains(target)) return;
      setMoreOpen(false);
      setAccountOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        setAccountOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen, accountOpen]);

  const renderMenuItem = (item, onSelect, extraClass = '') => {
    const itemClass = `topbar__menu-item ${extraClass}`.trim();
    if (item.href) {
      return (
        <a
          key={item.label}
          className={itemClass}
          role="menuitem"
          href={item.href}
          target={item.external ? '_blank' : undefined}
          rel={item.external ? 'noopener noreferrer' : undefined}
          onClick={onSelect}
        >
          {item.label}
        </a>
      );
    }
    if (item.to) {
      return (
        <NavLink
          key={item.label}
          to={item.to}
          className={`${itemClass} ${isNavItemActive(item) ? 'is-active' : ''}`}
          role="menuitem"
          onClick={onSelect}
        >
          {item.label}
        </NavLink>
      );
    }
    return (
      <button
        key={item.label}
        type="button"
        className={itemClass}
        role="menuitem"
        onClick={() => {
          item.onClick?.();
          onSelect();
        }}
      >
        {item.label}
      </button>
    );
  };

  return (
    <header className={`topbar topbar--noeis ${className}`.trim()}>
      <div className="topbar__content">
        <div className="topbar__left">
          <div className="topbar__brand-nav">
            <NavLink to="/wiki" className="topbar__brand" aria-label="Noeis home">
              Noeis
            </NavLink>
            <nav className="topbar__primary-nav" aria-label="Primary navigation">
              {primaryNav.map((item) => {
                /* Hold G and each room says its own letter. The suggestion is
                   in the masthead you were already reading, it costs no layout
                   because it sits over the name rather than beside it, and it
                   is gone again the moment the chord lapses. Sighted-only on
                   purpose: it is a legend for a key press, and the ? overlay
                   is where the same list is read aloud. */
                const goToKey = goToKeyFor(item.to);
                return (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    className={`topbar__primary-link ${isNavItemActive(item) ? 'is-active' : ''}`}
                  >
                    {item.label}
                    {goToKey ? (
                      <span className="topbar__primary-key" aria-hidden="true">{goToKey.toUpperCase()}</span>
                    ) : null}
                  </NavLink>
                );
              })}
            </nav>
          </div>
          {/* Notebook owns its control in the left rail. Other Think surfaces
              keep the existing bar control. */}
          {onThink && !onNotebook ? <FocusMode /> : null}
        </div>
        {searchMode === 'field' ? (
          <div className="topbar__search-slot">
            <button
              type="button"
              className="topbar__search-wrap topbar__search-trigger"
              aria-label="Open command palette"
              onClick={openSearch}
            >
              <span className="topbar__search-icon" aria-hidden="true" />
              <span className="topbar__search-trigger-label">Search</span>
              <kbd
                className="topbar__search-kbd"
                aria-hidden="true"
                title="Open command palette (⌘K)"
              >
                ⌘K
              </kbd>
            </button>
          </div>
        ) : null}
        <div className="topbar__right">
          {searchMode === 'icon' && (
            <button
              type="button"
              className="topbar__icon-button"
              aria-label="Open command palette"
              title="Search"
              onClick={openSearch}
            >
              <span aria-hidden="true">⌕</span>
            </button>
          )}
          {systemStatus ? (
            <SystemStatus
              backgroundWork={systemStatus.backgroundWork}
              latestReceipt={systemStatus.latestReceipt}
              recentReceipts={systemStatus.recentReceipts}
              onClearRecentReceipts={systemStatus.clearRecentReceipts}
              recoverableFailure={systemStatus.recoverableFailure}
              onRetryFailure={onSystemStatusRetry}
            />
          ) : null}
          {utilityNav.map((item) => (
            item.href ? (
              <a
                key={item.label}
                className={`topbar__button topbar__utility-button ${item.essential ? 'topbar__utility-button--essential' : ''} ${isNavItemActive(item) ? 'is-active' : ''}`.trim()}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
              >
                {item.label}
              </a>
            ) : item.to ? (
              <NavLink
                key={item.label}
                to={item.to}
                className={`topbar__button topbar__utility-button ${item.essential ? 'topbar__utility-button--essential' : ''} ${isNavItemActive(item) ? 'is-active' : ''}`.trim()}
              >
                {item.label}
              </NavLink>
            ) : (
              <button
                key={item.label}
                type="button"
                className={`topbar__button topbar__utility-button ${item.essential ? 'topbar__utility-button--essential' : ''} ${isNavItemActive(item) ? 'is-active' : ''}`.trim()}
                onClick={() => item.onClick?.()}
              >
                {item.label}
              </button>
            )
          ))}
          {showMoreMenu && (
            <div className="topbar__menu" ref={moreMenuRef}>
              <button
                type="button"
                className={`topbar__button topbar__more-button ${moreOpen ? 'is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                data-testid="topbar-more-button"
                onClick={() => {
                  setMoreOpen((prev) => {
                    const next = !prev;
                    if (next) setAccountOpen(false);
                    return next;
                  });
                }}
              >
                More
              </button>
              <TopBarMenuPopover
                open={moreOpen}
                anchorRef={moreMenuRef}
                popoverRef={morePopoverRef}
                testId="topbar-more-menu"
              >
                {primaryNav.map((item) => renderMenuItem(
                  item,
                  () => setMoreOpen(false),
                  'topbar__menu-item--mobile-room'
                ))}
                {secondaryNav.map((item) => renderMenuItem(item, () => setMoreOpen(false)))}
                {/* Below 1240px the utility buttons are hidden — Connections
                    and Settings are the widest things in the bar and were
                    marked essential, so they survived every narrowing rule and
                    pushed the wordmark and nav on top of each other. They stay
                    reachable: they move in here. CSS decides which copy shows,
                    so there is no viewport state to keep in sync. */}
                {utilityNav.map((item) => renderMenuItem(
                  item,
                  () => setMoreOpen(false),
                  'topbar__menu-item--narrow-only'
                ))}
              </TopBarMenuPopover>
            </div>
          )}
          {showAccountMenu && (
            <div className="topbar__menu" ref={accountMenuRef}>
              <button
                type="button"
                className={`topbar__icon-button ${accountOpen ? 'is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label="Account"
                title="Account"
                data-testid="topbar-account-button"
                onClick={() => {
                  setAccountOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setMoreOpen(false);
                    }
                    return next;
                  });
                }}
              >
                <span className="topbar__avatar-glyph" aria-hidden="true" />
              </button>
              <TopBarMenuPopover
                open={accountOpen}
                anchorRef={accountMenuRef}
                popoverRef={accountPopoverRef}
                testId="topbar-account-menu"
              >
                {accountMenuItems.map((item) => renderMenuItem(item, () => setAccountOpen(false)))}
              </TopBarMenuPopover>
            </div>
          )}
          {rightSlot}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
