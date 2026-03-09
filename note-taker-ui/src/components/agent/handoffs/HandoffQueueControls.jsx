import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui';

const HandoffQueueControls = ({
  mode = 'integrations',
  statusFilter = 'all',
  onStatusFilterChange = () => {},
  loading = false,
  queueActorType = 'user',
  onQueueActorTypeChange = () => {},
  queueActorId = '',
  onQueueActorIdChange = () => {},
  sortedAgents = [],
  setupAgentsHref = '/integrations#personal-agents',
  onRefresh = () => {}
}) => {
  const activePersonalAgents = sortedAgents.filter(agent => agent.status === 'active');
  const selectedPersonalAgent = activePersonalAgents.find(agent => String(agent?._id || '') === String(queueActorId || ''));

  if (mode === 'think') {
    return (
      <div className="think-index__controls">
        <label className="think-index__filter">
          <span>Queue status</span>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} disabled={loading}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="claimed">Claimed</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <div className="think-index__filter">
          <span>Run actions as</span>
          <div className="think-handoffs-sidebar__actor">
            <select value={queueActorType} onChange={(event) => onQueueActorTypeChange(event.target.value)}>
              <option value="user">User</option>
              <option value="native_agent">Native agent</option>
              <option value="byo_agent">Personal agent</option>
            </select>
            {queueActorType === 'byo_agent' && (
              <>
                <select value={queueActorId} onChange={(event) => onQueueActorIdChange(event.target.value)}>
                  <option value="">Select personal agent</option>
                  {activePersonalAgents.map(agent => (
                    <option key={agent._id} value={agent._id}>{agent.name}</option>
                  ))}
                </select>
                {selectedPersonalAgent && (
                  <p className="muted small">Selected agent: {selectedPersonalAgent.name}</p>
                )}
                {activePersonalAgents.length === 0 && (
                  <p className="muted small">
                    No active personal agents yet. <Link to={setupAgentsHref}>Set up an agent</Link>.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <Button variant="secondary" className="think-index__new-question" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh queue'}
        </Button>
      </div>
    );
  }

  return (
    <div className="settings-import-row" style={{ marginTop: 14 }}>
      <div>
        <p className="muted-label">Queue status</p>
        <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} disabled={loading}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="claimed">Claimed</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div>
        <p className="muted-label">Run actions as</p>
        <div className="settings-import-row">
          <select value={queueActorType} onChange={(event) => onQueueActorTypeChange(event.target.value)}>
            <option value="user">User</option>
            <option value="native_agent">Native agent</option>
            <option value="byo_agent">Personal agent</option>
          </select>
          {queueActorType === 'byo_agent' && (
            <>
              <select value={queueActorId} onChange={(event) => onQueueActorIdChange(event.target.value)}>
                <option value="">Select personal agent</option>
                {activePersonalAgents.map(agent => (
                  <option key={agent._id} value={agent._id}>{agent.name}</option>
                ))}
              </select>
              {selectedPersonalAgent && (
                <p className="muted small">Selected agent: {selectedPersonalAgent.name}</p>
              )}
              {activePersonalAgents.length === 0 && (
                <p className="muted small">
                  No active personal agents yet. <Link to={setupAgentsHref}>Set up an agent</Link>.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <Button variant="secondary" disabled={loading} onClick={onRefresh}>
        Refresh queue
      </Button>
    </div>
  );
};

export default HandoffQueueControls;
