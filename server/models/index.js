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

const userAgentProtocolPolicySchema = new mongoose.Schema({
  routingMode: { type: String, enum: ['balanced', 'native_first', 'byo_first'], default: 'balanced' },
  defaultByoAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PersonalAgent', default: null },
  allowByoForResearch: { type: Boolean, default: true },
  allowByoForSynthesis: { type: Boolean, default: true },
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
    type: { type: String, enum: ['claim', 'evidence', 'note'], default: 'note' },
    claimId: { type: mongoose.Schema.Types.ObjectId, default: null },
    anchor: {
      text: String,
      prefix: String,
      suffix: String,
      startOffsetApprox: Number
    },
    createdAt: { type: Date, default: Date.now }
  }],
  pdfs: { type: [pdfAttachmentSchema], default: [] },
  author: { type: String, default: '' },
  publicationDate: { type: String, default: '' },
  siteName: { type: String, default: '' }
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
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

notebookFolderSchema.index({ userId: 1, name: 1 });

const NotebookFolder = mongoose.model('NotebookFolder', notebookFolderSchema);

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

module.exports = {
  User,
  Feedback,
  Recommendation,
  Folder,
  Article,
  Note,
  NotebookEntry,
  NotebookFolder,
  TagMeta,
  ConceptNote,
  Question,
  Board,
  BoardItem,
  BoardEdge,
  WorkingMemoryItem,
  UiSettings,
  TourState,
  ReturnQueueEntry,
  Connection,
  ItemViewEvent,
  ConceptPath,
  ConceptPathProgress,
  BrainSummary,
  PersonalAgent,
  AgentActionApproval,
  AgentActionAudit,
  AgentSoftDeleteRecord,
  AgentHandoff,
  ReferenceEdge,
  SavedView,
  Collection,
  dropLegacyConnectionIndex
};
