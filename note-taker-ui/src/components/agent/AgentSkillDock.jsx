import React, { useMemo } from 'react';
import { QuietButton } from '../ui';
import useAgentSkills from '../../hooks/useAgentSkills';
import { buildQueuedAgentSkillPrompt } from '../../utils/agentSkillInvocation';

const clean = (value) => String(value || '').trim();
const formatWorkerRole = (value = '') => {
  const safe = clean(value);
  if (!safe) return '';
  return safe.charAt(0).toUpperCase() + safe.slice(1);
};
const formatWorkflowTrack = (workflow = null) => {
  const safeTrack = clean(workflow?.track);
  if (!safeTrack) return '';
  return safeTrack === 'maintenance'
    ? (workflow?.loop ? 'Maintenance loop' : 'Maintenance flow')
    : (workflow?.loop ? 'Output loop' : 'Output flow');
};
const formatWorkflowCadence = (workflow = null) => {
  const safeCadence = clean(workflow?.cadence);
  if (!safeCadence) return '';
  return safeCadence.replace(/_/g, ' ');
};

const AgentSkillDock = ({
  surface = '',
  contextType = '',
  category = '',
  contextId = '',
  targetContextType = '',
  targetContextId = '',
  contextTitle = '',
  selectionText = '',
  className = '',
  title = 'Agent moves',
  headline = '',
  subtitle = 'Use a skill to push the current context into an explicit draft.',
  maxVisible = 6,
  onInvoke = null
}) => {
  const { skills, loading, error } = useAgentSkills({
    surface,
    contextType,
    category
  });

  const visibleSkills = useMemo(
    () => (Array.isArray(skills) ? skills.slice(0, Math.max(1, maxVisible)) : []),
    [maxVisible, skills]
  );
  const activeSelection = clean(selectionText);
  const resolvedHeadline = clean(headline) || clean(contextTitle) || 'Current context';

  return (
    <section className={`agent-skill-dock ${className}`.trim()} data-testid="agent-skill-dock">
      <div className="agent-skill-dock__head">
        <div>
          <p className="agent-skill-dock__eyebrow">{title}</p>
          <h3>{resolvedHeadline}</h3>
          <p>{subtitle}</p>
        </div>
        {activeSelection && (
          <span className="agent-skill-dock__selection-pill">
            Selection active
          </span>
        )}
      </div>

      {loading && <p className="muted small">Loading agent moves…</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {!loading && !error && (
        <div className="agent-skill-dock__skills">
          {visibleSkills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className="agent-skill-dock__skill"
              onClick={() => onInvoke?.(buildQueuedAgentSkillPrompt(skill, {
                contextType: targetContextType || contextType,
                contextId: targetContextId || contextId,
                contextTitle,
                selectionText: activeSelection,
                mode: 'submit'
              }), skill)}
            >
              <span className="agent-skill-dock__skill-title">{skill.title}</span>
              <span className="agent-skill-dock__skill-summary">{skill.summary}</span>
              {(formatWorkflowTrack(skill.workflow) || formatWorkflowCadence(skill.workflow)) && (
                <span className="agent-skill-dock__skill-summary">
                  {[formatWorkflowTrack(skill.workflow), formatWorkflowCadence(skill.workflow)].filter(Boolean).join(' · ')}
                </span>
              )}
              <span className="agent-skill-dock__skill-meta">
                {formatWorkerRole(skill.workerRole) || 'Specialist'} · {skill.outputType?.replace(/_/g, ' ') || 'draft'}{Array.isArray(skill?.workflow?.steps) && skill.workflow.steps.length > 0 ? ` · ${skill.workflow.steps.length}-step flow` : ''}
              </span>
            </button>
          ))}
          {visibleSkills.length === 0 && (
            <p className="muted small">No agent moves match this surface yet.</p>
          )}
        </div>
      )}

      <div className="agent-skill-dock__footer">
        <QuietButton
          type="button"
          disabled={!visibleSkills.length}
          onClick={() => {
            const defaultSkill = visibleSkills[0];
            if (!defaultSkill) return;
            onInvoke?.(buildQueuedAgentSkillPrompt(defaultSkill, {
              contextType: targetContextType || contextType,
              contextId: targetContextId || contextId,
              contextTitle,
              selectionText: activeSelection,
              mode: 'draft'
            }), defaultSkill);
          }}
        >
          Load first move into composer
        </QuietButton>
      </div>
    </section>
  );
};

export default AgentSkillDock;
