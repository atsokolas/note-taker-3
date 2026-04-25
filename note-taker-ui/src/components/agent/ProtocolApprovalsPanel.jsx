import React, { useState } from 'react';
import { Button, SectionHeader, SurfaceCard } from '../ui';

const ProtocolApprovalsPanel = ({
  approvalsModel,
  title = 'Protocol approvals',
  subtitle = 'Queued agent actions that need user confirmation before they mutate shared threads or handoffs.',
  emptyText = 'No pending protocol approvals.',
  showActions = true,
  className = ''
}) => {
  const [rejectingApprovalId, setRejectingApprovalId] = useState('');
  const [rejectNotes, setRejectNotes] = useState({});
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

  const renderPreview = (approval = {}) => {
    const preview = approval?.preview && typeof approval.preview === 'object' ? approval.preview : {};
    const result = approval?.result && typeof approval.result === 'object' ? approval.result : {};
    const snippets = Array.isArray(preview.snippets) ? preview.snippets.filter(Boolean) : [];
    const meta = [];
    if (Number(preview.itemCount || 0) > 0) meta.push(`${Number(preview.itemCount)} ${Number(preview.itemCount) === 1 ? 'item' : 'items'}`);
    if (Number(result.createdCount || 0) > 0) meta.push(`${Number(result.createdCount)} committed`);
    if (Number(result.skippedExistingCount || 0) > 0) meta.push(`${Number(result.skippedExistingCount)} skipped duplicate`);
    return (
      <>
        {meta.length > 0 && (
          <div className="think-protocol-approval__meta">
            {meta.map((entry) => <span key={entry}>{entry}</span>)}
          </div>
        )}
        {snippets.length > 0 && (
          <ul className="think-protocol-approval__preview">
            {snippets.map((snippet, index) => (
              <li key={`${approval?.approvalId || 'approval'}-${index}`}>{snippet}</li>
            ))}
          </ul>
        )}
        {approval?.decisionNote && <p className="muted small">Decision note: {approval.decisionNote}</p>}
      </>
    );
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
            const isRejecting = rejectingApprovalId === approvalId;
            const rejectNote = String(rejectNotes[approvalId] || '');
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
                {renderPreview(approval)}
                {renderTimeline(approval) && <p className="muted small">{renderTimeline(approval)}</p>}
                {showActions && approval?.status === 'pending' && (
                  <>
                    {isRejecting && (
                      <label className="think-protocol-approval__reject-note">
                        <span>Rejection note</span>
                        <textarea
                          rows={3}
                          value={rejectNote}
                          disabled={busy}
                          placeholder="Optional: explain what should change before this is approved."
                          onChange={(event) => setRejectNotes(prev => ({ ...prev, [approvalId]: event.target.value }))}
                        />
                      </label>
                    )}
                    <div className="think-protocol-approval__actions">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => handleApproveProtocolApproval?.(approvalId)}
                      >
                        {busy ? 'Applying…' : 'Approve'}
                      </Button>
                      {isRejecting ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={async () => {
                              await handleRejectProtocolApproval?.(approvalId, { note: rejectNote });
                              setRejectingApprovalId('');
                            }}
                          >
                            {busy ? 'Working…' : 'Confirm reject'}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => setRejectingApprovalId('')}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setRejectingApprovalId(approvalId)}
                        >
                          Reject
                        </Button>
                      )}
                    </div>
                  </>
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
