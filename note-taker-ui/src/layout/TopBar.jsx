import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandGradient from '../components/BrandGradient';

const TopBar = ({
  rightSlot,
  brandEnergy = true,
  helpMenu = null
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const helpMenuRef = useRef(null);

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
      setHelpOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setHelpOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [helpOpen]);

  return (
    <header className="topbar">
      <BrandGradient variant="header" enabled={brandEnergy} />
      <div className="topbar__content">
        <div className="topbar__left">
          <div className="topbar__search-wrap">
            <span className="topbar__search-icon" aria-hidden="true">⌕</span>
            <input
              type="text"
              className="topbar__search"
              placeholder="Search notes and highlights..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
            />
          </div>
        </div>
        <div className="topbar__right">
          {helpMenu && (
            <div className="topbar__menu" ref={helpMenuRef}>
              <button
                type="button"
                className={`topbar__button ${helpOpen ? 'is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={helpOpen}
                onClick={() => setHelpOpen(prev => !prev)}
              >
                Help
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
                    Start tour
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
                    Resume tour
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
                    Restart tour
                  </button>
                </div>
              )}
            </div>
          )}
          <span className="topbar__mode-pill" aria-label="Theme mode">Dark</span>
          {rightSlot}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
