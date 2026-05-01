import React from 'react';

/**
 * EmptyState — single source of truth for the app's empty surfaces.
 *
 * Two variants:
 *   - "compact" (default): inline, column-level. Renders a muted line of
 *     copy with an optional inline action link. Mirrors the EmptyAction
 *     pattern from ThinkHome (PR #15).
 *   - "panel": full first-run shell with eyebrow / title / body / primary
 *     CTA / secondary link. Mirrors the LibraryArticleList first-run
 *     shell (PR #7) and the Concepts first-run shell (PR #14).
 *
 * Either variant can opt into the `panel` look with `variant="panel"`.
 *
 * Props (all optional except `text` for compact / `title` for panel):
 *   variant: 'compact' | 'panel'  (default 'compact')
 *   eyebrow: string               panel only — small uppercase label
 *   title: string                 panel only — primary headline
 *   text: string                  copy. compact: muted small line.
 *                                 panel: body paragraph below the title.
 *   actionLabel: string           label for the primary action
 *   onAction: () => void          handler — renders a <button>
 *   actionHref: string            alternative — renders an <a> instead
 *                                 (with target=_blank if external)
 *   actionExternal: boolean       open actionHref in a new tab
 *   secondaryLabel: string        panel only — small link below the CTA
 *   secondaryHref: string         where the secondary link goes
 *   secondaryRouterLink: ReactNode optional react-router <Link> instead
 *                                 of a plain <a>
 *   testId: string                data-testid on the wrapper for tests
 *   className: string             extra classes appended to the wrapper
 *   children: ReactNode           escape hatch for callers that need
 *                                 custom content alongside the standard
 *                                 layout (rendered after actions)
 *
 * Why a single component vs two:
 *   - Both variants share the same vocabulary (eyebrow/title/body/action +
 *     secondary). Keeping them under one component lets call sites swap
 *     density with a single prop, and prevents drift between the two
 *     existing patterns (which already drifted slightly on copy voice).
 */

const EmptyState = ({
  variant = 'compact',
  eyebrow,
  title,
  text,
  actionLabel,
  onAction,
  actionHref,
  actionExternal = false,
  secondaryLabel,
  secondaryHref,
  secondaryRouterLink,
  testId,
  className = '',
  children
}) => {
  const isPanel = variant === 'panel';

  // Action element. Prefer <a> when actionHref is set (so the user gets
  // browser middle-click / right-click semantics); otherwise <button>.
  const renderAction = () => {
    if (!actionLabel) return null;
    if (actionHref) {
      return (
        <a
          className={`empty-state__primary ${isPanel ? 'ui-quiet-button ui-quiet-button--primary' : 'empty-state__primary--inline'}`}
          href={actionHref}
          target={actionExternal ? '_blank' : undefined}
          rel={actionExternal ? 'noopener noreferrer' : undefined}
        >
          {actionLabel}
          {!isPanel ? <span aria-hidden="true">→</span> : null}
        </a>
      );
    }
    if (onAction) {
      return (
        <button
          type="button"
          className={`empty-state__primary ${isPanel ? 'ui-quiet-button ui-quiet-button--primary' : 'empty-state__primary--inline'}`}
          onClick={onAction}
        >
          {actionLabel}
          {!isPanel ? <span aria-hidden="true">→</span> : null}
        </button>
      );
    }
    return null;
  };

  const renderSecondary = () => {
    if (secondaryRouterLink) return secondaryRouterLink;
    if (secondaryLabel && secondaryHref) {
      return (
        <a className="empty-state__secondary muted small" href={secondaryHref}>
          {secondaryLabel}
        </a>
      );
    }
    return null;
  };

  if (isPanel) {
    return (
      <div
        className={`empty-state empty-state--panel ${className}`.trim()}
        data-testid={testId}
      >
        <div className="empty-state__copy">
          {eyebrow ? <span className="empty-state__eyebrow">{eyebrow}</span> : null}
          {title ? <h3 className="empty-state__title">{title}</h3> : null}
          {text ? <p className="empty-state__body">{text}</p> : null}
        </div>
        <div className="empty-state__actions">
          {renderAction()}
          {renderSecondary()}
        </div>
        {children}
      </div>
    );
  }

  // compact variant
  return (
    <div
      className={`empty-state empty-state--compact ${className}`.trim()}
      data-testid={testId}
    >
      {text ? <p className="empty-state__text muted small">{text}</p> : null}
      {renderAction()}
      {renderSecondary()}
      {children}
    </div>
  );
};

export default EmptyState;

/**
 * ErrorState — counterpart for error surfaces. Same vocabulary as the
 * EmptyState compact variant plus an optional retry button.
 *
 *   message: string         required — human-readable error copy
 *   onRetry: () => void     optional — renders a "Try again" button
 *   retryLabel: string      override the default "Try again" copy
 *   testId: string          data-testid on the wrapper
 *   className: string       extra classes
 *
 * Most existing error states render a flat <p> with the raw error text and
 * no recovery affordance. Use ErrorState whenever the operation is retryable
 * (network fetch, save, sync) so the user has a way out.
 */
export const ErrorState = ({
  message,
  onRetry,
  retryLabel = 'Try again',
  testId,
  className = ''
}) => (
  <div
    className={`error-state ${className}`.trim()}
    data-testid={testId}
    role="alert"
  >
    <p className="status-message error-message error-state__message">{message}</p>
    {onRetry ? (
      <button
        type="button"
        className="error-state__retry empty-state__primary--inline"
        onClick={onRetry}
      >
        {retryLabel}
        <span aria-hidden="true">↻</span>
      </button>
    ) : null}
  </div>
);
