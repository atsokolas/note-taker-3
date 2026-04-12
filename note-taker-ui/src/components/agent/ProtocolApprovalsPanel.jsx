import React from 'react';
import { Button, SectionHeader, SurfaceCard } from '../ui';

const ProtocolApprovalsPanel = ({
  approvalsModel,
  title = 'Protocol approvals',
  subtitle = 'Queued agent actions that need user confirmation before they mutate shared threads or handoffs.',
  emptyText = 'No pending protocol approvals.',
  showActions = true,
  className = ''
}) => {
  const {
    protocolApprovals,
    protocolApprovalsLoading,
    protocolApprovalsError,
    protocolApprovalBusyId,
    handleApproveProtocolApproval,
    handleRejectProtocolApproval
  } = approvalsModel || {};

  const renderTimeline = (approval = {}) => {
    const items = [];
    if (approval?.requestedBy?.actorType) items.push(`requested by ${approval.requestedBy.actorType}`);
    if (approval?.approvedAt) items.push(`approved ${new Date(approval.approvedAt).toLocaleString()}`);
    if (approval?.rejectedAt) items.push(`rejected ${new Date(approval.rejectedAt).toLocaleString()}`);
    if (approval?.executedAt) items.push(`executed ${new Date(approval.executedAt).toLocaleString()}`);
    return items.join(' · ');
  };

  return (
    <SurfaceCard className={className}>
      <SectionHeader title={title} subtitle={subtitle} />
      {protocolApprovalsError && <p className="status-message error-message">{protocolApprovalsError}</p>}
      {protocolApprovalsLoading ? (
        <p className="muted small">Loading protocol approvals…</p>
      ) : !Array.isArray(protocolApprovals) || protocolApprovals.length === 0 ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        <div className="section-stack">
          {protocolApprovals.map((approval) => {
            const approvalId = String(approval?.approvalId || '');
            const busy = protocolApprovalBusyId === approvalId;
            return (
              <div key={approvalId} className="think-protocol-approval">
                <div className="think-protocol-approval__header">
                  <span className="think-protocol-approval__op">{approval?.op || 'Protocol action'}</span>
                  <span className="think-protocol-approval__actor">{approval?.requestedBy?.actorType || 'agent'}</span>
                </div>
                {approval?.reason && <p className="muted small">{approval.reason}</p>}
                <div className="think-protocol-approval__meta">
                  <span className={`think-protocol-approval__status is-${String(approval?.status || '').toLowerCase() || 'pending'}`}>
                    {approval?.status || 'pending'}
                  </span>
                  {approval?.preview?.title && <span>{approval.preview.title}</span>}
                  {approval?.preview?.threadId && <span>thread {approval.preview.threadId}</span>}
                  {approval?.preview?.handoffId && <span>handoff {approval.preview.handoffId}</span>}
                </div>
                {renderTimeline(approval) && <p className="muted small">{renderTimeline(approval)}</p>}
                {showActions && approval?.status === 'pending' && (
                  <div className="think-protocol-approval__actions">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handleApproveProtocolApproval?.(approvalId)}
                    >
                      {busy ? 'Applying…' : 'Approve'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handleRejectProtocolApproval?.(approvalId)}
                    >
                      {busy ? 'Working…' : 'Reject'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SurfaceCard>
  );
};

export default ProtocolApprovalsPanel;
