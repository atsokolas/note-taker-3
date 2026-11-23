// The reader's interface settings and their first-run tour.
const { UiSettings, TourState } = require('../models/index');
const mongoose = require('mongoose');

const UI_SETTINGS_DEFAULTS = Object.freeze({
  typographyScale: 'default',
  density: 'comfortable',
  theme: 'auto',
  accent: 'electric',
  brandEnergy: true,
  motion: 'system'
});

const UI_SETTINGS_TYPOGRAPHY_VALUES = new Set(['small', 'default', 'large']);
const UI_SETTINGS_DENSITY_VALUES = new Set(['comfortable', 'compact']);
const UI_SETTINGS_THEME_VALUES = new Set(UiSettings.schema.path('theme').enumValues);
const UI_SETTINGS_ACCENT_VALUES = new Set([
  'electric', 'violet', 'indigo',
  'blue', 'emerald', 'amber', 'rose'
]);
const UI_SETTINGS_MOTION_VALUES = new Set(['system', 'reduced']);
const UI_SETTINGS_SCOPE_TYPE_VALUES = new Set(['global', 'workspace', 'concept', 'question', 'notebook']);

const normalizeUiSettingsValue = (value, allowedValues, fallbackValue) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (allowedValues.has(candidate)) return candidate;
  return fallbackValue;
};

const normalizeUiSettingsScope = (workspaceType, workspaceId) => {
  const safeWorkspaceTypeCandidate = String(workspaceType || 'global').trim().toLowerCase();
  const safeWorkspaceType = UI_SETTINGS_SCOPE_TYPE_VALUES.has(safeWorkspaceTypeCandidate)
    ? safeWorkspaceTypeCandidate
    : 'global';
  if (safeWorkspaceType === 'global') {
    return { workspaceType: 'global', workspaceId: '' };
  }
  return {
    workspaceType: safeWorkspaceType,
    workspaceId: String(workspaceId || '').trim().slice(0, 120)
  };
};

const normalizeUiSettingsPayload = (input = {}) => ({
  typographyScale: normalizeUiSettingsValue(
    input.typographyScale,
    UI_SETTINGS_TYPOGRAPHY_VALUES,
    UI_SETTINGS_DEFAULTS.typographyScale
  ),
  density: normalizeUiSettingsValue(
    input.density,
    UI_SETTINGS_DENSITY_VALUES,
    UI_SETTINGS_DEFAULTS.density
  ),
  theme: normalizeUiSettingsValue(
    input.theme,
    UI_SETTINGS_THEME_VALUES,
    UI_SETTINGS_DEFAULTS.theme
  ),
  accent: normalizeUiSettingsValue(
    input.accent,
    UI_SETTINGS_ACCENT_VALUES,
    UI_SETTINGS_DEFAULTS.accent
  ),
  brandEnergy: typeof input.brandEnergy === 'boolean'
    ? input.brandEnergy
    : (String(input.brandEnergy || '').trim().toLowerCase() === 'false'
      ? false
      : (String(input.brandEnergy || '').trim().toLowerCase() === 'true'
        ? true
        : UI_SETTINGS_DEFAULTS.brandEnergy)),
  motion: normalizeUiSettingsValue(
    input.motion,
    UI_SETTINGS_MOTION_VALUES,
    UI_SETTINGS_DEFAULTS.motion
  )
});

const buildUiSettingsResponse = (doc, scope = { workspaceType: 'global', workspaceId: '' }) => {
  const normalized = normalizeUiSettingsPayload(doc || {});
  return {
    ...UI_SETTINGS_DEFAULTS,
    ...normalized,
    workspaceType: scope.workspaceType || 'global',
    workspaceId: scope.workspaceId || '',
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null
  };
};

const TOUR_STEP_IDS = Object.freeze([
  'install_extension',
  'capture_first_highlight',
  'create_concept_from_highlight',
  'organize_workspace',
  'semantic_search'
]);

const TOUR_STATUSES = new Set(['not_started', 'in_progress', 'paused', 'completed']);

const TOUR_SIGNAL_DEFAULTS = Object.freeze({
  extensionConnected: false,
  firstHighlightCaptured: false,
  conceptFromHighlight: false,
  workspaceOrganized: false,
  semanticSearchUsed: false
});

const TOUR_EVENT_TIMESTAMP_DEFAULTS = Object.freeze({
  extension_connected: null,
  highlight_captured: null,
  concept_from_highlight: null,
  workspace_organized: null,
  semantic_search_used: null
});

const TOUR_SIGNAL_TO_STEP = Object.freeze({
  extensionConnected: 'install_extension',
  firstHighlightCaptured: 'capture_first_highlight',
  conceptFromHighlight: 'create_concept_from_highlight',
  workspaceOrganized: 'organize_workspace',
  semanticSearchUsed: 'semantic_search'
});

const TOUR_EVENT_TO_SIGNAL = Object.freeze({
  extension_connected: 'extensionConnected',
  highlight_captured: 'firstHighlightCaptured',
  concept_from_highlight: 'conceptFromHighlight',
  workspace_organized: 'workspaceOrganized',
  semantic_search_used: 'semanticSearchUsed'
});

const getNextTourStepId = (completedStepIds = []) => {
  const completed = new Set((completedStepIds || []).map(value => String(value || '').trim()));
  return TOUR_STEP_IDS.find(stepId => !completed.has(stepId)) || null;
};

const normalizeTourStatus = (value, fallback = 'not_started') => {
  const candidate = String(value || '').trim().toLowerCase();
  return TOUR_STATUSES.has(candidate) ? candidate : fallback;
};

const normalizeTourCurrentStepId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const candidate = String(value).trim();
  return TOUR_STEP_IDS.includes(candidate) ? candidate : null;
};

const normalizeTourSignals = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    extensionConnected: Boolean(source.extensionConnected),
    firstHighlightCaptured: Boolean(source.firstHighlightCaptured),
    conceptFromHighlight: Boolean(source.conceptFromHighlight),
    workspaceOrganized: Boolean(source.workspaceOrganized),
    semanticSearchUsed: Boolean(source.semanticSearchUsed)
  };
};

const normalizeTourCompletedStepIds = (input = []) => {
  const source = Array.isArray(input) ? input : [];
  const unique = new Set();
  source.forEach((value) => {
    const candidate = String(value || '').trim();
    if (TOUR_STEP_IDS.includes(candidate)) {
      unique.add(candidate);
    }
  });
  return TOUR_STEP_IDS.filter(stepId => unique.has(stepId));
};

const deriveCompletedStepIdsFromSignals = (signalsInput = {}) => {
  const signals = normalizeTourSignals(signalsInput);
  const completed = [];
  Object.entries(TOUR_SIGNAL_TO_STEP).forEach(([signalKey, stepId]) => {
    if (signals[signalKey]) completed.push(stepId);
  });
  return normalizeTourCompletedStepIds(completed);
};

const normalizeTourEventTimestamps = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const next = { ...TOUR_EVENT_TIMESTAMP_DEFAULTS };
  Object.keys(next).forEach((key) => {
    const value = source[key];
    if (!value) return;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      next[key] = parsed.toISOString();
    }
  });
  return next;
};

const isTourStateEmpty = (doc) => {
  if (!doc) return true;
  const completed = normalizeTourCompletedStepIds(doc.completedStepIds || []);
  const signals = normalizeTourSignals(doc.signals || {});
  const hasAnySignal = Object.values(signals).some(Boolean);
  const hasCurrentStep = Boolean(normalizeTourCurrentStepId(doc.currentStepId));
  const status = normalizeTourStatus(doc.status, 'not_started');
  return !hasAnySignal
    && completed.length === 0
    && !hasCurrentStep
    && !doc.startedAt
    && !doc.completedAt
    && status === 'not_started';
};

const buildTourStateResponse = (doc, options = {}) => {
  const safeDoc = doc && typeof doc === 'object' ? doc : {};
  const signals = normalizeTourSignals(safeDoc.signals || {});
  const completedFromSignals = deriveCompletedStepIdsFromSignals(signals);
  const completedExplicit = normalizeTourCompletedStepIds(safeDoc.completedStepIds || []);
  const mergedCompleted = normalizeTourCompletedStepIds([...completedExplicit, ...completedFromSignals]);
  const completedAll = mergedCompleted.length === TOUR_STEP_IDS.length;
  const rawStatus = normalizeTourStatus(safeDoc.status, 'not_started');
  const status = completedAll ? 'completed' : rawStatus;
  const currentStepId = status === 'completed'
    ? null
    : (status === 'not_started'
      ? null
      : (normalizeTourCurrentStepId(safeDoc.currentStepId) || getNextTourStepId(mergedCompleted)));
  const isFirstTimeVisitor = options.isFirstTimeVisitor !== undefined
    ? Boolean(options.isFirstTimeVisitor)
    : isTourStateEmpty(safeDoc);

  return {
    status,
    currentStepId,
    completedStepIds: mergedCompleted,
    isFirstTimeVisitor,
    signals,
    eventTimestamps: normalizeTourEventTimestamps(safeDoc.eventTimestamps || {}),
    startedAt: safeDoc.startedAt ? new Date(safeDoc.startedAt).toISOString() : null,
    completedAt: safeDoc.completedAt ? new Date(safeDoc.completedAt).toISOString() : null,
    updatedAt: safeDoc.updatedAt ? new Date(safeDoc.updatedAt).toISOString() : null
  };
};

const getOrCreateTourState = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  return TourState.findOneAndUpdate(
    { userId: userObjectId },
    {
      $setOnInsert: {
        status: 'not_started',
        currentStepId: null,
        completedStepIds: [],
        signals: { ...TOUR_SIGNAL_DEFAULTS },
        eventTimestamps: { ...TOUR_EVENT_TIMESTAMP_DEFAULTS },
        startedAt: null,
        completedAt: null
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
};

const markTourSignal = async (userId, signalKey, eventType = null) => {
  if (!Object.prototype.hasOwnProperty.call(TOUR_SIGNAL_DEFAULTS, signalKey)) return null;
  const state = await getOrCreateTourState(userId);
  const signals = normalizeTourSignals(state.signals || {});
  const alreadySet = Boolean(signals[signalKey]);
  if (!alreadySet) {
    signals[signalKey] = true;
  }
  const completedStepIds = deriveCompletedStepIdsFromSignals(signals);
  const now = new Date();
  const nextStatus = completedStepIds.length === TOUR_STEP_IDS.length
    ? 'completed'
    : (state.status === 'not_started' ? 'in_progress' : normalizeTourStatus(state.status, 'in_progress'));
  const existingEventTimestamps = state.eventTimestamps?.toObject
    ? state.eventTimestamps.toObject()
    : (state.eventTimestamps || {});
  const nextEventTimestamps = {
    ...TOUR_EVENT_TIMESTAMP_DEFAULTS,
    ...existingEventTimestamps
  };
  if (eventType && Object.prototype.hasOwnProperty.call(nextEventTimestamps, eventType) && !nextEventTimestamps[eventType]) {
    nextEventTimestamps[eventType] = now;
  }

  state.signals = signals;
  state.completedStepIds = completedStepIds;
  state.status = nextStatus;
  state.currentStepId = nextStatus === 'completed'
    ? null
    : getNextTourStepId(completedStepIds);
  state.startedAt = state.startedAt || now;
  state.completedAt = nextStatus === 'completed' ? (state.completedAt || now) : null;
  state.eventTimestamps = nextEventTimestamps;
  await state.save();
  return state;
};

module.exports = {
  normalizeUiSettingsScope,
  normalizeUiSettingsPayload,
  buildUiSettingsResponse,
  TOUR_STEP_IDS,
  TOUR_SIGNAL_DEFAULTS,
  TOUR_EVENT_TIMESTAMP_DEFAULTS,
  TOUR_EVENT_TO_SIGNAL,
  getNextTourStepId,
  normalizeTourStatus,
  normalizeTourCurrentStepId,
  normalizeTourSignals,
  normalizeTourCompletedStepIds,
  deriveCompletedStepIdsFromSignals,
  isTourStateEmpty,
  buildTourStateResponse,
  getOrCreateTourState,
  markTourSignal
};
