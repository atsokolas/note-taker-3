import React from 'react';
import { NavLink } from 'react-router-dom';

const cx = (...classes) => classes.filter(Boolean).join(' ');

export const Page = ({ children, className }) => (
  <div className={cx('ui-page', className)}>{children}</div>
);

export const Card = ({ children, className }) => (
  <div className={cx('ui-card', className)}>{children}</div>
);

export const Button = ({ children, variant = 'primary', className, ...rest }) => (
  <button className={cx('ui-button', `ui-button-${variant}`, className)} {...rest}>
    {children}
  </button>
);

export const TagChip = ({ children, className, onClick }) => (
  <span className={cx('ui-tag-chip', onClick && 'clickable', className)} onClick={onClick}>
    {children}
  </span>
);

export const Sidebar = ({ brand = 'Note Taker', navItems = [], footer, onLogout, className }) => (
  <aside className={cx('ui-sidebar', className)}>
    <div className="ui-sidebar__brand">
      <div className="ui-sidebar__title">{brand}</div>
      {onLogout && (
        <button className="ui-button ui-button-ghost ui-sidebar__logout" onClick={onLogout}>
          Logout
        </button>
      )}
    </div>
    <nav className="ui-sidebar__nav">
      {navItems.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => cx('ui-nav-link', isActive && 'active')}
        >
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
    {footer && <div className="ui-sidebar__footer">{footer}</div>}
  </aside>
);

export default {
  Page,
  Card,
  Button,
  Sidebar,
  TagChip
};
