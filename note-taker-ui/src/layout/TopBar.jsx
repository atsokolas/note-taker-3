import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandGradient from '../components/BrandGradient';

const TopBar = ({ rightSlot, theme = 'light', onThemeChange = () => {}, brandEnergy = true }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    const value = query.trim();
    if (!value) return;
    navigate(`/search?mode=keyword&q=${encodeURIComponent(value)}`);
  };

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
          <button
            type="button"
            className="topbar__button topbar__theme-pill"
            onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          {rightSlot}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
