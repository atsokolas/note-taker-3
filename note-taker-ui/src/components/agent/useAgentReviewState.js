import { useCallback, useMemo, useState } from 'react';
import {
  applyAgentStructureProposal,
  listAgentStructureProposals,
  rejectAgentStructureProposal,
  rollbackAgentStructureProposal,
  updateAgentStructureProposal
} from '../../api/agent';

const clean = (value) => String(value || '').trim();

const replaceEntryByKey = (entries = [], nextEntry = null, key = '') => {
  const safeKey = clean(key);
  const entryKey = safeKey ? clean(nextEntry?.[safeKey]) : '';
  if (!safeKey || !entryKey) return Array.isArray(entries) ? entries : [];
  const safeEntries = Array.isArray(entries) ? entries : [];
  const hasExisting = safeEntries.some((entry) => clean(entry?.[safeKey]) === entryKey);
  if (!hasExisting) return [nextEntry, ...safeEntries];
  return safeEntries.map((entry) => (
    clean(entry?.[safeKey]) === entryKey ? nextEntry : entry
  ));
};

const partitionPendingEntries = (entries = []) => {
  const safeEntries = Array.isArray(entries) ? entries : [];
  return {
    pending: safeEntries.filter((entry) => clean(entry?.status).toLowerCase() === 'pending'),
    resolved: safeEntries.filter((entry) => clean(entry?.status).toLowerCase() !== 'pending')
  };
};

/* The Partner's structure plans for one thread: load them, change an
   operation's status, apply, reject, or roll back. */
const useAgentReviewState = ({
  mapStructureProposal,
  setError
} = {}) => {
  const [structureProposals, setStructureProposals] = useState([]);
  const [structureProposalLoadingId, setStructureProposalLoadingId] = useState('');
  const [structureProposalOperationLoadingId, setStructureProposalOperationLoadingId] = useState('');

  const reportError = useCallback((message) => {
    if (typeof setError === 'function') setError(message);
  }, [setError]);

  const replaceStructureProposal = useCallback((nextProposal) => {
    const mapped = typeof mapStructureProposal === 'function' ? mapStructureProposal(nextProposal) : nextProposal;
    setStructureProposals((prev) => replaceEntryByKey(prev, mapped, 'structureProposalId'));
  }, [mapStructureProposal]);

  const loadStructureProposals = useCallback(async (threadId) => {
    const safeThreadId = clean(threadId);
    if (!safeThreadId) {
      setStructureProposals([]);
      return;
    }
    try {
      const result = await listAgentStructureProposals({ threadId: safeThreadId, status: 'all' });
      const rows = Array.isArray(result?.proposals)
        ? result.proposals
        : Array.isArray(result?.structureProposals)
          ? result.structureProposals
          : [];
      setStructureProposals(rows.map((entry) => mapStructureProposal(entry)));
    } catch (_error) {
      // Keep the panel usable even if structure proposal hydration fails.
    }
  }, [mapStructureProposal]);

  const handleUpdateStructureProposalOperationStatus = useCallback(async (proposal, operation, nextStatus) => {
    const safeProposalId = clean(proposal?.structureProposalId);
    const safeOpId = clean(operation?.opId);
    const safeStatus = clean(nextStatus);
    if (!safeProposalId || !safeOpId || !safeStatus) return;
    setStructureProposalOperationLoadingId(`${safeProposalId}:${safeOpId}`);
    try {
      const result = await updateAgentStructureProposal(safeProposalId, {
        operations: (Array.isArray(proposal?.operations) ? proposal.operations : []).map((entry) => (
          clean(entry?.opId) === safeOpId
            ? { opId: safeOpId, status: safeStatus }
            : { opId: clean(entry?.opId), status: clean(entry?.status) || 'pending' }
        ))
      });
      const nextProposal = result?.proposal || result?.structureProposal;
      if (nextProposal) replaceStructureProposal(nextProposal);
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to update structure plan.');
    } finally {
      setStructureProposalOperationLoadingId('');
    }
  }, [replaceStructureProposal, reportError]);

  const handleBulkUpdateStructureProposalOperationStatus = useCallback(async (proposal, operationIds = [], nextStatus = '') => {
    const safeProposalId = clean(proposal?.structureProposalId);
    const safeStatus = clean(nextStatus);
    const selectedIds = new Set(
      (Array.isArray(operationIds) ? operationIds : [])
        .map((value) => clean(value))
        .filter(Boolean)
    );
    if (!safeProposalId || !safeStatus || selectedIds.size === 0) return;
    setStructureProposalOperationLoadingId(`${safeProposalId}:bulk`);
    try {
      const result = await updateAgentStructureProposal(safeProposalId, {
        operations: (Array.isArray(proposal?.operations) ? proposal.operations : []).map((entry) => {
          const opId = clean(entry?.opId);
          if (selectedIds.has(opId)) return { opId, status: safeStatus };
          return { opId, status: clean(entry?.status) || 'pending' };
        })
      });
      const nextProposal = result?.proposal || result?.structureProposal;
      if (nextProposal) replaceStructureProposal(nextProposal);
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to update structure plan.');
    } finally {
      setStructureProposalOperationLoadingId('');
    }
  }, [replaceStructureProposal, reportError]);

  const handleApplyStructureProposal = useCallback(async (proposal) => {
    const safeProposalId = clean(proposal?.structureProposalId);
    if (!safeProposalId) return;
    setStructureProposalLoadingId(safeProposalId);
    try {
      const result = await applyAgentStructureProposal(safeProposalId);
      const nextProposal = result?.proposal || result?.structureProposal;
      if (nextProposal) replaceStructureProposal(nextProposal);
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to apply structure plan.');
    } finally {
      setStructureProposalLoadingId('');
    }
  }, [replaceStructureProposal, reportError]);

  const handleRejectStructureProposal = useCallback(async (proposal) => {
    const safeProposalId = clean(proposal?.structureProposalId);
    if (!safeProposalId) return;
    setStructureProposalLoadingId(safeProposalId);
    try {
      const result = await rejectAgentStructureProposal(safeProposalId);
      const nextProposal = result?.proposal || result?.structureProposal;
      if (nextProposal) replaceStructureProposal(nextProposal);
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to reject structure plan.');
    } finally {
      setStructureProposalLoadingId('');
    }
  }, [replaceStructureProposal, reportError]);

  const handleRollbackStructureProposal = useCallback(async (proposal) => {
    const safeProposalId = clean(proposal?.structureProposalId);
    if (!safeProposalId) return;
    setStructureProposalLoadingId(safeProposalId);
    try {
      const result = await rollbackAgentStructureProposal(safeProposalId);
      const nextProposal = result?.proposal || result?.structureProposal;
      if (nextProposal) replaceStructureProposal(nextProposal);
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to roll back structure plan.');
    } finally {
      setStructureProposalLoadingId('');
    }
  }, [replaceStructureProposal, reportError]);

  const structureProposalBuckets = useMemo(
    () => partitionPendingEntries(structureProposals),
    [structureProposals]
  );

  return {
    structureProposalLoadingId,
    structureProposalOperationLoadingId,
    pendingStructureProposals: structureProposalBuckets.pending,
    resolvedStructureProposals: structureProposalBuckets.resolved,
    loadStructureProposals,
    handleUpdateStructureProposalOperationStatus,
    handleBulkUpdateStructureProposalOperationStatus,
    handleApplyStructureProposal,
    handleRejectStructureProposal,
    handleRollbackStructureProposal
  };
};

export default useAgentReviewState;
