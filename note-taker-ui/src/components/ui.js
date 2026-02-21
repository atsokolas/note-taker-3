import React from 'react';
import { Link } from 'react-router-dom';

const cx = (...classes) => classes.filter(Boolean).join(' ');

export const Page = ({ children, className }) => (
  <div className={cx('ui-page', className)}>{children}</div>
);

export const Card = ({ children, className }) => (
  <div className={cx('ui-card', className)}>{children}</div>
);

export const SurfaceCard = ({ children, className }) => (
  <section className={cx('ui-surface-card', className)}>{children}</section>
);

export const Button = ({ children, variant = 'primary', className, ...rest }) => (
  <button className={cx('ui-button', `ui-button-${variant}`, className)} {...rest}>
    {children}
  </button>
);

export const TagChip = ({ children, className, onClick, to }) => {
  if (to) {
    return (
      <Link to={to} className={cx('ui-tag-chip', 'clickable', className)} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <span className={cx('ui-tag-chip', onClick && 'clickable', className)} onClick={onClick}>
      {children}
    </span>
  );
};

export const PageTitle = ({ eyebrow, title, subtitle, className }) => (
  <div className={cx('ui-page-title', className)}>
    {eyebrow && <div className="ui-page-title__eyebrow">{eyebrow}</div>}
    {title && <h1 className="ui-page-title__title">{title}</h1>}
    {subtitle && <p className="ui-page-title__subtitle">{subtitle}</p>}
  </div>
);

export const SectionHeader = ({ title, subtitle, action, className }) => (
  <div className={cx('ui-section-header', className)}>
    <div>
      {title && <div className="ui-section-header__title">{title}</div>}
      {subtitle && <div className="ui-section-header__subtitle">{subtitle}</div>}
    </div>
    {action && <div className="ui-section-header__action">{action}</div>}
  </div>
);

export const SubtleDivider = ({ className }) => (
  <hr className={cx('ui-subtle-divider', className)} />
);

export const Chip = ({ children, className }) => (
  <span className={cx('ui-chip', className)}>{children}</span>
);

export const QuietButton = ({ children, className, ...rest }) => (
  <button className={cx('ui-quiet-button', className)} {...rest}>
    {children}
  </button>
);

export const PanelHeader = ({ title, action, className }) => (
  <div className={cx('ui-panel-header', className)}>
    <div className="ui-panel-header__title">{title}</div>
    {action && <div className="ui-panel-header__action">{action}</div>}
  </div>
);

export const SegmentedNav = ({ items = [], value = '', onChange = () => {}, className }) => (
  <div className={cx('ui-segmented-nav', className)} role="tablist" aria-label="Section navigation">
    {items.map(item => (
      <button
        key={item.value}
        type="button"
        role="tab"
        aria-selected={value === item.value}
        className={cx('ui-segmented-nav__item', value === item.value && 'is-active')}
        onClick={() => onChange(item.value)}
      >
        {item.label}
      </button>
    ))}
  </div>
);

const ui = {
  Page,
  Card,
  SurfaceCard,
  Button,
  TagChip,
  PageTitle,
  SectionHeader,
  SubtleDivider,
  Chip,
  QuietButton,
  PanelHeader,
  SegmentedNav
};
export default ui;
