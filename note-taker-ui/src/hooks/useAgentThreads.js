import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  convertAgentThreadToHandoff,
  createAgentThread,
  getAgentThread,
  listAgentThreads,
  updateAgentThread
} from '../api/agent';

const clean = (value) => String(value || '').trim();

const THREAD_SCOPE_LABELS = {
  global: 'Global',
  workspace: 'Workspace',
  article: 'Article',
  notebook: 'Notebook',
  concept: 'Concept',
  handoff: 'Handoff',
  selection: 'Selection'
};

const buildDefaultThreadDraft = (scopeFilter = 'all') => {
  const safeScope = clean(scopeFilter).toLowerCase();
  const scopeType = safeScope && safeScope !== 'all' && safeScope !== 'handoff'
    ? safeScope
    : 'global';
  const scopeTitle = THREAD_SCOPE_LABELS[scopeType] || 'Shared';
  return {
    title: `${scopeTitle} thread`,
    scope: {
      type: scopeType,
      title: scopeTitle
    },
    checkpoint: {
      summary: '',
      openQuestions: [],
      nextActions: []
    }
  };
};

const upsertThreadRow = (rows = [], nextThread = null) => {
  if (!nextThread?.threadId) return rows;
  const safeRows = Array.isArray(rows) ? rows : [];
  const nextId = String(nextThread.threadId);
  const existingIndex = safeRows.findIndex((row) => String(row?.threadId || '') === nextId);
  if (existingIndex === -1) return [nextThread, ...safeRows];
  return safeRows.map((row, index) => (index === existingIndex ? nextThread : row));
};

const useAgentThreads = ({
  enabled = false,
  selectedThreadId = '',
  onOpenThread = null,
  onProtocolApprovalQueued = null
} = {}) => {
  const [threads, setThreads] = useState([]);
  const [selectedThreadOverride, setSelectedThreadOverride] = useState(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState('');
  const [threadStatusFilter, setThreadStatusFilter] = useState('active');
  const [threadScopeFilter, setThreadScopeFilter] = useState('all');
  const [threadActionBusyId, setThreadActionBusyId] = useState('');
  const [threadActionError, setThreadActionError] = useState('');
  const [threadActionInfo, setThreadActionInfo] = useState('');
  const [threadCreateBusy, setThreadCreateBusy] = useState(false);
  const [threadCreateError, setThreadCreateError] = useState('');
  const [threadCreateInfo, setThreadCreateInfo] = useState('');
  const [threadConvertBusyId, setThreadConvertBusyId] = useState('');

  const applyThreadResponseMeta = useCallback(async (response, fallbackInfo = '') => {
    const warnings = Array.isArray(response?.hookWarnings) ? response.hookWarnings.filter(Boolean) : [];
    if (String(response?.status || '').trim().toLowerCase() === 'approval_required') {
      setThreadActionInfo(String(response?.reason || fallbackInfo || 'Action queued for approval.'));
      if (typeof onProtocolApprovalQueued === 'function') await onProtocolApprovalQueued();
      return { approvalQueued: true, warnings };
    }
    if (warnings.length > 0) {
      setThreadActionInfo(warnings.join(' '));
    }
    return { approvalQueued: false, warnings };
  }, [onProtocolApprovalQueued]);

  const formatActor = useCallback((actor = {}) => {
    const actorType = clean(actor?.actorType).toLowerCase();
    const actorId = clean(actor?.actorId);
    if (actorType === 'user') return 'You';
    if (actorType === 'native_agent') return actorId ? `Native ${actorId}` : 'Native agent';
    if (actorType === 'byo_agent') return actorId ? `Personal ${actorId}` : 'Personal agent';
    return 'Unknown actor';
  }, []);

  const formatScopeLabel = useCallback((scope = {}) => {
    const type = clean(scope?.type).toLowerCase();
    const label = THREAD_SCOPE_LABELS[type] || 'Shared';
    const title = clean(scope?.title);
    return title ? `${label} · ${title}` : label;
  }, []);

  const formatDateTime = useCallback((value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString();
  }, []);

  const hydrateThread = useCallback((thread) => {
    if (!thread?.threadId) return null;
    setThreads((previous) => upsertThreadRow(previous, thread));
    if (String(thread.threadId) === String(selectedThreadId || '')) {
      setSelectedThreadOverride(thread);
    }
    return thread;
  }, [selectedThreadId]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError('');
    try {
      const response = await listAgentThreads({
        status: threadStatusFilter || 'active',
        scopeType: threadScopeFilter === 'all' ? '' : threadScopeFilter,
        limit: 60
      });
      const rows = Array.isArray(response?.threads) ? response.threads : [];
      setThreads(rows);
      const safeSelectedId = clean(selectedThreadId);
      if (safeSelectedId) {
        const selectedFromRows = rows.find((row) => String(row?.threadId || '') === safeSelectedId) || null;
        if (selectedFromRows) {
          setSelectedThreadOverride(selectedFromRows);
        } else {
          try {
            const selectedResponse = await getAgentThread(safeSelectedId);
            setSelectedThreadOverride(selectedResponse?.thread || null);
          } catch (threadError) {
            setSelectedThreadOverride(null);
          }
        }
      } else {
        setSelectedThreadOverride(null);
      }
    } catch (error) {
      setThreadsError(error.response?.data?.error || 'Failed to load shared threads.');
      setThreads([]);
      setSelectedThreadOverride(null);
    } finally {
      setThreadsLoading(false);
    }
  }, [selectedThreadId, threadScopeFilter, threadStatusFilter]);

  useEffect(() => {
    if (!enabled) return;
    loadThreads();
  }, [enabled, loadThreads]);

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThreadOverride(null);
      return;
    }
    const selectedFromRows = threads.find((row) => String(row?.threadId || '') === String(selectedThreadId)) || null;
    if (selectedFromRows) {
      setSelectedThreadOverride(selectedFromRows);
    }
  }, [selectedThreadId, threads]);

  const activeThreadData = useMemo(() => {
    const safeSelectedId = clean(selectedThreadId);
    if (safeSelectedId) {
      return threads.find((row) => String(row?.threadId || '') === safeSelectedId)
        || (selectedThreadOverride?.threadId === safeSelectedId ? selectedThreadOverride : null);
    }
    return threads[0] || null;
  }, [selectedThreadId, selectedThreadOverride, threads]);

  const refreshThread = useCallback(async (threadId) => {
    const safeThreadId = clean(threadId);
    if (!safeThreadId) return null;
    const response = await getAgentThread(safeThreadId);
    return hydrateThread(response?.thread || null);
  }, [hydrateThread]);

  const handleCreateThread = useCallback(async () => {
    if (threadCreateBusy) return;
    setThreadCreateBusy(true);
    setThreadCreateError('');
    setThreadCreateInfo('');
    try {
      const response = await createAgentThread(buildDefaultThreadDraft(threadScopeFilter));
      const meta = await applyThreadResponseMeta(response, 'Thread creation queued for approval.');
      if (meta.approvalQueued) return null;
      const createdThread = hydrateThread(response?.thread || null);
      if (meta.warnings.length > 0) setThreadCreateInfo(meta.warnings.join(' '));
      if (createdThread?.threadId && typeof onOpenThread === 'function') {
        onOpenThread(createdThread.threadId);
      }
      return createdThread;
    } catch (error) {
      setThreadCreateError(error.response?.data?.error || 'Failed to create thread.');
      return null;
    } finally {
      setThreadCreateBusy(false);
    }
  }, [applyThreadResponseMeta, hydrateThread, onOpenThread, threadCreateBusy, threadScopeFilter]);

  const handleUpdateThread = useCallback(async (threadId, payload = {}) => {
    const safeThreadId = clean(threadId);
    if (!safeThreadId || threadActionBusyId) return null;
    setThreadActionBusyId(safeThreadId);
    setThreadActionError('');
    setThreadActionInfo('');
    try {
      const response = await updateAgentThread(safeThreadId, payload);
      const meta = await applyThreadResponseMeta(response, 'Thread update queued for approval.');
      if (meta.approvalQueued) return null;
      return hydrateThread(response?.thread || null);
    } catch (error) {
      setThreadActionError(error.response?.data?.error || error.message || 'Failed to update thread.');
      return null;
    } finally {
      setThreadActionBusyId('');
    }
  }, [applyThreadResponseMeta, hydrateThread, threadActionBusyId]);

  const handleSaveCheckpoint = useCallback(async (threadId, checkpoint) => (
    handleUpdateThread(threadId, { checkpoint })
  ), [handleUpdateThread]);

  const handleToggleArchive = useCallback(async (threadId, shouldArchive = true) => (
    handleUpdateThread(threadId, { status: shouldArchive ? 'archived' : 'active' })
  ), [handleUpdateThread]);

  const handleConvertToHandoff = useCallback(async (threadId, payload = {}) => {
    const safeThreadId = clean(threadId);
    if (!safeThreadId || threadConvertBusyId) return null;
    setThreadConvertBusyId(safeThreadId);
    setThreadActionError('');
    setThreadActionInfo('');
    try {
      const response = await convertAgentThreadToHandoff(safeThreadId, payload);
      const meta = await applyThreadResponseMeta(response, 'Thread conversion queued for approval.');
      if (meta.approvalQueued) return response || null;
      if (response?.thread) hydrateThread(response.thread);
      return response || null;
    } catch (error) {
      setThreadActionError(error.response?.data?.error || error.message || 'Failed to convert thread to handoff.');
      return null;
    } finally {
      setThreadConvertBusyId('');
    }
  }, [applyThreadResponseMeta, hydrateThread, threadConvertBusyId]);

  return {
    threads,
    threadsLoading,
    threadsError,
    threadStatusFilter,
    setThreadStatusFilter,
    threadScopeFilter,
    setThreadScopeFilter,
    threadActionBusyId,
    threadActionError,
    threadActionInfo,
    threadCreateBusy,
    threadCreateError,
    threadCreateInfo,
    threadConvertBusyId,
    activeThreadData,
    formatActor,
    formatScopeLabel,
    formatDateTime,
    loadThreads,
    refreshThread,
    hydrateThread,
    handleCreateThread,
    handleUpdateThread,
    handleSaveCheckpoint,
    handleToggleArchive,
    handleConvertToHandoff
  };
};

export default useAgentThreads;
