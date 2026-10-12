import React from 'react';
import HandoffActionButtons from './HandoffActionButtons';

const clean = (value) => String(value || '').trim();
const formatWorkerRole = (planner = null) => {
  const label = clean(planner?.activeWorkerLabel);
  if (label) return label;
  const role = clean(planner?.activeWorkerRole);
  return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : '';
};

/* One handoff in the Connections queue: what was asked, who holds it, the
   actions open to you, and the last few things that happened to it. */
const HandoffDetailBlock = ({
  handoff = null,
  formatActor = () => 'Unknown actor',
  formatDateTime = () => '',
  busy = false,
  onClaim = null,
  onComplete = null,
  onReject = null,
  onCancel = null,
  onOpenThread = null,
  actionClassName = 'settings-import-row',
  actionStyle = undefined,
  className = ''
}) => {
  if (!handoff) return null;
  const events = Array.isArray(handoff.events) ? [...handoff.events].slice(-8).reverse() : [];
  const steps = Array.isArray(handoff.plan?.steps) ? handoff.plan.steps : [];
  const criteria = Array.isArray(handoff.plan?.successCriteria) ? handoff.plan.successCriteria : [];

  return (
    <div className={className}>
      <p><strong>{handoff.title || 'Untitled handoff'}</strong> · {handoff.status} · {handoff.taskType} · {handoff.priority}</p>
      {handoff.objective && <p className="muted">{handoff.objective}</p>}
      {clean(handoff?.planner?.rationale) && (
        <p className="muted">
          Planner: {handoff.planner.rationale}
        </p>
      )}
      {steps.length > 0 && (
        <ol className="handoff-plan" aria-label="Plan">
          {steps.map((step, index) => (
            <li key={step.id || index}>
              {step.title || 'Untitled step'} <span className="muted small">· {step.status || 'pending'}</span>
              {step.notes && <span className="muted small"> · {step.notes}</span>}
            </li>
          ))}
        </ol>
      )}
      {criteria.length > 0 && (
        <ul className="handoff-plan" aria-label="Done when">
          {criteria.map(item => <li key={item}>{item}</li>)}
        </ul>
      )}
      {handoff.checkpoint?.summary && (
        <p className="muted">
          Checkpoint: {handoff.checkpoint.summary}
        </p>
      )}
      <p>Requested: {formatActor(handoff.requestedActor)}</p>
      {clean(handoff?.planner?.activeWorkerRole) && (
        <p>Specialist: {formatWorkerRole(handoff.planner)}</p>
      )}
      {handoff.claimedBy && <p>Claimed by: {formatActor(handoff.claimedBy)}</p>}
      {handoff.completedBy && <p>Completed by: {formatActor(handoff.completedBy)}</p>}
      {handoff.dueAt && <p>Due: {formatDateTime(handoff.dueAt)}</p>}

      <HandoffActionButtons
        className={actionClassName}
        style={actionStyle}
        busy={busy}
        onClaim={onClaim}
        onComplete={onComplete}
        onReject={onReject}
        onCancel={onCancel}
        onOpenThread={onOpenThread}
      />

      {events.length > 0 && (
        <ol className="handoff-events" aria-label="Recent events">
          {events.map((event, index) => (
            <li key={`${event.eventType}-${event.createdAt || index}`}>
              <span className="muted small">{event.eventType} · {formatActor(event.actor)}</span>
              {event.note && <span>{event.note}</span>}
              {event.createdAt && <span className="muted small">{formatDateTime(event.createdAt)}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default HandoffDetailBlock;
