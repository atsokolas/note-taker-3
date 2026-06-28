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
  providerLabel = 'Connection'
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
      {receipt.nextAction?.label ? (
        <p className="muted-label connection-receipt__next">
          Next: {receipt.nextAction.label}
        </p>
      ) : null}
    </div>
  );
}
