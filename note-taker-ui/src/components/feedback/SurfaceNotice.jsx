import React from 'react';
import './SurfaceNotice.css';

const VARIANT_LABELS = {
  error: 'Needs attention',
  info: 'Update',
  recovering: 'Recovering',
  success: 'Ready',
  warning: 'Review',
  working: 'Working'
};

const normalizeVariant = (variant) => {
  const value = String(variant || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(VARIANT_LABELS, value) ? value : 'info';
};

const SurfaceNotice = ({
  actionLabel = '',
  children,
  className = '',
  label = '',
  onAction,
  title = '',
  variant = 'info'
}) => {
  const normalizedVariant = normalizeVariant(variant);
  const assertive = normalizedVariant === 'error';
  const classes = [
    'surface-notice',
    `surface-notice--${normalizedVariant}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} role={assertive ? 'alert' : 'status'} aria-live={assertive ? 'assertive' : 'polite'}>
      <span className="surface-notice__dot" aria-hidden="true" />
      <div className="surface-notice__body">
        <p className="surface-notice__label">{label || VARIANT_LABELS[normalizedVariant]}</p>
        {title ? <p className="surface-notice__title">{title}</p> : null}
        {children ? <div className="surface-notice__content">{children}</div> : null}
      </div>
      {actionLabel && typeof onAction === 'function' ? (
        <button type="button" className="surface-notice__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
};

export default SurfaceNotice;
