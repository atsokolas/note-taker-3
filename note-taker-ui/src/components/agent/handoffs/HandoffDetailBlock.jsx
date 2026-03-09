import React from 'react';
import HandoffActionButtons from './HandoffActionButtons';

const HandoffDetailBlock = ({
  handoff = null,
  formatActor = () => 'Unknown actor',
  formatDateTime = () => '',
  busy = false,
  onClaim = null,
  onComplete = null,
  onReject = null,
  onCancel = null,
  showEvents = false,
  eventsTitle = 'Recent events',
  eventsSubtitle = 'Latest protocol transitions.',
  variant = 'integrations',
  actionClassName = 'settings-import-row',
  actionStyle = undefined,
  className = ''
}) => {
  if (!handoff) return null;

  return (
    <div className={className}>
      {variant === 'think' ? (
        <>
          <p className="think-handoffs-title">{handoff.title || 'Untitled handoff'}</p>
          <p className="muted small">
            {handoff.status} · {handoff.taskType} · {handoff.priority}
          </p>
        </>
      ) : (
        <p><strong>{handoff.title || 'Untitled handoff'}</strong> · {handoff.status} · {handoff.taskType} · {handoff.priority}</p>
      )}

      {handoff.objective && <p className={variant === 'think' ? '' : 'muted'}>{handoff.objective}</p>}
      <p className={variant === 'think' ? 'muted small' : ''}>Requested: {formatActor(handoff.requestedActor)}</p>
      {handoff.claimedBy && <p className={variant === 'think' ? 'muted small' : ''}>Claimed by: {formatActor(handoff.claimedBy)}</p>}
      {handoff.completedBy && <p className={variant === 'think' ? 'muted small' : ''}>Completed by: {formatActor(handoff.completedBy)}</p>}
      {handoff.dueAt && <p className={variant === 'think' ? 'muted small' : ''}>Due: {formatDateTime(handoff.dueAt)}</p>}

      <HandoffActionButtons
        className={actionClassName}
        style={actionStyle}
        busy={busy}
        onClaim={onClaim}
        onComplete={onComplete}
        onReject={onReject}
        onCancel={onCancel}
      />

      {showEvents && (
        <div>
          {eventsTitle && <p className="muted-label">{eventsTitle}</p>}
          {eventsSubtitle && <p className="muted small">{eventsSubtitle}</p>}
          {Array.isArray(handoff.events) && handoff.events.length > 0 ? (
            <div className="think-handoffs-events">
              {[...handoff.events]
                .slice(-8)
                .reverse()
                .map((event, index) => (
                  <div key={`${event.eventType}-${event.createdAt || index}`} className="think-handoffs-events__row">
                    <div className="muted small">
                      {event.eventType} · {formatActor(event.actor)}
                    </div>
                    {event.note && <div>{event.note}</div>}
                    {event.createdAt && <div className="muted small">{formatDateTime(event.createdAt)}</div>}
                  </div>
                ))}
            </div>
          ) : (
            <p className="muted small">No events yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default HandoffDetailBlock;
