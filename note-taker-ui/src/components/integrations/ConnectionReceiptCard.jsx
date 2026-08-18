import React from 'react';

const toneClass = (tone = 'neutral') => {
  if (tone === 'success' || tone === 'warning' || tone === 'neutral') {
    return `import-summary--${tone}`;
  }
  return 'import-summary--neutral';
};

export default function ConnectionReceiptCard({
  receipt,
  testId,
  providerLabel = 'Connection',
  onNextAction = null,
  nextActionBusy = false
}) {
  if (!receipt) return null;

  const announceLive = Boolean(receipt.isLive || receipt.failureStage);
  const statusText = receipt.liveMessage || receipt.statusLabel;

  return (
    <div
      className={`import-summary connection-receipt ${toneClass(receipt.tone)}`}
      data-testid={testId}
    >
      <p className="muted-label">{providerLabel} status</p>
      {statusText ? (
        <p
          role={announceLive ? 'status' : undefined}
          aria-live={announceLive ? (receipt.failureStage ? 'assertive' : 'polite') : undefined}
          data-testid={testId ? `${testId}-status` : undefined}
        >
          <strong>{statusText}</strong>
        </p>
      ) : null}
      {receipt.headline ? <p>{receipt.headline}</p> : null}
      {receipt.summary ? (
        <p className="muted small" data-testid={testId ? `${testId}-summary` : undefined}>
          {receipt.summary}
        </p>
      ) : null}
      {receipt.detail ? <p className="muted small">{receipt.detail}</p> : null}
      {receipt.failureStage ? (
        <p className="muted small" data-testid={testId ? `${testId}-failure` : undefined}>
          Stage: {receipt.failureStage.replace(/_/g, ' ')}
          {receipt.failureMessage ? ` — ${receipt.failureMessage}` : ''}
        </p>
      ) : null}
      {/*
        * When the next step is an import and this card is given a way to run it,
        * the prompt IS the button. It used to be a label reading "Next: Preview or
        * sync" sitting beside a control called "Sync from Readwise" — the thing the
        * user was told to do and the thing they could click were not the same words.
        */}
      {receipt.nextAction?.label && receipt.nextAction.kind === 'import' && onNextAction ? (
        <button
          type="button"
          className="connection-receipt__next-action"
          onClick={onNextAction}
          disabled={nextActionBusy}
          data-testid={testId ? `${testId}-next-action` : undefined}
        >
          {nextActionBusy ? 'Importing…' : receipt.nextAction.label}
        </button>
      ) : receipt.nextAction?.label ? (
        <p className="muted-label connection-receipt__next">
          Next: {receipt.nextAction.label}
        </p>
      ) : null}
    </div>
  );
}
