import React from 'react';
import { SectionHeader, SurfaceCard } from '../../ui';
import HandoffCreateForm from '../../agent/handoffs/HandoffCreateForm';
import HandoffDetailBlock from '../../agent/handoffs/HandoffDetailBlock';

const HandoffsMainPanel = ({ handoffsModel }) => {
  const {
    activeHandoffData,
    sortedPersonalAgents,
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
    formatDateTime,
    handleCreateHandoff,
    handleClaimHandoff,
    handleCompleteHandoff,
    handleRejectHandoff,
    handleCancelHandoff
  } = handoffsModel;

  return (
    <div className="section-stack think-handoffs-main" data-testid="think-handoffs-main">
      <SurfaceCard className="think-handoffs-card">
        <SectionHeader title="Create handoff" subtitle="Delegate work between you, native agent, and personal agents." />
        <HandoffCreateForm
          mode="think"
          sortedAgents={sortedPersonalAgents}
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
      </SurfaceCard>

      <SurfaceCard className="think-handoffs-card">
        <SectionHeader title="Selected handoff" subtitle="Track status and close the loop from Think." />
        {!activeHandoffData ? (
          <p className="muted small">Select a handoff from the queue.</p>
        ) : (
          <HandoffDetailBlock
            handoff={activeHandoffData}
            formatActor={formatActor}
            formatDateTime={formatDateTime}
            busy={handoffActionBusyId === activeHandoffData.handoffId}
            onClaim={() => handleClaimHandoff(activeHandoffData.handoffId)}
            onComplete={() => handleCompleteHandoff(activeHandoffData.handoffId)}
            onReject={() => handleRejectHandoff(activeHandoffData.handoffId)}
            onCancel={() => handleCancelHandoff(activeHandoffData.handoffId)}
            showEvents
            variant="think"
            actionClassName="think-handoffs-detail-actions"
            className="section-stack think-handoffs-detail"
          />
        )}
        {handoffActionError && <p className="status-message error-message">{handoffActionError}</p>}
      </SurfaceCard>
    </div>
  );
};

export default HandoffsMainPanel;
