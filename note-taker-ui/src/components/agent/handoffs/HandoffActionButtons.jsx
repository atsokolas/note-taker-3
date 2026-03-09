import React from 'react';
import { Button } from '../../ui';

const HandoffActionButtons = ({
  busy = false,
  onClaim = null,
  onComplete = null,
  onReject = null,
  onCancel = null,
  className = '',
  style = undefined
}) => (
  <div className={className} style={style}>
    <Button variant="secondary" disabled={busy || typeof onClaim !== 'function'} onClick={onClaim || undefined}>
      {busy ? 'Working…' : 'Claim'}
    </Button>
    <Button variant="secondary" disabled={busy || typeof onComplete !== 'function'} onClick={onComplete || undefined}>
      {busy ? 'Working…' : 'Complete'}
    </Button>
    <Button variant="secondary" disabled={busy || typeof onReject !== 'function'} onClick={onReject || undefined}>
      {busy ? 'Working…' : 'Reject'}
    </Button>
    <Button variant="secondary" disabled={busy || typeof onCancel !== 'function'} onClick={onCancel || undefined}>
      {busy ? 'Working…' : 'Cancel'}
    </Button>
  </div>
);

export default HandoffActionButtons;
