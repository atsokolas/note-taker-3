import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dismissAgentArtifactDraft,
  listAgentArtifactDrafts,
  promoteAgentArtifactDraft,
  updateAgentArtifactDraft
} from '../api/agent';

const clean = (value) => String(value || '').trim();

const useAgentArtifactDrafts = ({
  status = 'all',
  threadId = '',
  artifactType = '',
  autoLoad = true,
  onChanged = null
} = {}) => {
  const [artifactDrafts, setArtifactDrafts] = useState([]);
  const [artifactDraftsLoading, setArtifactDraftsLoading] = useState(false);
  const [artifactDraftsError, setArtifactDraftsError] = useState('');
  const [artifactDraftBusyId, setArtifactDraftBusyId] = useState('');

  const loadArtifactDrafts = useCallback(async () => {
    setArtifactDraftsLoading(true);
    setArtifactDraftsError('');
    try {
      const response = await listAgentArtifactDrafts({
        status,
        threadId,
        artifactType
      });
      setArtifactDrafts(Array.isArray(response?.drafts) ? response.drafts : []);
    } catch (error) {
      setArtifactDrafts([]);
      setArtifactDraftsError(error.response?.data?.error || 'Failed to load agent drafts.');
    } finally {
      setArtifactDraftsLoading(false);
    }
  }, [artifactType, status, threadId]);

  useEffect(() => {
    if (!autoLoad) return undefined;
    loadArtifactDrafts();
    return undefined;
  }, [autoLoad, loadArtifactDrafts]);

  const handlePromoteArtifactDraft = useCallback(async (draftId) => {
    const safeId = clean(draftId);
    if (!safeId || artifactDraftBusyId) return null;
    setArtifactDraftBusyId(safeId);
    setArtifactDraftsError('');
    try {
      const result = await promoteAgentArtifactDraft(safeId);
      await loadArtifactDrafts();
      if (typeof onChanged === 'function') await onChanged(result || null);
      return result || null;
    } catch (error) {
      setArtifactDraftsError(error.response?.data?.error || 'Failed to promote draft.');
      return null;
    } finally {
      setArtifactDraftBusyId('');
    }
  }, [artifactDraftBusyId, loadArtifactDrafts, onChanged]);

  const handleDismissArtifactDraft = useCallback(async (draftId) => {
    const safeId = clean(draftId);
    if (!safeId || artifactDraftBusyId) return null;
    setArtifactDraftBusyId(safeId);
    setArtifactDraftsError('');
    try {
      const result = await dismissAgentArtifactDraft(safeId);
      await loadArtifactDrafts();
      if (typeof onChanged === 'function') await onChanged(result || null);
      return result || null;
    } catch (error) {
      setArtifactDraftsError(error.response?.data?.error || 'Failed to dismiss draft.');
      return null;
    } finally {
      setArtifactDraftBusyId('');
    }
  }, [artifactDraftBusyId, loadArtifactDrafts, onChanged]);

  const handleUpdateArtifactDraft = useCallback(async (draftId, payload = {}) => {
    const safeId = clean(draftId);
    if (!safeId || artifactDraftBusyId) return null;
    setArtifactDraftBusyId(safeId);
    setArtifactDraftsError('');
    try {
      const result = await updateAgentArtifactDraft(safeId, payload);
      await loadArtifactDrafts();
      if (typeof onChanged === 'function') await onChanged(result || null);
      return result || null;
    } catch (error) {
      setArtifactDraftsError(error.response?.data?.error || 'Failed to update draft.');
      return null;
    } finally {
      setArtifactDraftBusyId('');
    }
  }, [artifactDraftBusyId, loadArtifactDrafts, onChanged]);

  const pendingCount = useMemo(
    () => artifactDrafts.filter((draft) => clean(draft?.status).toLowerCase() === 'pending').length,
    [artifactDrafts]
  );

  return {
    artifactDrafts,
    artifactDraftsLoading,
    artifactDraftsError,
    artifactDraftBusyId,
    pendingCount,
    loadArtifactDrafts,
    handleUpdateArtifactDraft,
    handlePromoteArtifactDraft,
    handleDismissArtifactDraft
  };
};

export default useAgentArtifactDrafts;
