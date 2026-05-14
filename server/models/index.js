const mongoose = require('mongoose');
const {
  WIKI_PAGE_TYPES
} = require('../services/wikiPageStructureService');

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
    research: { type: userAgentProtocolTaskOverrideSchema, default: () => ({}) },
    synthesis: { type: userAgentProtocolTaskOverrideSchema, default: () => ({}) },
    restructure: { type: userAgentProtocolTaskOverrideSchema, default: () => ({}) },
    qa: { type: userAgentProtocolTaskOverrideSchema, default: () => ({}) },
    custom: { type: userAgentProtocolTaskOverrideSchema, default: () => ({}) }
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  agentProfile: { type: userAgentProfileSchema, default: () => ({}) },
  agentProtocolPolicy: { type: userAgentProtocolPolicySchema, default: () => ({}) }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// --- PDF attachments / annotations (defined early so Article can reference it) ---
const annotationSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  page: { type: Number, default: null },
  color: { type: String, default: '#f6c244' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const pdfAttachmentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  dataUrl: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  annotations: [annotationSchema]
}, { _id: false });

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

// Folder Schema and Model - MODIFIED TO INCLUDE userId
const folderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

folderSchema.index({ name: 1, userId: 1 }, { unique: true });
folderSchema.index({ userId: 1, name: 1 });

const Folder = mongoose.model('Folder', folderSchema);

const importMetaSchema = new mongoose.Schema({
  provider: { type: String, default: '', trim: true },
  sourceType: { type: String, default: '', trim: true },
  sourceLabel: { type: String, default: '', trim: true },
  sourcePath: { type: String, default: '', trim: true },
  sourceUrl: { type: String, default: '', trim: true },
  folderOwnership: { type: String, default: '', trim: true },
  draftTemplate: { type: String, default: '', trim: true },
  draftTemplateLabel: { type: String, default: '', trim: true },
  externalId: { type: String, default: '', trim: true },
  parentExternalId: { type: String, default: '', trim: true },
  importSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportSession', default: null },
  importedAt: { type: Date, default: null },
  searchableAt: { type: Date, default: null },
  // Provider-side "last modified" timestamp used for skip-if-unchanged logic
  // (PR #20 Notion agent fetch). Stored as a string because Notion returns
  // an ISO 8601 string and we compare via string equality — coercing to
  // Date and back loses millisecond fidelity in some clients.
  lastNotionEditedAt: { type: String, default: '', trim: true }
}, { _id: false });

// Article Schema and Model - MODIFIED TO INCLUDE userId
const articleSchema = new mongoose.Schema({
  url: { type: String, required: true },
  title: { type: String, required: true },
  content: String,
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  highlights: [{
    text: String,
    note: String,
    tags: { type: [String], default: [] },
    color: { type: String, default: '#f6e27a' },
    type: { type: String, enum: ['claim', 'evidence', 'note'], default: 'note' },
    claimId: { type: mongoose.Schema.Types.ObjectId, default: null },
    anchor: {
      text: String,
      prefix: String,
      suffix: String,
      startOffsetApprox: Number
    },
    createdAt: { type: Date, default: Date.now },
    importMeta: { type: importMetaSchema, default: () => ({}) }
  }],
  pdfs: { type: [pdfAttachmentSchema], default: [] },
  author: { type: String, default: '' },
  publicationDate: { type: String, default: '' },
  siteName: { type: String, default: '' },
  importMeta: { type: importMetaSchema, default: () => ({}) }
}, { timestamps: true });

articleSchema.index({ url: 1, userId: 1 }, { unique: true });
articleSchema.index({ userId: 1, createdAt: -1 });
articleSchema.index({ userId: 1, updatedAt: -1 });
articleSchema.index({ userId: 1, folder: 1, createdAt: -1 });
articleSchema.index({ userId: 1, 'highlights._id': 1 });
articleSchema.index({ userId: 1, 'highlights.claimId': 1 });
articleSchema.index({ userId: 1, 'highlights.tags': 1 });
articleSchema.index(
  {
    title: 'text',
    content: 'text',
    'highlights.text': 'text',
    'highlights.note': 'text',
    'highlights.tags': 'text'
  },
  {
    name: 'article_search_text',
    weights: {
      title: 8,
      'highlights.text': 7,
      'highlights.note': 5,
      'highlights.tags': 4,
      content: 2
    }
  }
);

const Article = mongoose.model('Article', articleSchema);

// --- NOTEBOOK: Schema for freeform notes with checklists ---
const checklistItemSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  checked: { type: Boolean, default: false }
}, { _id: true });

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, default: '' },
  checklist: [checklistItemSchema],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

noteSchema.index({ userId: 1, updatedAt: -1 });

const Note = mongoose.model('Note', noteSchema);

// --- NOTEBOOK ENTRIES (new lightweight notebook) ---
const notebookBlockSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, default: 'paragraph' },
  text: { type: String, default: '' },
  indent: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  highlightId: { type: mongoose.Schema.Types.ObjectId, default: null },
  articleId: { type: mongoose.Schema.Types.ObjectId, default: null },
  articleTitle: { type: String, default: '' },
  conceptId: { type: mongoose.Schema.Types.ObjectId, default: null },
  conceptName: { type: String, default: '' },
  questionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  questionText: { type: String, default: '' },
  status: { type: String, enum: ['open', 'answered'], default: 'open' }
}, { _id: false });

const notebookEntrySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, default: '' },
  blocks: { type: [notebookBlockSchema], default: [] },
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'NotebookFolder', default: null },
  type: { type: String, enum: ['claim', 'evidence', 'note'], default: 'note' },
  claimId: { type: mongoose.Schema.Types.ObjectId, default: null },
  tags: { type: [String], default: [] },
  linkedArticleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
  linkedHighlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  importMeta: { type: importMetaSchema, default: () => ({}) },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

notebookEntrySchema.index(
  {
    title: 'text',
    content: 'text',
    'blocks.text': 'text',
    tags: 'text'
  },
  {
    name: 'notebook_search_text',
    weights: {
      title: 8,
      'blocks.text': 6,
      content: 5,
      tags: 4
    }
  }
);
notebookEntrySchema.index({ userId: 1, updatedAt: -1 });
notebookEntrySchema.index({ userId: 1, type: 1, updatedAt: -1 });
notebookEntrySchema.index({ userId: 1, tags: 1, updatedAt: -1 });
notebookEntrySchema.index({ userId: 1, linkedHighlightIds: 1 });

const NotebookEntry = mongoose.model('NotebookEntry', notebookEntrySchema);

const notebookFolderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parentFolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotebookFolder', default: null },
  sortOrder: { type: Number, default: 0 },
  importMeta: { type: importMetaSchema, default: () => ({}) }
}, { timestamps: true });

notebookFolderSchema.index({ userId: 1, parentFolderId: 1, sortOrder: 1, name: 1 });

const NotebookFolder = mongoose.model('NotebookFolder', notebookFolderSchema);

const WIKI_PAGE_STATUSES = ['draft', 'published', 'archived'];
const WIKI_PROPOSAL_TYPES = ['repeated_theme', 'bridge_idea'];
const WIKI_PROPOSAL_STATUSES = ['pending', 'watched', 'accepted', 'dismissed', 'merged'];
const WIKI_PROPOSAL_SIGNAL_TYPES = ['phrase', 'tag', 'highlight', 'note', 'wiki_page', 'concept', 'question'];
const WIKI_VISIBILITY_VALUES = ['private', 'shared'];
const WIKI_SOURCE_SCOPES = ['entire_library', 'current_item', 'selected_sources'];

const normalizeWikiPageTypeForModel = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'topic';
  if (raw === 'person') return 'entity';
  if (raw === 'synthesis') return 'overview';
  return raw;
};

const wikiCreatedFromSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['wiki_index', 'idea', 'question', 'highlight', 'article', 'notebook', 'concept', 'sources', 'paste', 'search', 'thought_partner'],
    default: 'wiki_index'
  },
  objectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  objectIds: [{ type: mongoose.Schema.Types.ObjectId }],
  text: { type: String, default: '', trim: true },
  label: { type: String, default: '', trim: true }
}, { _id: false });

const wikiSourceRefSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external'],
    required: true
  },
  objectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  parentObjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  title: { type: String, default: '', trim: true },
  snippet: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  citationLabel: { type: String, default: '', trim: true },
  addedBy: { type: String, enum: ['user', 'ai'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const wikiCitationSchema = new mongoose.Schema({
  sourceRefId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceType: { type: String, default: '', trim: true },
  sourceObjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceTitle: { type: String, default: '', trim: true },
  quote: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const wikiClaimSchema = new mongoose.Schema({
  claimId: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  section: { type: String, default: '', trim: true },
  support: { type: String, enum: ['supported', 'partial', 'unsupported', 'conflicted'], default: 'unsupported' },
  citationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  contradictedByCitationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  confidence: { type: Number, min: 0, max: 1, default: 0 },
  lastReviewedAt: { type: Date, default: null },
  lastVerifiedAt: { type: Date, default: null },
  history: {
    type: [{
      at: { type: Date, default: Date.now },
      event: { type: String, default: 'reviewed', trim: true },
      support: { type: String, enum: ['supported', 'partial', 'unsupported', 'conflicted'], default: 'unsupported' },
      text: { type: String, default: '', trim: true },
      section: { type: String, default: '', trim: true },
      citationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      contradictedByCitationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      summary: { type: String, default: '', trim: true }
    }],
    default: []
  },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const wikiFreshnessSchema = new mongoose.Schema({
  status: { type: String, enum: ['fresh', 'needs_review', 'stale', 'conflicted'], default: 'fresh' },
  lastSourceEventAt: { type: Date, default: null },
  lastMaintainedAt: { type: Date, default: null },
  pendingSourceEventIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  conflictCount: { type: Number, default: 0 },
  staleSectionCount: { type: Number, default: 0 }
}, { _id: false });

const wikiAiStateSchema = new mongoose.Schema({
  draftStatus: { type: String, enum: ['idle', 'drafting', 'maintaining', 'ready', 'error'], default: 'idle' },
  draftRequestedAt: { type: Date, default: null },
  draftStartedAt: { type: Date, default: null },
  draftCompletedAt: { type: Date, default: null },
  lastDraftedAt: { type: Date, default: null },
  lastError: { type: String, default: '', trim: true },
  errorCode: { type: String, default: '', trim: true },
  model: { type: String, default: '', trim: true },
  provider: { type: String, default: '', trim: true },
  sourceScopeAtDraft: { type: String, enum: WIKI_SOURCE_SCOPES, default: 'entire_library' },
  sourceRefIdsAtDraft: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  maintenanceSummary: { type: String, default: '', trim: true },
  sectionMaintenance: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      updatedAt: null,
      sections: []
    })
  },
  quality: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      ok: true,
      status: 'pass',
      score: 1,
      failures: [],
      checkedAt: null,
      rebuiltAutomatically: false
    })
  },
  health: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      newItems: [],
      unsupportedClaims: [],
      missingCitations: [],
      staleSections: [],
      contradictions: [],
      relatedPages: []
    })
  },
  changeLog: {
    type: [{
      id: { type: String, default: '', trim: true },
      type: { type: String, default: 'edit', trim: true },
      title: { type: String, default: '', trim: true },
      text: { type: String, default: '', trim: true },
      sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  },
  suggestions: {
    type: [{
      id: { type: String, required: true, trim: true },
      type: { type: String, enum: ['outline', 'claim', 'gap', 'edit'], default: 'edit' },
      title: { type: String, default: '', trim: true },
      text: { type: String, default: '', trim: true },
      sourceRefIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      appliedAt: { type: Date, default: null },
      dismissedAt: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  }
}, { _id: false });

// Each entry is one Q&A turn against the page. answer is a TipTap doc that
// re-uses the existing claim mark schema so the editor's inline citation
// popover works on the answer text without extra plumbing.
const wikiDiscussionSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  answer: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ type: 'doc', content: [{ type: 'paragraph' }] })
  },
  citationIndexesUsed: { type: [Number], default: [] },
  model: { type: String, default: '', trim: true },
  status: { type: String, enum: ['answered', 'failed'], default: 'answered' },
  errorMessage: { type: String, default: '', trim: true },
  askedAt: { type: Date, default: Date.now }
});

const wikiPageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, default: 'Untitled Wiki Page' },
  slug: { type: String, required: true, trim: true },
  pageType: { type: String, enum: WIKI_PAGE_TYPES, default: 'topic', set: normalizeWikiPageTypeForModel },
  status: { type: String, enum: WIKI_PAGE_STATUSES, default: 'draft', index: true },
  visibility: { type: String, enum: WIKI_VISIBILITY_VALUES, default: 'private', index: true },
  sourceScope: { type: String, enum: WIKI_SOURCE_SCOPES, default: 'entire_library' },
  createdFrom: { type: wikiCreatedFromSchema, default: () => ({}) },
  body: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ type: 'doc', content: [{ type: 'paragraph' }] })
  },
  plainText: { type: String, default: '', trim: true },
  sourceRefs: { type: [wikiSourceRefSchema], default: [] },
  claims: { type: [wikiClaimSchema], default: [] },
  citations: { type: [wikiCitationSchema], default: [] },
  freshness: { type: wikiFreshnessSchema, default: () => ({}) },
  discussions: { type: [wikiDiscussionSchema], default: [] },
  aiState: { type: wikiAiStateSchema, default: () => ({}) }
}, { timestamps: true });

wikiPageSchema.index({ userId: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, status: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, visibility: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, slug: 1 }, { unique: true });

wikiPageSchema.pre('validate', function normalizeLegacyWikiPageType(next) {
  this.pageType = normalizeWikiPageTypeForModel(this.pageType);
  next();
});

const WikiPage = mongoose.model('WikiPage', wikiPageSchema);

const wikiProposalSignalSchema = new mongoose.Schema({
  type: { type: String, enum: WIKI_PROPOSAL_SIGNAL_TYPES, required: true },
  label: { type: String, default: '', trim: true },
  weight: { type: Number, default: 1 },
  sourceType: { type: String, default: '', trim: true },
  sourceObjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  snippet: { type: String, default: '', trim: true }
}, { _id: true });

const wikiProposalRefSchema = new mongoose.Schema({
  type: { type: String, enum: ['article', 'highlight', 'notebook', 'concept', 'question', 'wiki_page', 'memory', 'external'], required: true },
  objectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  title: { type: String, default: '', trim: true },
  snippet: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  sourceHost: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true }
}, { _id: true });

const wikiProposalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  proposalType: { type: String, enum: WIKI_PROPOSAL_TYPES, required: true, index: true },
  status: { type: String, enum: WIKI_PROPOSAL_STATUSES, default: 'pending', index: true },
  title: { type: String, required: true, trim: true },
  slugCandidate: { type: String, required: true, trim: true },
  summary: { type: String, default: '', trim: true },
  thesis: { type: String, default: '', trim: true },
  whyNow: { type: String, default: '', trim: true },
  confidence: { type: Number, min: 0, max: 1, default: 0 },
  clusterKey: { type: String, required: true, trim: true },
  sourceRefs: { type: [wikiProposalRefSchema], default: [] },
  connectedPageRefs: { type: [wikiProposalRefSchema], default: [] },
  connectedConceptRefs: { type: [wikiProposalRefSchema], default: [] },
  signals: { type: [wikiProposalSignalSchema], default: [] },
  starterClaims: { type: [String], default: [] },
  openQuestions: { type: [String], default: [] },
  proposalDecision: { type: mongoose.Schema.Types.Mixed, default: null },
  quality: { type: mongoose.Schema.Types.Mixed, default: null },
  createdPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', default: null },
  mergedIntoPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', default: null },
  dismissedReason: { type: String, default: '', trim: true },
  generation: {
    source: { type: String, enum: ['deterministic', 'deterministic_quality_gate', 'ai_shaped'], default: 'deterministic' },
    generatedAt: { type: Date, default: Date.now },
    materialHash: { type: String, default: '', trim: true },
    signalCount: { type: Number, default: 0 }
  }
}, { timestamps: true });

wikiProposalSchema.index({ userId: 1, status: 1, updatedAt: -1 });
wikiProposalSchema.index({ userId: 1, clusterKey: 1 }, { unique: true });
wikiProposalSchema.index({ userId: 1, proposalType: 1, confidence: -1 });

const WikiProposal = mongoose.model('WikiProposal', wikiProposalSchema);

const wikiRevisionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', required: true, index: true },
  reason: { type: String, enum: ['created', 'user_edit', 'agent_maintenance', 'source_event', 'archived'], default: 'user_edit' },
  actorType: { type: String, enum: ['user', 'agent', 'system'], default: 'user' },
  sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiSourceEvent', default: null },
  maintenanceRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiMaintenanceRun', default: null },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  summary: { type: String, default: '', trim: true }
}, { timestamps: true });

wikiRevisionSchema.index({ userId: 1, pageId: 1, createdAt: -1 });

const WikiRevision = mongoose.model('WikiRevision', wikiRevisionSchema);

const wikiSourceEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sourceType: { type: String, enum: ['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external'], required: true },
  sourceObjectId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  parentObjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  provider: { type: String, default: '', trim: true, index: true },
  externalId: { type: String, default: '', trim: true, index: true },
  importSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportSession', default: null, index: true },
  eventType: { type: String, enum: ['created', 'updated', 'deleted', 'imported', 'synced'], default: 'updated' },
  title: { type: String, default: '', trim: true },
  summary: { type: String, default: '', trim: true },
  text: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  sourceUpdatedAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'processing', 'processed', 'failed', 'ignored'], default: 'pending', index: true },
  affectedPageIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  attemptCount: { type: Number, default: 0 },
  lockedAt: { type: Date, default: null },
  nextAttemptAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  errorMessage: { type: String, default: '', trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

wikiSourceEventSchema.index({ userId: 1, status: 1, createdAt: -1 });
wikiSourceEventSchema.index({ userId: 1, sourceType: 1, sourceObjectId: 1, eventType: 1 });

const WikiSourceEvent = mongoose.model('WikiSourceEvent', wikiSourceEventSchema);

const wikiMaintenanceRunSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', default: null, index: true },
  sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiSourceEvent', default: null, index: true },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'needs_review'], default: 'queued', index: true },
  trigger: { type: String, enum: ['manual', 'source_event', 'batch'], default: 'manual' },
  summary: { type: String, default: '', trim: true },
  errorMessage: { type: String, default: '', trim: true },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

wikiMaintenanceRunSchema.index({ userId: 1, status: 1, createdAt: -1 });

const WikiMaintenanceRun = mongoose.model('WikiMaintenanceRun', wikiMaintenanceRunSchema);

const connectorActionLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  connector: { type: String, required: true, trim: true, index: true },
  action: { type: String, required: true, trim: true },
  direction: { type: String, enum: ['read', 'write'], default: 'read' },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'skipped'], default: 'completed', index: true },
  targetType: { type: String, default: '', trim: true },
  targetId: { type: String, default: '', trim: true },
  summary: { type: String, default: '', trim: true },
  errorMessage: { type: String, default: '', trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

connectorActionLogSchema.index({ userId: 1, connector: 1, createdAt: -1 });

const ConnectorActionLog = mongoose.model('ConnectorActionLog', connectorActionLogSchema);

const conceptLayoutSectionSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  cardIds: { type: [String], default: [] }
}, { _id: false });

const conceptLayoutCardSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  itemType: { type: String, enum: ['highlight', 'article', 'note', 'question'], required: true },
  itemId: { type: String, required: true, trim: true },
  role: { type: String, enum: ['idea', 'claim', 'evidence'], default: 'idea' },
  title: { type: String, default: '', trim: true },
  snippet: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const conceptLayoutConnectionSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  fromCardId: { type: String, required: true, trim: true },
  toCardId: { type: String, required: true, trim: true },
  type: { type: String, enum: ['supports', 'contradicts', 'related'], required: true },
  label: { type: String, default: '', trim: true }
}, { _id: false });

const conceptLayoutSchema = new mongoose.Schema({
  sections: { type: [conceptLayoutSectionSchema], default: [] },
  cards: { type: [conceptLayoutCardSchema], default: [] },
  connections: { type: [conceptLayoutConnectionSchema], default: [] }
}, { _id: false });

const conceptWorkspaceOutlineSectionSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  collapsed: { type: Boolean, default: false },
  order: { type: Number, default: 0 }
}, { _id: false });

const conceptWorkspaceAttachedItemSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  type: { type: String, enum: ['highlight', 'article', 'note', 'question'], required: true },
  refId: { type: String, required: true, trim: true },
  sectionId: { type: String, required: true, trim: true },
  groupId: { type: String, required: true, trim: true },
  parentId: { type: String, default: '', trim: true },
  inlineTitle: { type: String, default: '', trim: true },
  inlineText: { type: String, default: '', trim: true },
  stage: { type: String, enum: ['inbox', 'working', 'draft', 'archive'], default: 'working' },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  order: { type: Number, default: 0 }
}, { _id: false });

const conceptWorkspaceGroupSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  collapsed: { type: Boolean, default: false },
  order: { type: Number, default: 0 }
}, { _id: false });

const conceptWorkspaceItemSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  type: { type: String, enum: ['highlight', 'article', 'note', 'question'], required: true },
  refId: { type: String, required: true, trim: true },
  groupId: { type: String, required: true, trim: true },
  parentId: { type: String, default: '', trim: true },
  inlineTitle: { type: String, default: '', trim: true },
  inlineText: { type: String, default: '', trim: true },
  stage: { type: String, enum: ['inbox', 'working', 'draft', 'archive'], default: 'working' },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  order: { type: Number, default: 0 }
}, { _id: false });

const conceptWorkspaceConnectionSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  fromItemId: { type: String, required: true, trim: true },
  toItemId: { type: String, required: true, trim: true },
  type: { type: String, enum: ['supports', 'contradicts', 'related'], required: true }
}, { _id: false });

const conceptWorkspaceSchema = new mongoose.Schema({
  version: { type: Number, default: 1 },
  outlineSections: { type: [conceptWorkspaceOutlineSectionSchema], default: [] },
  attachedItems: { type: [conceptWorkspaceAttachedItemSchema], default: [] },
  groups: { type: [conceptWorkspaceGroupSchema], default: [] },
  items: { type: [conceptWorkspaceItemSchema], default: [] },
  connections: { type: [conceptWorkspaceConnectionSchema], default: [] },
  updatedAt: { type: String, default: () => new Date().toISOString() }
}, { _id: false });

// Tag metadata (concept pages)
const tagMetaSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  pinnedHighlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  pinnedArticleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
  pinnedNoteIds: [{ type: mongoose.Schema.Types.ObjectId }],
  dismissedHighlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  conceptLayout: { type: conceptLayoutSchema, default: undefined },
  workspace: { type: conceptWorkspaceSchema, default: undefined },
  ideaWorkbench: { type: mongoose.Schema.Types.Mixed, default: undefined },
  ideaWorkbenchMeta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  ideaWorkbenchRevision: { type: Number, default: 0 },
  ideaWorkbenchEvents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  workspaceTemplateId: { type: String, default: '', trim: true },
  workspaceTemplateName: { type: String, default: '', trim: true },
  isPublic: { type: Boolean, default: false },
  slug: {
    type: String,
    trim: true,
    default: undefined,
    set: (value) => {
      const normalized = String(value || '').trim();
      return normalized || undefined;
    }
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

tagMetaSchema.index({ name: 1, userId: 1 }, { unique: true });
tagMetaSchema.index({ slug: 1 }, { unique: true, sparse: true });
tagMetaSchema.index({ userId: 1, pinnedHighlightIds: 1 });
tagMetaSchema.index({ userId: 1, pinnedArticleIds: 1 });
tagMetaSchema.index({ userId: 1, pinnedNoteIds: 1 });

const TagMeta = mongoose.model('TagMeta', tagMetaSchema);

// Concept notes (per-tag notes)
const conceptNoteSchema = new mongoose.Schema({
  tagName: { type: String, required: true, trim: true },
  title: { type: String, default: '', trim: true },
  content: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

conceptNoteSchema.index({ userId: 1, tagName: 1, updatedAt: -1 });
conceptNoteSchema.index({ userId: 1, tagName: 1, createdAt: -1 });

const ConceptNote = mongoose.model('ConceptNote', conceptNoteSchema);

// Questions - lightweight thinking queue
const questionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  status: { type: String, enum: ['open', 'answered'], default: 'open' },
  linkedTagName: { type: String, default: '' },
  conceptName: { type: String, default: '' },
  blocks: [{
    id: { type: String, required: true },
    type: { type: String, enum: ['paragraph', 'highlight-ref'], default: 'paragraph' },
    text: { type: String, default: '' },
    highlightId: { type: mongoose.Schema.Types.ObjectId, default: null }
  }],
  linkedHighlightId: { type: mongoose.Schema.Types.ObjectId, default: null },
  linkedHighlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  linkedNotebookEntryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

questionSchema.index({ userId: 1, status: 1, createdAt: -1 });
questionSchema.index({ userId: 1, linkedTagName: 1, createdAt: -1 });
questionSchema.index({ userId: 1, conceptName: 1, createdAt: -1 });
questionSchema.index({ userId: 1, linkedNotebookEntryId: 1 });
questionSchema.index({ userId: 1, linkedHighlightIds: 1 });

const Question = mongoose.model('Question', questionSchema);

const boardSchema = new mongoose.Schema({
  scopeType: { type: String, enum: ['concept', 'question'], required: true },
  scopeId: { type: String, required: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

boardSchema.index({ userId: 1, scopeType: 1, scopeId: 1 }, { unique: true });

const Board = mongoose.model('Board', boardSchema);

const boardItemSchema = new mongoose.Schema({
  boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  type: { type: String, enum: ['note', 'highlight', 'article'], required: true },
  role: { type: String, enum: ['idea', 'claim', 'evidence'], default: 'idea' },
  sourceId: { type: String, default: '', trim: true },
  noteId: { type: String, default: '', trim: true },
  articleId: { type: String, default: '', trim: true },
  highlightId: { type: String, default: '', trim: true },
  text: { type: String, default: '', trim: true },
  x: { type: Number, default: 40 },
  y: { type: Number, default: 40 },
  w: { type: Number, default: 320 },
  h: { type: Number, default: 220 }
}, { timestamps: true });

boardItemSchema.index({ boardId: 1, createdAt: 1 });

const BoardItem = mongoose.model('BoardItem', boardItemSchema);

const boardEdgeSchema = new mongoose.Schema({
  boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  fromItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'BoardItem', required: true },
  toItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'BoardItem', required: true },
  relation: { type: String, enum: ['supports', 'contradicts', 'explains', 'example'], required: true }
}, { timestamps: true });

boardEdgeSchema.index({ boardId: 1, createdAt: 1 });
boardEdgeSchema.index({ boardId: 1, fromItemId: 1, toItemId: 1, relation: 1 }, { unique: true });

const BoardEdge = mongoose.model('BoardEdge', boardEdgeSchema);

const workingMemoryItemSchema = new mongoose.Schema({
  sourceType: { type: String, required: true, trim: true },
  sourceId: { type: String, required: true, trim: true },
  textSnippet: { type: String, required: true, trim: true },
  tags: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  processedAt: { type: Date, default: null },
  processedReason: { type: String, default: '', trim: true },
  workspaceType: { type: String, default: 'global', trim: true },
  workspaceId: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

workingMemoryItemSchema.index({ userId: 1, workspaceType: 1, workspaceId: 1, createdAt: -1 });
workingMemoryItemSchema.index({ userId: 1, workspaceType: 1, workspaceId: 1, status: 1, createdAt: -1 });

const WorkingMemoryItem = mongoose.model('WorkingMemoryItem', workingMemoryItemSchema);

const uiSettingsSchema = new mongoose.Schema({
  typographyScale: { type: String, enum: ['small', 'default', 'large'], default: 'default' },
  density: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  accent: { type: String, enum: ['blue', 'emerald', 'amber', 'rose'], default: 'blue' },
  brandEnergy: { type: Boolean, default: true },
  workspaceType: { type: String, default: 'global', trim: true },
  workspaceId: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

uiSettingsSchema.index({ userId: 1, workspaceType: 1, workspaceId: 1 }, { unique: true });

const UiSettings = mongoose.model('UiSettings', uiSettingsSchema);

const wikiSchemaSnapshotSchema = new mongoose.Schema({
  content: { type: String, default: '', trim: true, maxlength: 8000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const wikiSchemaSettingsSchema = new mongoose.Schema({
  content: { type: String, default: '', trim: true, maxlength: 8000 },
  snapshots: { type: [wikiSchemaSnapshotSchema], default: [] },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

wikiSchemaSettingsSchema.index({ userId: 1 }, { unique: true });

const WikiSchemaSettings = mongoose.model('WikiSchemaSettings', wikiSchemaSettingsSchema);

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

const tourStateSchema = new mongoose.Schema({
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

const returnQueueEntrySchema = new mongoose.Schema({
  itemType: { type: String, required: true, trim: true },
  itemId: { type: String, required: true, trim: true },
  reason: { type: String, default: '', trim: true },
  dueAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  completedAt: { type: Date, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

returnQueueEntrySchema.index({ userId: 1, status: 1, dueAt: 1, createdAt: -1 });
returnQueueEntrySchema.index({ userId: 1, itemType: 1, itemId: 1, status: 1 });

const ReturnQueueEntry = mongoose.model('ReturnQueueEntry', returnQueueEntrySchema);

const connectionSchema = new mongoose.Schema({
  fromType: { type: String, required: true, trim: true },
  fromId: { type: String, required: true, trim: true },
  toType: { type: String, required: true, trim: true },
  toId: { type: String, required: true, trim: true },
  relationType: { type: String, required: true, trim: true },
  scopeType: { type: String, default: '', trim: true },
  scopeId: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

connectionSchema.index(
  { userId: 1, scopeType: 1, scopeId: 1, fromType: 1, fromId: 1, toType: 1, toId: 1, relationType: 1 },
  { unique: true }
);
connectionSchema.index({ userId: 1, scopeType: 1, scopeId: 1, fromType: 1, fromId: 1, createdAt: -1 });
connectionSchema.index({ userId: 1, scopeType: 1, scopeId: 1, toType: 1, toId: 1, createdAt: -1 });

const Connection = mongoose.model('Connection', connectionSchema);

const itemViewEventSchema = new mongoose.Schema({
  itemType: { type: String, required: true, trim: true },
  itemId: { type: String, required: true, trim: true },
  previousItemType: { type: String, default: '', trim: true },
  previousItemId: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

itemViewEventSchema.index({ userId: 1, itemType: 1, itemId: 1, createdAt: -1 });
itemViewEventSchema.index({ userId: 1, previousItemType: 1, previousItemId: 1, createdAt: -1 });

const ItemViewEvent = mongoose.model('ItemViewEvent', itemViewEventSchema);

const dropLegacyConnectionIndex = async () => {
  const legacyIndexName = 'userId_1_fromType_1_fromId_1_toType_1_toId_1_relationType_1';
  try {
    await Connection.collection.dropIndex(legacyIndexName);
    console.log(`ℹ️ Dropped legacy connection index: ${legacyIndexName}`);
  } catch (error) {
    if (error?.codeName === 'IndexNotFound' || error?.code === 27) return;
    console.warn('⚠️ Unable to drop legacy connection index:', error?.message || error);
  }
};

const conceptPathItemRefSchema = new mongoose.Schema({
  type: { type: String, required: true, trim: true },
  id: { type: String, required: true, trim: true },
  order: { type: Number, required: true, min: 0 },
  notes: { type: String, default: '', trim: true }
}, { _id: true });

const conceptPathSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  itemRefs: { type: [conceptPathItemRefSchema], default: [] },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

conceptPathSchema.index({ userId: 1, updatedAt: -1 });

const ConceptPath = mongoose.model('ConceptPath', conceptPathSchema);

const conceptPathProgressSchema = new mongoose.Schema({
  pathId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConceptPath', required: true },
  understoodItemRefIds: { type: [String], default: [] },
  currentIndex: { type: Number, default: 0, min: 0 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

conceptPathProgressSchema.index({ userId: 1, pathId: 1 }, { unique: true });

const ConceptPathProgress = mongoose.model('ConceptPathProgress', conceptPathProgressSchema);

// Brain summaries (AI-generated, cached)
const brainSummarySchema = new mongoose.Schema({
  timeRange: { type: String, required: true },
  generatedAt: { type: Date, required: true },
  sourceCount: { type: Number, default: 0 },
  themes: { type: [String], default: [] },
  connections: { type: [String], default: [] },
  questions: { type: [String], default: [] },
  sourceHighlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

brainSummarySchema.index({ userId: 1, timeRange: 1, generatedAt: -1 });

const BrainSummary = mongoose.model('BrainSummary', brainSummarySchema);

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
  apiKeyHash: { type: String, required: true, trim: true },
  apiKeyPrefix: { type: String, default: '', trim: true },
  lastUsedAt: { type: Date, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

personalAgentSchema.index({ userId: 1, status: 1, updatedAt: -1 });
personalAgentSchema.index({ userId: 1, name: 1 });
personalAgentSchema.index({ apiKeyHash: 1 }, { unique: true });

const PersonalAgent = mongoose.model('PersonalAgent', personalAgentSchema);

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
    enum: ['global', 'workspace', 'article', 'notebook', 'concept', 'handoff', 'selection'],
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
    enum: ['create_folder', 'rename_folder', 'move_item', 'merge_folder', 'delete_folder'],
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

const agentUpkeepCycleRunSchema = new mongoose.Schema({
  handoffId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentHandoff', default: null },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentThread', default: null },
  scheduledFor: { type: Date, default: null },
  startedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled'
  }
}, { _id: false });

const agentUpkeepCycleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  summary: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed'],
    default: 'active'
  },
  cadence: { type: String, default: 'recurring', trim: true },
  taskType: {
    type: String,
    enum: ['research', 'synthesis', 'restructure', 'qa', 'custom'],
    default: 'custom'
  },
  workerRole: {
    type: String,
    enum: ['planner', 'researcher', 'synthesizer', 'critic', 'editor', 'organizer', ''],
    default: ''
  },
  nextDueAt: { type: Date, default: null },
  lastRunAt: { type: Date, default: null },
  lastHandoffId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentHandoff', default: null },
  lastThreadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentThread', default: null },
  sourceDraftId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentArtifactDraft', default: null },
  sourceContext: { type: mongoose.Schema.Types.Mixed, default: {} },
  workflow: { type: mongoose.Schema.Types.Mixed, default: {} },
  seed: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastOutcome: { type: mongoose.Schema.Types.Mixed, default: {} },
  runs: { type: [agentUpkeepCycleRunSchema], default: [] }
}, { timestamps: true });

agentUpkeepCycleSchema.index({ userId: 1, status: 1, nextDueAt: 1, updatedAt: -1 });
agentUpkeepCycleSchema.index({ userId: 1, sourceDraftId: 1, updatedAt: -1 });

const AgentUpkeepCycle = mongoose.model('AgentUpkeepCycle', agentUpkeepCycleSchema);

// Reference edges (block-level backlinks)
const referenceEdgeSchema = new mongoose.Schema({
  sourceType: { type: String, required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceBlockId: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  targetTagName: { type: String, default: '' },
  blockPreviewText: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

referenceEdgeSchema.index({ targetType: 1, targetId: 1, targetTagName: 1 });
referenceEdgeSchema.index({ userId: 1, targetType: 1, targetId: 1 });
referenceEdgeSchema.index({ userId: 1, targetType: 1, targetTagName: 1 });

const ReferenceEdge = mongoose.model('ReferenceEdge', referenceEdgeSchema);

// Saved Views (Smart Folders)
const savedViewSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  targetType: { type: String, enum: ['articles', 'highlights', 'notebook'], default: 'highlights' },
  filters: {
    tags: [{ type: String }],
    textQuery: { type: String, default: '' },
    dateFrom: { type: Date },
    dateTo: { type: Date },
    folders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Folder' }]
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const SavedView = mongoose.model('SavedView', savedViewSchema);

// Collections
const collectionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  slug: { type: String, required: true, trim: true },
  articleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
  highlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

collectionSchema.index({ slug: 1, userId: 1 }, { unique: true });
collectionSchema.index({ userId: 1, updatedAt: -1 });
collectionSchema.index({ userId: 1, articleIds: 1 });
collectionSchema.index({ userId: 1, highlightIds: 1 });

const Collection = mongoose.model('Collection', collectionSchema);

const integrationConnectionSchema = new mongoose.Schema({
  provider: { type: String, required: true, trim: true },
  status: { type: String, enum: ['draft', 'connected', 'error', 'revoked'], default: 'draft' },
  health: { type: String, enum: ['unknown', 'healthy', 'warning', 'error'], default: 'unknown' },
  accountLabel: { type: String, default: '', trim: true },
  externalAccountId: { type: String, default: '', trim: true },
  mode: { type: String, enum: ['api_token', 'oauth', 'file_upload', 'manual'], default: 'manual' },
  scopes: { type: [String], default: [] },
  secretVersion: { type: Number, default: 1 },
  encryptedAccessToken: { type: String, default: '' },
  encryptedRefreshToken: { type: String, default: '' },
  encryptedApiToken: { type: String, default: '' },
  lastSyncAt: { type: Date, default: null },
  lastValidatedAt: { type: Date, default: null },
  lastPreviewAt: { type: Date, default: null },
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
    filters: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
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

/**
 * SharedConcept — public read-only snapshot of a concept.
 *
 * Concepts live virtually (assembled from highlights + ConceptNote + workbench
 * state at read-time), so a "share" is really a slug → (userId, conceptName)
 * pointer. The public route resolves the pointer and assembles the read-only
 * snapshot at request time using the same loaders the owner sees.
 *
 * One row per (userId, conceptName) — toggling share off deletes the row,
 * toggling back on mints a fresh slug. We don't keep historical slugs because
 * regenerating is the de-facto revocation flow.
 */
const sharedConceptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conceptName: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  // Owner display name shown to public viewers; cached at mint time so we can
  // surface "Shared by X" without joining User on the public read path.
  ownerDisplayName: { type: String, default: '' }
}, { timestamps: true });

sharedConceptSchema.index({ userId: 1, conceptName: 1 }, { unique: true });

const SharedConcept = mongoose.model('SharedConcept', sharedConceptSchema);

module.exports = {
  User,
  Feedback,
  Recommendation,
  Folder,
  Article,
  Note,
  NotebookEntry,
  NotebookFolder,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiSourceEvent,
  WikiMaintenanceRun,
  ConnectorActionLog,
  TagMeta,
  ConceptNote,
  Question,
  Board,
  BoardItem,
  BoardEdge,
  WorkingMemoryItem,
  UiSettings,
  WikiSchemaSettings,
  TourState,
  ReturnQueueEntry,
  Connection,
  ItemViewEvent,
  ConceptPath,
  ConceptPathProgress,
  BrainSummary,
  PersonalAgent,
  AgentThread,
  AgentActionApproval,
  AgentProtocolApproval,
  AgentProtocolHookRun,
  AgentActionAudit,
  AgentSoftDeleteRecord,
  AgentHandoff,
  AgentArtifactDraft,
  AgentRun,
  AgentProposedChange,
  AgentStructureProposal,
  AgentUpkeepCycle,
  ReferenceEdge,
  SavedView,
  Collection,
  IntegrationConnection,
  ImportSession,
  SharedConcept,
  dropLegacyConnectionIndex
};
