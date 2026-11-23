// The reader: their account, settings, first run and feedback.
const mongoose = require('mongoose');

// --- AUTHENTICATION ADDITIONS: User Schema and Model ---
const userAgentProfileSchema = new mongoose.Schema({
  premiumTier: { type: String, enum: ['free', 'premium'], default: 'free' },
  webResearchEnabled: { type: Boolean, default: false },
  webResearchBetaEnabled: { type: Boolean, default: false }
}, { _id: false });

const userAgentProtocolTaskOverrideSchema = new mongoose.Schema({
  actorType: { type: String, enum: ['user', 'native_agent', 'byo_agent'], default: undefined },
  actorId: { type: String, default: '', trim: true }
}, { _id: false });

const userAgentProtocolHooksPolicySchema = new mongoose.Schema({
  beforeThreadOps: { type: String, enum: ['off', 'observe', 'warn', 'require_approval'], default: 'off' },
  afterThreadOps: { type: String, enum: ['off', 'observe', 'warn', 'require_approval'], default: 'off' },
  beforeHandoffOps: { type: String, enum: ['off', 'observe', 'warn', 'require_approval'], default: 'observe' },
  afterHandoffOps: { type: String, enum: ['off', 'observe', 'warn', 'require_approval'], default: 'observe' }
}, { _id: false });

const userAgentProtocolPolicySchema = new mongoose.Schema({
  routingMode: { type: String, enum: ['balanced', 'native_first', 'byo_first'], default: 'balanced' },
  defaultByoAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PersonalAgent', default: null },
  allowByoForResearch: { type: Boolean, default: true },
  allowByoForSynthesis: { type: Boolean, default: true },
  preferByoSpecialists: { type: Boolean, default: true },
  hooks: { type: userAgentProtocolHooksPolicySchema, default: () => ({}) },
  taskOverrides: {
    research: { type: userAgentProtocolTaskOverrideSchema, default: /** @returns {object} */ () => ({}) },
    synthesis: { type: userAgentProtocolTaskOverrideSchema, default: /** @returns {object} */ () => ({}) },
    restructure: { type: userAgentProtocolTaskOverrideSchema, default: /** @returns {object} */ () => ({}) },
    qa: { type: userAgentProtocolTaskOverrideSchema, default: /** @returns {object} */ () => ({}) },
    custom: { type: userAgentProtocolTaskOverrideSchema, default: /** @returns {object} */ () => ({}) }
  }
}, { _id: false });

const morningPaperSettingsSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  email: { type: String, default: '', trim: true, lowercase: true },
  emailConfirmedAt: { type: Date, default: null },
  timezone: { type: String, default: 'UTC', trim: true },
  sendHourLocal: { type: Number, min: 0, max: 23, default: 7 },
  unsubscribedAt: { type: Date, default: null },
  unsubscribeTokenVersion: { type: Number, min: 1, default: 1 },
  lastOpenedAt: { type: Date, default: null },
  lastSentAt: { type: Date, default: null },
  lastAttemptedAt: { type: Date, default: null },
  lastSkippedAt: { type: Date, default: null },
  lastSkipReason: { type: String, default: '', trim: true },
  lastCheckInLocalDate: { type: String, default: '', trim: true },
  checkInStreak: { type: Number, min: 0, default: 0 },
  deck: {
    type: {
      date: { type: String, default: '', trim: true },
      resolvedIds: { type: [String], default: [] },
      closedAt: { type: Date, default: null }
    },
    default: () => ({})
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  accountDisabledAt: { type: Date, default: null },
  /* Set when the owner deletes their account from an app. Access ends at
     once (accountDisabledAt); the content is erased by the support runbook
     (docs/noeis-support-erasure-runbook-2026-10-11.md), which finds the
     requests by this field. */
  accountDeletionRequestedAt: { type: Date, default: null },
  // Sign-ins before this moment no longer open the account: a new password ends them.
  signedInSince: { type: Date, default: null },
  agentProfile: { type: userAgentProfileSchema, default: () => ({}) },
  agentProtocolPolicy: { type: userAgentProtocolPolicySchema, default: () => ({}) },
  morningPaper: { type: morningPaperSettingsSchema, default: () => ({}) }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// --- FEEDBACK STORAGE ONLY ---
const feedbackSchema = new mongoose.Schema({
  message: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5, default: null },
  email: { type: String, default: '' },
  kind: { type: String, enum: ['feedback', 'feature', 'bug'], default: 'feedback', index: true },
  title: { type: String, default: '', trim: true },
  pageUrl: { type: String, default: '', trim: true },
  userAgent: { type: String, default: '', trim: true },
  source: { type: String, default: 'web-app' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

const Feedback = mongoose.model('Feedback', feedbackSchema);

// --- NEW SCHEMA for Recommendations ---
const recommendationSchema = new mongoose.Schema({
  articleUrl: { type: String, required: true, index: true },
  articleTitle: { type: String, required: true },
  recommendingUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sharedHighlights: [{
    text: { type: String, required: true }
  }]
}, { timestamps: true });

const Recommendation = mongoose.model('Recommendation', recommendationSchema);

const uiSettingsSchema = new mongoose.Schema({
  typographyScale: { type: String, enum: ['small', 'default', 'large'], default: 'default' },
  density: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
  // Mirrors note-taker-ui/src/settings/themeCatalog.js, plus 'auto'.
  theme: {
    type: String,
    enum: [
      'auto', 'light', 'dark', 'tokyo-midnight',
      'tokyo-night', 'catppuccin', 'dracula', 'nord', 'gruvbox-dark',
      'rose-pine', 'everforest', 'monokai', 'solarized-dark', 'solarized-light',
      'omarchy'
    ],
    default: 'auto'
  },
  accent: {
    type: String,
    enum: ['electric', 'violet', 'indigo', 'blue', 'emerald', 'amber', 'rose'],
    default: 'electric'
  },
  brandEnergy: { type: Boolean, default: true },
  motion: { type: String, enum: ['system', 'reduced'], default: 'system' },
  workspaceType: { type: String, default: 'global', trim: true },
  workspaceId: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

uiSettingsSchema.index({ userId: 1, workspaceType: 1, workspaceId: 1 }, { unique: true });

const UiSettings = mongoose.model('UiSettings', uiSettingsSchema);

const tourSignalsSchema = new mongoose.Schema({
  extensionConnected: { type: Boolean, default: false },
  firstHighlightCaptured: { type: Boolean, default: false },
  conceptFromHighlight: { type: Boolean, default: false },
  workspaceOrganized: { type: Boolean, default: false },
  semanticSearchUsed: { type: Boolean, default: false }
}, { _id: false });

const tourEventTimestampsSchema = new mongoose.Schema({
  extension_connected: { type: Date, default: null },
  highlight_captured: { type: Date, default: null },
  concept_from_highlight: { type: Date, default: null },
  workspace_organized: { type: Date, default: null },
  semantic_search_used: { type: Date, default: null }
}, { _id: false });

// First-run onboarding state. Kept on the tour record because that is already the
// per-user first-run document, uniquely indexed by userId — a second model would
// mean a second write and a second thing to keep in step. Onboarding completion
// used to live only in localStorage, so it re-triggered on a new browser and could
// not be measured server-side. A new account starts 'pending', which is the only
// state the first-run gate acts on; accounts that predate the flow stay
// 'not_started' and are never walked through it.
const onboardingStateSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['not_started', 'pending', 'complete'],
    default: 'not_started'
  },
  completedAt: { type: Date, default: null }
}, { _id: false });

const tourStateSchema = new mongoose.Schema({
  onboarding: { type: onboardingStateSchema, default: () => ({}) },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'paused', 'completed'],
    default: 'not_started'
  },
  currentStepId: { type: String, default: null },
  completedStepIds: { type: [String], default: [] },
  signals: { type: tourSignalsSchema, default: () => ({}) },
  eventTimestamps: { type: tourEventTimestampsSchema, default: () => ({}) },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

tourStateSchema.index({ userId: 1 }, { unique: true });

const TourState = mongoose.model('TourState', tourStateSchema);

module.exports = {
  User,
  Feedback,
  Recommendation,
  UiSettings,
  TourState
};
