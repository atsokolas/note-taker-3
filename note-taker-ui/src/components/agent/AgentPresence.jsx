import React from 'react';
import { AGENT_DISPLAY_NAME, AGENT_STATUS_LABEL } from '../../constants/agentIdentity';

const AgentPresence = ({
  status = 'idle',
  title = AGENT_DISPLAY_NAME,
  subtitle = '',
  actionLabel = '',
  actionDisabled = false,
  onAction,
  className = '',
  actionTestId = ''
}) => (
  <div
    className={`agent-presence wiki-agent-presence ${className}`.trim()}
    data-status={status}
    role="status"
    aria-live="polite"
    aria-label={AGENT_STATUS_LABEL}
  >
    <span className="agent-presence__dot wiki-agent-presence__dot" aria-hidden="true">
      <span className="agent-presence__dot-inner wiki-agent-presence__dot-inner" />
    </span>
    <div className="agent-presence__copy wiki-agent-presence__copy">
      <div className="agent-presence__text wiki-agent-presence__text">{title}</div>
      {subtitle ? <div className="agent-presence__sub wiki-agent-presence__sub">{subtitle}</div> : null}
    </div>
    {actionLabel ? (
      <button
        type="button"
        className="agent-presence__action wiki-agent-presence__action"
        onClick={onAction}
        disabled={actionDisabled}
        data-testid={actionTestId || undefined}
      >
        {actionLabel}
      </button>
    ) : null}
  </div>
);

export default React.memo(AgentPresence);
