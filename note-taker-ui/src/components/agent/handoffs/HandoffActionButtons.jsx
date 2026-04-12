import React from 'react';
import { Button } from '../../ui';

const HandoffActionButtons = ({
  busy = false,
  onClaim = null,
  onComplete = null,
  onReject = null,
  onCancel = null,
  onContinueThread = null,
  continueThreadLabel = 'Continue in thread',
  className = '',
  style = undefined
}) => (
  <div className={className} style={style}>
    {typeof onContinueThread === 'function' && (
      <Button variant="secondary" disabled={busy} onClick={onContinueThread}>
        {busy ? 'Working…' : continueThreadLabel}
      </Button>
    )}
    {typeof onClaim === 'function' && (
      <Button variant="secondary" disabled={busy} onClick={onClaim}>
        {busy ? 'Working…' : 'Claim'}
      </Button>
    )}
    {typeof onComplete === 'function' && (
      <Button variant="secondary" disabled={busy} onClick={onComplete}>
        {busy ? 'Working…' : 'Complete'}
      </Button>
    )}
    {typeof onReject === 'function' && (
      <Button variant="secondary" disabled={busy} onClick={onReject}>
        {busy ? 'Working…' : 'Reject'}
      </Button>
    )}
    {typeof onCancel === 'function' && (
      <Button variant="secondary" disabled={busy} onClick={onCancel}>
        {busy ? 'Working…' : 'Cancel'}
      </Button>
    )}
  </div>
);

export default HandoffActionButtons;
