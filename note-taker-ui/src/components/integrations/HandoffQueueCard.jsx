import React from 'react';
import { Card } from '../ui';
import HandoffCreateForm from '../agent/handoffs/HandoffCreateForm';
import HandoffDetailBlock from '../agent/handoffs/HandoffDetailBlock';
import HandoffQueueControls from '../agent/handoffs/HandoffQueueControls';

const HandoffQueueCard = ({
  handoffsModel,
  sortedAgents = [],
  formatDate = () => ''
}) => {
  const {
    handoffs,
    handoffsLoading,
    handoffsError,
    handoffStatusFilter,
    setHandoffStatusFilter,
    queueActorType,
    setQueueActorType,
    queueActorId,
    setQueueActorId,
    handoffActionBusyId,
    handoffActionError,
    newHandoffTitle,
    setNewHandoffTitle,
    newHandoffObjective,
    setNewHandoffObjective,
    newHandoffTaskType,
    setNewHandoffTaskType,
    newHandoffPriority,
    setNewHandoffPriority,
    newHandoffDueAt,
    setNewHandoffDueAt,
    newHandoffAutoRoute,
    setNewHandoffAutoRoute,
    newHandoffRequestedActorType,
    setNewHandoffRequestedActorType,
    newHandoffRequestedActorId,
    setNewHandoffRequestedActorId,
    handoffCreating,
    handoffCreateError,
    handoffCreateInfo,
    formatActor,
    loadHandoffs,
    handleCreateHandoff,
    handleClaimHandoff,
    handleCompleteHandoff,
    handleRejectHandoff,
    handleCancelHandoff
  } = handoffsModel;

  return (
    <Card className="settings-card">
      <h2>Agent handoff queue</h2>
      <p className="muted">Create, triage, and close handoffs shared between user, native, and BYO agents.</p>
      <HandoffCreateForm
        mode="integrations"
        sortedAgents={sortedAgents}
        setupAgentsHref="#personal-agents"
        title={newHandoffTitle}
        onTitleChange={setNewHandoffTitle}
        objective={newHandoffObjective}
        onObjectiveChange={setNewHandoffObjective}
        taskType={newHandoffTaskType}
        onTaskTypeChange={setNewHandoffTaskType}
        priority={newHandoffPriority}
        onPriorityChange={setNewHandoffPriority}
        dueAt={newHandoffDueAt}
        onDueAtChange={setNewHandoffDueAt}
        autoRoute={newHandoffAutoRoute}
        onAutoRouteChange={setNewHandoffAutoRoute}
        requestedActorType={newHandoffRequestedActorType}
        onRequestedActorTypeChange={setNewHandoffRequestedActorType}
        requestedActorId={newHandoffRequestedActorId}
        onRequestedActorIdChange={setNewHandoffRequestedActorId}
        creating={handoffCreating}
        onCreate={handleCreateHandoff}
        error={handoffCreateError}
        info={handoffCreateInfo}
      />

      <HandoffQueueControls
        mode="integrations"
        statusFilter={handoffStatusFilter}
        onStatusFilterChange={setHandoffStatusFilter}
        loading={handoffsLoading}
        queueActorType={queueActorType}
        onQueueActorTypeChange={setQueueActorType}
        queueActorId={queueActorId}
        onQueueActorIdChange={setQueueActorId}
        sortedAgents={sortedAgents}
        onRefresh={loadHandoffs}
        setupAgentsHref="#personal-agents"
      />

      {handoffsLoading ? (
        <p className="muted small">Loading handoffs…</p>
      ) : handoffs.length === 0 ? (
        <p className="muted small">No handoffs for this filter.</p>
      ) : (
        <div className="import-summary">
          {handoffs.map((handoff) => {
            const handoffId = String(handoff?.handoffId || '');
            const isBusy = handoffActionBusyId === handoffId;
            return (
              <div key={handoffId} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
                <HandoffDetailBlock
                  handoff={handoff}
                  formatActor={formatActor}
                  formatDateTime={formatDate}
                  busy={isBusy}
                  onClaim={() => handleClaimHandoff(handoffId)}
                  onComplete={() => handleCompleteHandoff(handoffId)}
                  onReject={() => handleRejectHandoff(handoffId)}
                  onCancel={() => handleCancelHandoff(handoffId)}
                  variant="integrations"
                  actionClassName="settings-import-row"
                  actionStyle={{ marginTop: 8 }}
                />
              </div>
            );
          })}
        </div>
      )}
      {handoffsError && <p className="status-message error-message">{handoffsError}</p>}
      {handoffActionError && <p className="status-message error-message">{handoffActionError}</p>}
    </Card>
  );
};

export default HandoffQueueCard;
