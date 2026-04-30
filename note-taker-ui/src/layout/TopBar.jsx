import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import BrandGradient from '../components/BrandGradient';

const TopBar = ({
  rightSlot,
  brandEnergy = true,
  helpMenu = null,
  primaryNav = [],
  utilityNav = [],
  secondaryNav = [],
  searchMode = 'field',
  accountMenuItems = [],
  className = ''
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const helpMenuRef = useRef(null);
  const moreMenuRef = useRef(null);
  const accountMenuRef = useRef(null);

  const isNavItemActive = useMemo(() => (item) => {
    if (typeof item.match === 'function') {
      return item.match(location);
    }
    return location.pathname === item.to;
  }, [location]);

  const handleSearch = () => {
    const value = query.trim();
    if (!value) return;
    navigate(`/search?mode=keyword&q=${encodeURIComponent(value)}`);
  };

  useEffect(() => {
    if (!helpOpen) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (helpMenuRef.current?.contains(target)) return;
      if (moreMenuRef.current?.contains(target)) return;
      if (accountMenuRef.current?.contains(target)) return;
      setHelpOpen(false);
      setMoreOpen(false);
      setAccountOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setHelpOpen(false);
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
  }, [helpOpen, moreOpen, accountOpen]);

  return (
    <header className={`topbar topbar--noeis ${className}`.trim()}>
      <BrandGradient variant="header" enabled={brandEnergy} />
      <div className="topbar__content">
        <div className="topbar__left">
          <div className="topbar__brand-nav">
            <NavLink to="/think?tab=home" className="topbar__brand" aria-label="Noeis Think home">
              Noeis
            </NavLink>
            <nav className="topbar__primary-nav" aria-label="Primary navigation">
              {primaryNav.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={`topbar__primary-link ${isNavItemActive(item) ? 'is-active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
        {searchMode === 'field' ? (
          <div className="topbar__search-slot">
            <div className="topbar__search-wrap">
              <span className="topbar__search-icon" aria-hidden="true" />
              <input
                type="text"
                className="topbar__search"
                placeholder="Search fragments"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSearch();
                }}
              />
              <kbd
                className="topbar__search-kbd"
                aria-hidden="true"
                title="Open command palette (⌘K)"
              >
                ⌘K
              </kbd>
            </div>
          </div>
        ) : null}
        <div className="topbar__right">
          {searchMode === 'icon' && (
            <button
              type="button"
              className="topbar__icon-button"
              aria-label="Search"
              title="Search"
              onClick={() => navigate('/search')}
            >
              <span aria-hidden="true">⌕</span>
            </button>
          )}
          {utilityNav.map((item) => (
            item.href ? (
              <a
                key={item.label}
                className={`topbar__button ${isNavItemActive(item) ? 'is-active' : ''}`.trim()}
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
                className={`topbar__button ${isNavItemActive(item) ? 'is-active' : ''}`.trim()}
              >
                {item.label}
              </NavLink>
            ) : (
              <button
                key={item.label}
                type="button"
                className={`topbar__button ${isNavItemActive(item) ? 'is-active' : ''}`.trim()}
                onClick={() => item.onClick?.()}
              >
                {item.label}
              </button>
            )
          ))}
          {secondaryNav.length > 0 && (
            <div className="topbar__menu" ref={moreMenuRef}>
              <button
                type="button"
                className={`topbar__button ${moreOpen ? 'is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onClick={() => {
                  setMoreOpen((prev) => {
                    const next = !prev;
                    if (next) setHelpOpen(false);
                    if (next) setAccountOpen(false);
                    return next;
                  });
                }}
              >
                More
              </button>
              {moreOpen && (
                <div className="topbar__menu-popover" role="menu">
                  {secondaryNav.map((item) => (
                    item.href ? (
                      <a
                        key={item.label}
                        className="topbar__menu-item"
                        role="menuitem"
                        href={item.href}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noopener noreferrer' : undefined}
                        onClick={() => setMoreOpen(false)}
                      >
                        {item.label}
                      </a>
                    ) : item.to ? (
                      <NavLink
                        key={item.label}
                        to={item.to}
                        className={`topbar__menu-item ${isNavItemActive(item) ? 'is-active' : ''}`}
                        role="menuitem"
                        onClick={() => setMoreOpen(false)}
                      >
                        {item.label}
                      </NavLink>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        className="topbar__menu-item"
                        role="menuitem"
                        onClick={() => {
                          item.onClick?.();
                          setMoreOpen(false);
                        }}
                      >
                        {item.label}
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          )}
          {helpMenu && (
            <div className="topbar__menu" ref={helpMenuRef}>
              <button
                type="button"
                className={`topbar__button topbar__tour-button ${helpOpen ? 'is-active' : ''} ${helpMenu.progress?.status === 'in_progress' || helpMenu.progress?.status === 'paused' ? 'has-progress' : ''}`.trim()}
                aria-haspopup="menu"
                aria-expanded={helpOpen}
                aria-label={
                  helpMenu.progress && (helpMenu.progress.status === 'in_progress' || helpMenu.progress.status === 'paused')
                    ? `Tour: ${helpMenu.progress.completed} of ${helpMenu.progress.total} steps complete`
                    : 'Tour'
                }
                title={
                  helpMenu.progress && (helpMenu.progress.status === 'in_progress' || helpMenu.progress.status === 'paused')
                    ? `Tour: ${helpMenu.progress.completed} of ${helpMenu.progress.total} steps complete`
                    : 'Tour'
                }
                data-testid="topbar-tour-button"
                onClick={() => {
                  setHelpOpen(prev => {
                    const next = !prev;
                    if (next) setMoreOpen(false);
                    if (next) setAccountOpen(false);
                    return next;
                  });
                }}
              >
                <span>Tour</span>
                {helpMenu.progress && (helpMenu.progress.status === 'in_progress' || helpMenu.progress.status === 'paused') && (
                  <span className="topbar__tour-progress" aria-hidden="true">
                    {helpMenu.progress.completed}/{helpMenu.progress.total}
                  </span>
                )}
              </button>
              {helpOpen && (
                <div className="topbar__menu-popover" role="menu">
                  <button
                    type="button"
                    className="topbar__menu-item"
                    role="menuitem"
                    onClick={() => {
                      setHelpOpen(false);
                      helpMenu.onStart?.();
                    }}
                  >
                    Start onboarding
                  </button>
                  <button
                    type="button"
                    className="topbar__menu-item"
                    role="menuitem"
                    onClick={() => {
                      setHelpOpen(false);
                      helpMenu.onResume?.();
                    }}
                    disabled={!helpMenu.canResume}
                  >
                    Resume onboarding
                  </button>
                  <button
                    type="button"
                    className="topbar__menu-item"
                    role="menuitem"
                    onClick={() => {
                      setHelpOpen(false);
                      helpMenu.onRestart?.();
                    }}
                  >
                    Restart onboarding
                  </button>
                </div>
              )}
            </div>
          )}
          {accountMenuItems.length > 0 && (
            <div className="topbar__menu" ref={accountMenuRef}>
              <button
                type="button"
                className={`topbar__icon-button ${accountOpen ? 'is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label="Account"
                title="Account"
                onClick={() => {
                  setAccountOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setMoreOpen(false);
                      setHelpOpen(false);
                    }
                    return next;
                  });
                }}
              >
                <span className="topbar__avatar-glyph" aria-hidden="true" />
              </button>
              {accountOpen && (
                <div className="topbar__menu-popover" role="menu">
                  {accountMenuItems.map((item) => (
                    item.href ? (
                      <a
                        key={item.label}
                        className="topbar__menu-item"
                        role="menuitem"
                        href={item.href}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noopener noreferrer' : undefined}
                        onClick={() => setAccountOpen(false)}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        className="topbar__menu-item"
                        role="menuitem"
                        onClick={() => {
                          item.onClick?.();
                          setAccountOpen(false);
                        }}
                      >
                        {item.label}
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          )}
          {rightSlot}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
