import { useCallback, useEffect, useRef, useState } from 'react';
import { updateNotebookWorkbench } from '../../../api/notebook';
import { normalizeNotebookWorkingState } from '../../../utils/notebookWorkbench';

const SAVE_DELAY_MS = 420;

const useNotebookWorkbench = (entry, { onEntryChange } = {}) => {
  const entryId = String(entry?._id || '');
  const [state, setState] = useState(() => normalizeNotebookWorkingState(entry?.workingState));
  const [saveState, setSaveState] = useState('idle');
  const [error, setError] = useState('');
  const desiredRef = useRef(state);
  const revisionRef = useRef(state.revision);
  const dirtyVersionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const timerRef = useRef(null);
  const inFlightRef = useRef(null);
  const activeIdRef = useRef(entryId);
  const flushRef = useRef(null);

  useEffect(() => {
    activeIdRef.current = entryId;
    const incoming = normalizeNotebookWorkingState(entry?.workingState);
    desiredRef.current = incoming;
    revisionRef.current = incoming.revision;
    dirtyVersionRef.current = 0;
    savedVersionRef.current = 0;
    setState(incoming);
    setSaveState('idle');
    setError('');
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(async () => {
    if (!entryId || activeIdRef.current !== entryId) return false;
    if (inFlightRef.current) return inFlightRef.current;
    if (savedVersionRef.current === dirtyVersionRef.current) return true;
    const savingVersion = dirtyVersionRef.current;
    const snapshot = desiredRef.current;
    setSaveState('saving');
    setError('');
    const attempt = (async () => {
      try {
        const saved = normalizeNotebookWorkingState(await updateNotebookWorkbench(
          entryId,
          snapshot,
          revisionRef.current
        ));
        if (activeIdRef.current !== entryId) return true;
        revisionRef.current = saved.revision;
        savedVersionRef.current = savingVersion;
        desiredRef.current = { ...desiredRef.current, revision: saved.revision };
        setState(desiredRef.current);
        onEntryChange?.(saved);
        setSaveState(savedVersionRef.current === dirtyVersionRef.current ? 'saved' : 'dirty');
        if (savedVersionRef.current !== dirtyVersionRef.current) {
          timerRef.current = window.setTimeout(() => flushRef.current?.(), 0);
        }
        return true;
      } catch (saveError) {
        if (activeIdRef.current !== entryId) return false;
        const current = saveError?.response?.data?.workingState;
        if (saveError?.response?.status === 409 && current) {
          revisionRef.current = normalizeNotebookWorkingState(current).revision;
          setError('Nearby material changed elsewhere. Your local version is still here; retry to save it against the current note.');
        } else {
          setError(saveError?.response?.data?.error || 'Nearby material was not saved.');
        }
        setSaveState('error');
        return false;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = attempt;
    return attempt;
  }, [entryId, onEntryChange]);

  flushRef.current = commit;

  const update = useCallback((updater) => {
    const previous = desiredRef.current;
    const next = normalizeNotebookWorkingState(
      typeof updater === 'function' ? updater(previous) : updater
    );
    next.revision = revisionRef.current;
    desiredRef.current = next;
    dirtyVersionRef.current += 1;
    setState(next);
    setSaveState('dirty');
    setError('');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => flushRef.current?.(), SAVE_DELAY_MS);
    return next;
  }, []);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  return { state, update, flush: commit, saveState, error };
};

export default useNotebookWorkbench;
