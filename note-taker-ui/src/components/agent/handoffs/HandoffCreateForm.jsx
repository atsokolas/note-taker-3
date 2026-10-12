import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui';
import { AGENT_DISPLAY_NAME, SPECIALIST_AGENT_LABEL } from '../../../constants/agentIdentity';

const HandoffCreateForm = ({
  sortedAgents = [],
  title = '',
  onTitleChange = () => {},
  objective = '',
  onObjectiveChange = () => {},
  taskType = 'research',
  onTaskTypeChange = () => {},
  priority = 'normal',
  onPriorityChange = () => {},
  dueAt = '',
  onDueAtChange = () => {},
  autoRoute = true,
  onAutoRouteChange = () => {},
  requestedActorType = 'native_agent',
  onRequestedActorTypeChange = () => {},
  requestedActorId = '',
  onRequestedActorIdChange = () => {},
  setupAgentsHref = '/integrations#personal-agents',
  creating = false,
  onCreate = () => {},
  error = '',
  info = ''
}) => {
  const activePersonalAgents = sortedAgents.filter(agent => agent.status === 'active');
  const selectedPersonalAgent = activePersonalAgents.find(agent => String(agent?._id || '') === String(requestedActorId || ''));

  return (
    <>
      <div className="settings-import-row">
        <div style={{ flex: 1 }}>
          <p className="muted-label">Title</p>
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Investigate contradictions in concept workspace"
            disabled={creating}
          />
        </div>
        <Button disabled={creating || !String(title || '').trim()} onClick={onCreate}>
          {creating ? 'Creating…' : (autoRoute ? 'Auto plan + create' : 'Create handoff')}
        </Button>
      </div>

      <div className="settings-import-row">
        <div style={{ flex: 2 }}>
          <p className="muted-label">Objective (optional)</p>
          <input
            type="text"
            value={objective}
            onChange={(event) => onObjectiveChange(event.target.value)}
            placeholder="Gather sources, summarize findings, and propose next steps"
            disabled={creating}
          />
        </div>
      </div>

      <div className="settings-import-row">
        <div style={{ flex: 1 }}>
          <p className="muted-label">Task type</p>
          <select value={taskType} onChange={(event) => onTaskTypeChange(event.target.value)} disabled={creating}>
            <option value="research">Research</option>
            <option value="synthesis">Synthesis</option>
            <option value="restructure">Restructure</option>
            <option value="qa">QA</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <p className="muted-label">Priority</p>
          <select value={priority} onChange={(event) => onPriorityChange(event.target.value)} disabled={creating}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <p className="muted-label">Due at (optional)</p>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => onDueAtChange(event.target.value)}
            disabled={creating}
          />
        </div>
      </div>

      <div className="settings-import-row" style={{ marginTop: 8 }}>
        <label className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={autoRoute}
            onChange={(event) => onAutoRouteChange(event.target.checked)}
            disabled={creating}
          />
          Auto route with policy
        </label>
        {!autoRoute && (
          <>
            <select
              value={requestedActorType}
              onChange={(event) => onRequestedActorTypeChange(event.target.value)}
              disabled={creating}
            >
              <option value="native_agent">{AGENT_DISPLAY_NAME}</option>
              <option value="user">User</option>
              <option value="byo_agent">{SPECIALIST_AGENT_LABEL}</option>
            </select>
            {requestedActorType === 'byo_agent' && (
              <>
                <select
                  value={requestedActorId}
                  onChange={(event) => onRequestedActorIdChange(event.target.value)}
                  disabled={creating}
                >
                  <option value="">Select specialist agent</option>
                  {activePersonalAgents.map(agent => (
                    <option key={agent._id} value={agent._id}>{agent.name}</option>
                  ))}
                </select>
                {selectedPersonalAgent && <p className="muted small">Selected specialist: {selectedPersonalAgent.name}</p>}
                {activePersonalAgents.length === 0 && (
                  <p className="muted small">
                    No active specialist agents yet. <Link to={setupAgentsHref}>Set up an agent</Link>.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {error && <p className="status-message error-message">{error}</p>}
      {!error && info && <p className="status-message">{info}</p>}
    </>
  );
};

export default HandoffCreateForm;
