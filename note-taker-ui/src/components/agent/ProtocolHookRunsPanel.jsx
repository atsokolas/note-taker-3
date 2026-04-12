import React from 'react';
import { SectionHeader, SurfaceCard } from '../ui';

const ProtocolHookRunsPanel = ({
  hookRunsModel,
  title = 'Hook activity',
  subtitle = 'Observed before/after protocol phases.',
  emptyText = 'No hook activity yet.',
  className = ''
}) => {
  const {
    hookRuns,
    hookRunsLoading,
    hookRunsError
  } = hookRunsModel || {};

  return (
    <SurfaceCard className={className}>
      <SectionHeader title={title} subtitle={subtitle} />
      {hookRunsError && <p className="status-message error-message">{hookRunsError}</p>}
      {hookRunsLoading ? (
        <p className="muted small">Loading hook activity…</p>
      ) : !Array.isArray(hookRuns) || hookRuns.length === 0 ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        <div className="section-stack">
          {hookRuns.map((run) => (
            <div key={run.hookRunId} className="think-hook-run">
              <div className="think-hook-run__header">
                <span className="think-hook-run__phase">{run.phase}</span>
                <span className="think-hook-run__op">{run.op}</span>
                <span className={`think-hook-run__effect is-${String(run.effect || '').toLowerCase() || 'observe'}`}>
                  {run.effect || 'observe'}
                </span>
                <span className={`think-hook-run__status is-${String(run.status || '').toLowerCase() || 'passed'}`}>
                  {run.status || 'passed'}
                </span>
              </div>
              <div className="think-hook-run__meta">
                <span>{run.source || 'native'}</span>
                {run.actor?.actorType && <span>{run.actor.actorType}</span>}
                {run.createdAt && <span>{new Date(run.createdAt).toLocaleString()}</span>}
              </div>
              {(run.preview?.title || run.threadId || run.handoffId) && (
                <div className="think-hook-run__meta">
                  {run.preview?.title && <span>{run.preview.title}</span>}
                  {run.threadId && <span>thread {run.threadId}</span>}
                  {run.handoffId && <span>handoff {run.handoffId}</span>}
                </div>
              )}
              {run.warningMessage && <p className="muted small">{run.warningMessage}</p>}
              {run.errorMessage && <p className="muted small">{run.errorMessage}</p>}
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
};

export default ProtocolHookRunsPanel;
