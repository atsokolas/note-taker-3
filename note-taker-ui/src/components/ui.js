import React from 'react';
import { Link } from 'react-router-dom';

const cx = (...classes) => classes.filter(Boolean).join(' ');

export const Page = ({ children, className, ...rest }) => (
  <div className={cx('ui-page', className)} {...rest}>{children}</div>
);

export const Card = ({ children, className, ...rest }) => (
  <div className={cx('ui-card', className)} {...rest}>{children}</div>
);

export const SurfaceCard = ({ children, className, ...rest }) => (
  <section className={cx('ui-surface-card', className)} {...rest}>{children}</section>
);

/* One button. Plain is the house control, quiet sits inside lists and
   toolbars, primary is the one thing the page wants next. */
const BUTTON_CLASSES = {
  plain: 'ui-button',
  quiet: 'ui-quiet-button',
  primary: 'ui-button ui-button-primary'
};

/* For a Link or anchor that should read as a button. */
export const buttonClass = (variant = 'plain', className) => cx(BUTTON_CLASSES[variant] || BUTTON_CLASSES.plain, className);

export const Button = ({ children, variant = 'plain', className, type = 'button', ...rest }) => (
  <button type={type} className={buttonClass(variant, className)} {...rest}>
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

/* Eyebrow, title, one-line lede; actions sit to the right. */
export const PageHeader = ({ eyebrow, title, lede, actions, titleId, className, children }) => (
  <header className={cx('ui-page-header', className)}>
    <div className="ui-page-header__copy">
      {eyebrow ? <div className="ui-page-header__eyebrow">{eyebrow}</div> : null}
      <h1 className="ui-page-header__title" id={titleId}>{title}</h1>
      {lede ? <p className="ui-page-header__lede">{lede}</p> : null}
      {children}
    </div>
    {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
  </header>
);

/* Silence is a state: say what is empty, and at most one way forward. */
export const EmptyState = ({ eyebrow, title, children, actions, className, ...rest }) => (
  <div className={cx('ui-empty-state', className)} {...rest}>
    {eyebrow ? <span className="ui-empty-state__eyebrow">{eyebrow}</span> : null}
    {title ? <h2 className="ui-empty-state__title">{title}</h2> : null}
    {children ? <div className="ui-empty-state__body">{children}</div> : null}
    {actions ? <div className="ui-empty-state__actions">{actions}</div> : null}
  </div>
);

export const SectionHeader = ({ title, subtitle, action, className }) => (
  <div className={cx('ui-section-header', className)}>
    <div className="ui-section-header__copy">
      {title && <div className="ui-section-header__title">{title}</div>}
      {subtitle && <div className="ui-section-header__subtitle">{subtitle}</div>}
    </div>
    {action && <div className="ui-section-header__action">{action}</div>}
  </div>
);

export const SubtleDivider = ({ className }) => (
  <hr className={cx('ui-subtle-divider', className)} />
);

export const Chip = ({ children, className, onClick }) => (
  <span className={cx('ui-chip', className, onClick && 'is-clickable')} onClick={onClick}>
    {children}
  </span>
);

export const PanelHeader = ({ title, action, className }) => (
  <div className={cx('ui-panel-header', className)}>
    <div className="ui-panel-header__title">{title}</div>
    {action && <div className="ui-panel-header__action">{action}</div>}
  </div>
);

export const SegmentedNav = ({ items = [], value = '', onChange = () => {}, className, appearance = 'default' }) => (
  <div
    className={cx('ui-segmented-nav', appearance === 'quiet' && 'ui-segmented-nav--quiet', className)}
    role="tablist"
    aria-label="Section navigation"
  >
    {items.map(item => (
      <button
        key={item.value}
        type="button"
        role="tab"
        aria-label={item.ariaLabel || item.label}
        aria-selected={value === item.value}
        className={cx('ui-segmented-nav__item', value === item.value && 'is-active')}
        onClick={() => onChange(item.value)}
      >
        <span className="ui-segmented-nav__label">{item.label}</span>
        {item.meta ? <span className="ui-segmented-nav__meta">{item.meta}</span> : null}
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
  PageHeader,
  EmptyState,
  SectionHeader,
  SubtleDivider,
  Chip,
  PanelHeader,
  SegmentedNav
};

export default ui;
