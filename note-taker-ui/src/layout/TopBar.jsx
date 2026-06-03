import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import BrandGradient from '../components/BrandGradient';
import { THEME_OPTIONS } from '../settings/uiPreferences';
import { buildReferenceHandoffPath } from '../navigation/referenceHandoff';

const TopBar = ({
  rightSlot,
  brandEnergy = true,
  primaryNav = [],
  utilityNav = [],
  secondaryNav = [],
  searchMode = 'field',
  onSearchOpen = null,
  accountMenuItems = [],
  className = '',
  theme = 'auto',
  onThemeChange = null,
  themeSaving = false
}) => {
  // Theme cycling: auto → light → dark → auto. Single click on the pill
  // advances; popover under the pill exposes all 3 options for users who
  // want to pick directly.
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef(null);
  const cycleTheme = () => {
    if (!onThemeChange) return;
    const idx = THEME_OPTIONS.findIndex((option) => option.value === theme);
    const next = THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length] || THEME_OPTIONS[0];
    onThemeChange(next.value);
  };
  const currentThemeOption = useMemo(
    () => THEME_OPTIONS.find((option) => option.value === theme) || THEME_OPTIONS[0],
    [theme]
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const moreMenuRef = useRef(null);
  const accountMenuRef = useRef(null);
  const showMoreMenu = secondaryNav.length > 0;

  const isNavItemActive = useMemo(() => (item) => {
    if (typeof item.match === 'function') {
      return item.match(location);
    }
    return location.pathname === item.to;
  }, [location]);

  const openSearch = () => {
    if (onSearchOpen) {
      onSearchOpen();
      return;
    }
    navigate('/search');
  };

  const openReferenceHandoff = () => {
    navigate(buildReferenceHandoffPath({
      pathname: location.pathname,
      search: location.search
    }));
  };

  useEffect(() => {
    if (!themeMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (themeMenuRef.current?.contains(event.target)) return;
      setThemeMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setThemeMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [themeMenuOpen]);

  useEffect(() => {
    if (!moreOpen && !accountOpen) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (moreMenuRef.current?.contains(target)) return;
      if (accountMenuRef.current?.contains(target)) return;
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
            <button
              type="button"
              className="topbar__search-wrap topbar__search-trigger"
              aria-label="Open command palette"
              onClick={openSearch}
            >
              <span className="topbar__search-icon" aria-hidden="true" />
              <span className="topbar__search-trigger-label">Search fragments</span>
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
          <button
            type="button"
            className="topbar__button topbar__reference-button"
            onClick={openReferenceHandoff}
          >
            Reference…
          </button>
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
          {onThemeChange ? (
            <div className="topbar__menu topbar__theme-menu" ref={themeMenuRef}>
              <button
                type="button"
                className={`topbar__theme-pill ${themeSaving ? 'is-busy' : ''}`}
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen}
                aria-label={`Theme: ${currentThemeOption.label}. Click to cycle, right-click for options.`}
                title={`Theme: ${currentThemeOption.label} — click to cycle`}
                data-testid="topbar-theme-toggle"
                onClick={cycleTheme}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setThemeMenuOpen((prev) => !prev);
                }}
              >
                <span aria-hidden="true" className={`topbar__theme-icon topbar__theme-icon--${currentThemeOption.value}`} />
              </button>
              {themeMenuOpen && (
                <div className="topbar__menu-popover topbar__theme-popover" role="menu">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={option.value === theme}
                      className={`topbar__menu-item ${option.value === theme ? 'is-active' : ''}`}
                      onClick={() => {
                        onThemeChange(option.value);
                        setThemeMenuOpen(false);
                      }}
                    >
                      <span aria-hidden="true" className={`topbar__theme-icon topbar__theme-icon--${option.value}`} />
                      {option.label}
                      {option.value === 'auto' ? <span className="muted small" style={{ marginLeft: 'auto' }}>System</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
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
          {showMoreMenu && (
            <div className="topbar__menu" ref={moreMenuRef}>
              <button
                type="button"
                className={`topbar__button ${moreOpen ? 'is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
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
