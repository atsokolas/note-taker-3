import {
  TOUR_SIGNALS_DEFAULT,
  TOUR_STATUS,
  TOUR_STEP_IDS
} from './tourConfig';

export const tourActionTypes = Object.freeze({
  HYDRATE_REMOTE: 'HYDRATE_REMOTE',
  SET_OPEN: 'SET_OPEN',
  SET_CURRENT_STEP: 'SET_CURRENT_STEP',
  SET_LOCAL_STATUS: 'SET_LOCAL_STATUS',
  SET_LOADING: 'SET_LOADING'
});

const normalizeSignals = (input = {}) => ({
  extensionConnected: Boolean(input.extensionConnected),
  firstHighlightCaptured: Boolean(input.firstHighlightCaptured),
  conceptFromHighlight: Boolean(input.conceptFromHighlight),
  workspaceOrganized: Boolean(input.workspaceOrganized),
  semanticSearchUsed: Boolean(input.semanticSearchUsed)
});

const normalizeCompletedStepIds = (input = []) => {
  const source = Array.isArray(input) ? input : [];
  const unique = new Set();
  source.forEach((value) => {
    const safe = String(value || '').trim();
    if (TOUR_STEP_IDS.includes(safe)) unique.add(safe);
  });
  return TOUR_STEP_IDS.filter(stepId => unique.has(stepId));
};

const normalizeStatus = (value) => {
  const safe = String(value || '').trim().toLowerCase();
  return Object.values(TOUR_STATUS).includes(safe) ? safe : TOUR_STATUS.NOT_STARTED;
};

const normalizeCurrentStepId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const safe = String(value).trim();
  return TOUR_STEP_IDS.includes(safe) ? safe : null;
};

const normalizeIsoOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

export const createInitialTourState = () => ({
  loading: true,
  open: false,
  status: TOUR_STATUS.NOT_STARTED,
  currentStepId: null,
  completedStepIds: [],
  isFirstTimeVisitor: true,
  signals: { ...TOUR_SIGNALS_DEFAULT },
  startedAt: null,
  completedAt: null,
  updatedAt: null
});

export const applyRemoteTourState = (state, remote = {}, options = {}) => {
  const preserveOpen = options.preserveOpen !== false;
  return {
    ...state,
    loading: false,
    open: preserveOpen ? state.open : Boolean(options.open),
    status: normalizeStatus(remote.status),
    currentStepId: normalizeCurrentStepId(remote.currentStepId),
    completedStepIds: normalizeCompletedStepIds(remote.completedStepIds),
    isFirstTimeVisitor: Boolean(remote.isFirstTimeVisitor),
    signals: normalizeSignals(remote.signals || {}),
    startedAt: normalizeIsoOrNull(remote.startedAt),
    completedAt: normalizeIsoOrNull(remote.completedAt),
    updatedAt: normalizeIsoOrNull(remote.updatedAt)
  };
};

const tourReducer = (state, action) => {
  switch (action.type) {
    case tourActionTypes.HYDRATE_REMOTE:
      return applyRemoteTourState(state, action.payload || {}, { preserveOpen: true });
    case tourActionTypes.SET_OPEN:
      return { ...state, open: Boolean(action.payload) };
    case tourActionTypes.SET_CURRENT_STEP:
      return { ...state, currentStepId: normalizeCurrentStepId(action.payload) };
    case tourActionTypes.SET_LOCAL_STATUS:
      return { ...state, status: normalizeStatus(action.payload) };
    case tourActionTypes.SET_LOADING:
      return { ...state, loading: Boolean(action.payload) };
    default:
      return state;
  }
};

export default tourReducer;
