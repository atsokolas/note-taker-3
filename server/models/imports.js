// Imports: connected services and the sessions that bring their writing in.
const mongoose = require('mongoose');

const integrationConnectionSchema = new mongoose.Schema({
  provider: { type: String, required: true, trim: true },
  status: { type: String, enum: ['draft', 'connected', 'error', 'revoked'], default: 'draft' },
  health: { type: String, enum: ['unknown', 'healthy', 'warning', 'error'], default: 'unknown' },
  accountLabel: { type: String, default: '', trim: true },
  externalAccountId: { type: String, default: '', trim: true },
  mode: { type: String, enum: ['api_token', 'oauth', 'mcp_remote', 'file_upload', 'manual'], default: 'manual' },
  scopes: { type: [String], default: [] },
  secretVersion: { type: Number, default: 1 },
  encryptedAccessToken: { type: String, default: '' },
  encryptedRefreshToken: { type: String, default: '' },
  encryptedApiToken: { type: String, default: '' },
  lastSyncAt: { type: Date, default: null },
  lastValidatedAt: { type: Date, default: null },
  lastPreviewAt: { type: Date, default: null },
  lastSyncResult: {
    importedArticles: { type: Number },
    importedHighlights: { type: Number },
    importedNotes: { type: Number, default: 0 },
    skippedRows: { type: Number, default: 0 },
    indexingQueued: { type: Number, default: 0 },
    indexingFailures: { type: Number, default: 0 },
    completedAt: { type: Date, default: null }
  },
  lastReceipt: { type: mongoose.Schema.Types.Mixed, default: null },
  lastError: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

integrationConnectionSchema.index({ userId: 1, provider: 1, updatedAt: -1 });

const IntegrationConnection = mongoose.model('IntegrationConnection', integrationConnectionSchema);

const importSessionSchema = new mongoose.Schema({
  provider: { type: String, required: true, trim: true },
  mode: { type: String, default: 'manual', trim: true },
  status: {
    type: String,
    enum: ['draft', 'preview_ready', 'importing', 'imported', 'completed', 'completed_with_warnings', 'failed'],
    default: 'draft'
  },
  sourceLabel: { type: String, default: '', trim: true },
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', default: null },
  config: {
    sourceType: { type: String, default: '', trim: true },
    importStrategy: { type: String, default: '', trim: true },
    selectedIds: { type: [String], default: [] },
    filters: { type: mongoose.Schema.Types.Mixed, default: /** @returns {object} */ () => ({}) }
  },
  preview: {
    items: { type: Number, default: 0 },
    articles: { type: Number, default: 0 },
    highlights: { type: Number, default: 0 },
    notes: { type: Number, default: 0 },
    databases: { type: Number, default: 0 },
    pages: { type: Number, default: 0 },
    notebooks: { type: Number, default: 0 },
    sampleTitles: { type: [String], default: [] },
    sampleAuthors: { type: [String], default: [] },
    sampleTags: { type: [String], default: [] },
    sampleDatabases: { type: [String], default: [] },
    samplePassages: { type: [mongoose.Schema.Types.Mixed], default: [] },
    sampleRows: { type: Number, default: 0 },
    warningCodes: { type: [String], default: [] },
    lastPreviewedAt: { type: Date, default: null },
    warnings: { type: [String], default: [] }
  },
  progress: {
    stage: { type: String, default: 'draft', trim: true },
    itemsProcessed: { type: Number, default: 0 },
    itemsTotal: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
    indexingState: { type: String, enum: ['not_started', 'queued', 'partial', 'ready', 'failed'], default: 'not_started' },
    lastCursor: { type: String, default: '', trim: true }
  },
  result: {
    importedArticles: { type: Number, default: 0 },
    importedHighlights: { type: Number, default: 0 },
    importedNotes: { type: Number, default: 0 },
    skippedRows: { type: Number, default: 0 },
    duplicateSkips: { type: Number, default: 0 },
    invalidSkips: { type: Number, default: 0 },
    parseErrors: { type: Number, default: 0 },
    indexingAttempts: { type: Number, default: 0 },
    indexingFailures: { type: Number, default: 0 },
    indexingQueued: { type: Number, default: 0 },
    warningCodes: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
    lastImportedEntryId: { type: String, default: '', trim: true },
    lastImportedArticleId: { type: String, default: '', trim: true },
    importedEntryIds: { type: [String], default: [] },
    importedArticleIds: { type: [String], default: [] }
  },
  receipt: { type: mongoose.Schema.Types.Mixed, default: null },
  activation: {
    status: { type: String, default: 'not_started', trim: true },
    conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'TagMeta', default: null },
    conceptName: { type: String, default: '', trim: true },
    dueAt: { type: Date, default: null },
    primaryAction: { type: String, default: 'create_concept', trim: true }
  },
  recommendedNextAction: { type: String, default: '', trim: true },
  agentSuggestions: {
    type: [{
      type: { type: String, default: '', trim: true },
      intent: { type: String, default: '', trim: true },
      operationType: { type: String, default: '', trim: true },
      status: { type: String, default: 'pending', trim: true },
      label: { type: String, default: '', trim: true },
      summary: { type: String, default: '', trim: true },
      scopeType: { type: String, default: '', trim: true },
      scopeId: { type: String, default: '', trim: true },
      structureProposalId: { type: String, default: '', trim: true },
      suggestedAt: { type: Date, default: null }
    }],
    default: []
  },
  lastError: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

importSessionSchema.index({ userId: 1, updatedAt: -1 });
importSessionSchema.index({ userId: 1, provider: 1, updatedAt: -1 });

const ImportSession = mongoose.model('ImportSession', importSessionSchema);

module.exports = {
  IntegrationConnection,
  ImportSession
};
