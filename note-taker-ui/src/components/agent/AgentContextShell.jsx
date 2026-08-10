import React from 'react';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';
import AgentPresence from './AgentPresence';

const normalizeSurface = (surface) => {
  const value = String(surface || 'context').trim().toLowerCase();
  return value || 'context';
};

/**
 * Presentation-only frame for surface-specific agent/context content.
 *
 * Transport, persisted state, and mutation permissions stay with the child
 * surface component. This frame only gives those components a common identity
 * and an honest loading/failure/orientation presentation.
 */
const AgentContextShell = ({
  surface = 'context',
  title = AGENT_DISPLAY_NAME,
  orientation = '',
  status = 'idle',
  loading = false,
  loadingMessage = 'Loading context…',
  error = '',
  showPresence = true,
  children,
  className = ''
}) => {
  const safeSurface = normalizeSurface(surface);
  const safeTitle = String(title || AGENT_DISPLAY_NAME).trim() || AGENT_DISPLAY_NAME;
  const safeOrientation = String(orientation || '').trim();
  const safeError = String(error || '').trim();

  return (
    <section
      className={`agent-context-shell agent-context-shell--${safeSurface} ${className}`.trim()}
      aria-label={`${safeTitle} context`}
      data-agent-context-surface={safeSurface}
    >
      {showPresence ? (
        <AgentPresence
          status={safeError ? 'error' : (loading ? 'working' : status)}
          title={safeTitle}
          subtitle={safeOrientation}
        />
      ) : null}
      {!showPresence && safeOrientation ? (
        <p className="agent-context-shell__orientation">{safeOrientation}</p>
      ) : null}
      {loading ? <p role="status">{loadingMessage}</p> : null}
      {safeError ? <p role="alert">{safeError}</p> : null}
      {children}
    </section>
  );
};

export default AgentContextShell;
