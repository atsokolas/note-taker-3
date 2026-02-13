import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const TopBar = ({ navItems = [], rightSlot }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    const q = query.trim();
    if (!q) return;
    navigate(`/search?mode=keyword&q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="topbar">
      <div className="topbar__brand">Note Taker</div>
      <nav className="topbar__nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `topbar__link ${isActive ? 'is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="topbar__right">
        <input
          type="text"
          className="topbar__search"
          placeholder="Search notes and highlights…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {rightSlot}
      </div>
    </header>
  );
};

export default TopBar;
