import React from 'react';
import { Link } from 'react-router-dom';
import HandoffQueueControls from '../../agent/handoffs/HandoffQueueControls';

const SidebarSkeletonRows = ({ rows = 5 }) => (
  <div className="library-article-skeletons" aria-hidden="true">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={`think-handoff-skeleton-${index}`} className="think-list-skeleton-row">
        <div className="skeleton skeleton-title" style={{ width: `${52 + (index % 3) * 14}%` }} />
        <div className="skeleton skeleton-text" style={{ width: `${28 + (index % 2) * 16}%` }} />
      </div>
    ))}
  </div>
);

const HandoffsSidebar = ({
  handoffsModel,
  onOpenHandoff = () => {}
}) => {
  const {
    handoffStatusFilter,
    setHandoffStatusFilter,
    handoffsLoading,
    queueActorType,
    setQueueActorType,
    queueActorId,
    setQueueActorId,
    sortedPersonalAgents,
    loadHandoffs,
    handoffsError,
    handoffActionError,
    handoffs,
    activeHandoffData
  } = handoffsModel;
  const hasActivePersonalAgents = sortedPersonalAgents.some(agent => agent.status === 'active');

  return (
    <div className="section-stack think-layout__left-panel think-index think-handoffs-sidebar" data-testid="think-handoffs-left-panel">
      <HandoffQueueControls
        mode="think"
        statusFilter={handoffStatusFilter}
        onStatusFilterChange={setHandoffStatusFilter}
        loading={handoffsLoading}
        queueActorType={queueActorType}
        onQueueActorTypeChange={setQueueActorType}
        queueActorId={queueActorId}
        onQueueActorIdChange={setQueueActorId}
        sortedAgents={sortedPersonalAgents}
        onRefresh={loadHandoffs}
      />
      {!hasActivePersonalAgents && (
        <p className="muted small">
          No personal agents set up yet. <Link to="/integrations#personal-agents">Set up an agent</Link>.
        </p>
      )}

      {handoffsError && <p className="status-message error-message">{handoffsError}</p>}
      {handoffActionError && <p className="status-message error-message">{handoffActionError}</p>}

      <div className="think-index__group">
        <div className="think-index__label">Handoffs</div>
        <div className="think-index__list">
          {handoffsLoading ? (
            <SidebarSkeletonRows rows={5} />
          ) : handoffs.length === 0 ? (
            <p className="think-calm-empty-line">No handoffs for this filter.</p>
          ) : (
            handoffs.map((handoff) => {
              const handoffId = String(handoff?.handoffId || '');
              const isActive = handoffId && handoffId === String(activeHandoffData?.handoffId || '');
              return (
                <button
                  key={handoffId}
                  type="button"
                  className={`think-index__row ${isActive ? 'is-active' : ''}`}
                  onClick={() => onOpenHandoff(handoffId)}
                >
                  <span className="think-index__row-title">{handoff.title || 'Untitled handoff'}</span>
                  <span className="think-index__row-meta">{handoff.status || 'pending'}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default HandoffsSidebar;
