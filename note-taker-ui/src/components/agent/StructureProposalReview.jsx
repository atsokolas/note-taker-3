import React, { useCallback, useMemo, useState } from 'react';
import { Button, QuietButton } from '../ui';
import {
  getSelectableStructureOperations,
  resolveOperationEvidence,
  resolveOperationRationale,
  resolveSourceQualityKey,
  resolveSourceQualityLabel
} from './structureProposalReviewModel';

const clean = (value) => String(value || '').trim();
const formatStatusLabel = (value = '') => clean(value).replace(/_/g, ' ') || 'pending';

const formatDateTime = (value = '') => {
  const safe = clean(value);
  if (!safe) return '';
  const parsed = new Date(safe);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const formatScopeLabel = (proposal = {}) => {
  const scope = clean(proposal?.scope);
  const scopeRef = clean(proposal?.scopeRef);
  if (!scope && !scopeRef) return 'organization plan';
  const scopeLabel = scope ? scope.replace(/_/g, ' ') : 'organization plan';
  return scopeRef ? `${scopeLabel} · ${scopeRef}` : scopeLabel;
};

const OPERATION_LABELS = {
  create_folder: 'Folders created',
  rename_folder: 'Folders renamed',
  move_item: 'Items moved',
  merge_item: 'Sources merged',
  merge_folder: 'Folders merged',
  delete_folder: 'Folders removed'
};

const summarizeOperations = (operations = []) => {
  const counts = operations.reduce((acc, operation) => {
    const type = clean(operation?.type);
    if (!type) return acc;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([type, count]) => ({
    key: type,
    label: OPERATION_LABELS[type] || formatStatusLabel(type),
    value: count
  }));
};

const describeOperationTitle = (operation = {}) => {
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const preview = operation?.preview && typeof operation.preview === 'object' ? operation.preview : {};
  switch (clean(operation?.type)) {
    case 'create_folder':
      return `Create ${clean(payload.name || preview.folderName || 'folder')}`;
    case 'rename_folder':
      return `Rename ${clean(preview.from || payload.folderId || 'folder')} to ${clean(payload.name || preview.to || 'new name')}`;
    case 'move_item':
      return `Move ${clean(preview.itemTitle || payload.itemTitle || payload.itemId || 'item')}`;
    case 'merge_item':
      return `Merge duplicate source ${clean(preview.sourceTitle || payload.sourceTitle || payload.sourceItemId || 'item')}`;
    case 'merge_folder':
      return `Merge ${clean(preview.sourceFolderName || payload.sourceFolderId || 'folder')}`;
    case 'delete_folder':
      return `Delete ${clean(preview.folderName || payload.folderId || 'folder')}`;
    default:
      return clean(operation?.title) || formatStatusLabel(operation?.type || 'step');
  }
};

const describeOperationDetail = (operation = {}) => {
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const preview = operation?.preview && typeof operation.preview === 'object' ? operation.preview : {};
  const destination = clean(
    preview.destinationFolderName
    || payload.destinationFolderName
    || payload.destinationFolderId
  );
  const reason = clean(preview.reason || payload.reason);
  switch (clean(operation?.type)) {
    case 'create_folder':
      return clean(preview.parentFolderName || payload.parentFolderId)
        ? `Inside ${clean(preview.parentFolderName || payload.parentFolderId)}`
        : 'New container for a cleaner cluster.';
    case 'rename_folder':
      return clean(preview.reason || '')
        || 'Normalize folder naming without moving contents.';
    case 'move_item':
      return destination ? `Destination: ${destination}` : 'Move into a stronger home.';
    case 'merge_item':
      return clean(preview.destinationTitle || payload.destinationTitle || payload.destinationItemId)
        ? `Into ${clean(preview.destinationTitle || payload.destinationTitle || payload.destinationItemId)}`
        : 'Merge duplicate highlights into the canonical source.';
    case 'merge_folder':
      return destination
        ? `Into ${destination}`
        : 'Collapse overlapping folders into one destination.';
    case 'delete_folder':
      return reason || 'Remove empty or obsolete structure after moves land.';
    default:
      return reason || '';
  }
};

const formatExecutionSummary = (executionResult = null) => {
  if (!executionResult || typeof executionResult !== 'object') return '';
  const parts = [];
  const appliedCount = Number(executionResult.appliedCount) || 0;
  const skippedCount = Number(executionResult.skippedCount) || 0;
  const failedCount = Number(executionResult.failedCount) || 0;
  if (appliedCount > 0) parts.push(`${appliedCount} applied`);
  if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
  if (failedCount > 0) parts.push(`${failedCount} failed`);
  return parts.join(' · ');
};

const StructureProposalReview = ({
  proposal = {},
  isLoading = false,
  activeOperationId = '',
  onApply = null,
  onReject = null,
  onRollback = null,
  onUpdateOperationStatus = null,
  onBulkUpdateOperationStatus = null
}) => {
  const status = clean(proposal?.status).toLowerCase() || 'pending';
  const isPending = status === 'pending';
  const isRollbackable = status === 'applied' || status === 'partially_applied';
  const activeOperationKey = clean(activeOperationId);
  const operations = useMemo(
    () => (Array.isArray(proposal?.operations) ? proposal.operations : []),
    [proposal?.operations]
  );
  const actionableOperations = operations.filter(
    (operation) => clean(operation?.status).toLowerCase() !== 'rejected' && operation?.isActionable !== false
  );
  const selectableOperations = useMemo(
    () => getSelectableStructureOperations(operations),
    [operations]
  );
  const selectableOpIds = useMemo(
    () => selectableOperations.map((operation) => clean(operation?.opId)).filter(Boolean),
    [selectableOperations]
  );
  const [selectedOpIds, setSelectedOpIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const selectedCount = useMemo(
    () => selectableOperations.filter((operation) => selectedOpIds.has(clean(operation?.opId))).length,
    [selectableOperations, selectedOpIds]
  );
  const allSelected = selectableOpIds.length > 0 && selectedCount === selectableOpIds.length;

  const toggleOperationSelection = useCallback((opId) => {
    const safeOpId = clean(opId);
    if (!safeOpId) return;
    setSelectedOpIds((prev) => {
      const next = new Set(prev);
      if (next.has(safeOpId)) next.delete(safeOpId);
      else next.add(safeOpId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedOpIds(new Set(selectableOpIds));
  }, [selectableOpIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedOpIds(new Set());
  }, []);

  const handleBulkStatus = useCallback(async (nextStatus) => {
    const safeStatus = clean(nextStatus).toLowerCase();
    const selectedIds = selectableOpIds.filter((opId) => selectedOpIds.has(opId));
    if (!safeStatus || selectedIds.length === 0) return;

    setBulkBusy(true);
    try {
      if (typeof onBulkUpdateOperationStatus === 'function') {
        await onBulkUpdateOperationStatus(proposal, selectedIds, safeStatus);
      } else if (typeof onUpdateOperationStatus === 'function') {
        for (const opId of selectedIds) {
          const operation = operations.find((entry) => clean(entry?.opId) === opId);
          if (!operation) continue;
          // eslint-disable-next-line no-await-in-loop
          await onUpdateOperationStatus(proposal, operation, safeStatus);
        }
      }
      setSelectedOpIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  }, [onBulkUpdateOperationStatus, onUpdateOperationStatus, operations, proposal, selectableOpIds, selectedOpIds]);

  const operationSummary = useMemo(
    () => summarizeOperations(operations),
    [operations]
  );
  const executionSummary = formatExecutionSummary(proposal?.executionResult);
  const timelineLabel = proposal?.rolledBackAt
    ? `Rolled back ${formatDateTime(proposal.rolledBackAt)}`
    : proposal?.acceptedAt
      ? `Applied ${formatDateTime(proposal.acceptedAt)}`
      : proposal?.rejectedAt
        ? `Rejected ${formatDateTime(proposal.rejectedAt)}`
        : '';
  const bulkDisabled = isLoading || bulkBusy || !isPending;

  return (
    <article
      className={`agent-thought-partner__review-card agent-thought-partner__review-card--structure ${isPending ? 'is-pending-plan' : 'is-history'} is-${status || 'pending'}`.trim()}
      data-testid={`structure-proposal-${proposal?.structureProposalId || 'unknown'}`}
    >
      <div className="agent-thought-partner__review-head">
        <div>
          <div className="agent-thought-partner__draft-meta">
            <span>{formatScopeLabel(proposal)}</span>
            <span>{formatStatusLabel(status)}</span>
          </div>
          <h4>{clean(proposal?.title) || 'Untitled organization plan'}</h4>
        </div>
        {timelineLabel ? (
          <p className="agent-thought-partner__history-timestamp">{timelineLabel}</p>
        ) : executionSummary ? (
          <p className="agent-thought-partner__history-timestamp">{executionSummary}</p>
        ) : null}
      </div>

      {clean(proposal?.summary) && (
        <p className="agent-thought-partner__draft-summary">{proposal.summary}</p>
      )}
      {clean(proposal?.rationale) && (
        <p className="agent-thought-partner__structure-note">{proposal.rationale}</p>
      )}

      {operationSummary.length > 0 && (
        <div className="agent-thought-partner__structure-summary" aria-label="Plan summary">
          {operationSummary.map((item) => (
            <div key={`${proposal?.structureProposalId || 'plan'}-${item.key}`} className="agent-thought-partner__structure-summary-chip">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {isPending && selectableOperations.length > 0 && (
        <div
          className="agent-thought-partner__structure-bulk-bar"
          aria-label="Bulk filing actions"
          data-testid="structure-proposal-bulk-bar"
        >
          <div className="agent-thought-partner__structure-bulk-count">
            <strong>{selectedCount}</strong>
            <span>selected</span>
          </div>
          <div className="agent-thought-partner__structure-bulk-actions">
            <QuietButton
              type="button"
              disabled={bulkDisabled || selectableOpIds.length === 0 || allSelected}
              onClick={handleSelectAll}
            >
              Select all
            </QuietButton>
            <QuietButton
              type="button"
              disabled={bulkDisabled || selectedCount === 0}
              onClick={() => handleBulkStatus('approved')}
            >
              {bulkBusy ? 'Saving…' : 'Accept selected'}
            </QuietButton>
            <QuietButton
              type="button"
              disabled={bulkDisabled || selectedCount === 0}
              onClick={() => handleBulkStatus('rejected')}
            >
              {bulkBusy ? 'Saving…' : 'Reject selected'}
            </QuietButton>
            <QuietButton
              type="button"
              disabled={bulkDisabled || selectedCount === 0}
              onClick={handleClearSelection}
            >
              Clear
            </QuietButton>
          </div>
        </div>
      )}

      <div className="agent-thought-partner__structure-operations">
        {operations.map((operation) => {
          const operationStatus = clean(operation?.status).toLowerCase() || 'pending';
          const operationKey = `${clean(proposal?.structureProposalId)}:${clean(operation?.opId)}`;
          const isOperationLoading = activeOperationKey === operationKey || bulkBusy;
          const nextStatus = operationStatus === 'rejected' ? 'approved' : 'rejected';
          const opId = clean(operation?.opId);
          const isSelectable = selectableOpIds.includes(opId);
          const isSelected = selectedOpIds.has(opId);
          const classificationRationale = resolveOperationRationale(operation);
          const sourceQualityLabel = resolveSourceQualityLabel(operation);
          const sourceQualityKey = resolveSourceQualityKey(operation);
          const operationEvidence = resolveOperationEvidence(operation);
          return (
            <section
              key={opId || `${clean(proposal?.structureProposalId)}-${describeOperationTitle(operation)}`}
              className={`agent-thought-partner__structure-step is-${operationStatus || 'pending'} ${operation?.isActionable === false ? 'is-invalid' : ''} ${isSelected ? 'is-bulk-selected' : ''}`.trim()}
            >
              <div className="agent-thought-partner__structure-step-head">
                <div className="agent-thought-partner__structure-step-title-row">
                  {isPending && isSelectable && (
                    <label className="agent-thought-partner__structure-step-check">
                      <span className="sr-only">Select {describeOperationTitle(operation)}</span>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={bulkDisabled}
                        onChange={() => toggleOperationSelection(opId)}
                      />
                    </label>
                  )}
                  <div>
                    <span className="agent-thought-partner__snapshot-label">{formatStatusLabel(operation?.type || 'step')}</span>
                    <p className="agent-thought-partner__structure-step-title">{describeOperationTitle(operation)}</p>
                  </div>
                </div>
                <div className="agent-thought-partner__draft-meta">
                  {sourceQualityLabel ? (
                    <span
                      className={`agent-thought-partner__structure-quality agent-thought-partner__structure-quality--${sourceQualityKey || 'unknown'}`}
                      data-testid={`structure-operation-quality-${opId || 'unknown'}`}
                    >
                      {sourceQualityLabel}
                    </span>
                  ) : null}
                  <span>{formatStatusLabel(operationStatus)}</span>
                  {clean(operation?.targetDomain) && <span>{clean(operation.targetDomain)}</span>}
                </div>
              </div>
              {clean(describeOperationDetail(operation)) && (
                <p className="agent-thought-partner__structure-step-copy">{describeOperationDetail(operation)}</p>
              )}
              {classificationRationale ? (
                <p className="agent-thought-partner__structure-rationale" data-testid={`structure-operation-rationale-${opId || 'unknown'}`}>
                  <span>Why this category?</span>
                  {classificationRationale}
                </p>
              ) : null}
              {operationEvidence.length > 0 ? (
                <div
                  className="agent-thought-partner__structure-evidence"
                  data-testid={`structure-operation-evidence-${opId || 'unknown'}`}
                  aria-label="Filing evidence"
                >
                  {operationEvidence.map((item) => (
                    <span key={`${opId || 'operation'}-${item}`}>{item}</span>
                  ))}
                </div>
              ) : null}
              {Array.isArray(operation?.invalidFields) && operation.invalidFields.length > 0 && (
                <p className="agent-thought-partner__structure-warning">
                  Needs cleanup before it can run: {operation.invalidFields.join(', ')}.
                </p>
              )}
              {isPending && typeof onUpdateOperationStatus === 'function' && opId && (
                <div className="agent-thought-partner__draft-actions">
                  <QuietButton
                    type="button"
                    disabled={isLoading || isOperationLoading}
                    onClick={() => onUpdateOperationStatus(proposal, operation, nextStatus)}
                  >
                    {isOperationLoading
                      ? 'Saving…'
                      : operationStatus === 'rejected'
                        ? 'Restore step'
                        : 'Reject step'}
                  </QuietButton>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="agent-thought-partner__draft-actions">
        {isPending && typeof onApply === 'function' && (
          <Button
            variant="secondary"
            type="button"
            disabled={isLoading || actionableOperations.length === 0}
            onClick={() => onApply(proposal)}
          >
            {isLoading ? 'Applying…' : 'Apply approved changes'}
          </Button>
        )}
        {isPending && typeof onReject === 'function' && (
          <QuietButton
            type="button"
            disabled={isLoading}
            onClick={() => onReject(proposal)}
          >
            {isLoading ? 'Rejecting…' : 'Reject plan'}
          </QuietButton>
        )}
        {isRollbackable && typeof onRollback === 'function' && (
          <Button
            variant="secondary"
            type="button"
            disabled={isLoading}
            onClick={() => onRollback(proposal)}
          >
            {isLoading ? 'Rolling back…' : 'Roll back'}
          </Button>
        )}
      </div>
    </article>
  );
};

export default StructureProposalReview;
