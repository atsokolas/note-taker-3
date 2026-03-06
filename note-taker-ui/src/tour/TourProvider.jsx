import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer
} from 'react';
import { fetchTourState, postTourEvent, updateTourState } from '../api/tourApi';
import {
  TOUR_CACHE_KEY,
  TOUR_STATUS,
  TOUR_STEP_IDS,
  TOUR_STEPS
} from './tourConfig';
import tourReducer, { createInitialTourState, tourActionTypes } from './tourReducer';

const TourContext = createContext(null);

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const readCachedState = () => {
  try {
    const raw = localStorage.getItem(TOUR_CACHE_KEY);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

const getStepIndex = (stepId) => TOUR_STEP_IDS.findIndex(id => id === stepId);

const getNextStepId = (stepId) => {
  const currentIndex = getStepIndex(stepId);
  if (currentIndex < 0) return TOUR_STEP_IDS[0] || null;
  return TOUR_STEP_IDS[currentIndex + 1] || null;
};

const getPrevStepId = (stepId) => {
  const currentIndex = getStepIndex(stepId);
  if (currentIndex <= 0) return null;
  return TOUR_STEP_IDS[currentIndex - 1] || null;
};

const getFirstIncompleteStepId = (completedStepIds = []) => {
  const completed = new Set((completedStepIds || []).map(value => String(value || '').trim()));
  return TOUR_STEP_IDS.find(stepId => !completed.has(stepId)) || null;
};

const TourProvider = ({ children }) => {
  const cached = readCachedState();
  const [state, dispatch] = useReducer(
    tourReducer,
    createInitialTourState(),
    (initial) => {
      if (!cached) return initial;
      return {
        ...initial,
        loading: false,
        ...cached,
        open: Boolean(cached.open)
      };
    }
  );

  const hydrateRemote = useCallback((remote) => {
    dispatch({ type: tourActionTypes.HYDRATE_REMOTE, payload: remote });
  }, []);

  const setOpen = useCallback((open) => {
    dispatch({ type: tourActionTypes.SET_OPEN, payload: Boolean(open) });
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const remote = await fetchTourState();
      hydrateRemote(remote);
      return remote;
    } catch (error) {
      dispatch({ type: tourActionTypes.SET_LOADING, payload: false });
      throw error;
    }
  }, [hydrateRemote]);

  const pushPatch = useCallback(async (patch) => {
    const remote = await updateTourState(patch);
    hydrateRemote(remote);
    return remote;
  }, [hydrateRemote]);

  const startTour = useCallback(async ({ restart = false } = {}) => {
    let base = state;
    if (restart) {
      base = await pushPatch({ reset: true });
    }
    const firstStep = getFirstIncompleteStepId(base.completedStepIds || []) || TOUR_STEP_IDS[0] || null;
    const remote = await pushPatch({
      status: TOUR_STATUS.IN_PROGRESS,
      currentStepId: firstStep
    });
    setOpen(true);
    return remote;
  }, [pushPatch, setOpen, state]);

  const resumeTour = useCallback(async () => {
    if (state.status === TOUR_STATUS.COMPLETED) {
      await startTour({ restart: true });
      return;
    }
    if (state.status === TOUR_STATUS.NOT_STARTED) {
      await startTour();
      return;
    }
    const currentStepId = state.currentStepId || getFirstIncompleteStepId(state.completedStepIds || []);
    await pushPatch({
      status: TOUR_STATUS.IN_PROGRESS,
      currentStepId
    });
    setOpen(true);
  }, [pushPatch, setOpen, startTour, state.completedStepIds, state.currentStepId, state.status]);

  const pauseTour = useCallback(async () => {
    if (state.status !== TOUR_STATUS.COMPLETED) {
      await pushPatch({
        status: TOUR_STATUS.PAUSED,
        currentStepId: state.currentStepId
      });
    }
    setOpen(false);
  }, [pushPatch, setOpen, state.currentStepId, state.status]);

  const completeTour = useCallback(async () => {
    await pushPatch({
      status: TOUR_STATUS.COMPLETED,
      currentStepId: null,
      completedStepIds: TOUR_STEP_IDS
    });
    setOpen(false);
  }, [pushPatch, setOpen]);

  const nextStep = useCallback(async () => {
    const activeStepId = state.currentStepId || getFirstIncompleteStepId(state.completedStepIds || []) || TOUR_STEP_IDS[0] || null;
    const next = getNextStepId(activeStepId);
    if (!next) {
      await completeTour();
      return;
    }
    await pushPatch({
      status: TOUR_STATUS.IN_PROGRESS,
      currentStepId: next
    });
    setOpen(true);
  }, [completeTour, pushPatch, setOpen, state.completedStepIds, state.currentStepId]);

  const prevStep = useCallback(async () => {
    const activeStepId = state.currentStepId || TOUR_STEP_IDS[0] || null;
    const prev = getPrevStepId(activeStepId);
    if (!prev) return;
    await pushPatch({
      status: TOUR_STATUS.IN_PROGRESS,
      currentStepId: prev
    });
    setOpen(true);
  }, [pushPatch, setOpen, state.currentStepId]);

  const goToStep = useCallback(async (stepId) => {
    const safeStepId = TOUR_STEP_IDS.includes(stepId) ? stepId : null;
    if (!safeStepId) return;
    await pushPatch({
      status: TOUR_STATUS.IN_PROGRESS,
      currentStepId: safeStepId
    });
    setOpen(true);
  }, [pushPatch, setOpen]);

  const skipTour = useCallback(async () => {
    await pauseTour();
  }, [pauseTour]);

  const restartTour = useCallback(async () => {
    await startTour({ restart: true });
  }, [startTour]);

  const recordEvent = useCallback(async ({ eventType, metadata = {} } = {}) => {
    const result = await postTourEvent({ eventType, metadata });
    if (result?.state) {
      hydrateRemote(result.state);
      return result.state;
    }
    const remote = await refreshState();
    return remote;
  }, [hydrateRemote, refreshState]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const remote = await fetchTourState();
        if (!cancelled) hydrateRemote(remote);
      } catch (error) {
        if (!cancelled) {
          dispatch({ type: tourActionTypes.SET_LOADING, payload: false });
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [hydrateRemote]);

  useEffect(() => {
    if (state.loading) return;
    try {
      const payload = {
        status: state.status,
        currentStepId: state.currentStepId,
        completedStepIds: state.completedStepIds,
        isFirstTimeVisitor: state.isFirstTimeVisitor,
        signals: state.signals,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        updatedAt: state.updatedAt,
        open: state.open
      };
      localStorage.setItem(TOUR_CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
      // ignore cache write errors
    }
  }, [state]);

  const currentIndex = useMemo(() => {
    if (!state.currentStepId) return 0;
    const index = getStepIndex(state.currentStepId);
    return index >= 0 ? index : 0;
  }, [state.currentStepId]);

  const currentStep = useMemo(
    () => TOUR_STEPS.find(step => step.id === state.currentStepId) || TOUR_STEPS[currentIndex] || null,
    [currentIndex, state.currentStepId]
  );

  const value = useMemo(() => ({
    state,
    steps: TOUR_STEPS,
    currentStep,
    currentIndex,
    totalSteps: TOUR_STEPS.length,
    startTour,
    resumeTour,
    pauseTour,
    skipTour,
    restartTour,
    completeTour,
    nextStep,
    prevStep,
    goToStep,
    setOpen,
    refreshState,
    recordEvent
  }), [
    completeTour,
    currentIndex,
    currentStep,
    goToStep,
    nextStep,
    pauseTour,
    prevStep,
    recordEvent,
    refreshState,
    restartTour,
    resumeTour,
    setOpen,
    skipTour,
    startTour,
    state
  ]);

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};

export default TourProvider;
