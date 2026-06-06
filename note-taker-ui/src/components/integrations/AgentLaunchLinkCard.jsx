import React, { useState } from 'react';
import { createAgentTaskLink } from '../../api/agent';
import { Card } from '../ui';

const RUNTIMES = [
  { value: 'openclaw', label: 'OpenClaw' },
  { value: 'hermes', label: 'Hermes' },
  { value: 'codex', label: 'Codex' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'agent', label: 'Noeis agent' }
];

const TASK_TYPES = [
  { value: 'qa', label: 'QA / review' },
  { value: 'research', label: 'Research' },
  { value: 'synthesis', label: 'Synthesis' },
  { value: 'restructure', label: 'Restructure' },
  { value: 'custom', label: 'Custom' }
];

const AgentLaunchLinkCard = () => {
  const [runtime, setRuntime] = useState('openclaw');
  const [taskType, setTaskType] = useState('qa');
  const [title, setTitle] = useState('Review this Noeis surface');
  const [objective, setObjective] = useState('Inspect the target, identify concrete issues, and draft proposed changes.');
  const [targetTitle, setTargetTitle] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    setCreated(null);
    try {
      const data = await createAgentTaskLink({
        runtime,
        taskType,
        title,
        objective,
        target: {
          title: targetTitle,
          url: targetUrl
        },
        appUrl: typeof window !== 'undefined' ? window.location.origin : ''
      });
      setCreated(data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create agent launch link.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="settings-card agent-launch-link-card">
      <div className="settings-appearance-header">
        <div>
          <h2>Agent launch links</h2>
          <p className="muted">Create a link that feeds a specific task to OpenClaw, Hermes, or another connected agent.</p>
        </div>
        <p className="muted-label">/a/run</p>
      </div>

      <div className="agent-launch-link-card__grid">
        <label>
          <span className="muted-label">Runtime</span>
          <select value={runtime} onChange={(event) => setRuntime(event.target.value)}>
            {RUNTIMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span className="muted-label">Task type</span>
          <select value={taskType} onChange={(event) => setTaskType(event.target.value)}>
            {TASK_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <label className="agent-launch-link-card__field">
        <span className="muted-label">Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="agent-launch-link-card__field">
        <span className="muted-label">Objective</span>
        <textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} />
      </label>
      <div className="agent-launch-link-card__grid">
        <label>
          <span className="muted-label">Target title</span>
          <input value={targetTitle} onChange={(event) => setTargetTitle(event.target.value)} placeholder="Optional" />
        </label>
        <label>
          <span className="muted-label">Target URL</span>
          <input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="Optional" />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      <div className="settings-actions">
        <button type="button" className="ui-button ui-button-primary" onClick={handleCreate} disabled={creating || !title.trim()}>
          {creating ? 'Creating...' : 'Create launch link'}
        </button>
      </div>

      {created?.runUrl ? (
        <div className="agent-launch-link-card__result" role="status">
          <strong>Launch link ready</strong>
          <pre className="external-bridge-pre">{created.runUrl}</pre>
          <a className="ui-button ui-button-secondary" href={created.runUrl}>Open link</a>
        </div>
      ) : null}
    </Card>
  );
};

export default AgentLaunchLinkCard;
