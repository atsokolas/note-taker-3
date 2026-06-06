import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dispatchAgentTaskLink, getAgentTaskLink } from '../api/agent';
import { Card, Page } from '../components/ui';

const AgentTaskRun = ({ taskIdOverride = '' }) => {
  const { taskId = '' } = useParams();
  const resolvedTaskId = taskIdOverride || taskId;
  const [task, setTask] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [loading, setLoading] = useState(Boolean(resolvedTaskId));
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState('');
  const [connectionRequired, setConnectionRequired] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!resolvedTaskId) {
        setError('Agent task link is missing.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const data = await getAgentTaskLink(resolvedTaskId);
        if (!cancelled) setTask(data.task || null);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || 'Failed to load this agent task.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [resolvedTaskId]);

  const handleDispatch = async () => {
    setDispatching(true);
    setError('');
    setConnectionRequired(null);
    try {
      const data = await dispatchAgentTaskLink(resolvedTaskId);
      setTask(data.task || task);
      setHandoff(data.handoff || null);
    } catch (err) {
      const payload = err?.response?.data || {};
      if (err?.response?.status === 409 && payload.status === 'connection_required') {
        setConnectionRequired(payload);
        setTask(payload.task || task);
      } else {
        setError(payload.error || 'Failed to run this agent task.');
      }
    } finally {
      setDispatching(false);
    }
  };

  const target = task?.target || {};
  const dispatched = task?.status === 'dispatched' || Boolean(handoff);

  return (
    <Page className="settings-page agent-task-run-page">
      <div className="page-header">
        <p className="muted-label">Agent task link</p>
        <h1>Run with {task?.runtimeLabel || 'Noeis'}</h1>
        <p className="muted">Review the requested work, then dispatch it into the Noeis handoff queue.</p>
      </div>

      <Card className="settings-card agent-task-run-card">
        {loading ? (
          <p className="muted">Loading task...</p>
        ) : error && !task ? (
          <>
            <h2>Task unavailable</h2>
            <p className="muted">{error}</p>
            <Link to="/integrations" className="ui-button ui-button-secondary">Open integrations</Link>
          </>
        ) : (
          <>
            <div className="settings-appearance-header">
              <div>
                <h2>{task?.title || 'Untitled task'}</h2>
                <p className="muted">{task?.objective || 'No objective provided.'}</p>
              </div>
              <p className="muted-label">{task?.status || 'pending'}</p>
            </div>

            <div className="agent-task-run-card__meta">
              <div>
                <span>Runtime</span>
                <strong>{task?.runtimeLabel || 'Noeis agent'}</strong>
              </div>
              <div>
                <span>Task type</span>
                <strong>{task?.taskType || 'custom'}</strong>
              </div>
              <div>
                <span>Priority</span>
                <strong>{task?.priority || 'normal'}</strong>
              </div>
            </div>

            {(target.title || target.type || target.id) && (
              <div className="agent-task-run-card__target">
                <span>Target</span>
                <strong>{target.title || target.id || target.type}</strong>
                <p className="muted small">{[target.type, target.id].filter(Boolean).join(' · ')}</p>
              </div>
            )}

            {connectionRequired ? (
              <div className="agent-task-run-card__warning" role="status">
                <strong>Connect {connectionRequired.runtimeLabel} first.</strong>
                <p className="muted small">Run this in your terminal, approve in Noeis, then return to this link.</p>
                <pre className="external-bridge-pre">{connectionRequired.connectCommand}</pre>
                <Link to={connectionRequired.connectPath || '/integrations'} className="ui-button ui-button-secondary">
                  Open integrations
                </Link>
              </div>
            ) : dispatched ? (
              <div className="agent-task-run-card__success" role="status">
                <strong>Task dispatched.</strong>
                <p className="muted small">The handoff is now in the Noeis queue.</p>
                <Link
                  to={handoff?.handoffId ? `/think?tab=handoffs&handoff=${encodeURIComponent(handoff.handoffId)}` : '/think?tab=handoffs'}
                  className="ui-button ui-button-primary"
                >
                  Open handoff
                </Link>
              </div>
            ) : (
              <>
                {error ? <p className="form-error">{error}</p> : null}
                <div className="settings-actions">
                  <button
                    type="button"
                    className="ui-button ui-button-primary"
                    onClick={handleDispatch}
                    disabled={dispatching || task?.status !== 'pending'}
                  >
                    {dispatching ? 'Dispatching...' : `Run with ${task?.runtimeLabel || 'agent'}`}
                  </button>
                  <Link to="/integrations" className="ui-button ui-button-secondary">Cancel</Link>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </Page>
  );
};

export default AgentTaskRun;
