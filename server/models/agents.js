// Agents: tokens, approvals, threads, runs, and what they hand back to the reader.
const mongoose = require('mongoose');
const { AGENT_TOKEN_SCOPES } = require('../services/agentTokenService');
const { pencilSchema } = require('./pieces');
const { PERSONA_KEYS } = require('../services/agentPersonas');

const connectorActionLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  connector: { type: String, required: true, trim: true, index: true },
  action: { type: String, required: true, trim: true },
  direction: { type: String, enum: ['read', 'write'], default: 'read' },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'skipped'], default: 'completed', index: true },
  resultStatus: { type: String, default: '', trim: true },
  agentTokenId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentToken', default: null, index: true },
  agentTokenLabel: { type: String, default: '', trim: true },
  actorType: { type: String, enum: ['user', 'agent_token', 'native_agent', 'byo_agent'], default: 'user', index: true },
  route: { type: String, default: '', trim: true },
  method: { type: String, default: '', trim: true },
  statusCode: { type: Number, default: null },
  durationMs: { type: Number, default: null },
  targetType: { type: String, default: '', trim: true },
  targetId: { type: String, default: '', trim: true },
  beforeRef: { type: String, default: '', trim: true },
  summary: { type: String, default: '', trim: true },
  errorMessage: { type: String, default: '', trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

connectorActionLogSchema.index({ userId: 1, connector: 1, createdAt: -1 });
connectorActionLogSchema.index({ userId: 1, agentTokenId: 1, createdAt: -1 });

const ConnectorActionLog = mongoose.model('ConnectorActionLog', connectorActionLogSchema);


const personalAgentCapabilitiesSchema = new mongoose.Schema({
  read: { type: Boolean, default: true },
  search: { type: Boolean, default: true },
  proposeChanges: { type: Boolean, default: true },
  executeWrites: { type: Boolean, default: true },
  executeDeletes: { type: Boolean, default: true }
}, { _id: false });

const personalAgentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  capabilities: { type: personalAgentCapabilitiesSchema, default: () => ({}) },
  preferredWorkerRoles: { type: [String], default: [] },
  persona: { type: String, enum: ['', ...PERSONA_KEYS], default: '' },
  apiKeyHash: { type: String, required: true, trim: true },
  apiKeyPrefix: { type: String, default: '', trim: true },
  lastUsedAt: { type: Date, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

personalAgentSchema.index({ userId: 1, status: 1, updatedAt: -1 });
personalAgentSchema.index({ userId: 1, name: 1 });
personalAgentSchema.index({ apiKeyHash: 1 }, { unique: true });

const PersonalAgent = mongoose.model('PersonalAgent', personalAgentSchema);

const agentTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label: { type: String, required: true, trim: true },
  runtime: { type: String, default: '', trim: true },
  connectionSessionId: { type: String, default: '', trim: true },
  oauthFamilyId: { type: String, default: '', index: true },
  oauthClientId: { type: String, default: '' },
  oauthResource: { type: String, default: '' },
  hashedSecret: { type: String, required: true, trim: true },
  secretPrefix: { type: String, default: '', trim: true },
  scopes: { type: [String], enum: AGENT_TOKEN_SCOPES, default: ['read'] },
  dailyQuota: { type: Number, default: null, min: 0 },
  callsToday: { type: Number, default: 0, min: 0 },
  quotaWindowStartedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null, index: true },
  lastUsedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true }
}, { timestamps: true });

agentTokenSchema.index({ userId: 1, status: 1, updatedAt: -1 });
agentTokenSchema.index({ hashedSecret: 1 }, { unique: true });

const AgentToken = mongoose.model('AgentToken', agentTokenSchema);

const agentConnectSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, trim: true },
  pollSecretHash: { type: String, required: true, trim: true },
  deviceCode: { type: String, required: true, trim: true, index: true },
  runtime: { type: String, default: 'agent', trim: true },
  label: { type: String, default: '', trim: true },
  scopes: { type: [String], enum: AGENT_TOKEN_SCOPES, default: ['read', 'agent-write'] },
  requestedApiUrl: { type: String, default: '', trim: true },
  requestedAppUrl: { type: String, default: '', trim: true },
  status: { type: String, enum: ['pending', 'approved', 'expired', 'cancelled'], default: 'pending', index: true },
  tokenId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentToken', default: null },
  approvedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

agentConnectSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
agentConnectSessionSchema.index({ status: 1, expiresAt: 1 });

const AgentConnectSession = mongoose.model('AgentConnectSession', agentConnectSessionSchema);

const agentTaskLinkSchema = new mongoose.Schema({
  taskId: { type: String, required: true, unique: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  runtime: { type: String, default: 'agent', trim: true },
  title: { type: String, required: true, trim: true },
  objective: { type: String, default: '', trim: true },
  taskType: { type: String, enum: ['research', 'synthesis', 'restructure', 'qa', 'custom'], default: 'custom' },
  priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
  target: { type: mongoose.Schema.Types.Mixed, default: {} },
  permissions: { type: [String], default: ['read', 'draft_write'] },
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  input: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'dispatched', 'expired', 'cancelled'], default: 'pending', index: true },
  handoffId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentHandoff', default: null },
  dispatchedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null }
}, { timestamps: true });

agentTaskLinkSchema.index({ userId: 1, status: 1, updatedAt: -1 });
agentTaskLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

const AgentTaskLink = mongoose.model('AgentTaskLink', agentTaskLinkSchema);

const actorIdentitySchema = new mongoose.Schema({
  actorType: { type: String, enum: ['user', 'native_agent', 'byo_agent'], default: 'native_agent' },
  actorId: { type: String, default: '', trim: true }
}, { _id: false });

const approvalPreviewTargetSchema = new mongoose.Schema({
  itemId: { type: String, default: '', trim: true },
  type: { type: String, default: '', trim: true },
  refId: { type: String, default: '', trim: true },
  title: { type: String, default: '', trim: true },
  sectionId: { type: String, default: '', trim: true },
  sectionTitle: { type: String, default: '', trim: true }
}, { _id: false });

const actionApprovalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'TagMeta', required: true },
  conceptName: { type: String, default: '', trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'executed', 'expired'], default: 'pending' },
  flow: { type: String, enum: ['direct', 'cleanup', 'restructure'], default: 'direct' },
  explicitUserCommand: { type: Boolean, default: false },
  deleteCount: { type: Number, default: 0 },
  approvalMode: { type: String, enum: ['single_batch', 'batched'], default: 'single_batch' },
  operations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  preview: {
    deleteTargets: { type: [approvalPreviewTargetSchema], default: [] },
    workspaceSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
    operationCount: { type: Number, default: 0 }
  },
  requestedBy: { type: actorIdentitySchema, default: () => ({}) },
  approvedBy: { type: actorIdentitySchema, default: undefined },
  rejectedBy: { type: actorIdentitySchema, default: undefined },
  approvedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  executedAt: { type: Date, default: null },
  auditId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentActionAudit', default: null }
}, { timestamps: true });

actionApprovalSchema.index({ userId: 1, status: 1, createdAt: -1 });
actionApprovalSchema.index({ userId: 1, conceptId: 1, createdAt: -1 });

const AgentActionApproval = mongoose.model('AgentActionApproval', actionApprovalSchema);

const protocolApprovalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'executed', 'expired'], default: 'pending' },
  scope: { type: String, default: 'agent_ops', trim: true },
  op: { type: String, required: true, trim: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  preview: { type: mongoose.Schema.Types.Mixed, default: {} },
  reason: { type: String, default: '', trim: true },
  decisionNote: { type: String, default: '', trim: true },
  requestedBy: { type: actorIdentitySchema, default: () => ({}) },
  approvedBy: { type: actorIdentitySchema, default: undefined },
  rejectedBy: { type: actorIdentitySchema, default: undefined },
  approvedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  executedAt: { type: Date, default: null },
  result: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

protocolApprovalSchema.index({ userId: 1, status: 1, createdAt: -1 });
protocolApprovalSchema.index({ userId: 1, op: 1, createdAt: -1 });

const AgentProtocolApproval = mongoose.model('AgentProtocolApproval', protocolApprovalSchema);

const protocolHookRunSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  source: { type: String, enum: ['native', 'bridge', 'approval_replay'], default: 'native' },
  phase: { type: String, enum: ['before', 'after'], required: true },
  effect: { type: String, enum: ['observe', 'warn', 'require_approval'], default: 'observe' },
  status: { type: String, enum: ['passed', 'error'], default: 'passed' },
  scope: { type: String, default: 'agent_ops', trim: true },
  op: { type: String, required: true, trim: true },
  actor: { type: actorIdentitySchema, default: () => ({}) },
  threadId: { type: String, default: '', trim: true },
  handoffId: { type: String, default: '', trim: true },
  approvalId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentProtocolApproval', default: null },
  preview: { type: mongoose.Schema.Types.Mixed, default: {} },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  result: { type: mongoose.Schema.Types.Mixed, default: {} },
  warningMessage: { type: String, default: '', trim: true },
  errorMessage: { type: String, default: '', trim: true }
}, { timestamps: true });

protocolHookRunSchema.index({ userId: 1, createdAt: -1 });
protocolHookRunSchema.index({ userId: 1, threadId: 1, createdAt: -1 });
protocolHookRunSchema.index({ userId: 1, handoffId: 1, createdAt: -1 });
protocolHookRunSchema.index({ userId: 1, op: 1, phase: 1, createdAt: -1 });

const AgentProtocolHookRun = mongoose.model('AgentProtocolHookRun', protocolHookRunSchema);

const actionAuditSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'TagMeta', required: true },
  conceptName: { type: String, default: '', trim: true },
  actorType: { type: String, enum: ['user', 'native_agent', 'byo_agent'], default: 'native_agent' },
  actorId: { type: String, default: '', trim: true },
  flow: { type: String, enum: ['direct', 'cleanup', 'restructure'], default: 'direct' },
  explicitUserCommand: { type: Boolean, default: false },
  operationCount: { type: Number, default: 0 },
  destructiveCount: { type: Number, default: 0 },
  operations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  undoable: { type: Boolean, default: true },
  beforeWorkspace: { type: mongoose.Schema.Types.Mixed, default: {} },
  afterWorkspace: { type: mongoose.Schema.Types.Mixed, default: {} },
  approvalId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentActionApproval', default: null },
  undoneAt: { type: Date, default: null },
  undoneBy: { type: actorIdentitySchema, default: undefined }
}, { timestamps: true });

actionAuditSchema.index({ userId: 1, conceptId: 1, createdAt: -1 });
actionAuditSchema.index({ userId: 1, undoneAt: 1, createdAt: -1 });

const AgentActionAudit = mongoose.model('AgentActionAudit', actionAuditSchema);

const softDeleteRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'TagMeta', required: true },
  conceptName: { type: String, default: '', trim: true },
  entityType: { type: String, enum: ['workspace_item'], default: 'workspace_item' },
  entityId: { type: String, required: true, trim: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['deleted', 'restored', 'expired'], default: 'deleted' },
  deletedAt: { type: Date, default: Date.now },
  restoreUntilAt: { type: Date, required: true },
  restoredAt: { type: Date, default: null },
  auditId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentActionAudit', default: null },
  restoredByAuditId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentActionAudit', default: null }
}, { timestamps: true });

softDeleteRecordSchema.index({ userId: 1, status: 1, restoreUntilAt: 1 });
softDeleteRecordSchema.index({ userId: 1, conceptId: 1, deletedAt: -1 });
softDeleteRecordSchema.index({ userId: 1, auditId: 1 });

const AgentSoftDeleteRecord = mongoose.model('AgentSoftDeleteRecord', softDeleteRecordSchema);

const agentHandoffEventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: ['created', 'claimed', 'completed', 'rejected', 'cancelled', 'note'],
    required: true
  },
  actor: { type: actorIdentitySchema, default: () => ({}) },
  note: { type: String, default: '', trim: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const agentThreadScopeSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['global', 'workspace', 'article', 'notebook', 'concept', 'question', 'wiki_page', 'think', 'handoff', 'selection'],
    default: 'global'
  },
  id: { type: String, default: '', trim: true },
  title: { type: String, default: '', trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const agentThreadMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['system', 'user', 'assistant', 'tool'], default: 'assistant' },
  text: { type: String, default: '', trim: true },
  actor: { type: actorIdentitySchema, default: () => ({ actorType: 'native_agent', actorId: '' }) },
  relatedItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
  citations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  suggestedActions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  proposalBundle: { type: mongoose.Schema.Types.Mixed, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const agentThreadPlanStepSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  title: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'blocked'],
    default: 'pending'
  },
  kind: { type: String, default: '', trim: true },
  workerRole: {
    type: String,
    enum: ['planner', 'researcher', 'synthesizer', 'critic', 'editor', 'organizer', ''],
    default: ''
  },
  actor: { type: actorIdentitySchema, default: () => ({ actorType: 'native_agent', actorId: '' }) },
  notes: { type: String, default: '', trim: true }
}, { _id: false });

const agentThreadPlanSchema = new mongoose.Schema({
  objective: { type: String, default: '', trim: true },
  currentStepId: { type: String, default: '', trim: true },
  successCriteria: { type: [String], default: [] },
  steps: { type: [agentThreadPlanStepSchema], default: [] },
  status: { type: String, enum: ['active', 'archived'], default: 'active' }
}, { _id: false });

const agentThreadCheckpointSchema = new mongoose.Schema({
  summary: { type: String, default: '', trim: true },
  openQuestions: { type: [String], default: [] },
  nextActions: { type: [String], default: [] },
  updatedBy: { type: actorIdentitySchema, default: () => ({ actorType: 'native_agent', actorId: '' }) },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const agentThreadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  summary: { type: String, default: '', trim: true },
  scope: { type: agentThreadScopeSchema, default: () => ({}) },
  createdBy: { type: actorIdentitySchema, default: () => ({ actorType: 'user', actorId: '' }) },
  lastActor: { type: actorIdentitySchema, default: undefined },
  handoffId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentHandoff', default: null },
  planner: { type: mongoose.Schema.Types.Mixed, default: {} },
  plan: { type: agentThreadPlanSchema, default: () => ({}) },
  checkpoint: { type: agentThreadCheckpointSchema, default: undefined },
  proposalBundles: { type: [mongoose.Schema.Types.Mixed], default: [] },
  messages: { type: [agentThreadMessageSchema], default: [] }
}, { timestamps: true });

agentThreadSchema.index({ userId: 1, status: 1, updatedAt: -1 });
agentThreadSchema.index({ userId: 1, 'scope.type': 1, 'scope.id': 1, updatedAt: -1 });
agentThreadSchema.index({ userId: 1, handoffId: 1, updatedAt: -1 });

const AgentThread = mongoose.model('AgentThread', agentThreadSchema);

const agentHandoffSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  taskType: {
    type: String,
    enum: ['research', 'synthesis', 'restructure', 'qa', 'custom'],
    default: 'custom'
  },
  objective: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['pending', 'claimed', 'completed', 'rejected', 'cancelled'],
    default: 'pending'
  },
  priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  input: { type: mongoose.Schema.Types.Mixed, default: {} },
  output: { type: mongoose.Schema.Types.Mixed, default: {} },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentThread', default: null },
  planner: { type: mongoose.Schema.Types.Mixed, default: {} },
  plan: { type: agentThreadPlanSchema, default: () => ({}) },
  checkpoint: { type: agentThreadCheckpointSchema, default: undefined },
  requestedActor: { type: actorIdentitySchema, default: () => ({ actorType: 'native_agent', actorId: '' }) },
  createdBy: { type: actorIdentitySchema, default: () => ({ actorType: 'user', actorId: '' }) },
  claimedBy: { type: actorIdentitySchema, default: undefined },
  completedBy: { type: actorIdentitySchema, default: undefined },
  rejectedBy: { type: actorIdentitySchema, default: undefined },
  cancelledBy: { type: actorIdentitySchema, default: undefined },
  dueAt: { type: Date, default: null },
  claimedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  events: { type: [agentHandoffEventSchema], default: [] }
}, { timestamps: true });

agentHandoffSchema.index({ userId: 1, status: 1, updatedAt: -1 });
agentHandoffSchema.index({ userId: 1, 'requestedActor.actorType': 1, 'requestedActor.actorId': 1, status: 1, updatedAt: -1 });

const AgentHandoff = mongoose.model('AgentHandoff', agentHandoffSchema);

const agentArtifactDraftSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  artifactType: { type: String, enum: ['note', 'concept', 'question', 'handoff'], required: true },
  status: { type: String, enum: ['pending', 'promoted', 'dismissed'], default: 'pending' },
  title: { type: String, default: '', trim: true },
  summary: { type: String, default: '', trim: true },
  body: { type: String, default: '', trim: true },
  sourceThreadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentThread', default: null },
  sourceHandoffId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentHandoff', default: null },
  sourceContext: { type: mongoose.Schema.Types.Mixed, default: {} },
  skill: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: actorIdentitySchema, default: () => ({ actorType: 'user', actorId: '' }) },
  promotedTo: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

agentArtifactDraftSchema.index({ userId: 1, status: 1, updatedAt: -1 });
agentArtifactDraftSchema.index({ userId: 1, artifactType: 1, status: 1, updatedAt: -1 });
agentArtifactDraftSchema.index({ userId: 1, sourceThreadId: 1, status: 1, updatedAt: -1 });

const AgentArtifactDraft = mongoose.model('AgentArtifactDraft', agentArtifactDraftSchema);

const agentRunStepSchema = new mongoose.Schema({
  opId: { type: String, required: true, trim: true },
  type: { type: String, default: '', trim: true },
  title: { type: String, default: '', trim: true },
  executionMode: { type: String, enum: ['direct', 'proposed_change'], default: 'direct' },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  requiresApproval: { type: Boolean, default: false },
  target: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'applied', 'blocked', 'dismissed', 'invalidated', 'failed'],
    default: 'pending'
  },
  appliedAt: { type: Date, default: null },
  blockedAt: { type: Date, default: null }
}, { _id: false });

const agentRunSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentThread', default: null },
  sourceBundleId: { type: String, required: true, trim: true },
  title: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'paused_for_approval', 'awaiting_review', 'completed', 'cancelled', 'failed'],
    default: 'pending'
  },
  createdBy: { type: actorIdentitySchema, default: () => ({ actorType: 'user', actorId: '' }) },
  lastActor: { type: actorIdentitySchema, default: undefined },
  currentOpId: { type: String, default: '', trim: true },
  blockedOpId: { type: String, default: '', trim: true },
  steps: { type: [agentRunStepSchema], default: [] },
  completedStepCount: { type: Number, default: 0 },
  startedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

agentRunSchema.index({ userId: 1, threadId: 1, updatedAt: -1 });
agentRunSchema.index({ userId: 1, sourceBundleId: 1, updatedAt: -1 });
agentRunSchema.index({ userId: 1, status: 1, updatedAt: -1 });

const AgentRun = mongoose.model('AgentRun', agentRunSchema);

const agentProposedChangeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['concept', 'notebook'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  targetTitle: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'applied', 'rolled_back', 'invalidated'],
    default: 'pending'
  },
  summary: { type: String, default: '', trim: true },
  diffSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
  sourceThreadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentThread', default: null },
  sourceRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentRun', default: null },
  sourceBundleId: { type: String, default: '', trim: true },
  sourceOpId: { type: String, default: '', trim: true },
  currentSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  proposedSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: actorIdentitySchema, default: () => ({ actorType: 'user', actorId: '' }) },
  acceptedBy: { type: actorIdentitySchema, default: undefined },
  rejectedBy: { type: actorIdentitySchema, default: undefined },
  rolledBackBy: { type: actorIdentitySchema, default: undefined },
  acceptedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  rolledBackAt: { type: Date, default: null }
}, { timestamps: true });

agentProposedChangeSchema.index({ userId: 1, targetType: 1, targetId: 1, updatedAt: -1 });
agentProposedChangeSchema.index({ userId: 1, sourceRunId: 1, updatedAt: -1 });
agentProposedChangeSchema.index({ userId: 1, sourceThreadId: 1, status: 1, updatedAt: -1 });

const AgentProposedChange = mongoose.model('AgentProposedChange', agentProposedChangeSchema);

const agentStructureProposalOperationSchema = new mongoose.Schema({
  opId: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['create_folder', 'rename_folder', 'move_item', 'merge_item', 'merge_folder', 'delete_folder'],
    required: true
  },
  targetDomain: {
    type: String,
    enum: ['library', 'notebook', 'concepts', 'questions'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'applied', 'skipped'],
    default: 'pending'
  },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  preview: { type: mongoose.Schema.Types.Mixed, default: {} },
  risk: { type: String, enum: ['low', 'medium'], default: 'low' },
  undoPayload: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const agentStructureProposalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceThreadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentThread', default: null },
  sourceRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentRun', default: null },
  sourceBundleId: { type: String, default: '', trim: true },
  scope: { type: String, enum: ['workspace', 'import_session', 'surface'], default: 'workspace' },
  scopeRef: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['pending', 'applied', 'partially_applied', 'skipped', 'failed', 'rejected', 'rolled_back', 'invalidated'],
    default: 'pending'
  },
  title: { type: String, default: '', trim: true },
  summary: { type: String, default: '', trim: true },
  rationale: { type: String, default: '', trim: true },
  operations: { type: [agentStructureProposalOperationSchema], default: [] },
  executionResult: { type: mongoose.Schema.Types.Mixed, default: null },
  createdBy: { type: mongoose.Schema.Types.Mixed, default: {} },
  acceptedBy: { type: mongoose.Schema.Types.Mixed, default: null },
  rejectedBy: { type: mongoose.Schema.Types.Mixed, default: null },
  rolledBackBy: { type: mongoose.Schema.Types.Mixed, default: null },
  acceptedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  rolledBackAt: { type: Date, default: null }
}, { timestamps: true });

agentStructureProposalSchema.index({ userId: 1, sourceThreadId: 1, status: 1, updatedAt: -1 });
agentStructureProposalSchema.index({ userId: 1, scope: 1, scopeRef: 1, updatedAt: -1 });

const AgentStructureProposal = mongoose.model('AgentStructureProposal', agentStructureProposalSchema);

/* Work the reader (or an agent) hands to an agent: one line, where they were,
   and what came of it. Its status is read from when it was taken, finished or
   called off, and what it wrote is the taker's pencil in between. */
const handoffSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ask: { type: String, required: true, trim: true, maxlength: 2000 },
  context: {
    kind: { type: String, default: '' },
    id: { type: String, default: '' },
    title: { type: String, default: '' },
    excerpt: { type: String, default: '', maxlength: 4000 },
    href: { type: String, default: '' }
  },
  // '' for any agent, 'noeis' for the built-in agent, else one connection's id.
  to: { type: String, default: '' },
  from: { type: pencilSchema, default: null },
  takenBy: { type: pencilSchema, default: null },
  takenAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  did: { type: String, default: '', trim: true, maxlength: 4000 },
  open: { type: String, default: '', trim: true, maxlength: 4000 },
  next: { type: String, default: '', trim: true, maxlength: 4000 }
}, { timestamps: true });

handoffSchema.index({ userId: 1, takenAt: 1, cancelledAt: 1, createdAt: -1 });

const Handoff = mongoose.model('Handoff', handoffSchema);

/* Where an agent put the reader's thinking to work: a note or a source it
   drew on, and where it went (a pull request, a doc, a reply). Told by the
   agent, so it is only as complete as the agents that say so. */
const citationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceId: { type: String, required: true },
  where: { type: String, required: true, trim: true, maxlength: 500 },
  by: { type: pencilSchema, required: true }
}, { timestamps: true });

citationSchema.index({ userId: 1, sourceId: 1, createdAt: -1 });

const Citation = mongoose.model('Citation', citationSchema);

/* A question the reader expects their library to answer, and the sources
   that answer it. Whether recall still finds them is worked out each time
   it is asked, never stored. */
/* The reader's verdict on something an agent wrote, or a connection Noeis
   drew: inked, or struck and why. What it was about is kept with it, since a
   strike removes the thing; the log is the reader's taste, as agents read it. */
const verdictSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  verdict: { type: String, enum: ['ink', 'strike'], required: true },
  kind: { type: String, required: true },
  agent: { type: String, default: '' },
  // A connection Noeis drew has no record of its own, so its verdict names it: source>type:id.
  about: { type: String, default: '' },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  why: { type: String, default: '' }
}, { timestamps: true });
verdictSchema.index({ userId: 1, createdAt: -1 });
verdictSchema.index({ userId: 1, kind: 1, about: 1 });
const Verdict = mongoose.model('Verdict', verdictSchema);

/* Two hands that cannot both be right: what an agent wrote, against a view
   the reader holds (agent '') or another agent's pencil. Open until the
   reader settles it. */
const sideSchema = new mongoose.Schema({
  agent: { type: String, default: '' },
  kind: String,
  id: String,
  title: { type: String, default: '' },
  says: { type: String, default: '' }
}, { _id: false });
const disagreementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  a: { type: sideSchema, required: true },
  b: { type: sideSchema, required: true },
  settledAt: { type: Date, default: null }
}, { timestamps: true });
disagreementSchema.index({ userId: 1, settledAt: 1, createdAt: -1 });
const Disagreement = mongoose.model('Disagreement', disagreementSchema);

const recallCheckSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  question: { type: String, required: true, trim: true, maxlength: 500 },
  expects: { type: [String], default: [] }
}, { timestamps: true });

const RecallCheck = mongoose.model('RecallCheck', recallCheckSchema);

module.exports = {
  ConnectorActionLog,
  PersonalAgent,
  AgentToken,
  AgentConnectSession,
  AgentTaskLink,
  AgentActionApproval,
  AgentProtocolApproval,
  AgentProtocolHookRun,
  AgentActionAudit,
  AgentSoftDeleteRecord,
  AgentThread,
  AgentHandoff,
  AgentArtifactDraft,
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  Handoff,
  Citation,
  Verdict,
  Disagreement,
  RecallCheck
};
