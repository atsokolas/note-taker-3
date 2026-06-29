import { useCallback, useMemo, useState } from 'react';
import {
  acceptAgentProposedChange,
  applyAgentStructureProposal,
  listAgentProposedChanges,
  listAgentStructureProposals,
  rejectAgentProposedChange,
  rejectAgentStructureProposal,
  rollbackAgentProposedChange,
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

const useAgentReviewState = ({
  activeThreadId = '',
  mapProposedChange,
  mapStructureProposal,
  loadRuns,
  loadHarnessMetrics,
  setError
} = {}) => {
  const [proposedChanges, setProposedChanges] = useState([]);
  const [structureProposals, setStructureProposals] = useState([]);
  const [proposedChangeLoadingId, setProposedChangeLoadingId] = useState('');
  const [structureProposalLoadingId, setStructureProposalLoadingId] = useState('');
  const [structureProposalOperationLoadingId, setStructureProposalOperationLoadingId] = useState('');

  const reportError = useCallback((message) => {
    if (typeof setError === 'function') setError(message);
  }, [setError]);

  const refreshThreadReviewState = useCallback(async () => {
    if (!clean(activeThreadId)) return;
    await loadRuns(activeThreadId);
    await loadHarnessMetrics(activeThreadId);
  }, [activeThreadId, loadHarnessMetrics, loadRuns]);

  const replaceProposedChange = useCallback((nextChange) => {
    const mapped = typeof mapProposedChange === 'function' ? mapProposedChange(nextChange) : nextChange;
    setProposedChanges((prev) => replaceEntryByKey(prev, mapped, 'proposedChangeId'));
  }, [mapProposedChange]);

  const replaceStructureProposal = useCallback((nextProposal) => {
    const mapped = typeof mapStructureProposal === 'function' ? mapStructureProposal(nextProposal) : nextProposal;
    setStructureProposals((prev) => replaceEntryByKey(prev, mapped, 'structureProposalId'));
  }, [mapStructureProposal]);

  const clearReviewState = useCallback(() => {
    setProposedChanges([]);
    setStructureProposals([]);
    setProposedChangeLoadingId('');
    setStructureProposalLoadingId('');
    setStructureProposalOperationLoadingId('');
  }, []);

  const loadProposedChanges = useCallback(async (threadId) => {
    const safeThreadId = clean(threadId);
    if (!safeThreadId) {
      setProposedChanges([]);
      return;
    }
    try {
      const result = await listAgentProposedChanges({ threadId: safeThreadId, status: 'all' });
      setProposedChanges(
        Array.isArray(result?.proposedChanges)
          ? result.proposedChanges.map((entry) => mapProposedChange(entry))
          : []
      );
    } catch (_error) {
      // Keep the panel usable even if proposed change hydration fails.
    }
  }, [mapProposedChange]);

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

  const handleAcceptProposedChange = useCallback(async (proposedChangeId) => {
    const safeId = clean(proposedChangeId);
    if (!safeId) return;
    setProposedChangeLoadingId(safeId);
    try {
      const result = await acceptAgentProposedChange(safeId);
      if (result?.proposedChange) {
        replaceProposedChange(result.proposedChange);
        await refreshThreadReviewState();
      }
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to accept proposed change.');
    } finally {
      setProposedChangeLoadingId('');
    }
  }, [refreshThreadReviewState, replaceProposedChange, reportError]);

  const handleRejectProposedChange = useCallback(async (proposedChangeId) => {
    const safeId = clean(proposedChangeId);
    if (!safeId) return;
    setProposedChangeLoadingId(safeId);
    try {
      const result = await rejectAgentProposedChange(safeId);
      if (result?.proposedChange) {
        replaceProposedChange(result.proposedChange);
        await refreshThreadReviewState();
      }
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to reject proposed change.');
    } finally {
      setProposedChangeLoadingId('');
    }
  }, [refreshThreadReviewState, replaceProposedChange, reportError]);

  const handleRollbackProposedChange = useCallback(async (proposedChangeId) => {
    const safeId = clean(proposedChangeId);
    if (!safeId) return;
    setProposedChangeLoadingId(safeId);
    try {
      const result = await rollbackAgentProposedChange(safeId);
      if (result?.proposedChange) {
        replaceProposedChange(result.proposedChange);
        await refreshThreadReviewState();
      }
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to roll back proposed change.');
    } finally {
      setProposedChangeLoadingId('');
    }
  }, [refreshThreadReviewState, replaceProposedChange, reportError]);

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
      if (nextProposal) {
        replaceStructureProposal(nextProposal);
        if (clean(activeThreadId)) await loadHarnessMetrics(activeThreadId);
      }
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to update structure plan.');
    } finally {
      setStructureProposalOperationLoadingId('');
    }
  }, [activeThreadId, loadHarnessMetrics, replaceStructureProposal, reportError]);

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
      if (nextProposal) {
        replaceStructureProposal(nextProposal);
        if (clean(activeThreadId)) await loadHarnessMetrics(activeThreadId);
      }
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to update structure plan.');
    } finally {
      setStructureProposalOperationLoadingId('');
    }
  }, [activeThreadId, loadHarnessMetrics, replaceStructureProposal, reportError]);

  const handleApplyStructureProposal = useCallback(async (proposal) => {
    const safeProposalId = clean(proposal?.structureProposalId);
    if (!safeProposalId) return;
    setStructureProposalLoadingId(safeProposalId);
    try {
      const result = await applyAgentStructureProposal(safeProposalId);
      const nextProposal = result?.proposal || result?.structureProposal;
      if (nextProposal) {
        replaceStructureProposal(nextProposal);
        await refreshThreadReviewState();
      }
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to apply structure plan.');
    } finally {
      setStructureProposalLoadingId('');
    }
  }, [refreshThreadReviewState, replaceStructureProposal, reportError]);

  const handleRejectStructureProposal = useCallback(async (proposal) => {
    const safeProposalId = clean(proposal?.structureProposalId);
    if (!safeProposalId) return;
    setStructureProposalLoadingId(safeProposalId);
    try {
      const result = await rejectAgentStructureProposal(safeProposalId);
      const nextProposal = result?.proposal || result?.structureProposal;
      if (nextProposal) {
        replaceStructureProposal(nextProposal);
        await refreshThreadReviewState();
      }
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to reject structure plan.');
    } finally {
      setStructureProposalLoadingId('');
    }
  }, [refreshThreadReviewState, replaceStructureProposal, reportError]);

  const handleRollbackStructureProposal = useCallback(async (proposal) => {
    const safeProposalId = clean(proposal?.structureProposalId);
    if (!safeProposalId) return;
    setStructureProposalLoadingId(safeProposalId);
    try {
      const result = await rollbackAgentStructureProposal(safeProposalId);
      const nextProposal = result?.proposal || result?.structureProposal;
      if (nextProposal) {
        replaceStructureProposal(nextProposal);
        await refreshThreadReviewState();
      }
    } catch (error) {
      reportError(error.response?.data?.error || 'Failed to roll back structure plan.');
    } finally {
      setStructureProposalLoadingId('');
    }
  }, [refreshThreadReviewState, replaceStructureProposal, reportError]);

  const proposedChangeBuckets = useMemo(
    () => partitionPendingEntries(proposedChanges),
    [proposedChanges]
  );
  const structureProposalBuckets = useMemo(
    () => partitionPendingEntries(structureProposals),
    [structureProposals]
  );

  return {
    proposedChanges,
    structureProposals,
    proposedChangeLoadingId,
    structureProposalLoadingId,
    structureProposalOperationLoadingId,
    setProposedChangeLoadingId,
    pendingProposedChanges: proposedChangeBuckets.pending,
    resolvedProposedChanges: proposedChangeBuckets.resolved,
    pendingStructureProposals: structureProposalBuckets.pending,
    resolvedStructureProposals: structureProposalBuckets.resolved,
    clearReviewState,
    replaceProposedChange,
    replaceStructureProposal,
    loadProposedChanges,
    loadStructureProposals,
    handleAcceptProposedChange,
    handleRejectProposedChange,
    handleRollbackProposedChange,
    handleUpdateStructureProposalOperationStatus,
    handleBulkUpdateStructureProposalOperationStatus,
    handleApplyStructureProposal,
    handleRejectStructureProposal,
    handleRollbackStructureProposal
  };
};

export default useAgentReviewState;
