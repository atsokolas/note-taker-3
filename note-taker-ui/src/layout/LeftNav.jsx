import React from 'react';
import { NavLink } from 'react-router-dom';

const LABEL_ICONS = {
  Today: '◴',
  Library: '▤',
  Think: '◈',
  Map: '◎',
  'Return Queue': '↺',
  Review: '✓',
  Settings: '⚙',
  'How To Use': '?'
};

const LeftNav = ({ items = [] }) => (
  <div className="left-nav">
    <div className="left-nav__brand" aria-label="Note Taker home">
      <span className="left-nav__brand-mark">N</span>
      <span className="left-nav__brand-copy">Note Taker</span>
    </div>
    <nav className="left-nav__links" aria-label="Main navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `left-nav__link ${isActive ? 'is-active' : ''}`}
        >
          <span className="left-nav__icon" aria-hidden="true">{LABEL_ICONS[item.label] || '•'}</span>
          <span className="left-nav__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  </div>
);

export default LeftNav;
