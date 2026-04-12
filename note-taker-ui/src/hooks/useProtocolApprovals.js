import { useCallback, useEffect, useState } from 'react';
import {
  approveAgentProtocolApproval,
  listAgentProtocolApprovals,
  rejectAgentProtocolApproval
} from '../api/agent';

const useProtocolApprovals = ({
  initialStatus = 'pending',
  limit = 20,
  threadId = '',
  handoffId = '',
  op = '',
  autoLoad = true,
  onChanged = null
} = {}) => {
  const [protocolApprovals, setProtocolApprovals] = useState([]);
  const [protocolApprovalsLoading, setProtocolApprovalsLoading] = useState(false);
  const [protocolApprovalsError, setProtocolApprovalsError] = useState('');
  const [protocolApprovalBusyId, setProtocolApprovalBusyId] = useState('');

  const loadProtocolApprovals = useCallback(async () => {
    setProtocolApprovalsLoading(true);
    setProtocolApprovalsError('');
    try {
      const response = await listAgentProtocolApprovals({
        status: initialStatus,
        limit,
        threadId,
        handoffId,
        op
      });
      setProtocolApprovals(Array.isArray(response?.approvals) ? response.approvals : []);
    } catch (error) {
      setProtocolApprovals([]);
      setProtocolApprovalsError(error.response?.data?.error || 'Failed to load protocol approvals.');
    } finally {
      setProtocolApprovalsLoading(false);
    }
  }, [handoffId, initialStatus, limit, op, threadId]);

  const handleApproveProtocolApproval = useCallback(async (approvalId) => {
    const safeId = String(approvalId || '').trim();
    if (!safeId || protocolApprovalBusyId) return null;
    setProtocolApprovalBusyId(safeId);
    setProtocolApprovalsError('');
    try {
      const response = await approveAgentProtocolApproval(safeId);
      await loadProtocolApprovals();
      if (typeof onChanged === 'function') await onChanged(response || null);
      return response || null;
    } catch (error) {
      setProtocolApprovalsError(error.response?.data?.error || 'Failed to approve protocol action.');
      return null;
    } finally {
      setProtocolApprovalBusyId('');
    }
  }, [loadProtocolApprovals, onChanged, protocolApprovalBusyId]);

  const handleRejectProtocolApproval = useCallback(async (approvalId) => {
    const safeId = String(approvalId || '').trim();
    if (!safeId || protocolApprovalBusyId) return null;
    setProtocolApprovalBusyId(safeId);
    setProtocolApprovalsError('');
    try {
      const response = await rejectAgentProtocolApproval(safeId);
      await loadProtocolApprovals();
      if (typeof onChanged === 'function') await onChanged(response || null);
      return response || null;
    } catch (error) {
      setProtocolApprovalsError(error.response?.data?.error || 'Failed to reject protocol action.');
      return null;
    } finally {
      setProtocolApprovalBusyId('');
    }
  }, [loadProtocolApprovals, onChanged, protocolApprovalBusyId]);

  useEffect(() => {
    if (!autoLoad) return undefined;
    loadProtocolApprovals();
    return undefined;
  }, [autoLoad, loadProtocolApprovals]);

  return {
    protocolApprovals,
    protocolApprovalsLoading,
    protocolApprovalsError,
    protocolApprovalBusyId,
    loadProtocolApprovals,
    handleApproveProtocolApproval,
    handleRejectProtocolApproval
  };
};

export default useProtocolApprovals;
