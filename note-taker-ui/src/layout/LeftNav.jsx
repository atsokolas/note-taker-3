import React from 'react';
import { NavLink } from 'react-router-dom';

const NavGlyph = ({ children }) => (
  <svg
    className="left-nav__icon-svg"
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
    strokeWidth="1.35"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const LABEL_ICONS = {
  Today: () => (
    <NavGlyph>
      <circle cx="7.5" cy="7.5" r="5.2" />
      <path d="M7.5 4.6V7.7L9.8 9" />
    </NavGlyph>
  ),
  Library: () => (
    <NavGlyph>
      <path d="M2.4 3.1h10.2v8.8H2.4z" />
      <path d="M5.1 3.1v8.8M9.2 3.1v8.8" />
    </NavGlyph>
  ),
  Think: () => (
    <NavGlyph>
      <path d="M2.7 7.5 7.5 2.7l4.8 4.8-4.8 4.8z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </NavGlyph>
  ),
  Map: () => (
    <NavGlyph>
      <circle cx="3.1" cy="7.5" r="1.2" />
      <circle cx="7.5" cy="3.2" r="1.2" />
      <circle cx="11.9" cy="7.5" r="1.2" />
      <circle cx="7.5" cy="11.8" r="1.2" />
      <path d="M4.1 6.7 6.5 4.2m1.9 0 2.5 2.5m0 1.6-2.5 2.5m-1.9 0-2.4-2.4" />
    </NavGlyph>
  ),
  'Return Queue': () => (
    <NavGlyph>
      <path d="M4.1 4.8A4.2 4.2 0 0 1 11.4 7M10.9 4.9V7.2H8.6" />
      <path d="M10.9 10.2A4.2 4.2 0 0 1 3.6 8M4.1 10.1V7.8h2.3" />
    </NavGlyph>
  ),
  Review: () => (
    <NavGlyph>
      <path d="M2.6 8.1 5.8 11l6.6-7.1" />
    </NavGlyph>
  ),
  Settings: () => (
    <NavGlyph>
      <circle cx="7.5" cy="7.5" r="1.8" />
      <path d="M7.5 2.6v1.4m0 7.1v1.3m4.9-4.9h-1.4m-7.1 0H2.6m8.2-3.5-1 1m-4.7 4.7-1 1m0-6.7 1 1m4.7 4.7 1 1" />
    </NavGlyph>
  ),
  'How To Use': () => (
    <NavGlyph>
      <path d="M5.9 5.6a1.7 1.7 0 1 1 2.9 1.3c-.8.7-1.3 1.1-1.3 2" />
      <circle cx="7.5" cy="11.5" r=".1" fill="currentColor" />
    </NavGlyph>
  ),
  default: () => (
    <NavGlyph>
      <circle cx="7.5" cy="7.5" r="1.8" />
    </NavGlyph>
  )
};

const LeftNav = ({ items = [] }) => (
  <div className="left-nav">
    <div className="left-nav__brand" aria-label="Noeis home">
      <span className="left-nav__brand-mark">N</span>
      <span className="left-nav__brand-copy">Noeis</span>
    </div>
    <nav className="left-nav__links" aria-label="Main navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `left-nav__link ${isActive ? 'is-active' : ''}`}
        >
          <span className="left-nav__icon" aria-hidden="true">
            {(LABEL_ICONS[item.label] || LABEL_ICONS.default)()}
          </span>
          <span className="left-nav__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  </div>
);

export default LeftNav;
