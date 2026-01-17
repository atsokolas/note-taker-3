import React from 'react';
import { NavLink } from 'react-router-dom';

const TopBar = ({ navItems = [], rightSlot }) => (
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
      {rightSlot}
    </div>
  </header>
);

export default TopBar;
