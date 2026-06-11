import React from 'react';
import ProtocolApprovalsPanel from '../../agent/ProtocolApprovalsPanel';
import { SectionHeader, SurfaceCard } from '../../ui';
import HandoffsMainPanel from '../handoffs/HandoffsMainPanel';
import HandoffsSidebar from '../handoffs/HandoffsSidebar';
import ThreadsMainPanel from '../threads/ThreadsMainPanel';
import ThreadsSidebar from '../threads/ThreadsSidebar';

const ProtocolRouteView = ({
  variant = 'main',
  mode,
  threadsModel,
  handoffsModel,
  threadApprovalHistoryModel,
  handoffApprovalHistoryModel,
  threadHookRunsModel,
  handoffHookRunsModel,
  protocolArtifactDraftsModel,
  upkeepCyclesModel,
  protocolApprovalsModel,
  workingMemoryDrawer,
  onOpenThread,
  onOpenHandoff,
  onInvokeWorkflowSkill,
  onOpenThreadFromDraft,
  onCreateHandoffFromDraft,
  onQueueFollowUpLoop
}) => {
  const isThreads = mode === 'threads';

  const leftPanel = isThreads ? (
    <ThreadsSidebar
      threadsModel={threadsModel}
      onOpenThread={onOpenThread}
    />
  ) : (
    <HandoffsSidebar
      handoffsModel={handoffsModel}
      onOpenHandoff={onOpenHandoff}
    />
  );

  const mainPanel = isThreads ? (
    <ThreadsMainPanel
      threadsModel={threadsModel}
      relatedApprovalsModel={threadApprovalHistoryModel}
      hookRunsModel={threadHookRunsModel}
      draftsModel={protocolArtifactDraftsModel}
      upkeepCyclesModel={upkeepCyclesModel}
      onOpenHandoff={onOpenHandoff}
      onOpenThread={onOpenThread}
      onInvokeWorkflowSkill={onInvokeWorkflowSkill}
      onOpenThreadFromDraft={onOpenThreadFromDraft}
      onCreateHandoffFromDraft={onCreateHandoffFromDraft}
      onQueueFollowUpLoop={onQueueFollowUpLoop}
    />
  ) : (
    <HandoffsMainPanel
      handoffsModel={handoffsModel}
      relatedApprovalsModel={handoffApprovalHistoryModel}
      hookRunsModel={handoffHookRunsModel}
      draftsModel={protocolArtifactDraftsModel}
      upkeepCyclesModel={upkeepCyclesModel}
      onOpenThread={onOpenThread}
      onOpenHandoff={onOpenHandoff}
      onInvokeWorkflowSkill={onInvokeWorkflowSkill}
      onOpenThreadFromDraft={onOpenThreadFromDraft}
      onCreateHandoffFromDraft={onCreateHandoffFromDraft}
      onQueueFollowUpLoop={onQueueFollowUpLoop}
    />
  );

  const rightPanel = (
    <div className="section-stack think-layout__right-panel">
      {workingMemoryDrawer}
      <SurfaceCard className="think-threads-card think-protocol-rail">
        <SectionHeader
          title={isThreads ? 'Thread protocol' : 'Handoff protocol'}
          subtitle="The main canvas now owns live state, drafts, upkeep loops, and operating history."
        />
        <p className="muted small">
          Use this rail for working memory and approval actions. Planner state, specialist context, upkeep loops, artifacts, and execution history now stay together in the central operating canvas.
        </p>
      </SurfaceCard>
      <ProtocolApprovalsPanel
        approvalsModel={protocolApprovalsModel}
        className="think-threads-card"
      />
    </div>
  );

  if (variant === 'left') return leftPanel;
  if (variant === 'right') return rightPanel;
  return mainPanel;
};

export default ProtocolRouteView;
