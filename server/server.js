const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const multer = require('multer');
const Papa = require('papaparse');
const path = require('path');
const crypto = require('crypto');
const {
  ensureWorkspace,
  applyPatchOp,
  validateWorkspacePayload
} = require('./utils/workspaceUtils');
const { checkHealth } = require('./ai/ollamaClient');
const {
  enqueueArticleEmbedding,
  enqueueHighlightEmbedding,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding
} = require('./ai/embeddingJobs');
const { EmbeddingError } = require('./ai/embed');
const { enqueueBrainSummary, registerBrainSummaryHandler } = require('./ai/brainSummaryJobs');
const {
  isAiEnabled,
  upsertEmbeddings,
  deleteEmbeddings,
  semanticSearch: aiSemanticSearch,
  similarTo: aiSimilarTo,
  getEmbeddings: aiGetEmbeddings,
  embedTexts: aiEmbedTexts,
  checkUpstreamHealth
} = require('./config/aiClient');
const { buildEmbeddingId } = require('./ai/embeddingTypes');
const {
  highlightToEmbeddingItem,
  articleToEmbeddingItems,
  notebookEntryToEmbeddingItems,
  conceptToEmbeddingItem,
  questionToEmbeddingItem
} = require('./ai/mappers');
const { isGenerationEnabled, generateDraftInsights } = require('./ai/generation');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  console.log(`[REQ] ${requestId} ${req.method} ${req.originalUrl}`);
  next();
});

// This is the new, permissive CORS setup
app.use(cors());

// Allow larger payloads for PDFs (Render/nginx often defaults to 1–10MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI) // useNewUrlParser and useUnifiedTopology are deprecated in recent Mongoose versions
  .then(() => console.log("✅ MongoDB connected successfully."))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- SCHEMA & MODELS ---

// --- AUTHENTICATION ADDITIONS: User Schema and Model ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true }, // Hashed password
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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } // Link to user
}, { timestamps: true });

// Add a unique compound index for name and userId to ensure unique folder names per user
folderSchema.index({ name: 1, userId: 1 }, { unique: true });

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

  // --- CORRECT LOCATION FOR NEW FIELDS ---
  author: { type: String, default: '' },
  publicationDate: { type: String, default: '' }, // <-- TYPO FIXED
  siteName: { type: String, default: '' }
  // --- END ---

}, { timestamps: true });


// Add a unique compound index for url and userId to ensure unique article URLs per user
articleSchema.index({ url: 1, userId: 1 }, { unique: true });
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
const NotebookEntry = mongoose.model('NotebookEntry', notebookEntrySchema);

const notebookFolderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

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
  order: { type: Number, default: 0 }
}, { _id: false });

const conceptWorkspaceSchema = new mongoose.Schema({
  version: { type: Number, default: 1 },
  groups: { type: [conceptWorkspaceGroupSchema], default: [] },
  items: { type: [conceptWorkspaceItemSchema], default: [] },
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
  isPublic: { type: Boolean, default: false },
  slug: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

tagMetaSchema.index({ name: 1, userId: 1 }, { unique: true });
tagMetaSchema.index({ slug: 1 }, { unique: true, sparse: true });

const TagMeta = mongoose.model('TagMeta', tagMetaSchema);

// Concept notes (per-tag notes)
const conceptNoteSchema = new mongoose.Schema({
  tagName: { type: String, required: true, trim: true },
  title: { type: String, default: '', trim: true },
  content: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

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
  workspaceType: { type: String, default: 'global', trim: true },
  workspaceId: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

uiSettingsSchema.index({ userId: 1, workspaceType: 1, workspaceId: 1 }, { unique: true });

const UiSettings = mongoose.model('UiSettings', uiSettingsSchema);

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

if (mongoose.connection.readyState === 1) {
  dropLegacyConnectionIndex();
} else {
  mongoose.connection.once('open', () => {
    dropLegacyConnectionIndex();
  });
}

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

const ReferenceEdge = mongoose.model('ReferenceEdge', referenceEdgeSchema);
const { buildFolderService } = require('./services/folderService');
const { getFoldersWithCounts } = buildFolderService({ Folder, Article, mongoose });
const { buildConceptService } = require('./services/conceptService');
const { getConcepts, getConceptMeta, updateConceptMeta, getConceptRelated } = buildConceptService({
  Article,
  TagMeta,
  NotebookEntry,
  ReferenceEdge,
  mongoose
});
const { buildReflectionService } = require('./services/reflectionService');
const { getReflections } = buildReflectionService({
  Article,
  NotebookEntry,
  Question,
  TagMeta,
  mongoose
});

registerBrainSummaryHandler({ Article, BrainSummary });

const createBlockId = () => (
  (crypto.randomUUID ? crypto.randomUUID() : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`)
);

const ITEM_TYPES = new Set(['claim', 'evidence', 'note']);

const normalizeItemType = (value, fallback = 'note') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (ITEM_TYPES.has(candidate)) return candidate;
  return fallback;
};

const normalizeTags = (input) => {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const output = [];
  input.forEach(tag => {
    const value = String(tag || '').trim();
    if (!value || seen.has(value.toLowerCase())) return;
    seen.add(value.toLowerCase());
    output.push(value);
  });
  return output.slice(0, 40);
};

const parseClaimId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const mapHighlightWithArticle = (article, highlight) => ({
  _id: highlight._id,
  articleId: article._id,
  articleTitle: article.title || 'Untitled article',
  text: highlight.text,
  note: highlight.note,
  tags: highlight.tags || [],
  type: normalizeItemType(highlight.type, 'note'),
  claimId: highlight.claimId || null,
  createdAt: highlight.createdAt
});

const findHighlightById = async (userId, highlightId) => {
  if (!mongoose.Types.ObjectId.isValid(highlightId)) return null;
  const matches = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': new mongoose.Types.ObjectId(highlightId) } },
    { $project: {
      _id: '$highlights._id',
      text: '$highlights.text',
      note: '$highlights.note',
      tags: '$highlights.tags',
      type: '$highlights.type',
      claimId: '$highlights.claimId',
      articleId: '$_id',
      articleTitle: '$title',
      createdAt: '$highlights.createdAt'
    } }
  ]);
  return matches[0] || null;
};

const BOARD_SCOPE_TYPES = new Set(['concept', 'question']);
const BOARD_ITEM_TYPES = new Set(['note', 'highlight', 'article']);
const BOARD_ITEM_ROLES = new Set(['idea', 'claim', 'evidence']);
const BOARD_EDGE_RELATIONS = new Set(['supports', 'contradicts', 'explains', 'example']);

const normalizeBoardScopeType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!BOARD_SCOPE_TYPES.has(candidate)) return '';
  return candidate;
};

const normalizeBoardScopeId = (scopeType, value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (scopeType === 'concept') return raw.toLowerCase();
  return raw;
};

const normalizeBoardItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!BOARD_ITEM_TYPES.has(candidate)) return '';
  return candidate;
};

const normalizeBoardItemRole = (value, fallback = 'idea') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (BOARD_ITEM_ROLES.has(candidate)) return candidate;
  return fallback;
};

const normalizeBoardRelation = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!BOARD_EDGE_RELATIONS.has(candidate)) return '';
  return candidate;
};

const normalizeBoardNumber = (value, fallback, { min = 0, max = 10000 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const resolveBoardItemPayload = async ({ userId, type, sourceId, text }) => {
  const safeSourceId = String(sourceId || '').trim();
  const safeText = String(text || '').trim();
  if (!safeSourceId) {
    return { sourceId: '', text: safeText, noteId: '', articleId: '', highlightId: '' };
  }

  if (type === 'highlight') {
    const highlight = await findHighlightById(userId, safeSourceId);
    if (!highlight) return null;
    return {
      sourceId: String(highlight._id),
      text: safeText || highlight.text || '',
      noteId: '',
      articleId: '',
      highlightId: String(highlight._id)
    };
  }

  if (type === 'note') {
    if (!mongoose.Types.ObjectId.isValid(safeSourceId)) return null;
    const note = await NotebookEntry.findOne({ _id: safeSourceId, userId }).select('title content blocks');
    if (!note) return null;
    const blockText = Array.isArray(note.blocks)
      ? note.blocks.map(block => String(block?.text || '').trim()).filter(Boolean).join(' ')
      : '';
    return {
      sourceId: String(note._id),
      text: safeText || note.title || blockText || '',
      noteId: String(note._id),
      articleId: '',
      highlightId: ''
    };
  }

  if (type === 'article') {
    if (!mongoose.Types.ObjectId.isValid(safeSourceId)) return null;
    const article = await Article.findOne({ _id: safeSourceId, userId }).select('title');
    if (!article) return null;
    return {
      sourceId: String(article._id),
      text: safeText || article.title || '',
      noteId: '',
      articleId: String(article._id),
      highlightId: ''
    };
  }

  return null;
};

const ensureBoardOwnership = async (userId, boardId) => {
  if (!mongoose.Types.ObjectId.isValid(boardId)) return null;
  return Board.findOne({ _id: boardId, userId });
};

const WORKING_MEMORY_STATUSES = new Set(['active', 'archived']);
const WORKING_MEMORY_PROMOTE_TARGETS = new Set(['notebook', 'concept', 'question']);

const normalizeWorkingMemoryStatus = (value, fallback = 'active') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (WORKING_MEMORY_STATUSES.has(candidate)) return candidate;
  return fallback;
};

const normalizeWorkingMemoryTarget = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (WORKING_MEMORY_PROMOTE_TARGETS.has(candidate)) return candidate;
  return '';
};

const normalizeWorkingMemoryIds = (value) => {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const ids = [];
  values.forEach(raw => {
    const id = String(raw || '').trim();
    if (!id || seen.has(id) || !mongoose.Types.ObjectId.isValid(id)) return;
    seen.add(id);
    ids.push(new mongoose.Types.ObjectId(id));
  });
  return ids;
};

const activeWorkingMemoryStatusFilter = () => ({
  $or: [
    { status: 'active' },
    { status: { $exists: false } }
  ]
});

const parseWorkingMemoryTags = (value) => {
  if (Array.isArray(value)) return normalizeTags(value).slice(0, 20);
  const text = String(value || '').trim();
  if (!text) return [];
  return normalizeTags(text.split(',')).slice(0, 20);
};

const splitWorkingMemoryText = (value, mode = 'sentence') => {
  const text = String(value || '').replace(/\r/g, '\n').trim();
  if (!text) return [];
  const safeMode = String(mode || 'sentence').trim().toLowerCase();
  const chunks = safeMode === 'newline'
    ? text.split(/\n+/)
    : text.split(/(?<=[.!?])\s+|\n+/);
  return chunks
    .map(chunk => String(chunk || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 40);
};

const buildWorkingMemoryNotebookTitle = (text = '') => {
  const clean = stripHtml(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Working memory extract';
  const words = clean.split(' ').slice(0, 8).join(' ');
  return words.length > 80 ? `${words.slice(0, 80).trim()}...` : words;
};

const archiveWorkingMemoryItems = async ({
  userId,
  itemIds = [],
  reason = 'archived'
}) => {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { matchedCount: 0, modifiedCount: 0 };
  }
  return WorkingMemoryItem.updateMany(
    {
      _id: { $in: itemIds },
      userId,
      ...activeWorkingMemoryStatusFilter()
    },
    {
      $set: {
        status: 'archived',
        processedAt: new Date(),
        processedReason: String(reason || 'archived').trim().slice(0, 120)
      }
    }
  );
};

const unarchiveWorkingMemoryItems = async ({
  userId,
  itemIds = []
}) => {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { matchedCount: 0, modifiedCount: 0 };
  }
  return WorkingMemoryItem.updateMany(
    {
      _id: { $in: itemIds },
      userId,
      status: 'archived'
    },
    {
      $set: {
        status: 'active',
        processedAt: null,
        processedReason: ''
      }
    }
  );
};

const RETURN_QUEUE_ITEM_TYPES = new Set(['highlight', 'notebook', 'question', 'concept', 'article']);

const normalizeReturnQueueItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (RETURN_QUEUE_ITEM_TYPES.has(candidate)) return candidate;
  return '';
};

const UI_SETTINGS_DEFAULTS = Object.freeze({
  typographyScale: 'default',
  density: 'comfortable',
  theme: 'light',
  accent: 'blue'
});

const UI_SETTINGS_TYPOGRAPHY_VALUES = new Set(['small', 'default', 'large']);
const UI_SETTINGS_DENSITY_VALUES = new Set(['comfortable', 'compact']);
const UI_SETTINGS_THEME_VALUES = new Set(['light', 'dark']);
const UI_SETTINGS_ACCENT_VALUES = new Set(['blue', 'emerald', 'amber', 'rose']);
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
  )
});

const buildUiSettingsResponse = (doc, scope = { workspaceType: 'global', workspaceId: '' }) => {
  const normalized = normalizeUiSettingsPayload(doc || {});
  return {
    ...UI_SETTINGS_DEFAULTS,
    ...normalized,
    workspaceType: scope.workspaceType || 'global',
    workspaceId: scope.workspaceId || ''
  };
};

const parseDueAt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const buildUnavailableQueueItem = () => ({
  title: 'Unavailable item',
  snippet: 'This item could not be loaded.',
  openPath: '',
  exists: false
});

const decodeBasicHtmlEntities = (value = '') => (
  String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
);

const buildQueueSnippet = (...values) => {
  const first = values.find(value => String(value || '').trim());
  const clean = decodeBasicHtmlEntities(stripHtml(first || ''));
  return clean.slice(0, 280);
};

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CONCEPT_LAYOUT_CARD_TYPES = new Set(['highlight', 'article', 'note', 'question']);
const CONCEPT_LAYOUT_CARD_ROLES = new Set(['idea', 'claim', 'evidence']);
const CONCEPT_LAYOUT_CONNECTION_TYPES = new Set(['supports', 'contradicts', 'related']);

const makeConceptLayoutId = (prefix = 'id') => (
  `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Math.random().toString(36).slice(2, 9)}-${Date.now()}`}`
);

const createDefaultConceptLayout = () => ({
  sections: [
    { id: makeConceptLayoutId('section'), title: 'Claims', description: '', cardIds: [] },
    { id: makeConceptLayoutId('section'), title: 'Evidence', description: '', cardIds: [] },
    { id: makeConceptLayoutId('section'), title: 'Examples', description: '', cardIds: [] },
    { id: makeConceptLayoutId('section'), title: 'Questions', description: '', cardIds: [] },
    { id: makeConceptLayoutId('section'), title: 'To verify', description: '', cardIds: [] }
  ],
  cards: [],
  connections: []
});

const normalizeConceptLayoutCardType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!CONCEPT_LAYOUT_CARD_TYPES.has(candidate)) return '';
  return candidate;
};

const normalizeConceptLayoutCardRole = (value, fallback = 'idea') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (CONCEPT_LAYOUT_CARD_ROLES.has(candidate)) return candidate;
  return fallback;
};

const normalizeConceptLayoutConnectionType = (value, fallback = 'related') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (CONCEPT_LAYOUT_CONNECTION_TYPES.has(candidate)) return candidate;
  return fallback;
};

const normalizeConceptLayout = (input = {}, options = {}) => {
  const base = options.baseLayout && typeof options.baseLayout === 'object'
    ? options.baseLayout
    : createDefaultConceptLayout();
  const source = input && typeof input === 'object' ? input : {};

  const cards = [];
  const cardIds = new Set();
  const incomingCards = Array.isArray(source.cards) ? source.cards : [];
  incomingCards.forEach((rawCard) => {
    if (!rawCard || typeof rawCard !== 'object') return;
    const itemType = normalizeConceptLayoutCardType(rawCard.itemType);
    const itemId = String(rawCard.itemId || '').trim();
    if (!itemType || !itemId) return;
    let id = String(rawCard.id || '').trim() || makeConceptLayoutId('card');
    if (cardIds.has(id)) id = makeConceptLayoutId('card');
    cardIds.add(id);
    cards.push({
      id,
      itemType,
      itemId,
      role: normalizeConceptLayoutCardRole(rawCard.role),
      title: String(rawCard.title || '').trim().slice(0, 220),
      snippet: String(rawCard.snippet || '').trim().slice(0, 4000),
      createdAt: rawCard.createdAt ? new Date(rawCard.createdAt) : new Date()
    });
  });

  const sections = [];
  const sectionIds = new Set();
  const incomingSections = Array.isArray(source.sections) && source.sections.length > 0
    ? source.sections
    : (Array.isArray(base.sections) ? base.sections : []);
  incomingSections.forEach((rawSection, index) => {
    if (!rawSection || typeof rawSection !== 'object') return;
    let id = String(rawSection.id || '').trim() || makeConceptLayoutId('section');
    if (sectionIds.has(id)) id = makeConceptLayoutId('section');
    sectionIds.add(id);
    const fallbackTitle = index === 0 ? 'Section' : `Section ${index + 1}`;
    const title = String(rawSection.title || '').trim() || fallbackTitle;
    const description = String(rawSection.description || '').trim().slice(0, 400);
    const list = Array.isArray(rawSection.cardIds) ? rawSection.cardIds : [];
    const seenCardInSection = new Set();
    const cardIdsForSection = [];
    list.forEach((rawCardId) => {
      const cardId = String(rawCardId || '').trim();
      if (!cardId || seenCardInSection.has(cardId) || !cardIds.has(cardId)) return;
      seenCardInSection.add(cardId);
      cardIdsForSection.push(cardId);
    });
    sections.push({ id, title: title.slice(0, 120), description, cardIds: cardIdsForSection });
  });

  if (sections.length === 0) {
    const fallback = createDefaultConceptLayout();
    fallback.sections.forEach(section => sections.push(section));
  }

  const assigned = new Set();
  sections.forEach(section => section.cardIds.forEach(cardId => assigned.add(cardId)));
  const unassigned = cards.filter(card => !assigned.has(card.id)).map(card => card.id);
  if (unassigned.length > 0) {
    sections[0].cardIds = [...sections[0].cardIds, ...unassigned];
  }

  const connections = [];
  const seenConnections = new Set();
  const incomingConnections = Array.isArray(source.connections) ? source.connections : [];
  incomingConnections.forEach((rawConnection) => {
    if (!rawConnection || typeof rawConnection !== 'object') return;
    const fromCardId = String(rawConnection.fromCardId || '').trim();
    const toCardId = String(rawConnection.toCardId || '').trim();
    if (!fromCardId || !toCardId || fromCardId === toCardId) return;
    if (!cardIds.has(fromCardId) || !cardIds.has(toCardId)) return;
    const type = normalizeConceptLayoutConnectionType(rawConnection.type, '');
    if (!type) return;
    const key = `${fromCardId}:${toCardId}:${type}`;
    if (seenConnections.has(key)) return;
    seenConnections.add(key);
    const id = String(rawConnection.id || '').trim() || makeConceptLayoutId('connection');
    connections.push({
      id,
      fromCardId,
      toCardId,
      type,
      label: String(rawConnection.label || '').trim().slice(0, 120)
    });
  });

  return { sections, cards, connections };
};

const resolveConceptByParam = async (userId, rawParam, { createIfMissing = false } = {}) => {
  const safeParam = String(rawParam || '').trim();
  if (!safeParam) return null;
  const userObjectId = new mongoose.Types.ObjectId(userId);
  if (mongoose.Types.ObjectId.isValid(safeParam)) {
    const byId = await TagMeta.findOne({ _id: safeParam, userId: userObjectId });
    if (byId) return byId;
  }
  const byName = await TagMeta.findOne({
    name: new RegExp(`^${escapeRegExp(safeParam)}$`, 'i'),
    userId: userObjectId
  });
  if (byName) return byName;
  if (!createIfMissing) return null;
  const created = await TagMeta.findOneAndUpdate(
    { name: safeParam, userId: userObjectId },
    { $setOnInsert: { name: safeParam } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return created;
};

const stripInlineHtml = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const createConceptLayoutCard = async ({ userId, itemType, itemId, title, snippet, role }) => {
  const safeType = normalizeConceptLayoutCardType(itemType);
  const safeItemId = String(itemId || '').trim();
  const safeRole = normalizeConceptLayoutCardRole(role);
  if (!safeType || !safeItemId) return null;

  if (safeType === 'highlight') {
    const highlight = await findHighlightById(userId, safeItemId);
    if (!highlight) return null;
    return {
      id: makeConceptLayoutId('card'),
      itemType: safeType,
      itemId: String(highlight._id),
      role: safeRole,
      title: String(title || '').trim().slice(0, 220) || highlight.articleTitle || 'Highlight',
      snippet: String(snippet || '').trim().slice(0, 4000) || String(highlight.text || '').trim(),
      createdAt: new Date()
    };
  }

  if (!mongoose.Types.ObjectId.isValid(safeItemId)) return null;
  if (safeType === 'article') {
    const article = await Article.findOne({ _id: safeItemId, userId }).select('title content url').lean();
    if (!article) return null;
    const fallbackSnippet = stripInlineHtml(article.content || article.url || '').slice(0, 320);
    return {
      id: makeConceptLayoutId('card'),
      itemType: safeType,
      itemId: String(article._id),
      role: safeRole,
      title: String(title || '').trim().slice(0, 220) || article.title || 'Article',
      snippet: String(snippet || '').trim().slice(0, 4000) || fallbackSnippet,
      createdAt: new Date()
    };
  }

  if (safeType === 'note') {
    const note = await NotebookEntry.findOne({ _id: safeItemId, userId }).select('title content blocks').lean();
    if (!note) return null;
    const blockSnippet = Array.isArray(note.blocks)
      ? note.blocks.map(block => String(block?.text || '').trim()).filter(Boolean).join(' ')
      : '';
    return {
      id: makeConceptLayoutId('card'),
      itemType: safeType,
      itemId: String(note._id),
      role: safeRole,
      title: String(title || '').trim().slice(0, 220) || note.title || 'Notebook note',
      snippet: String(snippet || '').trim().slice(0, 4000) || stripInlineHtml(note.content || blockSnippet).slice(0, 320),
      createdAt: new Date()
    };
  }

  if (safeType === 'question') {
    const question = await Question.findOne({ _id: safeItemId, userId })
      .select('text linkedTagName')
      .lean();
    if (!question) return null;
    return {
      id: makeConceptLayoutId('card'),
      itemType: safeType,
      itemId: String(question._id),
      role: safeRole,
      title: String(title || '').trim().slice(0, 220) || question.text || 'Question',
      snippet: String(snippet || '').trim().slice(0, 4000) || String(question.linkedTagName || '').trim(),
      createdAt: new Date()
    };
  }

  return null;
};

const resolveReturnQueueItem = async (userId, itemType, itemId) => {
  const safeItemId = String(itemId || '').trim();
  if (!safeItemId) return null;
  if (itemType === 'highlight') {
    const highlight = await findHighlightById(userId, safeItemId);
    if (!highlight) return null;
    return {
      title: highlight.articleTitle || 'Highlight',
      snippet: buildQueueSnippet(highlight.text, highlight.note),
      openPath: highlight.articleId ? `/articles/${highlight.articleId}` : '/library?scope=highlights',
      exists: true
    };
  }
  if (!mongoose.Types.ObjectId.isValid(safeItemId)) return null;
  if (itemType === 'notebook') {
    const entry = await NotebookEntry.findOne({ _id: safeItemId, userId })
      .select('title content blocks')
      .lean();
    if (!entry) return null;
    const blockText = Array.isArray(entry.blocks)
      ? entry.blocks.find(block => String(block?.text || '').trim())?.text
      : '';
    return {
      title: entry.title || 'Notebook entry',
      snippet: buildQueueSnippet(entry.content, blockText, entry.title),
      openPath: `/think?tab=notebook&entryId=${entry._id}`,
      exists: true
    };
  }
  if (itemType === 'question') {
    const question = await Question.findOne({ _id: safeItemId, userId })
      .select('text')
      .lean();
    if (!question) return null;
    return {
      title: 'Question',
      snippet: buildQueueSnippet(question.text),
      openPath: `/think?tab=questions&questionId=${question._id}`,
      exists: true
    };
  }
  if (itemType === 'concept') {
    const concept = await TagMeta.findOne({ _id: safeItemId, userId })
      .select('name description')
      .lean();
    if (!concept) return null;
    return {
      title: concept.name || 'Concept',
      snippet: buildQueueSnippet(concept.description, concept.name),
      openPath: concept.name ? `/think?tab=concepts&concept=${encodeURIComponent(concept.name)}` : '/think?tab=concepts',
      exists: true
    };
  }
  if (itemType === 'article') {
    const article = await Article.findOne({ _id: safeItemId, userId })
      .select('title content')
      .lean();
    if (!article) return null;
    return {
      title: article.title || 'Article',
      snippet: buildQueueSnippet(article.content, article.title),
      openPath: `/articles/${article._id}`,
      exists: true
    };
  }
  return null;
};

const CONNECTION_RELATION_TYPES = new Set(['supports', 'contradicts', 'extends', 'related']);
const CONNECTION_ITEM_TYPES = new Set(['highlight', 'notebook', 'article', 'concept', 'question']);
const CONNECTION_SCOPE_TYPES = new Set(['', 'concept', 'question']);

const normalizeConnectionItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'note') return 'notebook';
  if (CONNECTION_ITEM_TYPES.has(candidate)) return candidate;
  return '';
};

const normalizeRelationType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (CONNECTION_RELATION_TYPES.has(candidate)) return candidate;
  return '';
};

const normalizeConnectionScopeType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === '') return '';
  if (CONNECTION_SCOPE_TYPES.has(candidate)) return candidate;
  return null;
};

const resolveConnectionScope = async (userId, scopeType, scopeId) => {
  const safeScopeType = normalizeConnectionScopeType(scopeType);
  const safeScopeId = String(scopeId || '').trim();
  if (safeScopeType === null) return null;
  if (safeScopeType === '') {
    return { scopeType: '', scopeId: '', title: '' };
  }
  if (!safeScopeId) return null;
  if (safeScopeType === 'concept') {
    if (mongoose.Types.ObjectId.isValid(safeScopeId)) {
      const conceptById = await TagMeta.findOne({ _id: safeScopeId, userId }).select('name').lean();
      if (conceptById) {
        return {
          scopeType: 'concept',
          scopeId: String(conceptById._id),
          title: conceptById.name || 'Concept',
          conceptName: conceptById.name || ''
        };
      }
    }
    const conceptByName = await TagMeta.findOne({
      userId,
      name: new RegExp(`^${escapeRegExp(safeScopeId)}$`, 'i')
    }).select('name').lean();
    if (!conceptByName) return null;
    return {
      scopeType: 'concept',
      scopeId: String(conceptByName._id),
      title: conceptByName.name || 'Concept',
      conceptName: conceptByName.name || ''
    };
  }
  if (safeScopeType === 'question') {
    if (!mongoose.Types.ObjectId.isValid(safeScopeId)) return null;
    const question = await Question.findOne({ _id: safeScopeId, userId }).select('text').lean();
    if (!question) return null;
    return {
      scopeType: 'question',
      scopeId: String(safeScopeId),
      title: question.text || 'Question'
    };
  }
  return null;
};

const resolveConnectionItem = async (userId, itemType, itemId) => {
  const normalizedType = normalizeConnectionItemType(itemType);
  if (!normalizedType) return null;
  return resolveReturnQueueItem(userId, normalizedType, itemId);
};

const resolveConnectionScopeInput = async (userId, scopeType, scopeId, hasInput = false) => {
  if (!hasInput) return { scopeType: '', scopeId: '', title: '' };
  const scope = await resolveConnectionScope(userId, scopeType, scopeId);
  if (!scope) return null;
  return {
    scopeType: scope.scopeType || '',
    scopeId: scope.scopeId || '',
    title: scope.title || ''
  };
};

const toObjectIdList = (ids = []) => (
  ids
    .map(value => String(value || '').trim())
    .filter(value => mongoose.Types.ObjectId.isValid(value))
    .map(value => new mongoose.Types.ObjectId(value))
);

const normalizeConnectionScopeCandidates = (rows = []) => {
  const set = new Set();
  rows.forEach(row => {
    const value = String(row?._id || row || '').trim();
    if (value) set.add(value);
  });
  return set;
};

const createEmptyConnectionCandidateSets = () => ({
  highlightIds: new Set(),
  notebookIds: new Set(),
  articleIds: new Set(),
  conceptIds: new Set(),
  questionIds: new Set()
});

const addToCandidateSet = (set, value) => {
  if (!set || typeof set.add !== 'function') return;
  const safe = String(value || '').trim();
  if (safe) set.add(safe);
};

const addManyToCandidateSet = (set, values = []) => {
  values.forEach(value => addToCandidateSet(set, value));
};

const addArticleIdsForHighlightIds = async (userId, highlightIds, articleSet) => {
  const highlightObjectIds = toObjectIdList(Array.from(highlightIds));
  if (!highlightObjectIds.length) return;
  const articleRows = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': { $in: highlightObjectIds } } },
    { $group: { _id: '$_id' } }
  ]);
  articleRows.forEach(row => addToCandidateSet(articleSet, row?._id));
};

const buildConnectionScopeCandidates = async (userId, scope) => {
  if (!scope?.scopeType || !scope?.scopeId) return null;

  if (scope.scopeType === 'concept') {
    const concept = await TagMeta.findOne({ _id: scope.scopeId, userId })
      .select('name pinnedHighlightIds pinnedNoteIds pinnedArticleIds')
      .lean();
    if (!concept) return null;

    const candidates = createEmptyConnectionCandidateSets();
    addToCandidateSet(candidates.conceptIds, concept._id);
    addManyToCandidateSet(candidates.highlightIds, normalizeConnectionScopeCandidates(concept.pinnedHighlightIds || []));
    addManyToCandidateSet(candidates.notebookIds, normalizeConnectionScopeCandidates(concept.pinnedNoteIds || []));
    addManyToCandidateSet(candidates.articleIds, normalizeConnectionScopeCandidates(concept.pinnedArticleIds || []));
    const conceptName = String(concept.name || '').trim();

    if (conceptName) {
      const regex = new RegExp(`^${escapeRegExp(conceptName)}$`, 'i');
      const taggedHighlights = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags': regex } },
        { $project: { _id: '$highlights._id', articleId: '$_id' } },
        { $limit: 600 }
      ]);
      taggedHighlights.forEach(row => {
        addToCandidateSet(candidates.highlightIds, row?._id);
        addToCandidateSet(candidates.articleIds, row?.articleId);
      });

      const taggedNotes = await NotebookEntry.find({ userId, tags: regex })
        .select('_id')
        .lean();
      taggedNotes.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));

      const conceptQuestions = await Question.find({ userId, linkedTagName: regex })
        .select('_id')
        .limit(200)
        .lean();
      conceptQuestions.forEach(row => addToCandidateSet(candidates.questionIds, row?._id));

      const conceptReferenceEdges = await ReferenceEdge.find({
        userId: new mongoose.Types.ObjectId(userId),
        targetType: 'concept',
        targetTagName: regex
      })
        .select('sourceId')
        .lean();
      conceptReferenceEdges.forEach(edge => addToCandidateSet(candidates.notebookIds, edge?.sourceId));
    }

    const highlightObjectIds = toObjectIdList(Array.from(candidates.highlightIds));
    if (highlightObjectIds.length > 0) {
      const notesLinkedToHighlights = await NotebookEntry.find({
        userId,
        linkedHighlightIds: { $in: highlightObjectIds }
      })
        .select('_id')
        .lean();
      notesLinkedToHighlights.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));
    }

    await addArticleIdsForHighlightIds(userId, candidates.highlightIds, candidates.articleIds);
    return candidates;
  }

  if (scope.scopeType === 'question') {
    const question = await Question.findOne({ _id: scope.scopeId, userId })
      .select('blocks linkedHighlightId linkedHighlightIds linkedNotebookEntryId linkedTagName')
      .lean();
    if (!question) return null;

    const candidates = createEmptyConnectionCandidateSets();
    addToCandidateSet(candidates.questionIds, question._id);
    addToCandidateSet(candidates.notebookIds, question.linkedNotebookEntryId);

    if (question.linkedTagName) {
      const linkedConcept = await TagMeta.findOne({
        userId,
        name: new RegExp(`^${escapeRegExp(question.linkedTagName)}$`, 'i')
      }).select('_id').lean();
      addToCandidateSet(candidates.conceptIds, linkedConcept?._id);
    }

    const addHighlightId = (value) => {
      const clean = String(value || '').trim();
      if (clean) candidates.highlightIds.add(clean);
    };

    addHighlightId(question.linkedHighlightId);
    (question.linkedHighlightIds || []).forEach(addHighlightId);
    (question.blocks || []).forEach(block => {
      if (block?.type === 'highlight-ref') addHighlightId(block.highlightId);
    });

    const highlightObjectIds = toObjectIdList(Array.from(candidates.highlightIds));
    if (highlightObjectIds.length > 0) {
      const notesLinkedToHighlights = await NotebookEntry.find({
        userId,
        linkedHighlightIds: { $in: highlightObjectIds }
      })
        .select('_id')
        .lean();
      notesLinkedToHighlights.forEach(row => addToCandidateSet(candidates.notebookIds, row?._id));
    }

    await addArticleIdsForHighlightIds(userId, candidates.highlightIds, candidates.articleIds);
    return candidates;
  }

  return null;
};

const isConnectionItemInScopeCandidates = (itemType, itemId, candidates) => {
  if (!candidates) return true;
  const safeType = normalizeConnectionItemType(itemType);
  const safeId = String(itemId || '').trim();
  if (!safeType || !safeId) return false;
  if (safeType === 'highlight') return candidates.highlightIds.has(safeId);
  if (safeType === 'notebook') return candidates.notebookIds.has(safeId);
  if (safeType === 'article') return candidates.articleIds.has(safeId);
  if (safeType === 'concept') return candidates.conceptIds.has(safeId);
  if (safeType === 'question') return candidates.questionIds.has(safeId);
  return false;
};

const buildConnectionScopeQuery = (scope) => {
  if (!scope?.scopeType && !scope?.scopeId) {
    return {
      $or: [
        { scopeType: '', scopeId: '' },
        { scopeType: { $exists: false }, scopeId: { $exists: false } },
        { scopeType: null, scopeId: null }
      ]
    };
  }
  return {
    scopeType: scope.scopeType || '',
    scopeId: scope.scopeId || ''
  };
};

const normalizeConceptPathItemType = (value) => normalizeConnectionItemType(value);

const normalizeConceptPathNotes = (value) => String(value || '').trim().slice(0, 400);

const sortPathItemRefs = (itemRefs = []) => (
  [...itemRefs]
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((item, index) => ({ ...item, order: index }))
);

const normalizePathItemRefsInput = (itemRefs = []) => {
  if (!Array.isArray(itemRefs)) return [];
  const normalized = [];
  itemRefs.forEach((item, index) => {
    const type = normalizeConceptPathItemType(item?.type);
    const id = String(item?.id || '').trim();
    if (!type || !id) return;
    normalized.push({
      type,
      id,
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      notes: normalizeConceptPathNotes(item?.notes)
    });
  });
  return sortPathItemRefs(normalized);
};

const hydratePathItemRefs = async (userId, itemRefs = []) => {
  const sorted = sortPathItemRefs(itemRefs);
  const hydrated = await Promise.all(sorted.map(async (itemRef) => {
    const item = await resolveConnectionItem(userId, itemRef.type, itemRef.id);
    return {
      _id: itemRef._id,
      type: itemRef.type,
      id: itemRef.id,
      order: itemRef.order,
      notes: itemRef.notes || '',
      item
    };
  }));
  return hydrated.filter(row => row.item);
};

const ensureConceptPathOwnership = async (userId, pathId) => {
  if (!mongoose.Types.ObjectId.isValid(pathId)) return null;
  return ConceptPath.findOne({ _id: pathId, userId });
};

const getConceptPathWithProgress = async (userId, pathDoc) => {
  const path = pathDoc.toObject ? pathDoc.toObject() : pathDoc;
  const [itemRefs, progressDoc] = await Promise.all([
    hydratePathItemRefs(userId, path.itemRefs || []),
    ConceptPathProgress.findOne({ userId, pathId: path._id }).lean()
  ]);
  const progress = progressDoc || {
    understoodItemRefIds: [],
    currentIndex: 0
  };
  return {
    ...path,
    itemRefs,
    progress: {
      understoodItemRefIds: progress.understoodItemRefIds || [],
      currentIndex: Math.max(0, Math.min(progress.currentIndex || 0, Math.max(itemRefs.length - 1, 0)))
    }
  };
};

const parseCsvList = (value) => (
  String(value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
);

const buildGraphNodeKey = (itemType, itemId) => `${itemType}:${itemId}`;

const buildGraphNodeMap = async (userId, idsByType = {}) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const nodeMap = new Map();

  const highlightIds = toObjectIdList(Array.from(idsByType.highlight || []));
  if (highlightIds.length > 0) {
    const highlights = await Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights._id': { $in: highlightIds } } },
      { $project: {
        itemId: '$highlights._id',
        articleId: '$_id',
        articleTitle: '$title',
        text: '$highlights.text',
        tags: '$highlights.tags',
        createdAt: '$highlights.createdAt'
      } }
    ]);
    highlights.forEach(row => {
      const itemId = String(row.itemId);
      const key = buildGraphNodeKey('highlight', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'highlight',
        itemId,
        title: row.articleTitle || 'Highlight',
        snippet: buildQueueSnippet(row.text, row.articleTitle),
        tags: Array.isArray(row.tags) ? row.tags : [],
        updatedAt: row.createdAt || null,
        openPath: row.articleId ? `/articles/${row.articleId}` : '/library?scope=highlights'
      });
    });
  }

  const notebookIds = toObjectIdList(Array.from(idsByType.notebook || []));
  if (notebookIds.length > 0) {
    const notes = await NotebookEntry.find({ userId, _id: { $in: notebookIds } })
      .select('title content tags updatedAt')
      .lean();
    notes.forEach(note => {
      const itemId = String(note._id);
      const key = buildGraphNodeKey('notebook', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'notebook',
        itemId,
        title: note.title || 'Note',
        snippet: buildQueueSnippet(note.content, note.title),
        tags: Array.isArray(note.tags) ? note.tags : [],
        updatedAt: note.updatedAt || null,
        openPath: `/think?tab=notebook&entryId=${note._id}`
      });
    });
  }

  const articleIds = toObjectIdList(Array.from(idsByType.article || []));
  if (articleIds.length > 0) {
    const articles = await Article.find({ userId, _id: { $in: articleIds } })
      .select('title content updatedAt')
      .lean();
    articles.forEach(article => {
      const itemId = String(article._id);
      const key = buildGraphNodeKey('article', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'article',
        itemId,
        title: article.title || 'Article',
        snippet: buildQueueSnippet(article.content, article.title),
        tags: [],
        updatedAt: article.updatedAt || null,
        openPath: `/articles/${article._id}`
      });
    });
  }

  const conceptIds = toObjectIdList(Array.from(idsByType.concept || []));
  if (conceptIds.length > 0) {
    const concepts = await TagMeta.find({ userId, _id: { $in: conceptIds } })
      .select('name description updatedAt')
      .lean();
    concepts.forEach(concept => {
      const itemId = String(concept._id);
      const key = buildGraphNodeKey('concept', itemId);
      nodeMap.set(key, {
        id: key,
        itemType: 'concept',
        itemId,
        title: concept.name || 'Concept',
        snippet: buildQueueSnippet(concept.description, concept.name),
        tags: concept.name ? [concept.name] : [],
        updatedAt: concept.updatedAt || null,
        openPath: concept.name ? `/think?tab=concepts&concept=${encodeURIComponent(concept.name)}` : '/think?tab=concepts'
      });
    });
  }

  const questionIds = toObjectIdList(Array.from(idsByType.question || []));
  if (questionIds.length > 0) {
    const questions = await Question.find({ userId, _id: { $in: questionIds } })
      .select('text linkedTagName updatedAt')
      .lean();
    questions.forEach(question => {
      const itemId = String(question._id);
      const key = buildGraphNodeKey('question', itemId);
      const tags = question.linkedTagName ? [question.linkedTagName] : [];
      nodeMap.set(key, {
        id: key,
        itemType: 'question',
        itemId,
        title: 'Question',
        snippet: buildQueueSnippet(question.text),
        tags,
        updatedAt: question.updatedAt || null,
        openPath: `/think?tab=questions&questionId=${question._id}`
      });
    });
  }

  return nodeMap;
};
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

const Collection = mongoose.model('Collection', collectionSchema);

// --- AUTHENTICATION ADDITIONS: JWT Verification Middleware ---
const getCookieValue = (cookieHeader, name) => {
  if (!cookieHeader) return '';
  const parts = cookieHeader.split(';').map(part => part.trim());
  const match = parts.find(part => part.startsWith(`${name}=`));
  if (!match) return '';
  return decodeURIComponent(match.slice(name.length + 1));
};

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const headerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const cookieHeader = req.headers.cookie || '';
  const cookieToken =
    getCookieValue(cookieHeader, 'token') ||
    getCookieValue(cookieHeader, 'authToken') ||
    getCookieValue(cookieHeader, 'jwt');

  const token = headerToken || cookieToken;
  const tokenSource = headerToken ? 'header' : (cookieToken ? 'cookie' : 'none');

  if (!token) {
    if (process.env.DEBUG_AUTH === 'true') {
      console.log('[AUTH] missing token', {
        tokenSource,
        serverNowSec: Math.floor(Date.now() / 1000)
      });
    }
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    const serverNowSec = Math.floor(Date.now() / 1000);
    const decoded = jwt.decode(token) || {};
    if (process.env.DEBUG_AUTH === 'true') {
      const diffSec = decoded.exp ? serverNowSec - decoded.exp : null;
      console.log('[AUTH] verify', {
        tokenSource,
        serverNowSec,
        iat: decoded.iat,
        exp: decoded.exp,
        diffSec
      });
    }

    if (err) {
      if (err.name === 'TokenExpiredError') {
        console.warn("JWT Verification Error: token expired");
        return res.status(401).json({ error: "AUTH_EXPIRED" });
      }
      console.warn("JWT Verification Error:", err.message);
      return res.status(401).json({ error: "AUTH_INVALID" });
    }
    req.user = user;
    req.authInfo = {
      tokenSource,
      iat: user.iat,
      exp: user.exp
    };
    next();
  });
}

const findRowValue = (row, keys) => {
  if (!row) return '';
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const match = Object.keys(row).find(k => k.toLowerCase() === String(key).toLowerCase());
    if (match && row[match] !== undefined && row[match] !== null) return row[match];
  }
  return '';
};

const parseTagList = (value) => (
  String(value || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
);

const slugify = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
);

const extractConceptTags = (text = '') => {
  const matches = String(text).match(/#([a-zA-Z0-9_-]+)/g) || [];
  return Array.from(new Set(matches.map(tag => tag.slice(1).toLowerCase())));
};

const stripHtml = (value = '') => (
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const buildNotebookMarkdown = (entry) => {
  const title = entry?.title || 'Untitled';
  const blocks = Array.isArray(entry?.blocks) && entry.blocks.length > 0
    ? entry.blocks
    : [{ type: 'paragraph', text: stripHtml(entry?.content || '') }];
  const lines = [`# ${title}`, ''];
  blocks.forEach((block) => {
    const type = block.type || 'paragraph';
    const text = String(block.text || '').trim();
    if (type === 'heading') {
      const level = Math.min(Math.max(block.level || 1, 1), 4);
      lines.push(`${'#'.repeat(level)} ${text}`);
      lines.push('');
      return;
    }
    if (type === 'bullet') {
      const indent = '  '.repeat(block.indent || 0);
      lines.push(`${indent}- ${text}`);
      return;
    }
    if (type === 'highlight_embed' || type === 'highlight-ref') {
      if (text) {
        lines.push(`> ${text}`);
        lines.push('');
      }
      return;
    }
    if (type === 'article_ref' || type === 'article-ref') {
      lines.push(`- Article: ${block.articleTitle || text || 'Untitled article'}`);
      return;
    }
    if (type === 'concept_ref' || type === 'concept-ref') {
      lines.push(`- Concept: ${block.conceptName || text || 'Concept'}`);
      return;
    }
    if (type === 'question_ref' || type === 'question-ref') {
      lines.push(`- Question: ${block.questionText || text || 'Question'}`);
      return;
    }
    if (text) {
      lines.push(text);
      lines.push('');
    }
  });
  return lines.join('\n').trim() + '\n';
};

const buildConceptMarkdown = ({ concept, related, questions }) => {
  const lines = [`# ${concept?.name || 'Concept'}`, ''];
  if (concept?.description) {
    lines.push(concept.description);
    lines.push('');
  }
  if (related?.highlights?.length) {
    lines.push('## Highlights');
    related.highlights.forEach(h => {
      lines.push(`- ${h.text || 'Highlight'}${h.articleTitle ? ` — ${h.articleTitle}` : ''}`);
    });
    lines.push('');
  }
  if (related?.articles?.length) {
    lines.push('## Source articles');
    related.articles.forEach(article => {
      lines.push(`- ${article.title || 'Untitled article'} (${article.highlightCount || 0} highlights)`);
    });
    lines.push('');
  }
  if (questions?.length) {
    lines.push('## Questions');
    questions.forEach(question => {
      lines.push(`- ${question.text}`);
    });
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
};

const queueEmbeddingUpsert = (items) => {
  if (!isAiEnabled()) return;
  const payload = (items || []).filter(Boolean);
  if (payload.length === 0) return;
  setImmediate(() => {
    upsertEmbeddings(payload, { requestId: 'embedding-upsert' })
      .catch(err => {
        console.error('❌ AI upsert failed:', err.message || err);
      });
  });
};

const queueEmbeddingDelete = (ids) => {
  if (!isAiEnabled()) return;
  const payload = (ids || []).filter(Boolean);
  if (payload.length === 0) return;
  setImmediate(() => {
    deleteEmbeddings(payload).catch(err => {
      console.error('❌ AI delete failed:', err.message || err);
    });
  });
};

const sendEmbeddingError = (res, error) => {
  const status = error.status || 503;
  const payload = error.payload || { error: error.message };
  res.status(status).json(payload);
};

const safeMapEmbedding = (fn, label) => {
  try {
    return fn();
  } catch (err) {
    console.error(`❌ AI mapping failed (${label}):`, err.message || err);
    return null;
  }
};

const ensureNotebookBlocks = (entry, createId) => {
  if (!entry) return entry;
  if (Array.isArray(entry.blocks) && entry.blocks.length > 0) return entry;
  const text = stripHtml(entry.content || '');
  if (!text) return entry;
  const blockId = createId ? createId() : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
  entry.blocks = [{ id: blockId, type: 'paragraph', text }];
  return entry;
};

const buildNotebookBlocksFromEdges = async ({ userId, edges }) => {
  if (!edges || edges.length === 0) return [];
  const entryIds = Array.from(new Set(edges.map(edge => String(edge.sourceId))));
  const entries = await NotebookEntry.find({ userId, _id: { $in: entryIds } })
    .select('title updatedAt');
  const entryMap = new Map(entries.map(entry => [String(entry._id), entry]));

  const seen = new Set();
  return edges.reduce((acc, edge) => {
    const key = `${edge.sourceId}:${edge.sourceBlockId || ''}`;
    if (seen.has(key)) return acc;
    seen.add(key);
    const entry = entryMap.get(String(edge.sourceId));
    acc.push({
      notebookEntryId: edge.sourceId,
      notebookTitle: entry?.title || 'Untitled',
      blockId: edge.sourceBlockId,
      blockPreviewText: edge.blockPreviewText || '',
      updatedAt: entry?.updatedAt
    });
    return acc;
  }, []);
};

const loadNotebookBacklinks = async ({ userId, targetType, targetId, targetTagName }) => {
  const query = { userId, targetType };
  if (targetId) query.targetId = targetId;
  if (targetTagName) query.targetTagName = targetTagName;
  const edges = await ReferenceEdge.find(query).lean();
  return buildNotebookBlocksFromEdges({ userId, edges });
};

const syncNotebookReferences = async (userId, entryId, blocks = []) => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    await ReferenceEdge.deleteMany({ userId, sourceType: 'notebook', sourceId: entryId });
    return;
  }

  await ReferenceEdge.deleteMany({ userId, sourceType: 'notebook', sourceId: entryId });
  const edges = [];

  blocks.forEach((block) => {
    const blockId = block.id || block.blockId;
    if (!blockId) return;
    const preview = String(block.text || '').slice(0, 180);

    const blockType = block.type || '';
    if ((blockType === 'highlight-ref' || blockType === 'highlight_embed') && block.highlightId) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'highlight',
        targetId: block.highlightId,
        blockPreviewText: preview,
        userId
      });
    }

    if ((blockType === 'article_ref' || blockType === 'article-ref') && block.articleId) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'article',
        targetId: block.articleId,
        blockPreviewText: preview,
        userId
      });
    }

    if ((blockType === 'concept_ref' || blockType === 'concept-ref') && block.conceptName) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'concept',
        targetTagName: String(block.conceptName).toLowerCase(),
        blockPreviewText: preview,
        userId
      });
    }

    if ((blockType === 'question_ref' || blockType === 'question-ref') && block.questionId) {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'question',
        targetId: block.questionId,
        blockPreviewText: preview,
        userId
      });
    }

    const tags = extractConceptTags(block.text || '');
    tags.forEach((tagName) => {
      edges.push({
        sourceType: 'notebook',
        sourceId: entryId,
        sourceBlockId: blockId,
        targetType: 'concept',
        targetTagName: tagName,
        blockPreviewText: preview,
        userId
      });
    });
  });

  if (edges.length > 0) {
    await ReferenceEdge.insertMany(edges);
  }
};


// --- API ROUTES ---

// --- AUTHENTICATION ADDITIONS: Register Route ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required." });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ error: "Username already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash password with salt rounds
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully." });
    } catch (error) {
        console.error("❌ Error registering user:", error);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
});

// --- AUTHENTICATION ADDITIONS: Login Route ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required." });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials." }); // User not found
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials." }); // Passwords don't match
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // Token expires in 7 days
        );

        res.clearCookie('token');
        res.clearCookie('authToken');
        res.clearCookie('jwt');
        res.status(200).json({ token, username: user.username, userId: user._id });
    } catch (error) {
        console.error("❌ Error logging in user:", error);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
});

// --- NEW SOCIAL API ROUTES ---

// POST /api/recommendations - Recommend an article with selected highlights
app.post('/api/recommendations', authenticateToken, async (req, res) => {
  const { articleId, highlightIds } = req.body;
  const userId = req.user.id;

  // --- Validation Rules ---
  if (!articleId || !highlightIds) {
      return res.status(400).json({ error: "Article ID and highlight IDs are required." });
  }
  if (!Array.isArray(highlightIds) || highlightIds.length === 0) {
      return res.status(400).json({ error: "You must select at least one highlight to share." });
  }
  if (highlightIds.length > 10) {
      return res.status(400).json({ error: "You can share a maximum of 10 highlights." });
  }
  const WORD_LIMIT_PER_HIGHLIGHT = 35; // A reasonable limit
  // -------------------------

  try {
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) {
          return res.status(404).json({ error: "Article not found or you do not own it." });
      }

      const sharedHighlights = [];
      for (const hId of highlightIds) {
          const highlight = article.highlights.id(hId);
          if (!highlight) {
              return res.status(400).json({ error: `Highlight with ID ${hId} not found.` });
          }
          // Check word count for each highlight
          if (highlight.text.split(' ').length > WORD_LIMIT_PER_HIGHLIGHT) {
              return res.status(400).json({ error: `One of your selected highlights exceeds the ${WORD_LIMIT_PER_HIGHLIGHT}-word limit.` });
          }
          sharedHighlights.push({ text: highlight.text });
      }

      const newRecommendation = new Recommendation({
          articleUrl: article.url,
          articleTitle: article.title,
          recommendingUserId: userId,
          sharedHighlights: sharedHighlights
      });

      await newRecommendation.save();
      res.status(201).json({ message: "Article recommended successfully!", recommendation: newRecommendation });

  } catch (error) {
      console.error("❌ Error recommending article:", error);
      res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/trending - top recommended and highlighted articles across all users (last 7 days)
app.get('/api/trending', authenticateToken, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recommended = await Recommendation.aggregate([
      { $match: { createdAt: { $gte: cutoff } } },
      { $group: {
          _id: "$articleUrl",
          recommendationCount: { $sum: 1 },
          articleTitle: { $first: "$articleTitle" }
      }},
      { $sort: { recommendationCount: -1 } },
      { $limit: 10 }
    ]);

    const highlighted = await Article.aggregate([
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: cutoff } } },
      { $group: {
          _id: '$_id',
          title: { $first: '$title' },
          count: { $sum: 1 }
      }},
      { $sort: { count: -1, title: 1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({ recommended, highlighted });
  } catch (error) {
    console.error("❌ Error fetching trending data:", error);
    res.status(500).json({ error: "Failed to fetch trending." });
  }
});

// --- NOTEBOOK ROUTES ---
const normalizeChecklist = (checklist = []) => {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map(item => ({
      text: (item?.text || '').trim(),
      checked: !!item?.checked
    }))
    .filter(item => item.text.length > 0);
};

const normalizeAnnotations = (annotations = []) => {
  if (!Array.isArray(annotations)) return [];
  return annotations
    .map(item => {
      const text = (item?.text || '').trim();
      const note = (item?.note || '').trim();
      if (!text && !note) return null;
      return {
        id: item?.id || new mongoose.Types.ObjectId().toString(),
        text,
        note,
        page: typeof item?.page === 'number' ? item.page : null,
        color: item?.color || '#f6c244',
        createdAt: item?.createdAt || new Date()
      };
    })
    .filter(Boolean);
};

const normalizePdfs = (pdfs = []) => {
  if (!Array.isArray(pdfs)) return [];
  return pdfs
    .map(pdf => {
      const dataUrl = typeof pdf?.dataUrl === 'string' ? pdf.dataUrl : '';
      if (!dataUrl) return null;
      return {
        id: pdf?.id || new mongoose.Types.ObjectId().toString(),
        name: (pdf?.name || 'Untitled.pdf').trim().slice(0, 200),
        dataUrl,
        uploadedAt: pdf?.uploadedAt || new Date(),
        annotations: normalizeAnnotations(pdf?.annotations || [])
      };
    })
    .filter(Boolean);
};

// GET /api/notes - fetch all notes for the authenticated user
app.get('/api/notes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const notes = await Note.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json(notes);
  } catch (error) {
    console.error("❌ Error fetching notes:", error);
    res.status(500).json({ error: "Failed to fetch notes." });
  }
});

// POST /api/notes - create a new note
app.post('/api/notes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, checklist } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "A title is required to create a note." });
    }

    const newNote = new Note({
      title: title.trim(),
      content: content || '',
      checklist: normalizeChecklist(checklist),
      userId
    });

    await newNote.save();
    res.status(201).json(newNote);
  } catch (error) {
    console.error("❌ Error creating note:", error);
    res.status(500).json({ error: "Failed to create note." });
  }
});

// PATCH /api/notes/:id - update an existing note
app.patch('/api/notes/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, content, checklist } = req.body;

    const updates = {};
    if (title !== undefined) {
      const trimmed = title.trim();
      updates.title = trimmed.length ? trimmed : 'Untitled note';
    }
    if (content !== undefined) updates.content = content;
    if (checklist !== undefined) updates.checklist = normalizeChecklist(checklist);

    const updatedNote = await Note.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true }
    );

    if (!updatedNote) {
      return res.status(404).json({ error: "Note not found or you do not have permission to edit it." });
    }

    res.status(200).json(updatedNote);
  } catch (error) {
    console.error("❌ Error updating note:", error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid note ID format." });
    }
    res.status(500).json({ error: "Failed to update note." });
  }
});

// DELETE /api/notes/:id - delete a note
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const deletedNote = await Note.findOneAndDelete({ _id: id, userId });
    if (!deletedNote) {
      return res.status(404).json({ error: "Note not found or you do not have permission to delete it." });
    }

    res.status(200).json({ message: "Note deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting note:", error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid note ID format." });
    }
    res.status(500).json({ error: "Failed to delete note." });
  }
});

// POST /save-article: Saves a new article or updates an existing one - MODIFIED FOR USER AUTHENTICATION
app.post("/save-article", authenticateToken, async (req, res) => {
  try {
    // --- 1. I added the new fields here ---
    const {title, url, content, folderId, author, publicationDate, siteName, pdfs} = req.body;
    const userId = req.user.id; // Get user ID from authenticated token

    if (!title || !url) {
      return res.status(400).json({ error: "Missing required fields: title and url." });
    }

    // Ensure folderId refers to an existing folder for THIS user if provided
    let actualFolderId = null;
    if (folderId && folderId !== 'null' && folderId !== 'uncategorized') {
      const folderExists = await Folder.findOne({ _id: folderId, userId: userId });
      if (!folderExists) {
          console.warn(`Attempted to save article with non-existent or unauthorized folderId: ${folderId} for user ${userId}`);
          return res.status(400).json({ error: "Provided folderId does not exist or is not accessible." });
      }
      actualFolderId = folderId;
    }
    const articleData = {
        title: title,
        content: content || '',
        folder: actualFolderId,
        userId: userId,
        
        // --- 2. And I added them to the data object here ---
        author: author || '',
        publicationDate: publicationDate || '',
        siteName: siteName || '',
        ...(pdfs !== undefined ? { pdfs: normalizePdfs(pdfs) } : {}),
        
        $setOnInsert: { highlights: [] }
    }; // <-- THIS WAS THE MISSING BRACE AND SEMICOLON

    // Find and update/upsert based on url AND userId
    const updatedArticle = await Article.findOneAndUpdate({ url: url, userId: userId }, articleData, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    });
    enqueueArticleEmbedding(updatedArticle);
    const articleItems = safeMapEmbedding(
      () => articleToEmbeddingItems(updatedArticle, String(userId)),
      'article'
    );
    if (Array.isArray(articleItems)) {
      queueEmbeddingUpsert(articleItems);
    }
    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error in /save-article:", error);
    res.status(500).json({ error: "Internal server error.", details: error.message });
  }
});


// --- FOLDER API ROUTES ---

// GET /api/folders?includeCounts=true - folders with optional article counts
app.get('/api/folders', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const includeCounts = String(req.query.includeCounts || '').toLowerCase() === 'true';
        if (includeCounts) {
            const data = await getFoldersWithCounts(userId);
            return res.json(data);
        }
        const folders = await Folder.find({ userId: userId }).sort({ name: 1 });
        return res.json(folders);
    } catch (err) {
        console.error("❌ Failed to fetch folders:", err);
        res.status(500).json({ error: "Failed to fetch folders" });
    }
});

// GET /folders: Fetches all created folders - MODIFIED FOR USER AUTHENTICATION
app.get('/folders', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch folders belonging to the authenticated user
        const folders = await Folder.find({ userId: userId }).sort({ name: 1 });
        res.json(folders);
    } catch (err) {
        console.error("❌ Failed to fetch folders:", err);
        res.status(500).json({ error: "Failed to fetch folders" });
    }
});

// POST /folders: Creates a new folder - MODIFIED FOR USER AUTHENTICATION
app.post('/folders', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user.id;
        if (!name) {
            return res.status(400).json({ error: "Folder name is required." });
        }
        // Check if folder already exists for THIS user (case-insensitive)
        const existingFolder = await Folder.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, userId: userId });
        if (existingFolder) {
            return res.status(409).json({ error: "A folder with this name already exists for your account." });
        }
        const newFolder = new Folder({ name, userId: userId }); // Assign user ID
        await newFolder.save();
        res.status(201).json(newFolder);
    } catch (err) {
        console.error("❌ Failed to create folder:", err);
        res.status(500).json({ error: "Failed to create folder" });
    }
});

// DELETE /folders/:id: Deletes a specific folder - MODIFIED FOR USER AUTHENTICATION
app.delete('/folders/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Option 1 (chosen): Prevent deletion if the folder contains any articles for THIS user.
        const articlesInFolder = await Article.countDocuments({ folder: id, userId: userId });
        if (articlesInFolder > 0) {
             return res.status(409).json({ error: "Cannot delete folder with articles. Please move or delete articles first." });
        }

        // Ensure the folder belongs to the authenticated user before deleting
        const result = await Folder.findOneAndDelete({ _id: id, userId: userId });
        if (!result) {
            return res.status(404).json({ error: "Folder not found or you do not have permission to delete it." });
        }
        res.status(200).json({ message: "Folder deleted successfully." });
    } catch (error) {
        console.error("❌ Error deleting folder:", error);
        if (error.name === 'CastError') {
          return res.status(400).json({ error: "Invalid folder ID format." });
        }
        res.status(500).json({ error: "Failed to delete folder.", details: error.message });
    }
});


// --- ARTICLE MANAGEMENT API ROUTES ---

// GET /get-articles - MODIFIED FOR USER AUTHENTICATION
app.get('/get-articles', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    // Fetch articles belonging to the authenticated user
    const articles = await Article.find({ userId: userId })
                                 .populate('folder')
                                 .select('title url createdAt folder highlights')
                                 .sort({createdAt: -1});
    res.json(articles);
  } catch (err) {
    console.error("❌ Failed to fetch articles:", err);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});


// GET /articles/:id: Fetches a single article by ID - MODIFIED FOR USER AUTHENTICATION
app.get('/articles/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        // Fetch article by ID AND ensure it belongs to the authenticated user
        const article = await Article.findOne({ _id: id, userId: userId }).populate('folder');
        if (!article) {
            return res.status(404).json({ error: "Article not found or you do not have permission to view it." });
        }
        res.status(200).json(article);
    } catch (error) {
        console.error("❌ Error fetching single article by ID:", error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: "Invalid article ID format." });
        }
        res.status(500).json({ error: "Failed to fetch article.", details: error.message });
    }
});

// GET /api/articles/:id/highlights - highlights for a single article
app.get('/api/articles/:id/highlights', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const article = await Article.findOne({ _id: id, userId }).select('highlights title');
    if (!article) {
      return res.status(404).json({ error: "Article not found." });
    }
    const highlights = (article.highlights || []).map(h => ({
      _id: h._id,
      text: h.text,
      note: h.note || '',
      tags: h.tags || [],
      type: normalizeItemType(h.type, 'note'),
      claimId: h.claimId || null,
      anchor: h.anchor,
      createdAt: h.createdAt,
      articleId: id,
      articleTitle: article.title || 'Untitled article'
    }));
    res.status(200).json(highlights);
  } catch (error) {
    console.error("❌ Error fetching article highlights:", error);
    res.status(500).json({ error: "Failed to fetch article highlights." });
  }
});

// Add this new route to server.js

// GET /api/articles/by-url: Finds an article by its URL for the current user
app.get('/api/articles/by-url', authenticateToken, async (req, res) => {
  try {
      const { url } = req.query;
      if (!url) {
          return res.status(400).json({ error: 'URL query parameter is required.' });
      }
      
      const userId = req.user.id;
      // Find the article that matches the URL and the logged-in user
      const article = await Article.findOne({ url: url, userId: userId });

      if (!article) {
          // It's not an error if not found, just return an empty success response
          return res.status(200).json(null); 
      }

      res.status(200).json(article); // Return the found article
  } catch (error) {
      console.error("❌ Error fetching article by URL:", error);
      res.status(500).json({ error: "Internal server error." });
  }
});

// DELETE /articles/:id: Deletes a specific article - MODIFIED FOR USER AUTHENTICATION
app.delete('/articles/:id', authenticateToken, async (req, res) => {
  try {
      const { id } = req.params;
      const userId = req.user.id;
      // Delete article by ID AND ensure it belongs to the authenticated user
      const result = await Article.findOneAndDelete({ _id: id, userId: userId });
      if (!result) {
          return res.status(404).json({ error: "Article not found or you do not have permission to delete it." });
      }
      const ids = [
        buildEmbeddingId({ userId: String(userId), objectType: 'article', objectId: String(result._id) }),
        ...(result.highlights || []).map(h => buildEmbeddingId({
          userId: String(userId),
          objectType: 'highlight',
          objectId: String(h._id)
        }))
      ];
      queueEmbeddingDelete(ids);
      res.status(200).json({ message: "Article deleted successfully." });
  } catch (error) {
      console.error("❌ Error deleting article:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid article ID format." });
      }
      res.status(500).json({ error: "Failed to delete article.", details: error.message });
  }
});

// PATCH /articles/:id/move: Moves an article to a different folder (or uncategorized) - MODIFIED FOR USER AUTHENTICATION
app.patch('/articles/:id/move', authenticateToken, async (req, res) => {
  try {
      const { id } = req.params;
      const { folderId } = req.body;
      const userId = req.user.id;

      let targetFolder = null;
      if (folderId && folderId !== 'null' && folderId !== 'uncategorized') {
          // Validate if folderId exists AND belongs to the authenticated user
          const folderExists = await Folder.findOne({ _id: folderId, userId: userId });
          if (!folderExists) {
              return res.status(400).json({ error: "Provided folderId does not exist or is not accessible." });
          }
          targetFolder = folderId;
      }

      // Update article by ID AND ensure it belongs to the authenticated user
      const updatedArticle = await Article.findOneAndUpdate(
          { _id: id, userId: userId },
          { folder: targetFolder },
          { new: true, populate: 'folder' }
      );

      if (!updatedArticle) {
          return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      }
      res.status(200).json(updatedArticle);
  } catch (error) {
      console.error("❌ Error moving article:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid article ID format." });
      }
      res.status(500).json({ error: "Failed to move article.", details: error.message });
  }
});

// PATCH /articles/:id/pdfs - replace PDF attachments and annotations for an article
app.patch('/articles/:id/pdfs', authenticateToken, async (req, res) => {
  try {
      const { id } = req.params;
      const userId = req.user.id;
    const { pdfs } = req.body;

    const normalizedPdfs = normalizePdfs(pdfs || []);
    const updatedArticle = await Article.findOneAndUpdate(
      { _id: id, userId },
      { pdfs: normalizedPdfs },
      { new: true }
    ).populate('folder');

    if (!updatedArticle) {
      return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
    }

    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error updating article PDFs:", error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid article ID format." });
    }
    res.status(500).json({ error: "Failed to update PDFs.", details: error.message });
  }
});

// GET /api/highlights/all - fetch all highlights across user's articles
app.get('/api/highlights/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const highlights = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          type: '$highlights.type',
          claimId: '$highlights.claimId',
          createdAt: '$highlights.createdAt'
      } },
      { $sort: { createdAt: -1 } }
    ]);
    res.status(200).json(highlights);
  } catch (error) {
    console.error("❌ Error fetching all highlights:", error);
    res.status(500).json({ error: "Failed to fetch highlights." });
  }
});


// --- NOTEBOOK ENTRY CRUD ---
// GET /api/notebook - list entries
app.get('/api/notebook', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const entries = await NotebookEntry.find({ userId }).sort({ updatedAt: -1 });
    const normalized = await Promise.all(entries.map(async entry => {
      const hadBlocks = Array.isArray(entry.blocks) && entry.blocks.length > 0;
      ensureNotebookBlocks(entry, createBlockId);
      if (!hadBlocks && entry.blocks?.length) {
        await entry.save();
      }
      return entry;
    }));
    res.status(200).json(normalized);
  } catch (error) {
    console.error("❌ Error fetching notebook entries:", error);
    res.status(500).json({ error: "Failed to fetch notebook entries." });
  }
});

// POST /api/notebook - create
app.post('/api/notebook', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, blocks, folder, tags, linkedArticleId, type, claimId } = req.body;
    const nextBlocks = Array.isArray(blocks)
      ? blocks
      : (stripHtml(content || '') ? [{ id: createBlockId(), type: 'paragraph', text: stripHtml(content || '') }] : []);
    const nextType = normalizeItemType(type, 'note');
    const nextClaimId = nextType === 'evidence' ? parseClaimId(claimId) : null;
    if (nextType === 'evidence' && claimId !== undefined && claimId !== null && claimId !== '' && !nextClaimId) {
      return res.status(400).json({ error: 'Invalid claimId.' });
    }
    if (nextType === 'evidence' && nextClaimId) {
      const linkedClaim = await NotebookEntry.findOne({ _id: nextClaimId, userId }).select('type');
      if (!linkedClaim || normalizeItemType(linkedClaim.type, 'note') !== 'claim') {
        return res.status(400).json({ error: 'claimId must reference one of your claim notes.' });
      }
    }
    const newEntry = new NotebookEntry({
      title: (title || 'Untitled').trim(),
      content: content || '',
      blocks: nextBlocks,
      folder: folder || null,
      type: nextType,
      claimId: nextClaimId,
      tags: normalizeTags(tags),
      linkedArticleId: linkedArticleId || null,
      userId
    });
    await newEntry.save();
    if (Array.isArray(nextBlocks)) {
      await syncNotebookReferences(userId, newEntry._id, nextBlocks);
    }
    enqueueNotebookEmbedding(newEntry);
    res.status(201).json(newEntry);
  } catch (error) {
    console.error("❌ Error creating notebook entry:", error);
    res.status(500).json({ error: "Failed to create notebook entry." });
  }
});

// GET /api/notebook/organize/claims - searchable claim notes for linking evidence
app.get('/api/notebook/organize/claims', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const queryText = String(req.query.q || '').trim();
    const query = { userId, type: 'claim' };
    if (queryText) {
      const regex = new RegExp(queryText, 'i');
      query.$or = [
        { title: regex },
        { content: regex },
        { tags: regex }
      ];
    }
    const claims = await NotebookEntry.find(query)
      .sort({ updatedAt: -1 })
      .limit(30)
      .select('_id title tags updatedAt');
    res.status(200).json(claims);
  } catch (error) {
    console.error("❌ Error fetching notebook claims:", error);
    res.status(500).json({ error: 'Failed to fetch claims.' });
  }
});

// GET /api/notebook/:id - fetch single entry
app.get('/api/notebook/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const entry = await NotebookEntry.findOne({ _id: id, userId });
    if (!entry) {
      return res.status(404).json({ error: "Notebook entry not found." });
    }
    const hadBlocks = Array.isArray(entry.blocks) && entry.blocks.length > 0;
    ensureNotebookBlocks(entry, createBlockId);
    if (!hadBlocks && entry.blocks?.length) {
      await entry.save();
    }
    res.status(200).json(entry);
  } catch (error) {
    console.error("❌ Error fetching notebook entry:", error);
    res.status(500).json({ error: "Failed to fetch notebook entry." });
  }
});

// PATCH /api/notebook/:id/organize - update type/tags/claim linkage for note organization
app.patch('/api/notebook/:id/organize', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { type, tags, claimId } = req.body || {};
    const entry = await NotebookEntry.findOne({ _id: id, userId });
    if (!entry) {
      return res.status(404).json({ error: 'Notebook entry not found.' });
    }

    const hasType = type !== undefined;
    const nextType = hasType ? normalizeItemType(type, '') : normalizeItemType(entry.type, 'note');
    if (hasType && !nextType) {
      return res.status(400).json({ error: 'type must be one of claim, evidence, note.' });
    }

    let nextClaimId = claimId !== undefined ? parseClaimId(claimId) : entry.claimId;
    if (claimId !== undefined && claimId !== null && claimId !== '' && !nextClaimId) {
      return res.status(400).json({ error: 'Invalid claimId.' });
    }

    if (nextType !== 'evidence') {
      nextClaimId = null;
    }

    if (nextType === 'evidence' && nextClaimId) {
      const linkedClaim = await NotebookEntry.findOne({ _id: nextClaimId, userId }).select('_id type');
      if (!linkedClaim || normalizeItemType(linkedClaim.type, 'note') !== 'claim') {
        return res.status(400).json({ error: 'claimId must reference one of your claim notes.' });
      }
      if (String(linkedClaim._id) === String(entry._id)) {
        return res.status(400).json({ error: 'An evidence note cannot link to itself as a claim.' });
      }
    }

    if (hasType) entry.type = nextType;
    if (tags !== undefined) entry.tags = normalizeTags(tags);
    entry.claimId = nextClaimId;
    await entry.save();
    res.status(200).json(entry);
  } catch (error) {
    console.error("❌ Error organizing notebook entry:", error);
    res.status(500).json({ error: 'Failed to organize notebook entry.' });
  }
});

// POST /api/notebook/:id/link-claim - link an evidence note to a claim note
app.post('/api/notebook/:id/link-claim', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const claimObjectId = parseClaimId(req.body?.claimId);
    if (!claimObjectId) {
      return res.status(400).json({ error: 'claimId is required.' });
    }

    const evidence = await NotebookEntry.findOne({ _id: id, userId });
    if (!evidence) {
      return res.status(404).json({ error: 'Notebook entry not found.' });
    }
    const claim = await NotebookEntry.findOne({ _id: claimObjectId, userId }).select('_id type');
    if (!claim || normalizeItemType(claim.type, 'note') !== 'claim') {
      return res.status(400).json({ error: 'claimId must reference one of your claim notes.' });
    }
    if (String(claim._id) === String(evidence._id)) {
      return res.status(400).json({ error: 'An evidence note cannot link to itself as a claim.' });
    }

    evidence.type = 'evidence';
    evidence.claimId = claim._id;
    await evidence.save();
    res.status(200).json(evidence);
  } catch (error) {
    console.error("❌ Error linking note evidence to claim:", error);
    res.status(500).json({ error: 'Failed to link evidence to claim.' });
  }
});

// GET /api/notebook/:id/claim - fetch claim note plus linked evidence notes
app.get('/api/notebook/:id/claim', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const claim = await NotebookEntry.findOne({ _id: id, userId });
    if (!claim) {
      return res.status(404).json({ error: 'Notebook entry not found.' });
    }
    if (normalizeItemType(claim.type, 'note') !== 'claim') {
      return res.status(400).json({ error: 'Requested notebook entry is not a claim.' });
    }
    const evidence = await NotebookEntry.find({
      userId,
      type: 'evidence',
      claimId: claim._id
    }).sort({ createdAt: -1 });
    res.status(200).json({ claim, evidence });
  } catch (error) {
    console.error("❌ Error fetching note claim evidence:", error);
    res.status(500).json({ error: 'Failed to fetch claim evidence.' });
  }
});

// POST /api/notebook/:id/link-highlight - record backlink to highlight
app.post('/api/notebook/:id/link-highlight', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { highlightId } = req.body;
    if (!highlightId) {
      return res.status(400).json({ error: "highlightId is required." });
    }
    const updated = await NotebookEntry.findOneAndUpdate(
      { _id: id, userId },
      { $addToSet: { linkedHighlightIds: highlightId } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "Notebook entry not found." });
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error linking highlight to notebook:", error);
    res.status(500).json({ error: "Failed to link highlight." });
  }
});

// POST /api/notebook/:id/append-highlight - append highlight block to notebook
app.post('/api/notebook/:id/append-highlight', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { highlightId } = req.body;
    if (!highlightId) return res.status(400).json({ error: "highlightId is required." });
    const entry = await NotebookEntry.findOne({ _id: id, userId });
    if (!entry) return res.status(404).json({ error: "Notebook entry not found." });
    const highlight = await findHighlightById(userId, highlightId);
    if (!highlight) return res.status(404).json({ error: "Highlight not found." });

    const hasBlock = (entry.blocks || []).some(block => {
      const blockType = block.type || '';
      return (blockType === 'highlight-ref' || blockType === 'highlight_embed')
        && String(block.highlightId) === String(highlightId);
    });
    if (!hasBlock) {
      entry.blocks = entry.blocks || [];
      entry.blocks.push({
        id: createBlockId(),
        type: 'highlight_embed',
        text: highlight.text || '',
        highlightId
      });
    }
    entry.linkedHighlightIds = entry.linkedHighlightIds || [];
    if (!entry.linkedHighlightIds.some(id => String(id) === String(highlightId))) {
      entry.linkedHighlightIds.push(highlightId);
    }
    await entry.save();
    await syncNotebookReferences(userId, entry._id, entry.blocks || []);
    res.status(200).json(entry);
  } catch (error) {
    console.error("❌ Error appending highlight to notebook:", error);
    res.status(500).json({ error: "Failed to append highlight." });
  }
});

// PUT /api/notebook/:id - update
app.put('/api/notebook/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, content, blocks, folder, tags, linkedArticleId, type, claimId } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title.trim() || 'Untitled';
    if (content !== undefined) updates.content = content;
    if (blocks !== undefined) {
      updates.blocks = Array.isArray(blocks) ? blocks : [];
    } else if (content !== undefined) {
      const text = stripHtml(content || '');
      updates.blocks = text ? [{ id: createBlockId(), type: 'paragraph', text }] : [];
    }
    if (folder !== undefined) updates.folder = folder || null;
    if (tags !== undefined) updates.tags = normalizeTags(tags);
    if (linkedArticleId !== undefined) updates.linkedArticleId = linkedArticleId || null;
    if (type !== undefined) {
      const nextType = normalizeItemType(type, '');
      if (!nextType) {
        return res.status(400).json({ error: 'type must be one of claim, evidence, note.' });
      }
      updates.type = nextType;
      if (nextType !== 'evidence') {
        updates.claimId = null;
      }
    }
    if (claimId !== undefined) {
      const nextClaimId = parseClaimId(claimId);
      if (claimId !== null && claimId !== '' && !nextClaimId) {
        return res.status(400).json({ error: 'Invalid claimId.' });
      }
      updates.claimId = nextClaimId;
    }

    let effectiveType = updates.type;
    if (!effectiveType) {
      const existing = await NotebookEntry.findOne({ _id: id, userId }).select('type');
      if (!existing) {
        return res.status(404).json({ error: "Notebook entry not found." });
      }
      effectiveType = normalizeItemType(existing.type, 'note');
    }
    if (effectiveType !== 'evidence') {
      if (updates.claimId) {
        return res.status(400).json({ error: 'claimId can only be set when type is evidence.' });
      }
      if (updates.claimId !== undefined) {
        updates.claimId = null;
      }
    }
    const needsClaimValidation = effectiveType === 'evidence' && updates.claimId !== undefined;
    if (needsClaimValidation) {
      if (!updates.claimId) {
        updates.claimId = null;
      } else {
        const linkedClaim = await NotebookEntry.findOne({ _id: updates.claimId, userId }).select('_id type');
        if (!linkedClaim || normalizeItemType(linkedClaim.type, 'note') !== 'claim') {
          return res.status(400).json({ error: 'claimId must reference one of your claim notes.' });
        }
        if (String(linkedClaim._id) === String(id)) {
          return res.status(400).json({ error: 'An evidence note cannot link to itself as a claim.' });
        }
      }
    }

    const updated = await NotebookEntry.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "Notebook entry not found." });
    }
    if (Array.isArray(blocks)) {
      await syncNotebookReferences(userId, updated._id, blocks);
    }
    enqueueNotebookEmbedding(updated);
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating notebook entry:", error);
    res.status(500).json({ error: "Failed to update notebook entry." });
  }
});

// DELETE /api/notebook/:id - delete
app.delete('/api/notebook/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await NotebookEntry.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({ error: "Notebook entry not found." });
    }
    await ReferenceEdge.deleteMany({ userId, sourceType: 'notebook', sourceId: id });
    res.status(200).json({ message: "Notebook entry deleted." });
  } catch (error) {
    console.error("❌ Error deleting notebook entry:", error);
    res.status(500).json({ error: "Failed to delete notebook entry." });
  }
});

// NOTEBOOK FOLDERS
app.get('/api/notebook/folders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const folders = await NotebookFolder.find({ userId }).sort({ name: 1 });
    res.status(200).json(folders);
  } catch (error) {
    console.error("❌ Error fetching notebook folders:", error);
    res.status(500).json({ error: "Failed to fetch folders." });
  }
});

app.post('/api/notebook/folders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Folder name is required." });
    }
    const folder = new NotebookFolder({ name: name.trim(), userId });
    await folder.save();
    res.status(201).json(folder);
  } catch (error) {
    console.error("❌ Error creating notebook folder:", error);
    res.status(500).json({ error: "Failed to create folder." });
  }
});

app.delete('/api/notebook/folders/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await NotebookFolder.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({ error: "Folder not found." });
    }
    // Clear folder from entries that referenced it
    await NotebookEntry.updateMany({ userId, folder: id }, { $set: { folder: null } });
    res.status(200).json({ message: "Folder deleted." });
  } catch (error) {
    console.error("❌ Error deleting notebook folder:", error);
    res.status(500).json({ error: "Failed to delete folder." });
  }
});

// --- WORKING MEMORY ---
app.get('/api/working-memory', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const workspaceType = String(req.query.workspaceType || 'global').trim();
    const workspaceId = String(req.query.workspaceId || '').trim();
    const requestedStatus = String(req.query.status || 'active').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const query = { userId, workspaceType, workspaceId };
    if (requestedStatus !== 'all') {
      const safeStatus = normalizeWorkingMemoryStatus(requestedStatus, 'active');
      if (safeStatus === 'active') {
        query.$or = activeWorkingMemoryStatusFilter().$or;
      } else {
        query.status = safeStatus;
      }
    }
    const items = await WorkingMemoryItem.find(query).sort({ createdAt: -1 }).limit(limit);
    res.status(200).json(items);
  } catch (error) {
    console.error('❌ Error fetching working memory:', error);
    res.status(500).json({ error: 'Failed to fetch working memory.' });
  }
});

app.post('/api/working-memory', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      sourceType = '',
      sourceId = '',
      textSnippet = '',
      tags = [],
      workspaceType = 'global',
      workspaceId = ''
    } = req.body || {};
    const safeSnippet = String(textSnippet || '').trim().slice(0, 1200);
    if (!sourceType || !sourceId || !safeSnippet) {
      return res.status(400).json({
        error: 'sourceType, sourceId, and textSnippet are required.'
      });
    }
    const created = await WorkingMemoryItem.create({
      sourceType: String(sourceType).trim(),
      sourceId: String(sourceId).trim(),
      textSnippet: safeSnippet,
      tags: parseWorkingMemoryTags(tags),
      status: 'active',
      processedAt: null,
      processedReason: '',
      workspaceType: String(workspaceType || 'global').trim() || 'global',
      workspaceId: String(workspaceId || '').trim(),
      userId
    });
    res.status(201).json(created);
  } catch (error) {
    console.error('❌ Error creating working memory item:', error);
    res.status(500).json({ error: 'Failed to create working memory item.' });
  }
});

app.post('/api/working-memory/archive', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const ids = normalizeWorkingMemoryIds(req.body?.ids || []);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids must include at least one valid item id.' });
    }
    const result = await archiveWorkingMemoryItems({
      userId,
      itemIds: ids,
      reason: 'archived'
    });
    res.status(200).json({
      archivedCount: Number(result.modifiedCount || 0),
      matchedCount: Number(result.matchedCount || 0)
    });
  } catch (error) {
    console.error('❌ Error archiving working memory items:', error);
    res.status(500).json({ error: 'Failed to archive working memory items.' });
  }
});

app.post('/api/working-memory/unarchive', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const ids = normalizeWorkingMemoryIds(req.body?.ids || []);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids must include at least one valid item id.' });
    }
    const result = await unarchiveWorkingMemoryItems({
      userId,
      itemIds: ids
    });
    res.status(200).json({
      restoredCount: Number(result.modifiedCount || 0),
      matchedCount: Number(result.matchedCount || 0)
    });
  } catch (error) {
    console.error('❌ Error restoring working memory items:', error);
    res.status(500).json({ error: 'Failed to restore working memory items.' });
  }
});

app.post('/api/working-memory/:id/split', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid working memory id.' });
    }
    const mode = String(req.body?.mode || 'sentence').trim().toLowerCase();
    if (!['sentence', 'newline'].includes(mode)) {
      return res.status(400).json({ error: "mode must be 'sentence' or 'newline'." });
    }
    const item = await WorkingMemoryItem.findOne({
      _id: id,
      userId,
      ...activeWorkingMemoryStatusFilter()
    });
    if (!item) {
      return res.status(404).json({ error: 'Working memory item not found.' });
    }

    const chunks = splitWorkingMemoryText(item.textSnippet, mode);
    if (chunks.length < 2) {
      return res.status(400).json({ error: `Not enough ${mode} chunks to split.` });
    }

    const created = await WorkingMemoryItem.insertMany(
      chunks.map(chunk => ({
        sourceType: item.sourceType || 'working-memory-split',
        sourceId: item.sourceId || String(item._id),
        textSnippet: String(chunk).slice(0, 1200),
        tags: Array.isArray(item.tags) ? item.tags : [],
        status: 'active',
        processedAt: null,
        processedReason: '',
        workspaceType: item.workspaceType || 'global',
        workspaceId: item.workspaceId || '',
        userId
      }))
    );

    await archiveWorkingMemoryItems({
      userId,
      itemIds: [new mongoose.Types.ObjectId(id)],
      reason: `split:${mode}`
    });

    res.status(201).json({
      mode,
      archivedId: id,
      created
    });
  } catch (error) {
    console.error('❌ Error splitting working memory item:', error);
    res.status(500).json({ error: 'Failed to split working memory item.' });
  }
});

app.post('/api/working-memory/promote/:target', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const target = normalizeWorkingMemoryTarget(req.params.target);
    if (!target) {
      return res.status(400).json({ error: 'target must be one of: notebook, concept, question.' });
    }

    const ids = normalizeWorkingMemoryIds(req.body?.ids || []);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids must include at least one valid item id.' });
    }

    const tags = parseWorkingMemoryTags(req.body?.tags || []);
    const items = await WorkingMemoryItem.find({
      _id: { $in: ids },
      userId,
      ...activeWorkingMemoryStatusFilter()
    }).sort({ createdAt: -1 });
    if (items.length === 0) {
      return res.status(404).json({ error: 'No active working memory items found for promotion.' });
    }

    const texts = items
      .map(item => String(item.textSnippet || '').trim())
      .filter(Boolean)
      .slice(0, 100);
    if (texts.length === 0) {
      return res.status(400).json({ error: 'No promotable text found in selected blocks.' });
    }

    const defaultTitle = buildWorkingMemoryNotebookTitle(texts[0] || '');
    const requestedTitle = String(req.body?.title || '').trim();
    const title = (requestedTitle || defaultTitle).slice(0, 140);
    let resultPayload = {};

    if (target === 'notebook') {
      const blocks = texts.map(text => ({
        id: createBlockId(),
        type: 'paragraph',
        text: String(text).slice(0, 1200)
      }));
      const created = await NotebookEntry.create({
        title: title || 'Working memory extract',
        content: '',
        blocks,
        tags,
        userId
      });
      await syncNotebookReferences(userId, created._id, blocks);
      enqueueNotebookEmbedding(created);
      resultPayload = { notebookEntry: created };
    }

    if (target === 'concept') {
      const conceptInput = String(req.body?.conceptName || tags[0] || '').trim();
      if (!conceptInput) {
        return res.status(400).json({ error: 'conceptName is required to promote to concept.' });
      }
      const conceptRegex = new RegExp(`^${escapeRegExp(conceptInput)}$`, 'i');
      let concept = await TagMeta.findOne({ name: conceptRegex, userId });
      if (!concept) {
        concept = await TagMeta.create({
          name: conceptInput,
          description: '',
          userId
        });
      }
      const conceptContent = tags.length > 0
        ? `${texts.join('\n\n')}\n\nTags: ${tags.join(', ')}`
        : texts.join('\n\n');
      const conceptNote = await ConceptNote.create({
        tagName: concept.name,
        title: title || 'Working memory extract',
        content: conceptContent,
        userId
      });
      resultPayload = {
        concept: {
          _id: concept._id,
          name: concept.name
        },
        conceptNote
      };
    }

    if (target === 'question') {
      const requestedQuestionId = String(req.body?.questionId || '').trim();
      const conceptName = String(req.body?.conceptName || tags[0] || '').trim();
      const questionText = String(req.body?.questionText || '').trim().slice(0, 400)
        || `From working memory: ${defaultTitle}`;
      const blocksToAppend = texts.map(text => ({
        id: createBlockId(),
        type: 'paragraph',
        text: String(text).slice(0, 1200)
      }));

      if (requestedQuestionId) {
        if (!mongoose.Types.ObjectId.isValid(requestedQuestionId)) {
          return res.status(400).json({ error: 'Invalid questionId.' });
        }
        const question = await Question.findOne({ _id: requestedQuestionId, userId });
        if (!question) {
          return res.status(404).json({ error: 'Question not found.' });
        }
        question.blocks = Array.isArray(question.blocks) ? question.blocks : [];
        question.blocks.push(...blocksToAppend);
        if (conceptName) {
          question.conceptName = conceptName;
          question.linkedTagName = conceptName;
        }
        await question.save();
        enqueueQuestionEmbedding(question);
        resultPayload = { question };
      } else {
        const created = await Question.create({
          text: questionText,
          status: 'open',
          linkedTagName: conceptName || '',
          conceptName: conceptName || '',
          blocks: blocksToAppend,
          userId
        });
        enqueueQuestionEmbedding(created);
        resultPayload = { question: created };
      }
    }

    const archived = await archiveWorkingMemoryItems({
      userId,
      itemIds: ids,
      reason: `promoted:${target}`
    });

    res.status(200).json({
      promotedTo: target,
      sourceCount: items.length,
      archivedCount: Number(archived.modifiedCount || 0),
      ...resultPayload
    });
  } catch (error) {
    console.error('❌ Error promoting working memory items:', error);
    res.status(500).json({ error: 'Failed to promote working memory items.' });
  }
});

app.delete('/api/working-memory/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await WorkingMemoryItem.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({ error: 'Working memory item not found.' });
    }
    res.status(200).json({ message: 'Working memory item deleted.' });
  } catch (error) {
    console.error('❌ Error deleting working memory item:', error);
    res.status(500).json({ error: 'Failed to delete working memory item.' });
  }
});

// --- UI SETTINGS ---
app.get('/api/ui-settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const scope = normalizeUiSettingsScope(req.query.workspaceType, req.query.workspaceId);
    const settings = await UiSettings.findOne({
      userId,
      workspaceType: scope.workspaceType,
      workspaceId: scope.workspaceId
    }).lean();
    res.status(200).json(buildUiSettingsResponse(settings, scope));
  } catch (error) {
    console.error('❌ Error fetching UI settings:', error);
    res.status(500).json({ error: 'Failed to fetch UI settings.' });
  }
});

app.put('/api/ui-settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};
    const scope = normalizeUiSettingsScope(body.workspaceType, body.workspaceId);
    const payload = normalizeUiSettingsPayload(body);
    const updated = await UiSettings.findOneAndUpdate(
      {
        userId,
        workspaceType: scope.workspaceType,
        workspaceId: scope.workspaceId
      },
      {
        $set: {
          ...payload,
          workspaceType: scope.workspaceType,
          workspaceId: scope.workspaceId
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();
    res.status(200).json(buildUiSettingsResponse(updated, scope));
  } catch (error) {
    console.error('❌ Error updating UI settings:', error);
    res.status(500).json({ error: 'Failed to update UI settings.' });
  }
});

// --- RETURN QUEUE ---
app.post(['/api/return-queue', '/return-queue'], authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      itemType = '',
      itemId = '',
      reason = '',
      dueAt = null
    } = req.body || {};
    const safeItemType = normalizeReturnQueueItemType(itemType);
    const safeItemId = String(itemId || '').trim();
    const safeReason = String(reason || '').trim().slice(0, 280);
    if (!safeItemType || !safeItemId) {
      return res.status(400).json({ error: 'itemType and itemId are required.' });
    }
    const parsedDueAt = parseDueAt(dueAt);
    if (dueAt !== null && dueAt !== undefined && dueAt !== '' && !parsedDueAt) {
      return res.status(400).json({ error: 'Invalid dueAt value.' });
    }
    const item = await resolveReturnQueueItem(userId, safeItemType, safeItemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found for this user.' });
    }
    const created = await ReturnQueueEntry.create({
      itemType: safeItemType,
      itemId: safeItemId,
      reason: safeReason,
      dueAt: parsedDueAt,
      status: 'pending',
      userId
    });
    res.status(201).json({ ...created.toObject(), item });
  } catch (error) {
    console.error('❌ Error creating return queue entry:', error);
    res.status(500).json({ error: 'Failed to create return queue entry.' });
  }
});

app.get(['/api/return-queue', '/return-queue'], authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const filter = String(req.query.filter || 'due').trim().toLowerCase();
    if (!['due', 'upcoming', 'all'].includes(filter)) {
      return res.status(400).json({ error: "filter must be one of: due, upcoming, all." });
    }
    const now = new Date();
    const query = { userId };
    if (filter === 'due') {
      query.status = 'pending';
      query.$or = [{ dueAt: null }, { dueAt: { $lte: now } }];
    } else if (filter === 'upcoming') {
      query.status = 'pending';
      query.dueAt = { $gt: now };
    }
    const entries = await ReturnQueueEntry.find(query)
      .sort({ status: 1, dueAt: 1, createdAt: -1 })
      .limit(400)
      .lean();
    const hydrated = await Promise.all(entries.map(async (entry) => {
      const item = await resolveReturnQueueItem(userId, entry.itemType, entry.itemId);
      return {
        ...entry,
        item: item || buildUnavailableQueueItem()
      };
    }));
    res.status(200).json(hydrated);
  } catch (error) {
    console.error('❌ Error fetching return queue entries:', error);
    res.status(500).json({ error: 'Failed to fetch return queue entries.' });
  }
});

app.patch(['/api/return-queue/:id', '/return-queue/:id'], authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid return queue id.' });
    }
    const {
      action = '',
      dueAt = null,
      snoozeDays = 3,
      reason
    } = req.body || {};
    const safeAction = String(action || '').trim().toLowerCase();
    if (!['done', 'snooze', 'reschedule'].includes(safeAction)) {
      return res.status(400).json({ error: 'action must be one of: done, snooze, reschedule.' });
    }
    const entry = await ReturnQueueEntry.findOne({ _id: id, userId });
    if (!entry) {
      return res.status(404).json({ error: 'Return queue entry not found.' });
    }
    if (safeAction === 'done') {
      entry.status = 'completed';
      entry.completedAt = new Date();
    } else if (safeAction === 'snooze') {
      const days = Number.isFinite(Number(snoozeDays)) ? Number(snoozeDays) : 3;
      const safeDays = Math.max(1, Math.min(30, Math.round(days)));
      const nextDue = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);
      entry.status = 'pending';
      entry.completedAt = null;
      entry.dueAt = nextDue;
    } else if (safeAction === 'reschedule') {
      const parsedDueAt = parseDueAt(dueAt);
      if (!parsedDueAt) {
        return res.status(400).json({ error: 'dueAt is required for reschedule.' });
      }
      entry.status = 'pending';
      entry.completedAt = null;
      entry.dueAt = parsedDueAt;
    }
    if (reason !== undefined) {
      entry.reason = String(reason || '').trim().slice(0, 280);
    }
    await entry.save();
    const item = await resolveReturnQueueItem(userId, entry.itemType, entry.itemId);
    res.status(200).json({ ...entry.toObject(), item: item || buildUnavailableQueueItem() });
  } catch (error) {
    console.error('❌ Error updating return queue entry:', error);
    res.status(500).json({ error: 'Failed to update return queue entry.' });
  }
});

// --- CONNECTIONS (notes/highlights) ---
app.post('/api/connections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fromType = '',
      fromId = '',
      toType = '',
      toId = '',
      relationType = '',
      scopeType,
      scopeId
    } = req.body || {};

    const safeFromType = normalizeConnectionItemType(fromType);
    const safeToType = normalizeConnectionItemType(toType);
    const safeFromId = String(fromId || '').trim();
    const safeToId = String(toId || '').trim();
    const safeRelationType = normalizeRelationType(relationType);

    if (!safeFromType || !safeToType || !safeFromId || !safeToId || !safeRelationType) {
      return res.status(400).json({
        error: 'fromType, fromId, toType, toId, relationType are required.'
      });
    }
    if (safeFromType === safeToType && safeFromId === safeToId) {
      return res.status(400).json({ error: 'Cannot connect an item to itself.' });
    }

    const hasScopeInput = scopeType !== undefined || scopeId !== undefined;
    const scope = await resolveConnectionScopeInput(userId, scopeType, scopeId, hasScopeInput);
    if (!scope) {
      return res.status(400).json({ error: 'Invalid scopeType/scopeId.' });
    }

    const [fromItem, toItem] = await Promise.all([
      resolveConnectionItem(userId, safeFromType, safeFromId),
      resolveConnectionItem(userId, safeToType, safeToId)
    ]);
    if (!fromItem || !toItem) {
      return res.status(404).json({ error: 'One or both items were not found for this user.' });
    }

    const existing = await Connection.findOne({
      userId,
      fromType: safeFromType,
      fromId: safeFromId,
      toType: safeToType,
      toId: safeToId,
      relationType: safeRelationType,
      ...buildConnectionScopeQuery(scope)
    }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Connection already exists.' });
    }

    const created = await Connection.create({
      fromType: safeFromType,
      fromId: safeFromId,
      toType: safeToType,
      toId: safeToId,
      relationType: safeRelationType,
      scopeType: scope.scopeType || '',
      scopeId: scope.scopeId || '',
      userId
    });

    res.status(201).json({
      ...created.toObject(),
      fromItem,
      toItem
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Connection already exists.' });
    }
    console.error('❌ Error creating connection:', error);
    res.status(500).json({ error: 'Failed to create connection.' });
  }
});

app.get('/api/connections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const safeItemType = normalizeConnectionItemType(req.query.itemType);
    const safeItemId = String(req.query.itemId || '').trim();
    if (!safeItemType || !safeItemId) {
      return res.status(400).json({ error: 'itemType and itemId are required.' });
    }

    const item = await resolveConnectionItem(userId, safeItemType, safeItemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found for this user.' });
    }

    const hasScopeInput = req.query.scopeType !== undefined || req.query.scopeId !== undefined;
    const scope = await resolveConnectionScopeInput(userId, req.query.scopeType, req.query.scopeId, hasScopeInput);
    if (!scope) {
      return res.status(400).json({ error: 'Invalid scopeType/scopeId.' });
    }

    const scopeFilter = buildConnectionScopeQuery(scope);

    const [outgoingRows, incomingRows] = await Promise.all([
      Connection.find({ userId, fromType: safeItemType, fromId: safeItemId, ...scopeFilter })
        .sort({ createdAt: -1 })
        .lean(),
      Connection.find({ userId, toType: safeItemType, toId: safeItemId, ...scopeFilter })
        .sort({ createdAt: -1 })
        .lean()
    ]);

    const outgoing = await Promise.all(outgoingRows.map(async (row) => ({
      ...row,
      target: await resolveConnectionItem(userId, row.toType, row.toId)
    })));
    const incoming = await Promise.all(incomingRows.map(async (row) => ({
      ...row,
      source: await resolveConnectionItem(userId, row.fromType, row.fromId)
    })));

    res.status(200).json({
      item,
      scope: {
        scopeType: scope.scopeType || '',
        scopeId: scope.scopeId || ''
      },
      outgoing: outgoing.filter(row => row.target),
      incoming: incoming.filter(row => row.source)
    });
  } catch (error) {
    console.error('❌ Error listing connections:', error);
    res.status(500).json({ error: 'Failed to list connections.' });
  }
});

app.get('/api/connections/search', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const q = String(req.query.q || '').trim();
    const excludeType = normalizeConnectionItemType(req.query.excludeType);
    const excludeId = String(req.query.excludeId || '').trim();
    const limit = Math.max(1, Math.min(40, Number(req.query.limit) || 15));
    const regex = q ? new RegExp(escapeRegExp(q), 'i') : null;
    const requestedItemTypes = String(req.query.itemTypes || '')
      .split(',')
      .map(value => normalizeConnectionItemType(value))
      .filter(Boolean);
    const allowedItemTypes = new Set(requestedItemTypes);
    const hasScopeInput = req.query.scopeType !== undefined || req.query.scopeId !== undefined;
    const scope = await resolveConnectionScopeInput(userId, req.query.scopeType, req.query.scopeId, hasScopeInput);
    if (!scope) {
      return res.status(400).json({ error: 'Invalid scopeType/scopeId.' });
    }
    const scopeCandidates = await buildConnectionScopeCandidates(userId, scope);
    const scopedNotebookObjectIds = scopeCandidates
      ? toObjectIdList(Array.from(scopeCandidates.notebookIds || []))
      : [];
    const scopedHighlightObjectIds = scopeCandidates
      ? toObjectIdList(Array.from(scopeCandidates.highlightIds || []))
      : [];
    const scopedArticleObjectIds = scopeCandidates
      ? toObjectIdList(Array.from(scopeCandidates.articleIds || []))
      : [];
    const scopedConceptObjectIds = scopeCandidates
      ? toObjectIdList(Array.from(scopeCandidates.conceptIds || []))
      : [];
    const scopedQuestionObjectIds = scopeCandidates
      ? toObjectIdList(Array.from(scopeCandidates.questionIds || []))
      : [];

    if (
      scopeCandidates &&
      scopedNotebookObjectIds.length === 0 &&
      scopedHighlightObjectIds.length === 0 &&
      scopedArticleObjectIds.length === 0 &&
      scopedConceptObjectIds.length === 0 &&
      scopedQuestionObjectIds.length === 0
    ) {
      return res.status(200).json([]);
    }

    const fetchLimit = scopeCandidates ? Math.max(limit * 4, 80) : limit;
    const notebookQuery = {
      userId,
      ...(regex ? { $or: [{ title: regex }, { content: regex }] } : {})
    };
    if (scopeCandidates) {
      notebookQuery._id = { $in: scopedNotebookObjectIds };
    }

    const articleQuery = {
      userId,
      ...(regex ? { $or: [{ title: regex }, { content: regex }, { url: regex }] } : {})
    };
    if (scopeCandidates) {
      articleQuery._id = { $in: scopedArticleObjectIds };
    }

    const conceptQuery = {
      userId,
      ...(regex ? { $or: [{ name: regex }, { description: regex }] } : {})
    };
    if (scopeCandidates) {
      conceptQuery._id = { $in: scopedConceptObjectIds };
    }

    const questionQuery = {
      userId,
      ...(regex ? { text: regex } : {})
    };
    if (scopeCandidates) {
      questionQuery._id = { $in: scopedQuestionObjectIds };
    }

    const [notebooks, highlights, articles, concepts, questions] = await Promise.all([
      NotebookEntry.find(notebookQuery)
        .select('title content updatedAt')
        .sort({ updatedAt: -1 })
        .limit(fetchLimit)
        .lean(),
      Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        ...(scopeCandidates ? [{ $match: { 'highlights._id': { $in: scopedHighlightObjectIds } } }] : []),
        ...(regex ? [{
          $match: {
            $or: [
              { title: regex },
              { 'highlights.text': regex },
              { 'highlights.note': regex }
            ]
          }
        }] : []),
        { $sort: { 'highlights.createdAt': -1 } },
        { $limit: fetchLimit },
        {
          $project: {
            _id: '$highlights._id',
            articleId: '$_id',
            articleTitle: '$title',
            text: '$highlights.text',
            note: '$highlights.note'
          }
        }
      ]),
      Article.find(articleQuery)
        .select('title content url updatedAt')
        .sort({ updatedAt: -1 })
        .limit(fetchLimit)
        .lean(),
      TagMeta.find(conceptQuery)
        .select('name description updatedAt')
        .sort({ updatedAt: -1 })
        .limit(fetchLimit)
        .lean(),
      Question.find(questionQuery)
        .select('text updatedAt')
        .sort({ updatedAt: -1 })
        .limit(fetchLimit)
        .lean()
    ]);

    const notebookItems = notebooks.map(entry => ({
      itemType: 'notebook',
      itemId: String(entry._id),
      title: entry.title || 'Notebook entry',
      snippet: buildQueueSnippet(entry.content, entry.title),
      updatedAt: entry.updatedAt
    }));
    const highlightItems = highlights.map(highlight => ({
      itemType: 'highlight',
      itemId: String(highlight._id),
      title: highlight.articleTitle || 'Highlight',
      snippet: buildQueueSnippet(highlight.text, highlight.note),
      updatedAt: null
    }));
    const articleItems = articles.map(article => ({
      itemType: 'article',
      itemId: String(article._id),
      title: article.title || 'Article',
      snippet: buildQueueSnippet(article.content, article.url, article.title),
      updatedAt: article.updatedAt
    }));
    const conceptItems = concepts.map(concept => ({
      itemType: 'concept',
      itemId: String(concept._id),
      title: concept.name || 'Concept',
      snippet: buildQueueSnippet(concept.description, concept.name),
      updatedAt: concept.updatedAt
    }));
    const questionItems = questions.map(question => ({
      itemType: 'question',
      itemId: String(question._id),
      title: 'Question',
      snippet: buildQueueSnippet(question.text),
      updatedAt: question.updatedAt
    }));

    const results = [...notebookItems, ...highlightItems, ...articleItems, ...conceptItems, ...questionItems]
      .filter(item => !(item.itemType === excludeType && item.itemId === excludeId))
      .filter(item => (allowedItemTypes.size === 0 ? true : allowedItemTypes.has(item.itemType)))
      .filter(item => isConnectionItemInScopeCandidates(item.itemType, item.itemId, scopeCandidates))
      .sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, limit);

    res.status(200).json(results);
  } catch (error) {
    console.error('❌ Error searching connectable items:', error);
    res.status(500).json({ error: 'Failed to search items.' });
  }
});

app.get('/api/connections/scope', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const hasScopeInput = req.query.scopeType !== undefined || req.query.scopeId !== undefined;
    const scope = await resolveConnectionScopeInput(userId, req.query.scopeType, req.query.scopeId, hasScopeInput);
    if (!scope || !scope.scopeType || !scope.scopeId) {
      return res.status(400).json({ error: 'scopeType and scopeId are required.' });
    }

    const limit = Math.max(1, Math.min(120, Number(req.query.limit) || 40));
    const rows = await Connection.find({
      userId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const connections = await Promise.all(rows.map(async (row) => {
      const [fromItem, toItem] = await Promise.all([
        resolveConnectionItem(userId, row.fromType, row.fromId),
        resolveConnectionItem(userId, row.toType, row.toId)
      ]);
      return {
        ...row,
        fromItem,
        toItem
      };
    }));

    res.status(200).json({
      scope: {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        title: scope.title || ''
      },
      connections: connections.filter(row => row.fromItem && row.toItem)
    });
  } catch (error) {
    console.error('❌ Error listing scope connections:', error);
    res.status(500).json({ error: 'Failed to list scope connections.' });
  }
});

app.get('/api/map/graph', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.max(20, Math.min(600, Number(req.query.limit) || 180));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const relationTypes = parseCsvList(req.query.relationTypes)
      .map(value => normalizeRelationType(value))
      .filter(Boolean);
    const itemTypes = parseCsvList(req.query.itemTypes)
      .map(value => normalizeConnectionItemType(value))
      .filter(Boolean);
    const tagFilters = new Set(parseCsvList(req.query.tags).map(tag => tag.toLowerCase()));
    const notebookId = String(req.query.notebookId || '').trim();

    const hasScopeInput = req.query.scopeType !== undefined || req.query.scopeId !== undefined;
    let scope = null;
    if (hasScopeInput) {
      scope = await resolveConnectionScopeInput(userId, req.query.scopeType, req.query.scopeId, true);
      if (!scope) {
        return res.status(400).json({ error: 'Invalid scopeType/scopeId.' });
      }
    }

    const query = { userId };
    if (hasScopeInput) {
      query.scopeType = scope.scopeType || '';
      query.scopeId = scope.scopeId || '';
    }
    if (relationTypes.length > 0) {
      query.relationType = { $in: relationTypes };
    }
    if (itemTypes.length > 0) {
      query.fromType = { $in: itemTypes };
      query.toType = { $in: itemTypes };
    }
    if (notebookId) {
      query.$or = [
        { fromType: 'notebook', fromId: notebookId },
        { toType: 'notebook', toId: notebookId }
      ];
    }

    const rows = await Connection.find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const edgeRows = hasMore ? rows.slice(0, limit) : rows;

    const idsByType = {
      highlight: new Set(),
      notebook: new Set(),
      article: new Set(),
      concept: new Set(),
      question: new Set()
    };
    edgeRows.forEach(row => {
      addToCandidateSet(idsByType[row.fromType], row.fromId);
      addToCandidateSet(idsByType[row.toType], row.toId);
    });

    const nodeMap = await buildGraphNodeMap(userId, idsByType);
    let edges = edgeRows
      .map(row => ({
        id: String(row._id),
        source: buildGraphNodeKey(row.fromType, row.fromId),
        target: buildGraphNodeKey(row.toType, row.toId),
        relationType: row.relationType,
        createdAt: row.createdAt,
        scopeType: row.scopeType || '',
        scopeId: row.scopeId || ''
      }))
      .filter(edge => nodeMap.has(edge.source) && nodeMap.has(edge.target));
    let nodes = Array.from(nodeMap.values());

    if (tagFilters.size > 0) {
      const matchedNodeIds = new Set(
        nodes
          .filter(node => Array.isArray(node.tags) && node.tags.some(tag => tagFilters.has(String(tag || '').toLowerCase())))
          .map(node => node.id)
      );

      if (matchedNodeIds.size === 0) {
        return res.status(200).json({
          nodes: [],
          edges: [],
          page: {
            limit,
            offset,
            hasMore: false,
            nextOffset: offset
          }
        });
      }

      edges = edges.filter(edge => matchedNodeIds.has(edge.source) || matchedNodeIds.has(edge.target));
      const visibleNodeIds = new Set(matchedNodeIds);
      edges.forEach(edge => {
        visibleNodeIds.add(edge.source);
        visibleNodeIds.add(edge.target);
      });
      nodes = nodes.filter(node => visibleNodeIds.has(node.id));
    }

    res.status(200).json({
      nodes,
      edges,
      page: {
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + limit : offset
      }
    });
  } catch (error) {
    console.error('❌ Error fetching map graph:', error);
    res.status(500).json({ error: 'Failed to fetch graph.' });
  }
});

app.delete('/api/connections/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await Connection.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({ error: 'Connection not found.' });
    }
    res.status(200).json({ message: 'Connection deleted.' });
  } catch (error) {
    console.error('❌ Error deleting connection:', error);
    res.status(500).json({ error: 'Failed to delete connection.' });
  }
});

// --- CONCEPT PATHS ---
app.get('/api/concept-paths', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const paths = await ConceptPath.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();
    const progressRows = await ConceptPathProgress.find({ userId, pathId: { $in: paths.map(path => path._id) } }).lean();
    const progressMap = new Map(progressRows.map(row => [String(row.pathId), row]));
    const summaries = paths.map(path => {
      const progress = progressMap.get(String(path._id));
      return {
        _id: path._id,
        title: path.title,
        description: path.description || '',
        createdAt: path.createdAt,
        updatedAt: path.updatedAt,
        itemCount: Array.isArray(path.itemRefs) ? path.itemRefs.length : 0,
        progress: {
          understoodCount: (progress?.understoodItemRefIds || []).length,
          currentIndex: progress?.currentIndex || 0
        }
      };
    });
    res.status(200).json(summaries);
  } catch (error) {
    console.error('❌ Error listing concept paths:', error);
    res.status(500).json({ error: 'Failed to list concept paths.' });
  }
});

app.post('/api/concept-paths', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title = '',
      description = '',
      itemRefs = [],
      startItem = null
    } = req.body || {};
    const safeTitle = String(title || '').trim().slice(0, 140);
    if (!safeTitle) {
      return res.status(400).json({ error: 'title is required.' });
    }

    const normalizedRefs = normalizePathItemRefsInput(itemRefs);
    if (startItem && typeof startItem === 'object') {
      const startType = normalizeConceptPathItemType(startItem.type);
      const startId = String(startItem.id || '').trim();
      if (startType && startId && !normalizedRefs.some(item => item.type === startType && item.id === startId)) {
        normalizedRefs.unshift({
          type: startType,
          id: startId,
          order: 0,
          notes: normalizeConceptPathNotes(startItem.notes)
        });
      }
    }
    const orderedRefs = sortPathItemRefs(normalizedRefs);
    const validation = await Promise.all(orderedRefs.map(item => resolveConnectionItem(userId, item.type, item.id)));
    if (validation.some(item => !item)) {
      return res.status(400).json({ error: 'One or more path items are invalid for this user.' });
    }

    const created = await ConceptPath.create({
      title: safeTitle,
      description: String(description || '').trim().slice(0, 500),
      itemRefs: orderedRefs,
      userId
    });
    const response = await getConceptPathWithProgress(userId, created);
    res.status(201).json(response);
  } catch (error) {
    console.error('❌ Error creating concept path:', error);
    res.status(500).json({ error: 'Failed to create concept path.' });
  }
});

app.get('/api/concept-paths/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const path = await ensureConceptPathOwnership(userId, req.params.id);
    if (!path) return res.status(404).json({ error: 'Concept path not found.' });
    const response = await getConceptPathWithProgress(userId, path);
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Error fetching concept path:', error);
    res.status(500).json({ error: 'Failed to fetch concept path.' });
  }
});

app.put('/api/concept-paths/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const path = await ensureConceptPathOwnership(userId, req.params.id);
    if (!path) return res.status(404).json({ error: 'Concept path not found.' });

    const { title, description, itemRefs } = req.body || {};
    if (title !== undefined) {
      const safeTitle = String(title || '').trim().slice(0, 140);
      if (!safeTitle) return res.status(400).json({ error: 'title cannot be empty.' });
      path.title = safeTitle;
    }
    if (description !== undefined) {
      path.description = String(description || '').trim().slice(0, 500);
    }
    if (itemRefs !== undefined) {
      const normalizedRefs = normalizePathItemRefsInput(itemRefs);
      const validation = await Promise.all(normalizedRefs.map(item => resolveConnectionItem(userId, item.type, item.id)));
      if (validation.some(item => !item)) {
        return res.status(400).json({ error: 'One or more path items are invalid for this user.' });
      }
      path.itemRefs = normalizedRefs;
    }
    await path.save();

    const progress = await ConceptPathProgress.findOne({ userId, pathId: path._id });
    if (progress) {
      const validIds = new Set((path.itemRefs || []).map(ref => String(ref._id)));
      progress.understoodItemRefIds = (progress.understoodItemRefIds || []).filter(id => validIds.has(String(id)));
      progress.currentIndex = Math.max(0, Math.min(progress.currentIndex || 0, Math.max((path.itemRefs || []).length - 1, 0)));
      await progress.save();
    }

    const response = await getConceptPathWithProgress(userId, path);
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Error updating concept path:', error);
    res.status(500).json({ error: 'Failed to update concept path.' });
  }
});

app.delete('/api/concept-paths/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const path = await ensureConceptPathOwnership(userId, req.params.id);
    if (!path) return res.status(404).json({ error: 'Concept path not found.' });
    await Promise.all([
      ConceptPath.deleteOne({ _id: path._id, userId }),
      ConceptPathProgress.deleteOne({ pathId: path._id, userId })
    ]);
    res.status(200).json({ message: 'Concept path deleted.' });
  } catch (error) {
    console.error('❌ Error deleting concept path:', error);
    res.status(500).json({ error: 'Failed to delete concept path.' });
  }
});

app.post('/api/concept-paths/:id/items', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const path = await ensureConceptPathOwnership(userId, req.params.id);
    if (!path) return res.status(404).json({ error: 'Concept path not found.' });

    const safeType = normalizeConceptPathItemType(req.body?.type);
    const safeId = String(req.body?.id || '').trim();
    const safeNotes = normalizeConceptPathNotes(req.body?.notes);
    const position = Number.isFinite(Number(req.body?.position)) ? Number(req.body.position) : (path.itemRefs || []).length;
    if (!safeType || !safeId) {
      return res.status(400).json({ error: 'type and id are required.' });
    }
    const resolved = await resolveConnectionItem(userId, safeType, safeId);
    if (!resolved) {
      return res.status(400).json({ error: 'Item not found for this user.' });
    }
    const hasDuplicate = (path.itemRefs || []).some(item => item.type === safeType && item.id === safeId);
    if (hasDuplicate) {
      return res.status(409).json({ error: 'Item already exists in this path.' });
    }

    const nextRefs = [...(path.itemRefs || [])];
    const boundedPosition = Math.max(0, Math.min(position, nextRefs.length));
    nextRefs.splice(boundedPosition, 0, {
      type: safeType,
      id: safeId,
      order: boundedPosition,
      notes: safeNotes
    });
    path.itemRefs = sortPathItemRefs(nextRefs);
    await path.save();
    const response = await getConceptPathWithProgress(userId, path);
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Error adding path item:', error);
    res.status(500).json({ error: 'Failed to add path item.' });
  }
});

app.patch('/api/concept-paths/:id/items/reorder', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const path = await ensureConceptPathOwnership(userId, req.params.id);
    if (!path) return res.status(404).json({ error: 'Concept path not found.' });

    const itemRefIds = Array.isArray(req.body?.itemRefIds) ? req.body.itemRefIds.map(value => String(value || '').trim()) : [];
    if (itemRefIds.length !== (path.itemRefs || []).length) {
      return res.status(400).json({ error: 'itemRefIds must include all path item ids.' });
    }
    const existingMap = new Map((path.itemRefs || []).map(item => [String(item._id), item.toObject ? item.toObject() : item]));
    if (itemRefIds.some(id => !existingMap.has(id))) {
      return res.status(400).json({ error: 'itemRefIds contains unknown values.' });
    }
    const reordered = itemRefIds.map((id, index) => ({
      ...existingMap.get(id),
      order: index
    }));
    path.itemRefs = reordered;
    await path.save();
    const response = await getConceptPathWithProgress(userId, path);
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Error reordering path items:', error);
    res.status(500).json({ error: 'Failed to reorder path items.' });
  }
});

app.patch('/api/concept-paths/:id/items/:itemRefId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const path = await ensureConceptPathOwnership(userId, req.params.id);
    if (!path) return res.status(404).json({ error: 'Concept path not found.' });
    const itemRef = (path.itemRefs || []).find(item => String(item._id) === String(req.params.itemRefId));
    if (!itemRef) return res.status(404).json({ error: 'Path item not found.' });
    if (req.body?.notes !== undefined) {
      itemRef.notes = normalizeConceptPathNotes(req.body.notes);
    }
    await path.save();
    const response = await getConceptPathWithProgress(userId, path);
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Error updating path item:', error);
    res.status(500).json({ error: 'Failed to update path item.' });
  }
});

app.delete('/api/concept-paths/:id/items/:itemRefId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const path = await ensureConceptPathOwnership(userId, req.params.id);
    if (!path) return res.status(404).json({ error: 'Concept path not found.' });
    const beforeCount = (path.itemRefs || []).length;
    path.itemRefs = sortPathItemRefs((path.itemRefs || []).filter(item => String(item._id) !== String(req.params.itemRefId)));
    if (path.itemRefs.length === beforeCount) {
      return res.status(404).json({ error: 'Path item not found.' });
    }
    await path.save();

    const progress = await ConceptPathProgress.findOne({ userId, pathId: path._id });
    if (progress) {
      const validIds = new Set((path.itemRefs || []).map(ref => String(ref._id)));
      progress.understoodItemRefIds = (progress.understoodItemRefIds || []).filter(id => validIds.has(String(id)));
      progress.currentIndex = Math.max(0, Math.min(progress.currentIndex || 0, Math.max(path.itemRefs.length - 1, 0)));
      await progress.save();
    }

    const response = await getConceptPathWithProgress(userId, path);
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Error removing path item:', error);
    res.status(500).json({ error: 'Failed to remove path item.' });
  }
});

app.patch('/api/concept-paths/:id/progress', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const path = await ensureConceptPathOwnership(userId, req.params.id);
    if (!path) return res.status(404).json({ error: 'Concept path not found.' });

    const validRefIds = new Set((path.itemRefs || []).map(ref => String(ref._id)));
    const {
      currentIndex,
      understoodItemRefIds,
      toggleItemRefId,
      understood
    } = req.body || {};

    const progress = await ConceptPathProgress.findOneAndUpdate(
      { userId, pathId: path._id },
      { $setOnInsert: { userId, pathId: path._id, understoodItemRefIds: [], currentIndex: 0 } },
      { new: true, upsert: true }
    );

    if (Array.isArray(understoodItemRefIds)) {
      progress.understoodItemRefIds = understoodItemRefIds
        .map(id => String(id || '').trim())
        .filter(id => validRefIds.has(id));
    }
    if (toggleItemRefId !== undefined) {
      const safeId = String(toggleItemRefId || '').trim();
      if (validRefIds.has(safeId)) {
        const set = new Set((progress.understoodItemRefIds || []).map(id => String(id)));
        const shouldMark = understood !== undefined ? Boolean(understood) : !set.has(safeId);
        if (shouldMark) set.add(safeId);
        else set.delete(safeId);
        progress.understoodItemRefIds = Array.from(set);
      }
    }
    if (currentIndex !== undefined) {
      const nextIndex = Number.isFinite(Number(currentIndex)) ? Number(currentIndex) : 0;
      progress.currentIndex = Math.max(0, Math.min(Math.round(nextIndex), Math.max((path.itemRefs || []).length - 1, 0)));
    } else {
      progress.currentIndex = Math.max(0, Math.min(progress.currentIndex || 0, Math.max((path.itemRefs || []).length - 1, 0)));
    }

    progress.understoodItemRefIds = (progress.understoodItemRefIds || []).filter(id => validRefIds.has(String(id)));
    await progress.save();
    res.status(200).json({
      understoodItemRefIds: progress.understoodItemRefIds || [],
      currentIndex: progress.currentIndex || 0
    });
  } catch (error) {
    console.error('❌ Error updating concept path progress:', error);
    res.status(500).json({ error: 'Failed to update concept path progress.' });
  }
});

// POST /api/feedback - store feedback in Mongo (no email)
app.post('/api/feedback', async (req, res) => {
  try {
    const { message, rating, email, source } = req.body || {};
    const trimmedMessage = (message || '').trim();
    if (!trimmedMessage) {
      return res.status(400).json({ error: "Feedback message is required." });
    }
    const safeRating = Number.isFinite(Number(rating)) ? Math.max(1, Math.min(5, Number(rating))) : null;
    const feedback = new Feedback({
      message: trimmedMessage,
      rating: safeRating,
      email: (email || '').trim(),
      source: source || 'web-app',
      userId: req.user?.id || null
    });
    await feedback.save();
    res.status(200).json({ message: "Feedback saved. Thank you!" });
  } catch (error) {
    console.error("❌ Error saving feedback:", error);
    res.status(500).json({ error: "Failed to save feedback." });
  }
});

// GET /api/feedback - fetch feedback (authenticated)
app.get('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const adminList = (process.env.FEEDBACK_ADMIN_USERNAMES || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
    if (adminList.length > 0 && !adminList.includes(req.user?.username)) {
      return res.status(403).json({ error: "Not authorized to view feedback." });
    }

    const feedback = await Feedback.find().sort({ createdAt: -1 }).limit(200);
    res.status(200).json(feedback);
  } catch (error) {
    console.error("❌ Error fetching feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback." });
  }
});

// GET /api/highlights - filtered highlights
app.get('/api/highlights', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { folderId, tag, articleId, q, cursor, limit = 120 } = req.query;
    const match = { userId };

    if (folderId) {
      if (folderId === 'unfiled') {
        match.folder = null;
      } else {
        match.folder = new mongoose.Types.ObjectId(folderId);
      }
    }

    if (articleId) {
      match._id = new mongoose.Types.ObjectId(articleId);
    }

    const highlightMatch = {};
    if (tag) {
      highlightMatch['highlights.tags'] = tag;
    }
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        highlightMatch['highlights.createdAt'] = { $lt: cursorDate };
      }
    }
    if (q) {
      const regex = new RegExp(q, 'i');
      highlightMatch.$or = [
        { 'highlights.text': regex },
        { 'highlights.note': regex },
        { 'highlights.tags': regex },
        { title: regex }
      ];
    }

    const pipeline = [
      { $match: match },
      { $unwind: '$highlights' }
    ];

    if (Object.keys(highlightMatch).length > 0) {
      pipeline.push({ $match: highlightMatch });
    }

    pipeline.push(
      { $sort: { 'highlights.createdAt': -1 } },
      { $limit: Math.min(Number(limit) || 120, 200) },
      { $project: {
        _id: '$highlights._id',
        articleId: '$_id',
        articleTitle: '$title',
        text: '$highlights.text',
        note: '$highlights.note',
        tags: '$highlights.tags',
        type: '$highlights.type',
        claimId: '$highlights.claimId',
        createdAt: '$highlights.createdAt'
      } }
    );

    const highlights = await Article.aggregate(pipeline);
    res.status(200).json(highlights);
  } catch (error) {
    console.error("❌ Error fetching highlights:", error);
    res.status(500).json({ error: "Failed to fetch highlights." });
  }
});

// GET /api/highlights/organize/claims - searchable claim highlights for linking evidence
app.get('/api/highlights/organize/claims', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const queryText = String(req.query.q || '').trim();
    const pipeline = [
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.type': 'claim' } }
    ];
    if (queryText) {
      const regex = new RegExp(queryText, 'i');
      pipeline.push({
        $match: {
          $or: [
            { 'highlights.text': regex },
            { 'highlights.tags': regex },
            { title: regex }
          ]
        }
      });
    }
    pipeline.push(
      { $sort: { 'highlights.createdAt': -1 } },
      { $limit: 30 },
      {
        $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          tags: '$highlights.tags',
          createdAt: '$highlights.createdAt'
        }
      }
    );
    const claims = await Article.aggregate(pipeline);
    res.status(200).json(claims);
  } catch (error) {
    console.error("❌ Error fetching highlight claims:", error);
    res.status(500).json({ error: 'Failed to fetch claims.' });
  }
});

// PATCH /api/highlights/:id/organize - update highlight type/tags/claim linkage
app.patch('/api/highlights/:id/organize', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const highlightId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(highlightId)) {
      return res.status(400).json({ error: 'Invalid highlight ID format.' });
    }
    const { type, tags, claimId } = req.body || {};
    const article = await Article.findOne({ userId, 'highlights._id': new mongoose.Types.ObjectId(highlightId) });
    if (!article) {
      return res.status(404).json({ error: 'Highlight not found.' });
    }
    const highlight = article.highlights.id(highlightId);
    if (!highlight) {
      return res.status(404).json({ error: 'Highlight not found.' });
    }

    const hasType = type !== undefined;
    const nextType = hasType ? normalizeItemType(type, '') : normalizeItemType(highlight.type, 'note');
    if (hasType && !nextType) {
      return res.status(400).json({ error: 'type must be one of claim, evidence, note.' });
    }

    let nextClaimId = claimId !== undefined ? parseClaimId(claimId) : highlight.claimId;
    if (claimId !== undefined && claimId !== null && claimId !== '' && !nextClaimId) {
      return res.status(400).json({ error: 'Invalid claimId.' });
    }

    if (nextType !== 'evidence') {
      nextClaimId = null;
    }

    if (nextType === 'evidence' && nextClaimId) {
      const claimArticle = await Article.findOne({ userId, 'highlights._id': nextClaimId }).select('highlights');
      const claimHighlight = claimArticle?.highlights?.id(nextClaimId) || null;
      if (!claimHighlight || normalizeItemType(claimHighlight.type, 'note') !== 'claim') {
        return res.status(400).json({ error: 'claimId must reference one of your claim highlights.' });
      }
      if (String(claimHighlight._id) === String(highlight._id)) {
        return res.status(400).json({ error: 'An evidence highlight cannot link to itself as a claim.' });
      }
    }

    if (hasType) highlight.type = nextType;
    if (tags !== undefined) highlight.tags = normalizeTags(tags);
    highlight.claimId = nextClaimId;
    await article.save();
    enqueueHighlightEmbedding({ highlight, article });
    res.status(200).json(mapHighlightWithArticle(article, highlight));
  } catch (error) {
    console.error("❌ Error organizing highlight:", error);
    res.status(500).json({ error: 'Failed to organize highlight.' });
  }
});

// POST /api/highlights/:id/link-claim - link evidence highlight to claim highlight
app.post('/api/highlights/:id/link-claim', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const highlightId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(highlightId)) {
      return res.status(400).json({ error: 'Invalid highlight ID format.' });
    }
    const claimObjectId = parseClaimId(req.body?.claimId);
    if (!claimObjectId) {
      return res.status(400).json({ error: 'claimId is required.' });
    }

    const evidenceArticle = await Article.findOne({ userId, 'highlights._id': new mongoose.Types.ObjectId(highlightId) });
    if (!evidenceArticle) {
      return res.status(404).json({ error: 'Highlight not found.' });
    }
    const evidenceHighlight = evidenceArticle.highlights.id(highlightId);

    const claimArticle = await Article.findOne({ userId, 'highlights._id': claimObjectId });
    const claimHighlight = claimArticle?.highlights?.id(claimObjectId) || null;
    if (!claimHighlight || normalizeItemType(claimHighlight.type, 'note') !== 'claim') {
      return res.status(400).json({ error: 'claimId must reference one of your claim highlights.' });
    }
    if (String(claimHighlight._id) === String(evidenceHighlight._id)) {
      return res.status(400).json({ error: 'An evidence highlight cannot link to itself as a claim.' });
    }

    evidenceHighlight.type = 'evidence';
    evidenceHighlight.claimId = claimHighlight._id;
    await evidenceArticle.save();
    enqueueHighlightEmbedding({ highlight: evidenceHighlight, article: evidenceArticle });
    res.status(200).json(mapHighlightWithArticle(evidenceArticle, evidenceHighlight));
  } catch (error) {
    console.error("❌ Error linking highlight evidence to claim:", error);
    res.status(500).json({ error: 'Failed to link evidence to claim.' });
  }
});

// GET /api/highlights/:id/claim - fetch claim highlight plus linked evidence highlights
app.get('/api/highlights/:id/claim', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const claimId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(claimId)) {
      return res.status(400).json({ error: 'Invalid highlight ID format.' });
    }
    const claimObjectId = new mongoose.Types.ObjectId(claimId);

    const claimRows = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      {
        $match: {
          'highlights._id': claimObjectId,
          'highlights.type': 'claim'
        }
      },
      {
        $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          type: '$highlights.type',
          claimId: '$highlights.claimId',
          createdAt: '$highlights.createdAt'
        }
      }
    ]);
    const claim = claimRows[0];
    if (!claim) {
      return res.status(404).json({ error: 'Claim highlight not found.' });
    }

    const evidence = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      {
        $match: {
          'highlights.type': 'evidence',
          'highlights.claimId': claimObjectId
        }
      },
      { $sort: { 'highlights.createdAt': -1 } },
      {
        $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          type: '$highlights.type',
          claimId: '$highlights.claimId',
          createdAt: '$highlights.createdAt'
        }
      }
    ]);

    res.status(200).json({ claim, evidence });
  } catch (error) {
    console.error("❌ Error fetching claim evidence:", error);
    res.status(500).json({ error: 'Failed to fetch claim evidence.' });
  }
});

const buildSnippet = (text = '', limit = 180) => {
  const clean = stripHtml(text || '');
  if (!clean) return '';
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).trim()}…`;
};

const parseEmbeddingId = (value = '') => {
  const parts = String(value || '').split(':');
  if (parts.length < 3) return {};
  return {
    userId: parts[0],
    objectType: parts[1],
    objectId: parts[2],
    subId: parts[3] || ''
  };
};

const hydrateSemanticResults = async ({ matches = [], userId }) => {
  const safeUserId = String(userId || '');
  const hydrated = await Promise.all(matches.map(async (item) => {
    const meta = item?.metadata || {};
    const parsed = parseEmbeddingId(item?.id || '');
    const rawType = meta.objectType || item.objectType || parsed.objectType || '';
    const objectType = rawType || 'other';
    const objectId = meta.objectId || item.objectId || parsed.objectId || '';
    const blockId = meta.subId || parsed.subId || '';
    const score = item?.score ?? null;
    const base = {
      objectType: objectType === 'notebook_block' ? 'notebook' : objectType,
      objectId: String(objectId || ''),
      score,
      metadata: { ...meta }
    };

    if (objectType === 'article') {
      const article = await Article.findOne({ _id: objectId, userId: safeUserId })
        .select('title content updatedAt');
      if (!article) return null;
      return {
        ...base,
        title: article.title || 'Untitled article',
        snippet: buildSnippet(article.content || ''),
        metadata: { ...base.metadata, updatedAt: article.updatedAt }
      };
    }

    if (objectType === 'highlight') {
      const highlight = await findHighlightById(safeUserId, objectId);
      if (!highlight) return null;
      return {
        ...base,
        title: highlight.text || 'Highlight',
        snippet: highlight.articleTitle || '',
        metadata: {
          ...base.metadata,
          articleId: highlight.articleId,
          articleTitle: highlight.articleTitle,
          tags: highlight.tags || [],
          createdAt: highlight.createdAt
        }
      };
    }

    if (objectType === 'notebook_block') {
      const entry = await NotebookEntry.findOne({ _id: objectId, userId: safeUserId })
        .select('title blocks updatedAt');
      if (!entry) return null;
      const block = entry.blocks?.find((b) => String(b.id) === String(blockId));
      const snippet = item?.document || block?.text || '';
      return {
        ...base,
        title: entry.title || 'Untitled note',
        snippet: buildSnippet(snippet),
        metadata: { ...base.metadata, blockId }
      };
    }

    if (objectType === 'concept') {
      const conceptQuery = mongoose.Types.ObjectId.isValid(objectId)
        ? { _id: objectId, userId: safeUserId }
        : { name: objectId, userId: safeUserId };
      const concept = await TagMeta.findOne(conceptQuery)
        .select('name description updatedAt');
      if (!concept) return null;
      return {
        ...base,
        title: concept.name || 'Concept',
        snippet: buildSnippet(concept.description || ''),
        metadata: { ...base.metadata, name: concept.name }
      };
    }

    if (objectType === 'question') {
      const question = await Question.findOne({ _id: objectId, userId: safeUserId })
        .select('text conceptName linkedTagName updatedAt');
      if (!question) return null;
      return {
        ...base,
        title: question.text || 'Question',
        snippet: question.conceptName || question.linkedTagName || '',
        metadata: { ...base.metadata }
      };
    }

    return null;
  }));

  return hydrated.filter(Boolean);
};

const SEARCH_SCOPE_VALUES = new Set(['all', 'articles', 'highlights', 'notebook']);
const SEARCH_TYPE_VALUES = new Set(['article', 'highlight', 'notebook', 'note', 'claim', 'evidence']);
const SEARCH_ENTRY_TYPE_VALUES = new Set(['note', 'claim', 'evidence']);

const normalizeSearchScope = (value) => {
  const candidate = String(value || 'all').trim().toLowerCase();
  if (SEARCH_SCOPE_VALUES.has(candidate)) return candidate;
  return 'all';
};

const normalizeSearchTypeFilters = (value) => (
  parseCsvList(value)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => SEARCH_TYPE_VALUES.has(item))
);

const normalizeSearchTagFilters = (value) => (
  parseCsvList(value)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 10)
);

const normalizeEntryTypeFilters = (types = []) => {
  const entryTypes = types.filter(type => SEARCH_ENTRY_TYPE_VALUES.has(type));
  return Array.from(new Set(entryTypes));
};

const hasRequestedType = (typeSet, candidates = []) => (
  typeSet.size === 0 || candidates.some(candidate => typeSet.has(candidate))
);

const toCaseInsensitiveTagRegexes = (tags = []) => (
  tags
    .map(tag => String(tag || '').trim())
    .filter(Boolean)
    .map(tag => new RegExp(`^${escapeRegExp(tag)}$`, 'i'))
);

const toSafeObjectId = (value) => (
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null
);

const resolveNotebookSnippet = (entry) => {
  const blockText = Array.isArray(entry?.blocks)
    ? (entry.blocks.find(block => String(block?.text || '').trim())?.text || '')
    : '';
  return buildQueueSnippet(entry?.content || '', blockText, entry?.title || '');
};

const RELATED_REASON_SCORES = Object.freeze({
  connection: 5,
  tag: 3,
  coview: 2
});

const normalizeRelatedLimit = (value, fallback = 8) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), 20);
};

const buildRelatedKey = (itemType, itemId) => `${itemType}:${itemId}`;

const scoreRelatedCandidate = (candidateMap, itemType, itemId, reason, score = 1) => {
  const safeType = normalizeConnectionItemType(itemType);
  const safeId = String(itemId || '').trim();
  if (!safeType || !safeId) return;
  const key = buildRelatedKey(safeType, safeId);
  const existing = candidateMap.get(key);
  const reasonScore = Number(score) || 0;
  if (!existing) {
    candidateMap.set(key, {
      itemType: safeType,
      itemId: safeId,
      score: reasonScore,
      reasons: new Set([reason])
    });
    return;
  }
  existing.score += reasonScore;
  existing.reasons.add(reason);
};

const normalizeTagValues = (tags = []) => {
  const set = new Set();
  (Array.isArray(tags) ? tags : []).forEach(tag => {
    const value = String(tag || '').trim();
    if (!value) return;
    set.add(value.toLowerCase());
  });
  return Array.from(set);
};

const computeTagOverlapScore = (sourceTagSet, targetTags = []) => {
  if (!sourceTagSet.size) return 0;
  const overlap = normalizeTagValues(targetTags).reduce((count, tag) => (
    sourceTagSet.has(tag) ? count + 1 : count
  ), 0);
  return overlap;
};

const resolveItemTagSignals = async (userId, itemType, itemId) => {
  const safeType = normalizeConnectionItemType(itemType);
  const safeId = String(itemId || '').trim();
  if (!safeType || !safeId) return [];

  if (safeType === 'highlight') {
    const highlight = await findHighlightById(userId, safeId);
    return normalizeTagValues(highlight?.tags || []);
  }
  if (safeType === 'notebook') {
    if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
    const note = await NotebookEntry.findOne({ _id: safeId, userId })
      .select('tags')
      .lean();
    return normalizeTagValues(note?.tags || []);
  }
  if (safeType === 'concept') {
    if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
    const concept = await TagMeta.findOne({ _id: safeId, userId })
      .select('name')
      .lean();
    return concept?.name ? normalizeTagValues([concept.name]) : [];
  }
  if (safeType === 'question') {
    if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
    const question = await Question.findOne({ _id: safeId, userId })
      .select('linkedTagName conceptName')
      .lean();
    return normalizeTagValues([question?.linkedTagName, question?.conceptName]);
  }
  if (safeType === 'article') {
    if (!mongoose.Types.ObjectId.isValid(safeId)) return [];
    const article = await Article.findOne({ _id: safeId, userId })
      .select('highlights.tags')
      .lean();
    const tags = [];
    (article?.highlights || []).forEach(highlight => {
      (highlight?.tags || []).forEach(tag => tags.push(tag));
    });
    return normalizeTagValues(tags).slice(0, 20);
  }
  return [];
};

const collectTagRelatedCandidates = async (userId, sourceType, sourceId, sourceTags = [], candidateMap) => {
  if (!sourceTags.length) return;
  const sourceTagSet = new Set(sourceTags);
  const tagRegexes = toCaseInsensitiveTagRegexes(sourceTags);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [highlightRows, notebookRows, conceptRows, questionRows, articleRows] = await Promise.all([
    Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': { $in: tagRegexes } } },
      {
        $project: {
          _id: '$highlights._id',
          tags: '$highlights.tags'
        }
      },
      { $sort: { 'highlights.createdAt': -1 } },
      { $limit: 120 }
    ]),
    NotebookEntry.find({ userId, tags: { $in: tagRegexes } })
      .select('_id tags updatedAt')
      .sort({ updatedAt: -1 })
      .limit(120)
      .lean(),
    TagMeta.find({ userId, name: { $in: tagRegexes } })
      .select('_id name updatedAt')
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean(),
    Question.find({
      userId,
      $or: [{ linkedTagName: { $in: tagRegexes } }, { conceptName: { $in: tagRegexes } }]
    })
      .select('_id linkedTagName conceptName updatedAt')
      .sort({ updatedAt: -1 })
      .limit(60)
      .lean(),
    Article.find({ userId, 'highlights.tags': { $in: tagRegexes } })
      .select('_id highlights.tags updatedAt')
      .sort({ updatedAt: -1 })
      .limit(60)
      .lean()
  ]);

  highlightRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'highlight' && itemId === sourceId) return;
    const overlap = computeTagOverlapScore(sourceTagSet, row?.tags || []);
    scoreRelatedCandidate(
      candidateMap,
      'highlight',
      itemId,
      'tag',
      RELATED_REASON_SCORES.tag + overlap
    );
  });

  notebookRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'notebook' && itemId === sourceId) return;
    const overlap = computeTagOverlapScore(sourceTagSet, row?.tags || []);
    scoreRelatedCandidate(
      candidateMap,
      'notebook',
      itemId,
      'tag',
      RELATED_REASON_SCORES.tag + overlap
    );
  });

  conceptRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'concept' && itemId === sourceId) return;
    scoreRelatedCandidate(candidateMap, 'concept', itemId, 'tag', RELATED_REASON_SCORES.tag + 1);
  });

  questionRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'question' && itemId === sourceId) return;
    const overlap = computeTagOverlapScore(sourceTagSet, [row?.linkedTagName, row?.conceptName]);
    scoreRelatedCandidate(
      candidateMap,
      'question',
      itemId,
      'tag',
      RELATED_REASON_SCORES.tag + overlap
    );
  });

  articleRows.forEach(row => {
    const itemId = String(row?._id || '');
    if (sourceType === 'article' && itemId === sourceId) return;
    const articleTags = [];
    (row?.highlights || []).forEach(highlight => {
      (highlight?.tags || []).forEach(tag => articleTags.push(tag));
    });
    const overlap = computeTagOverlapScore(sourceTagSet, articleTags);
    scoreRelatedCandidate(
      candidateMap,
      'article',
      itemId,
      'tag',
      RELATED_REASON_SCORES.tag + overlap
    );
  });
};

const collectConnectionRelatedCandidates = async (userId, sourceType, sourceId, candidateMap) => {
  const connections = await Connection.find({
    userId,
    $or: [
      { fromType: sourceType, fromId: sourceId },
      { toType: sourceType, toId: sourceId }
    ]
  })
    .select('fromType fromId toType toId relationType')
    .sort({ createdAt: -1 })
    .limit(160)
    .lean();

  connections.forEach(connection => {
    const pointsFromSource = connection.fromType === sourceType && connection.fromId === sourceId;
    const itemType = pointsFromSource ? connection.toType : connection.fromType;
    const itemId = pointsFromSource ? connection.toId : connection.fromId;
    if (!itemType || !itemId) return;
    scoreRelatedCandidate(
      candidateMap,
      itemType,
      itemId,
      'connection',
      RELATED_REASON_SCORES.connection
    );
  });
};

const collectCoViewCandidates = async (userId, sourceType, sourceId, candidateMap) => {
  const lookbackStart = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const rows = await ItemViewEvent.find({
    userId,
    createdAt: { $gte: lookbackStart },
    $or: [
      { itemType: sourceType, itemId: sourceId, previousItemType: { $ne: '' }, previousItemId: { $ne: '' } },
      { previousItemType: sourceType, previousItemId: sourceId }
    ]
  })
    .select('itemType itemId previousItemType previousItemId')
    .sort({ createdAt: -1 })
    .limit(260)
    .lean();

  rows.forEach(row => {
    const sourceIsCurrent = row.itemType === sourceType && row.itemId === sourceId;
    const candidateType = sourceIsCurrent ? row.previousItemType : row.itemType;
    const candidateId = sourceIsCurrent ? row.previousItemId : row.itemId;
    scoreRelatedCandidate(candidateMap, candidateType, candidateId, 'coview', RELATED_REASON_SCORES.coview);
  });
};

const hydrateRelatedCandidates = async (userId, candidateMap, limit = 8) => {
  const idsByType = {
    highlight: new Set(),
    notebook: new Set(),
    article: new Set(),
    concept: new Set(),
    question: new Set()
  };
  candidateMap.forEach(candidate => {
    addToCandidateSet(idsByType[candidate.itemType], candidate.itemId);
  });
  const nodeMap = await buildGraphNodeMap(userId, idsByType);

  const hydrated = [];
  candidateMap.forEach((candidate, key) => {
    const nodeKey = buildGraphNodeKey(candidate.itemType, candidate.itemId);
    const node = nodeMap.get(nodeKey);
    if (!node) return;
    hydrated.push({
      id: key,
      itemType: candidate.itemType,
      itemId: candidate.itemId,
      title: node.title || 'Untitled',
      snippet: node.snippet || '',
      tags: Array.isArray(node.tags) ? node.tags : [],
      updatedAt: node.updatedAt || null,
      openPath: node.openPath || '',
      score: candidate.score,
      reasons: Array.from(candidate.reasons)
    });
  });

  return hydrated
    .sort((a, b) => (
      (b.score - a.score) ||
      (new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    ))
    .slice(0, limit);
};

// GET /api/search?q= - full-text + filtered retrieval
app.get('/api/search', authenticateToken, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: "Query parameter q is required." });
    }
    const userId = req.user.id;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const scope = normalizeSearchScope(req.query.scope);
    const requestedTypes = new Set(normalizeSearchTypeFilters(req.query.type));
    const entryTypeFilters = normalizeEntryTypeFilters(Array.from(requestedTypes));
    const tagFilters = normalizeSearchTagFilters(req.query.tags);
    const tagRegexes = toCaseInsensitiveTagRegexes(tagFilters);
    const notebookId = String(req.query.notebookId || req.query.notebook || '').trim();
    const notebookObjectId = toSafeObjectId(notebookId);
    const queryRegex = new RegExp(escapeRegExp(q), 'i');

    const includeArticles = (scope === 'all' || scope === 'articles')
      && hasRequestedType(requestedTypes, ['article']);
    const includeHighlights = (scope === 'all' || scope === 'highlights')
      && hasRequestedType(requestedTypes, ['highlight', 'note', 'claim', 'evidence']);
    const includeNotebook = (scope === 'all' || scope === 'notebook')
      && hasRequestedType(requestedTypes, ['notebook', 'note', 'claim', 'evidence']);

    const highlightTypeFilters = entryTypeFilters.length > 0 ? entryTypeFilters : [];
    const notebookTypeFilters = entryTypeFilters.length > 0 ? entryTypeFilters : [];

    const [articleRows, highlightRows, notebookRows] = await Promise.all([
      includeArticles
        ? Article.aggregate([
            { $match: { userId: userObjectId } },
            ...(tagRegexes.length > 0 ? [{ $match: { 'highlights.tags': { $in: tagRegexes } } }] : []),
            { $match: { $text: { $search: q } } },
            { $addFields: { _score: { $meta: 'textScore' } } },
            { $sort: { _score: -1, updatedAt: -1 } },
            { $limit: 40 },
            { $project: { title: 1, content: 1, url: 1, updatedAt: 1, _score: 1 } }
          ])
        : Promise.resolve([]),
      includeHighlights
        ? Article.aggregate([
            { $match: { userId: userObjectId } },
            ...(tagRegexes.length > 0 ? [{ $match: { 'highlights.tags': { $in: tagRegexes } } }] : []),
            { $match: { $text: { $search: q } } },
            { $addFields: { _score: { $meta: 'textScore' } } },
            { $project: { title: 1, highlights: 1, _score: 1 } },
            { $unwind: '$highlights' },
            ...(tagRegexes.length > 0 ? [{ $match: { 'highlights.tags': { $in: tagRegexes } } }] : []),
            ...(highlightTypeFilters.length > 0 ? [{ $match: { 'highlights.type': { $in: highlightTypeFilters } } }] : []),
            {
              $match: {
                $or: [
                  { 'highlights.text': queryRegex },
                  { 'highlights.note': queryRegex },
                  { 'highlights.tags': queryRegex },
                  { title: queryRegex }
                ]
              }
            },
            {
              $project: {
                _id: '$highlights._id',
                articleId: '$_id',
                articleTitle: '$title',
                text: '$highlights.text',
                note: '$highlights.note',
                tags: '$highlights.tags',
                type: { $ifNull: ['$highlights.type', 'note'] },
                claimId: '$highlights.claimId',
                createdAt: '$highlights.createdAt',
                _score: 1
              }
            },
            { $sort: { _score: -1, createdAt: -1 } },
            { $limit: 120 }
          ])
        : Promise.resolve([]),
      includeNotebook
        ? NotebookEntry.aggregate([
            {
              $match: {
                userId: userObjectId,
                ...(notebookId ? { _id: notebookObjectId || new mongoose.Types.ObjectId() } : {})
              }
            },
            ...(tagRegexes.length > 0 ? [{ $match: { tags: { $in: tagRegexes } } }] : []),
            { $match: { $text: { $search: q } } },
            { $addFields: { _score: { $meta: 'textScore' } } },
            ...(notebookTypeFilters.length > 0 ? [{ $match: { type: { $in: notebookTypeFilters } } }] : []),
            { $sort: { _score: -1, updatedAt: -1 } },
            { $limit: 80 },
            { $project: { title: 1, content: 1, blocks: 1, tags: 1, type: 1, updatedAt: 1, _score: 1 } }
          ])
        : Promise.resolve([])
    ]);

    let articles = (articleRows || []).map(row => ({
      _id: row._id,
      title: row.title || 'Untitled article',
      content: buildQueueSnippet(row.content || '', row.title || ''),
      url: row.url || '',
      updatedAt: row.updatedAt || null,
      score: row._score || 0
    }));

    let highlights = (highlightRows || []).map(row => ({
      _id: row._id,
      articleId: row.articleId,
      articleTitle: row.articleTitle || 'Untitled article',
      text: row.text || '',
      note: row.note || '',
      tags: Array.isArray(row.tags) ? row.tags : [],
      type: normalizeItemType(row.type, 'note'),
      claimId: row.claimId || null,
      createdAt: row.createdAt || null,
      score: row._score || 0
    }));

    let notebook = (notebookRows || []).map(entry => ({
      _id: entry._id,
      title: entry.title || 'Untitled note',
      content: resolveNotebookSnippet(entry),
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      type: normalizeItemType(entry.type, 'note'),
      updatedAt: entry.updatedAt || null,
      score: entry._score || 0
    }));

    // Regex fallback keeps retrieval resilient for very small datasets or stop-word-only text queries.
    if (articles.length === 0 && includeArticles) {
      const articleFallback = await Article.find({
        userId,
        $or: [{ title: queryRegex }, { content: queryRegex }]
      })
        .select('title content url updatedAt')
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean();
      articles = articleFallback.map(row => ({
        _id: row._id,
        title: row.title || 'Untitled article',
        content: buildQueueSnippet(row.content || '', row.title || ''),
        url: row.url || '',
        updatedAt: row.updatedAt || null,
        score: 0
      }));
    }

    if (highlights.length === 0 && includeHighlights) {
      const highlightFallback = await Article.aggregate([
        { $match: { userId: userObjectId } },
        { $unwind: '$highlights' },
        ...(tagRegexes.length > 0 ? [{ $match: { 'highlights.tags': { $in: tagRegexes } } }] : []),
        ...(highlightTypeFilters.length > 0 ? [{ $match: { 'highlights.type': { $in: highlightTypeFilters } } }] : []),
        {
          $match: {
            $or: [
              { 'highlights.text': queryRegex },
              { 'highlights.note': queryRegex },
              { 'highlights.tags': queryRegex },
              { title: queryRegex }
            ]
          }
        },
        {
          $project: {
            _id: '$highlights._id',
            articleId: '$_id',
            articleTitle: '$title',
            text: '$highlights.text',
            note: '$highlights.note',
            tags: '$highlights.tags',
            type: { $ifNull: ['$highlights.type', 'note'] },
            claimId: '$highlights.claimId',
            createdAt: '$highlights.createdAt'
          }
        },
        { $sort: { createdAt: -1 } },
        { $limit: 80 }
      ]);
      highlights = highlightFallback.map(row => ({
        _id: row._id,
        articleId: row.articleId,
        articleTitle: row.articleTitle || 'Untitled article',
        text: row.text || '',
        note: row.note || '',
        tags: Array.isArray(row.tags) ? row.tags : [],
        type: normalizeItemType(row.type, 'note'),
        claimId: row.claimId || null,
        createdAt: row.createdAt || null,
        score: 0
      }));
    }

    if (notebook.length === 0 && includeNotebook) {
      const notebookFallback = await NotebookEntry.find({
        userId,
        ...(notebookId ? { _id: notebookObjectId || new mongoose.Types.ObjectId() } : {}),
        ...(notebookTypeFilters.length > 0 ? { type: { $in: notebookTypeFilters } } : {}),
        ...(tagRegexes.length > 0 ? { tags: { $in: tagRegexes } } : {}),
        $or: [
          { title: queryRegex },
          { content: queryRegex },
          { 'blocks.text': queryRegex },
          { tags: queryRegex }
        ]
      })
        .select('title content blocks tags type updatedAt')
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean();
      notebook = notebookFallback.map(entry => ({
        _id: entry._id,
        title: entry.title || 'Untitled note',
        content: resolveNotebookSnippet(entry),
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        type: normalizeItemType(entry.type, 'note'),
        updatedAt: entry.updatedAt || null,
        score: 0
      }));
    }

    const notes = [
      ...notebook.filter(item => item.type === 'note').map(item => ({
        ...item,
        sourceType: 'notebook',
        openPath: `/think?tab=notebook&entryId=${item._id}`
      }))
    ];

    const claimResults = [
      ...highlights.filter(item => item.type === 'claim').map(item => ({
        ...item,
        sourceType: 'highlight',
        openPath: `/articles/${item.articleId}`
      })),
      ...notebook.filter(item => item.type === 'claim').map(item => ({
        ...item,
        sourceType: 'notebook',
        openPath: `/think?tab=notebook&entryId=${item._id}`
      }))
    ].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));

    const evidenceResults = [
      ...highlights.filter(item => item.type === 'evidence').map(item => ({
        ...item,
        sourceType: 'highlight',
        openPath: `/articles/${item.articleId}`
      })),
      ...notebook.filter(item => item.type === 'evidence').map(item => ({
        ...item,
        sourceType: 'notebook',
        openPath: `/think?tab=notebook&entryId=${item._id}`
      }))
    ].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));

    const highlightGroup = highlights
      .filter(item => item.type === 'note')
      .map(item => ({
        ...item,
        sourceType: 'highlight',
        openPath: `/articles/${item.articleId}`
      }));

    res.status(200).json({
      query: q,
      filters: {
        scope,
        tags: tagFilters,
        type: Array.from(requestedTypes),
        notebookId: notebookObjectId ? String(notebookObjectId) : ''
      },
      articles,
      highlights,
      notebook,
      groups: {
        notes: notes.slice(0, 40),
        highlights: highlightGroup.slice(0, 40),
        claims: claimResults.slice(0, 40),
        evidence: evidenceResults.slice(0, 40)
      }
    });
  } catch (error) {
    console.error("❌ Error performing search:", error);
    res.status(500).json({ error: "Failed to perform search." });
  }
});

app.post('/api/retrieval/view', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const itemType = normalizeConnectionItemType(req.body?.itemType);
    const itemId = String(req.body?.itemId || '').trim();
    if (!itemType || !itemId) {
      return res.status(400).json({ error: 'itemType and itemId are required.' });
    }

    const currentItem = await resolveConnectionItem(userId, itemType, itemId);
    if (!currentItem) {
      return res.status(404).json({ error: 'Item not found for this user.' });
    }

    const previousItemType = normalizeConnectionItemType(req.body?.previousItemType);
    const previousItemId = String(req.body?.previousItemId || '').trim();
    let safePreviousType = '';
    let safePreviousId = '';
    if (previousItemType && previousItemId && !(previousItemType === itemType && previousItemId === itemId)) {
      const previousItem = await resolveConnectionItem(userId, previousItemType, previousItemId);
      if (previousItem) {
        safePreviousType = previousItemType;
        safePreviousId = previousItemId;
      }
    }

    await ItemViewEvent.create({
      itemType,
      itemId,
      previousItemType: safePreviousType,
      previousItemId: safePreviousId,
      userId
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('❌ Error recording retrieval view:', error);
    res.status(500).json({ error: 'Failed to record item view.' });
  }
});

app.get('/api/retrieval/related', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const itemType = normalizeConnectionItemType(req.query.itemType);
    const itemId = String(req.query.itemId || '').trim();
    const limit = normalizeRelatedLimit(req.query.limit, 8);
    if (!itemType || !itemId) {
      return res.status(400).json({ error: 'itemType and itemId are required.' });
    }

    const item = await resolveConnectionItem(userId, itemType, itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found for this user.' });
    }

    const candidateMap = new Map();
    const sourceTags = await resolveItemTagSignals(userId, itemType, itemId);
    await Promise.all([
      collectConnectionRelatedCandidates(userId, itemType, itemId, candidateMap),
      collectTagRelatedCandidates(userId, itemType, itemId, sourceTags, candidateMap),
      collectCoViewCandidates(userId, itemType, itemId, candidateMap)
    ]);
    candidateMap.delete(buildRelatedKey(itemType, itemId));
    const items = await hydrateRelatedCandidates(userId, candidateMap, limit);

    res.status(200).json({
      itemType,
      itemId,
      tags: sourceTags,
      items
    });
  } catch (error) {
    console.error('❌ Error fetching retrieval related items:', error);
    res.status(500).json({ error: 'Failed to fetch related items.' });
  }
});

const normalizeSearchTypes = (types) => {
  if (!Array.isArray(types)) return undefined;
  return types
    .map((type) => String(type || '').trim())
    .filter(Boolean)
    .map((type) => {
      if (type === 'notebook' || type === 'notebook_entry') return 'notebook_block';
      return type;
    });
};

const normalizeRelatedTypes = (types) => normalizeSearchTypes(types);

const fetchSimilarEmbeddings = async ({ userId, sourceId, types, limit, requestId }) => {
  const response = await aiSimilarTo({
    userId: String(userId),
    sourceId: String(sourceId),
    types,
    limit
  }, { requestId });
  return Array.isArray(response?.results) ? response.results : [];
};

const filterOutIds = (items, type, ids) => {
  if (!ids || ids.size === 0) return items;
  return items.filter(item => {
    if (item.objectType !== type) return true;
    return !ids.has(String(item.objectId));
  });
};

const buildRangeStart = (range) => {
  const mapping = { '7d': 7, '30d': 30, '90d': 90 };
  const days = mapping[range] || 7;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
};

const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const stopWords = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you',
  'are', 'was', 'were', 'have', 'has', 'had', 'but', 'not', 'about', 'what',
  'when', 'where', 'who', 'why', 'how', 'can', 'could', 'should', 'would',
  'their', 'they', 'them', 'then', 'than', 'these', 'those', 'its', 'it', 'in',
  'on', 'of', 'to', 'a', 'an', 'as', 'is', 'be', 'by', 'or', 'we', 'our'
]);

const labelCluster = (highlights) => {
  const tagCounts = new Map();
  highlights.forEach(item => {
    (item.tags || []).forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  if (tagCounts.size > 0) {
    return Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }
  const wordCounts = new Map();
  highlights.forEach(item => {
    const words = stripHtml(item.text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
  });
  if (wordCounts.size === 0) return 'Highlights';
  return Array.from(wordCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
};

const getObjectIdFromEmbedding = (item) => {
  if (item?.metadata?.objectId) return String(item.metadata.objectId);
  const parsed = parseEmbeddingId(item?.id || '');
  return parsed.objectId ? String(parsed.objectId) : '';
};

const sentimentScore = (text = '') => {
  const positive = ['growth', 'improve', 'benefit', 'win', 'success', 'good', 'great', 'strong', 'positive'];
  const negative = ['risk', 'problem', 'failure', 'bad', 'weak', 'negative', 'loss', 'decline', 'conflict'];
  const lower = stripHtml(text).toLowerCase();
  let score = 0;
  positive.forEach(word => {
    if (lower.includes(word)) score += 1;
  });
  negative.forEach(word => {
    if (lower.includes(word)) score -= 1;
  });
  return score;
};

const extractQuestions = (texts = []) => {
  const questions = new Set();
  texts.forEach(text => {
    const clean = stripHtml(text || '');
    const parts = clean.split(/(?<=[?.!])\s+/);
    parts.forEach(part => {
      const trimmed = part.trim();
      if (!trimmed) return;
      if (trimmed.endsWith('?')) {
        questions.add(trimmed);
        return;
      }
      if (/^(why|how|what|where|when|who)\b/i.test(trimmed)) {
        questions.add(trimmed.endsWith('?') ? trimmed : `${trimmed}?`);
      }
    });
  });
  return Array.from(questions).slice(0, 10);
};

const { parseAiServiceUrl, normalizeAiServiceOrigin, joinUrl } = require('./utils/aiUpstream');

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const truncateText = (text, limit) => (
  text.length > limit ? text.slice(0, limit) : text
);

const applySynthesisLimits = (items = [], limits = {}) => {
  const maxItems = toPositiveInt(limits.maxItems, 60);
  const maxTotalChars = toPositiveInt(limits.maxTotalChars, 25000);
  const maxItemChars = toPositiveInt(limits.maxItemChars, 1200);
  const prepared = items
    .map(item => ({
      ...item,
      text: truncateText(String(item.text || ''), maxItemChars)
    }))
    .filter(item => item.text);

  const recencyValue = (item) => {
    if (typeof item.createdAt === 'number' && !Number.isNaN(item.createdAt)) {
      return item.createdAt;
    }
    if (typeof item.order === 'number' && !Number.isNaN(item.order)) {
      return item.order;
    }
    return 0;
  };

  const byRecency = [...prepared].sort((a, b) => {
    const aValue = recencyValue(a);
    const bValue = recencyValue(b);
    if (aValue === bValue) {
      return (b.order || 0) - (a.order || 0);
    }
    return bValue - aValue;
  });

  const cappedByTotal = [];
  let totalChars = 0;
  for (const item of byRecency) {
    let text = item.text;
    if (text.length > maxTotalChars) {
      text = text.slice(0, maxTotalChars);
    }
    if (totalChars + text.length > maxTotalChars) {
      continue;
    }
    totalChars += text.length;
    cappedByTotal.push({ ...item, text });
    if (totalChars >= maxTotalChars) break;
  }

  let capped = cappedByTotal;
  if (capped.length > maxItems) {
    capped = capped.slice(0, maxItems);
  }

  const stats = {
    item_count: capped.length,
    total_chars: capped.reduce((sum, item) => sum + item.text.length, 0),
    max_item_chars: capped.reduce((max, item) => Math.max(max, item.text.length), 0)
  };

  return { items: capped, stats, limits: { maxItems, maxTotalChars, maxItemChars } };
};

const fetchHighlightsByIds = async (userId, highlightIds) => {
  const ids = (highlightIds || [])
    .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null)
    .filter(Boolean);
  if (!ids.length) return [];
  const results = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': { $in: ids } } },
    { $project: {
      _id: '$highlights._id',
      text: '$highlights.text',
      note: '$highlights.note',
      tags: '$highlights.tags',
      articleId: '$_id',
      articleTitle: '$title',
      createdAt: '$highlights.createdAt'
    } }
  ]);
  return results;
};

const kMeans = (vectors, k, maxIterations = 12) => {
  const count = vectors.length;
  const dims = vectors[0]?.length || 0;
  const centroids = [];
  const used = new Set();
  while (centroids.length < k && centroids.length < count) {
    const idx = Math.floor(Math.random() * count);
    if (used.has(idx)) continue;
    used.add(idx);
    centroids.push([...vectors[idx]]);
  }
  const assignments = new Array(count).fill(0);
  for (let iter = 0; iter < maxIterations; iter += 1) {
    let changed = false;
    for (let i = 0; i < count; i += 1) {
      let bestIdx = 0;
      let bestScore = -Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const score = cosineSimilarity(vectors[i], centroids[c]);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = c;
        }
      }
      if (assignments[i] !== bestIdx) {
        assignments[i] = bestIdx;
        changed = true;
      }
    }
    const sums = Array.from({ length: centroids.length }, () => new Array(dims).fill(0));
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < count; i += 1) {
      const cluster = assignments[i];
      counts[cluster] += 1;
      for (let d = 0; d < dims; d += 1) {
        sums[cluster][d] += vectors[i][d];
      }
    }
    for (let c = 0; c < centroids.length; c += 1) {
      if (!counts[c]) continue;
      for (let d = 0; d < dims; d += 1) {
        centroids[c][d] = sums[c][d] / counts[c];
      }
    }
    if (!changed) break;
  }
  return { centroids, assignments };
};

const handleSemanticSearch = async (req, res, query, rawTypes, rawLimit) => {
  if (!isAiEnabled()) {
    return res.status(503).json({ error: 'AI_DISABLED', hint: 'Set AI_ENABLED=true to enable AI search.' });
  }
  const q = String(query || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Query is required.' });
  }
  const limit = Math.min(Number(rawLimit) || 12, 30);
  const types = normalizeSearchTypes(rawTypes);
  try {
    const response = await aiSemanticSearch({
      userId: String(req.user.id),
      query: q,
      types,
      limit
    }, { requestId: req.requestId });
    const matches = Array.isArray(response?.results) ? response.results : [];
    const results = await hydrateSemanticResults({ matches, userId: req.user.id });
    res.status(200).json({ results });
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
};

// GET /api/search/semantic?q=
app.get('/api/search/semantic', authenticateToken, async (req, res) => {
  await handleSemanticSearch(req, res, req.query.q, req.query.types, req.query.limit);
});

// POST /api/search/semantic
app.post('/api/search/semantic', authenticateToken, async (req, res) => {
  const { query, types, limit } = req.body || {};
  await handleSemanticSearch(req, res, query, types, limit);
});

// GET /api/tags - list unique tags with counts
app.get('/api/tags', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const tags = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $unwind: '$highlights.tags' },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]);
    res.status(200).json(tags.map(t => ({ tag: t._id, count: t.count })));
  } catch (error) {
    console.error("❌ Error fetching tags:", error);
    res.status(500).json({ error: "Failed to fetch tags." });
  }
});

// --- CONCEPT (TAG) API ROUTES ---
app.get('/api/concepts', authenticateToken, async (req, res) => {
  try {
    const data = await getConcepts(req.user.id);
    res.status(200).json(data);
  } catch (error) {
    console.error("❌ Error fetching concepts:", error);
    res.status(500).json({ error: "Failed to fetch concepts." });
  }
});

app.get('/api/concepts/:name', authenticateToken, async (req, res) => {
  try {
    const data = await getConceptMeta(req.user.id, req.params.name);
    res.status(200).json(data);
  } catch (error) {
    console.error("❌ Error fetching concept meta:", error);
    res.status(500).json({ error: "Failed to fetch concept meta." });
  }
});

app.put('/api/concepts/:name', authenticateToken, async (req, res) => {
  try {
    const updated = await updateConceptMeta(req.user.id, req.params.name, req.body || {});
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating concept meta:", error);
    res.status(500).json({ error: "Failed to update concept meta." });
  }
});

app.get('/api/concepts/:name/related', authenticateToken, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const data = await getConceptRelated(req.user.id, req.params.name, { limit, offset });
    res.status(200).json(data);
  } catch (error) {
    console.error("❌ Error fetching concept related data:", error);
    res.status(500).json({ error: "Failed to fetch concept related data." });
  }
});

const loadWorkspaceConcept = async (userId, conceptId) => {
  const concept = await resolveConceptByParam(userId, conceptId, { createIfMissing: false });
  if (!concept) return null;
  const workspace = ensureWorkspace(concept);
  const previous = JSON.stringify(concept.workspace || null);
  const normalized = JSON.stringify(workspace);
  if (previous !== normalized) {
    concept.workspace = workspace;
    concept.markModified('workspace');
    await concept.save();
  }
  return { concept, workspace };
};

app.get('/api/concepts/:conceptId/workspace', authenticateToken, async (req, res) => {
  try {
    const conceptId = String(req.params.conceptId || '').trim();
    console.log(`[WORKSPACE] GET concept=${conceptId} user=${req.user.id}`);
    const loaded = await loadWorkspaceConcept(req.user.id, conceptId);
    if (!loaded) return res.status(404).json({ error: 'Concept not found.' });
    res.status(200).json({
      conceptId: String(loaded.concept._id),
      conceptName: loaded.concept.name,
      workspace: loaded.workspace
    });
  } catch (error) {
    console.error('❌ Error loading concept workspace:', error);
    res.status(500).json({ error: 'Failed to load concept workspace.' });
  }
});

app.put('/api/concepts/:conceptId/workspace', authenticateToken, async (req, res) => {
  try {
    const conceptId = String(req.params.conceptId || '').trim();
    console.log(`[WORKSPACE] PUT concept=${conceptId} user=${req.user.id}`);
    const concept = await resolveConceptByParam(req.user.id, conceptId, { createIfMissing: false });
    if (!concept) return res.status(404).json({ error: 'Concept not found.' });

    const rawWorkspace = req.body?.workspace && typeof req.body.workspace === 'object'
      ? req.body.workspace
      : (req.body || {});
    if (rawWorkspace && typeof rawWorkspace !== 'object') {
      return res.status(400).json({ error: 'Workspace payload must be an object.' });
    }
    if (rawWorkspace.version !== undefined && Number(rawWorkspace.version) !== 1) {
      return res.status(400).json({ error: 'workspace.version must be 1.' });
    }
    try {
      validateWorkspacePayload(rawWorkspace);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message || 'Invalid workspace payload.' });
    }

    const workspace = ensureWorkspace({ workspace: rawWorkspace });
    concept.workspace = workspace;
    concept.markModified('workspace');
    await concept.save();

    res.status(200).json({
      conceptId: String(concept._id),
      conceptName: concept.name,
      workspace
    });
  } catch (error) {
    console.error('❌ Error replacing concept workspace:', error);
    res.status(500).json({ error: 'Failed to save concept workspace.' });
  }
});

app.patch('/api/concepts/:conceptId/workspace', authenticateToken, async (req, res) => {
  try {
    const conceptId = String(req.params.conceptId || '').trim();
    const opName = String(req.body?.op || '').trim();
    console.log(`[WORKSPACE] PATCH concept=${conceptId} user=${req.user.id} op=${opName || 'unknown'}`);
    const loaded = await loadWorkspaceConcept(req.user.id, conceptId);
    if (!loaded) return res.status(404).json({ error: 'Concept not found.' });

    let workspace;
    try {
      workspace = applyPatchOp(loaded.workspace, req.body || {});
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message || 'Invalid workspace patch operation.' });
    }
    const concept = loaded.concept;
    concept.workspace = workspace;
    concept.markModified('workspace');
    await concept.save();

    res.status(200).json({
      conceptId: String(concept._id),
      conceptName: concept.name,
      workspace
    });
  } catch (error) {
    console.error('❌ Error patching concept workspace:', error);
    res.status(500).json({ error: 'Failed to patch concept workspace.' });
  }
});

app.get('/api/concepts/:id/layout', authenticateToken, async (req, res) => {
  try {
    const concept = await resolveConceptByParam(req.user.id, req.params.id, { createIfMissing: true });
    if (!concept) return res.status(404).json({ error: 'Concept not found.' });

    const hadLayout = concept?.conceptLayout && typeof concept.conceptLayout === 'object';
    const layout = normalizeConceptLayout(concept?.conceptLayout || {});
    if (!hadLayout) {
      concept.conceptLayout = layout;
      concept.markModified('conceptLayout');
      await concept.save();
    }

    res.status(200).json({
      conceptId: String(concept._id),
      conceptName: concept.name,
      layout
    });
  } catch (error) {
    console.error('❌ Error loading concept layout:', error);
    res.status(500).json({ error: 'Failed to load concept layout.' });
  }
});

app.put('/api/concepts/:id/layout', authenticateToken, async (req, res) => {
  try {
    const concept = await resolveConceptByParam(req.user.id, req.params.id, { createIfMissing: true });
    if (!concept) return res.status(404).json({ error: 'Concept not found.' });

    const incomingLayout = req.body?.layout && typeof req.body.layout === 'object'
      ? req.body.layout
      : (req.body || {});
    const layout = normalizeConceptLayout(incomingLayout, { baseLayout: concept.conceptLayout });
    concept.conceptLayout = layout;
    concept.markModified('conceptLayout');
    await concept.save();

    res.status(200).json({
      conceptId: String(concept._id),
      conceptName: concept.name,
      layout
    });
  } catch (error) {
    console.error('❌ Error saving concept layout:', error);
    res.status(500).json({ error: 'Failed to save concept layout.' });
  }
});

app.post('/api/concepts/:id/layout/add-card', authenticateToken, async (req, res) => {
  try {
    const concept = await resolveConceptByParam(req.user.id, req.params.id, { createIfMissing: true });
    if (!concept) return res.status(404).json({ error: 'Concept not found.' });

    const layout = normalizeConceptLayout(concept.conceptLayout || {});
    const sectionId = String(req.body?.sectionId || '').trim();
    const itemType = String(req.body?.itemType || '').trim();
    const itemId = String(req.body?.itemId || '').trim();
    if (!itemType || !itemId) {
      return res.status(400).json({ error: 'itemType and itemId are required.' });
    }

    const createdCard = await createConceptLayoutCard({
      userId: req.user.id,
      itemType,
      itemId,
      title: req.body?.title,
      snippet: req.body?.snippet,
      role: req.body?.role
    });
    if (!createdCard) {
      return res.status(404).json({ error: 'Could not resolve source item for card.' });
    }

    const duplicate = layout.cards.find(card => (
      card.itemType === createdCard.itemType && String(card.itemId) === String(createdCard.itemId)
    ));
    const card = duplicate || createdCard;
    if (duplicate && req.body?.role) {
      card.role = normalizeConceptLayoutCardRole(req.body.role, card.role || 'idea');
    }
    if (!duplicate) layout.cards.push(card);

    const targetSection = layout.sections.find(section => section.id === sectionId) || layout.sections[0];
    if (!targetSection) {
      return res.status(400).json({ error: 'No sections available for this concept layout.' });
    }

    layout.sections = layout.sections.map((section) => {
      const nextCardIds = section.cardIds.filter(cardId => cardId !== card.id);
      if (section.id === targetSection.id) {
        nextCardIds.push(card.id);
      }
      return { ...section, cardIds: nextCardIds };
    });
    const normalized = normalizeConceptLayout(layout);

    concept.conceptLayout = normalized;
    concept.markModified('conceptLayout');
    await concept.save();

    res.status(201).json({
      conceptId: String(concept._id),
      conceptName: concept.name,
      card,
      layout: normalized
    });
  } catch (error) {
    console.error('❌ Error adding concept layout card:', error);
    res.status(500).json({ error: 'Failed to add concept layout card.' });
  }
});

// GET /api/concepts/:id/suggestions - semantic highlight suggestions
app.get('/api/concepts/:id/suggestions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, userId }
      : { name: id, userId };
    const concept = await TagMeta.findOne(query)
      .select('name pinnedHighlightIds dismissedHighlightIds');
    if (!concept) {
      return res.status(404).json({ error: 'Concept not found.' });
    }
    const sourceId = buildEmbeddingId({
      userId: String(userId),
      objectType: 'concept',
      objectId: String(concept._id || concept.name)
    });
    const matches = await fetchSimilarEmbeddings({
      userId,
      sourceId,
      types: ['highlight'],
      limit: limit + 5,
      requestId: req.requestId
    });
    let results = await hydrateSemanticResults({ matches, userId });
    const pinnedSet = new Set((concept.pinnedHighlightIds || []).map(item => String(item)));
    const dismissedSet = new Set((concept.dismissedHighlightIds || []).map(item => String(item)));
    results = results
      .filter(item => item.objectType === 'highlight')
      .filter(item => !pinnedSet.has(String(item.objectId)))
      .filter(item => !dismissedSet.has(String(item.objectId)))
      .slice(0, limit);
    res.status(200).json({ results });
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai/themes?range=7d|30d|90d
app.get('/api/ai/themes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const range = String(req.query.range || '7d');
    const limit = 500;
    const since = buildRangeStart(range);
    const highlights = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: since } } },
      { $project: {
        _id: '$highlights._id',
        text: '$highlights.text',
        tags: '$highlights.tags',
        articleId: '$_id',
        articleTitle: '$title',
        createdAt: '$highlights.createdAt'
      } },
      { $sort: { 'highlights.createdAt': -1 } },
      { $limit: limit }
    ]);
    if (!highlights.length) {
      return res.status(200).json({ clusters: [] });
    }
    const embeddingIds = highlights.map(h => buildEmbeddingId({
      userId: String(userId),
      objectType: 'highlight',
      objectId: String(h._id)
    }));
    const embedResponse = await aiGetEmbeddings(embeddingIds, { requestId: req.requestId });
    const embedItems = Array.isArray(embedResponse?.results) ? embedResponse.results : [];
    const embeddingMap = new Map(embedItems.map(item => [item.id, item.embedding]));
    const vectors = [];
    const highlightRecords = [];
    highlights.forEach((highlight) => {
      const id = buildEmbeddingId({
        userId: String(userId),
        objectType: 'highlight',
        objectId: String(highlight._id)
      });
      const vector = embeddingMap.get(id);
      if (!vector) return;
      vectors.push(vector);
      highlightRecords.push({
        id: String(highlight._id),
        text: highlight.text || '',
        tags: highlight.tags || [],
        articleId: String(highlight.articleId),
        articleTitle: highlight.articleTitle || ''
      });
    });
    if (vectors.length < 3) {
      return res.status(200).json({
        clusters: vectors.length ? [{
          title: labelCluster(highlightRecords),
          highlightIds: highlightRecords.map(h => h.id),
          topTags: [],
          representativeHighlights: highlightRecords.slice(0, 5)
        }] : []
      });
    }
    const k = Math.min(7, Math.max(2, Math.round(Math.sqrt(vectors.length / 2))));
    const { centroids, assignments } = kMeans(vectors, k);
    const clusterMap = new Map();
    assignments.forEach((clusterIdx, idx) => {
      if (!clusterMap.has(clusterIdx)) clusterMap.set(clusterIdx, []);
      clusterMap.get(clusterIdx).push({ vector: vectors[idx], highlight: highlightRecords[idx] });
    });
    const clusters = Array.from(clusterMap.entries()).map(([clusterIdx, items]) => {
      const highlightsForCluster = items.map(item => item.highlight);
      const tagCounts = new Map();
      highlightsForCluster.forEach(item => {
        (item.tags || []).forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      });
      const topTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);
      const centroid = centroids[clusterIdx];
      const sorted = items
        .map(item => ({
          highlight: item.highlight,
          score: cosineSimilarity(item.vector, centroid)
        }))
        .sort((a, b) => b.score - a.score)
        .map(item => item.highlight);
      return {
        title: labelCluster(highlightsForCluster),
        highlightIds: highlightsForCluster.map(h => h.id),
        topTags,
        representativeHighlights: sorted.slice(0, 5)
      };
    }).sort((a, b) => b.highlightIds.length - a.highlightIds.length);
    res.status(200).json({ clusters: clusters.slice(0, 7) });
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai/connections?limit=20
app.get('/api/ai/connections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Number(req.query.limit) || 20, 40);
    const concepts = await TagMeta.find({ userId })
      .select('name description')
      .limit(50);
    if (concepts.length < 2) {
      return res.status(200).json({ pairs: [] });
    }
    const embeddingIds = concepts.map(concept => buildEmbeddingId({
      userId: String(userId),
      objectType: 'concept',
      objectId: String(concept._id)
    }));
    const embedResponse = await aiGetEmbeddings(embeddingIds, { requestId: req.requestId });
    const embedItems = Array.isArray(embedResponse?.results) ? embedResponse.results : [];
    const embeddingMap = new Map(embedItems.map(item => [item.id, item.embedding]));
    const conceptVectors = concepts.map((concept) => ({
      id: String(concept._id),
      name: concept.name,
      embeddingId: buildEmbeddingId({
        userId: String(userId),
        objectType: 'concept',
        objectId: String(concept._id)
      }),
      vector: embeddingMap.get(buildEmbeddingId({
        userId: String(userId),
        objectType: 'concept',
        objectId: String(concept._id)
      })) || null
    })).filter(item => item.vector);
    const pairs = [];
    for (let i = 0; i < conceptVectors.length; i += 1) {
      for (let j = i + 1; j < conceptVectors.length; j += 1) {
        const score = cosineSimilarity(conceptVectors[i].vector, conceptVectors[j].vector);
        pairs.push({
          conceptA: conceptVectors[i],
          conceptB: conceptVectors[j],
          score
        });
      }
    }
    const topPairs = pairs.sort((a, b) => b.score - a.score).slice(0, limit);
    const hydrated = await Promise.all(topPairs.map(async (pair) => {
      const [aSimilar, bSimilar] = await Promise.all([
        fetchSimilarEmbeddings({
          userId,
          sourceId: pair.conceptA.embeddingId,
          types: ['highlight'],
          limit: 20,
          requestId: req.requestId
        }),
        fetchSimilarEmbeddings({
          userId,
          sourceId: pair.conceptB.embeddingId,
          types: ['highlight'],
          limit: 20,
          requestId: req.requestId
        })
      ]);
      const toIds = (items) => new Set(
        items
          .map(item => getObjectIdFromEmbedding(item))
          .filter(Boolean)
      );
      const setA = toIds(aSimilar);
      const sharedIds = Array.from(setA).filter(id => toIds(bSimilar).has(id));
      const sharedHighlights = await Promise.all(
        sharedIds.slice(0, 5).map(async (id) => {
          const highlight = await findHighlightById(userId, id);
          if (!highlight) return null;
          return {
            objectId: String(highlight._id),
            title: highlight.text || 'Highlight',
            snippet: highlight.articleTitle || '',
            metadata: {
              articleId: highlight.articleId,
              articleTitle: highlight.articleTitle,
              tags: highlight.tags || []
            }
          };
        })
      );
      return {
        conceptA: { id: pair.conceptA.id, name: pair.conceptA.name },
        conceptB: { id: pair.conceptB.id, name: pair.conceptB.name },
        score: pair.score,
        sharedSuggestedHighlights: sharedHighlights.filter(Boolean)
      };
    }));
    res.status(200).json({ pairs: hydrated });
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/synthesize
app.post('/api/ai/synthesize', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      scopeType = 'custom',
      scopeId = '',
      itemIds = [],
      range
    } = req.body || {};

    const scopeSets = {
      highlight: new Set(),
      article: new Set(),
      notebook: new Set(),
      question: new Set(),
      concept: new Set()
    };
    const sourceTexts = [];
    const highlightRecords = [];
    const synthesisItems = [];
    let synthesisOrder = 0;

    const addSynthesisItem = ({ type, id, text, createdAt }) => {
      const cleanText = String(text || '').trim();
      if (!cleanText) return;
      synthesisItems.push({
        type: String(type || 'text'),
        id: String(id || ''),
        text: cleanText,
        createdAt: createdAt ? new Date(createdAt).getTime() : null,
        order: synthesisOrder
      });
      synthesisOrder += 1;
    };

    const addHighlightRecord = (highlight) => {
      if (!highlight) return;
      const id = String(highlight._id || highlight.objectId || '');
      if (!id) return;
      if (scopeSets.highlight.has(id)) return;
      scopeSets.highlight.add(id);
      highlightRecords.push({
        id,
        text: highlight.text || '',
        note: highlight.note || '',
        tags: highlight.tags || [],
        articleId: String(highlight.articleId || ''),
        articleTitle: highlight.articleTitle || '',
        createdAt: highlight.createdAt || null
      });
      const highlightText = [highlight.text, highlight.note].filter(Boolean).join(' ');
      sourceTexts.push(highlightText);
      addSynthesisItem({
        type: 'highlight',
        id,
        text: highlightText,
        createdAt: highlight.createdAt
      });
    };

    if (scopeType === 'range') {
      const since = buildRangeStart(range || '7d');
      const highlights = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.createdAt': { $gte: since } } },
        { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          articleId: '$_id',
          articleTitle: '$title',
          createdAt: '$highlights.createdAt'
        } },
        { $limit: 300 }
      ]);
      highlights.forEach(addHighlightRecord);
    } else if (scopeType === 'concept') {
      const query = mongoose.Types.ObjectId.isValid(scopeId)
        ? { _id: scopeId, userId }
        : { name: scopeId, userId };
      const concept = await TagMeta.findOne(query)
        .select('name description pinnedHighlightIds');
      if (!concept) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      scopeSets.concept.add(String(concept._id || concept.name));
      const conceptText = `${concept.name}\n${concept.description || ''}`;
      sourceTexts.push(conceptText);
      addSynthesisItem({
        type: 'concept',
        id: concept._id || concept.name,
        text: conceptText
      });
      const pinned = await fetchHighlightsByIds(userId, concept.pinnedHighlightIds || []);
      pinned.forEach(addHighlightRecord);
      if (pinned.length === 0 && concept.name) {
        const tagged = await Article.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(userId) } },
          { $unwind: '$highlights' },
          { $match: { 'highlights.tags': concept.name } },
          { $project: {
            _id: '$highlights._id',
            text: '$highlights.text',
            note: '$highlights.note',
            tags: '$highlights.tags',
            articleId: '$_id',
            articleTitle: '$title',
            createdAt: '$highlights.createdAt'
          } },
          { $limit: 200 }
        ]);
        tagged.forEach(addHighlightRecord);
      }
    } else if (scopeType === 'question') {
      const question = await Question.findOne({ _id: scopeId, userId })
        .select('text blocks linkedHighlightIds');
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      scopeSets.question.add(String(question._id));
      sourceTexts.push(question.text || '');
      addSynthesisItem({
        type: 'question',
        id: question._id,
        text: question.text || ''
      });
      const highlightIds = new Set(question.linkedHighlightIds || []);
      (question.blocks || []).forEach((block, idx) => {
        if (block.highlightId) highlightIds.add(block.highlightId);
        if (block.text) {
          sourceTexts.push(block.text);
          addSynthesisItem({
            type: 'question-block',
            id: block.id || `${question._id}-block-${idx}`,
            text: block.text
          });
        }
      });
      const highlights = await fetchHighlightsByIds(userId, Array.from(highlightIds));
      highlights.forEach(addHighlightRecord);
    } else if (scopeType === 'notebook') {
      const entry = await NotebookEntry.findOne({ _id: scopeId, userId })
        .select('title blocks linkedHighlightIds');
      if (!entry) {
        return res.status(404).json({ error: 'Notebook entry not found.' });
      }
      scopeSets.notebook.add(String(entry._id));
      sourceTexts.push(entry.title || '');
      addSynthesisItem({
        type: 'notebook',
        id: entry._id,
        text: entry.title || ''
      });
      const highlightIds = new Set(entry.linkedHighlightIds || []);
      (entry.blocks || []).forEach((block, idx) => {
        if (block.highlightId) highlightIds.add(block.highlightId);
        if (block.text) {
          sourceTexts.push(block.text);
          addSynthesisItem({
            type: 'notebook-block',
            id: block.id || `${entry._id}-block-${idx}`,
            text: block.text
          });
        }
      });
      const highlights = await fetchHighlightsByIds(userId, Array.from(highlightIds));
      highlights.forEach(addHighlightRecord);
    } else if (scopeType === 'custom' && Array.isArray(itemIds)) {
      for (const item of itemIds) {
        const objectType = item?.objectType;
        const objectId = item?.objectId;
        if (!objectType || !objectId) continue;
        if (objectType === 'highlight') {
          const highlight = await findHighlightById(userId, objectId);
          addHighlightRecord(highlight);
        }
        if (objectType === 'article') {
          const article = await Article.findOne({ _id: objectId, userId }).select('title content');
          if (article) {
            scopeSets.article.add(String(article._id));
            const articleText = `${article.title}\n${buildSnippet(article.content || '', 400)}`;
            sourceTexts.push(articleText);
            addSynthesisItem({
              type: 'article',
              id: article._id,
              text: articleText
            });
          }
        }
        if (objectType === 'concept') {
          const concept = await TagMeta.findOne({ _id: objectId, userId }).select('name description');
          if (concept) {
            scopeSets.concept.add(String(concept._id));
            const conceptText = `${concept.name}\n${concept.description || ''}`;
            sourceTexts.push(conceptText);
            addSynthesisItem({
              type: 'concept',
              id: concept._id,
              text: conceptText
            });
          }
        }
        if (objectType === 'question') {
          const question = await Question.findOne({ _id: objectId, userId }).select('text');
          if (question) {
            scopeSets.question.add(String(question._id));
            sourceTexts.push(question.text || '');
            addSynthesisItem({
              type: 'question',
              id: question._id,
              text: question.text || ''
            });
          }
        }
        if (objectType === 'notebook') {
          const entry = await NotebookEntry.findOne({ _id: objectId, userId }).select('title blocks');
          if (entry) {
            scopeSets.notebook.add(String(entry._id));
            sourceTexts.push(entry.title || '');
            addSynthesisItem({
              type: 'notebook',
              id: entry._id,
              text: entry.title || ''
            });
            (entry.blocks || []).forEach((block, idx) => {
              if (block.text) {
                sourceTexts.push(block.text);
                addSynthesisItem({
                  type: 'notebook-block',
                  id: block.id || `${entry._id}-block-${idx}`,
                  text: block.text
                });
              }
            });
          }
        }
      }
    }

    const synthLimits = {
      maxItems: process.env.AI_SYNTH_MAX_ITEMS,
      maxTotalChars: process.env.AI_SYNTH_MAX_CHARS,
      maxItemChars: process.env.AI_SYNTH_MAX_ITEM_CHARS
    };
    const { items: synthItems, stats: synthStats } = applySynthesisLimits(synthesisItems, synthLimits);
    const { origin: upstreamOrigin, hasPath: upstreamHasPath } = parseAiServiceUrl(
      process.env.AI_SERVICE_URL || ''
    );
    const upstreamUrl = upstreamOrigin ? joinUrl(upstreamOrigin, '/synthesize') : '';
    if (upstreamUrl) {
      console.log('AI upstream URL:', upstreamUrl);
    }
    console.log('[AI-SYNTH] payload', {
      route: 'ai_synthesize',
      scopeType,
      scopeId,
      item_count: synthStats.item_count,
      total_chars: synthStats.total_chars,
      max_item_chars: synthStats.max_item_chars,
      upstream_url: upstreamUrl
    });
    if (upstreamHasPath) {
      console.warn('[AI-SYNTH] AI_SERVICE_URL includes a path; using origin only.');
    }

    const vectors = [];
    const vectorHighlights = [];

    if (highlightRecords.length > 0) {
      const embedInputs = highlightRecords
        .map(record => ({
          record,
          text: [record.text, record.note].filter(Boolean).join(' ').trim()
        }))
        .filter(item => item.text);
      if (embedInputs.length) {
        let embedResponse;
        try {
          embedResponse = await aiEmbedTexts(
            embedInputs.map(item => item.text),
            { requestId: req.requestId }
          );
        } catch (error) {
          return res.status(502).json({
            error: 'UPSTREAM_FAILED',
            upstream: 'ai_service',
            message: error.message,
            details: error.payload || error.response?.data || ''
          });
        }
        const embedVectors = Array.isArray(embedResponse?.vectors)
          ? embedResponse.vectors
          : [];
        embedVectors.forEach((vector, idx) => {
          if (!Array.isArray(vector)) return;
          vectors.push(vector);
          vectorHighlights.push(embedInputs[idx].record);
        });
      }
    }

    let themes = [];
    if (vectors.length >= 3) {
      const k = Math.min(5, Math.max(2, Math.round(Math.sqrt(vectors.length / 2))));
      const { centroids, assignments } = kMeans(vectors, k);
      const clusters = new Map();
      assignments.forEach((clusterIdx, idx) => {
        if (!clusters.has(clusterIdx)) clusters.set(clusterIdx, []);
        clusters.get(clusterIdx).push({ vector: vectors[idx], highlight: vectorHighlights[idx] });
      });
      themes = Array.from(clusters.entries()).map(([clusterIdx, items]) => {
        const highlights = items.map(item => item.highlight);
        const centroid = centroids[clusterIdx];
        const ranked = items
          .map(item => ({
            highlight: item.highlight,
            score: cosineSimilarity(item.vector, centroid)
          }))
          .sort((a, b) => b.score - a.score)
          .map(item => item.highlight);
        return {
          title: labelCluster(highlights),
          evidence: highlights.map(h => h.id),
          representative: ranked.slice(0, 4).map(h => h.id)
        };
      });
    } else if (vectorHighlights.length > 0) {
      themes = [{
        title: labelCluster(vectorHighlights),
        evidence: vectorHighlights.map(h => h.id),
        representative: vectorHighlights.map(h => h.id).slice(0, 4)
      }];
    }

    let connections = [];
    if (vectorHighlights.length >= 2) {
      const pairs = [];
      for (let i = 0; i < vectorHighlights.length; i += 1) {
        for (let j = i + 1; j < vectorHighlights.length; j += 1) {
          const sim = cosineSimilarity(vectors[i], vectors[j]);
          if (sim < 0.75) continue;
          const s1 = sentimentScore(vectorHighlights[i].text);
          const s2 = sentimentScore(vectorHighlights[j].text);
          if (s1 === 0 || s2 === 0 || Math.sign(s1) === Math.sign(s2)) continue;
          pairs.push({
            a: vectorHighlights[i],
            b: vectorHighlights[j],
            score: sim
          });
        }
      }
      pairs.sort((a, b) => b.score - a.score);
      pairs.slice(0, 5).forEach(pair => {
        connections.push({
          description: `Possible tension between "${buildSnippet(pair.a.text, 90)}" and "${buildSnippet(pair.b.text, 90)}"`,
          evidence: [pair.a.id, pair.b.id]
        });
      });
    }

    let questions = extractQuestions(sourceTexts);
    if (synthItems.length > 0) {
      const aiSecret = String(process.env.AI_SHARED_SECRET || '').trim();
      if (!upstreamUrl || !aiSecret) {
        return res.status(503).json({
          error: 'UPSTREAM_FAILED',
          upstream_status: 503,
          hint: 'AI service not configured.'
        });
      }
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const timeoutMs = toPositiveInt(process.env.AI_SERVICE_TIMEOUT_MS, 60000);
      const backoffs = [250, 750];
      let synthData = null;
      let synthError = null;
      for (let attempt = 0; attempt <= backoffs.length; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          console.log('AI upstream URL:', upstreamUrl);
          const res = await fetch(upstreamUrl, {
            method: 'POST',
            headers: {
              'x-ai-shared-secret': aiSecret,
              'Content-Type': 'application/json',
              'X-Request-Id': req.requestId
            },
            body: JSON.stringify({
              items: synthItems.map(item => ({
                type: item.type,
                id: item.id,
                text: item.text
              }))
            }),
            signal: controller.signal
          });
          clearTimeout(timeout);
          const bodyText = await res.text().catch(() => '');
          const bodySnippet = String(bodyText || '').slice(0, 200);
          if (!res.ok) {
            console.error('[AI-SYNTH] upstream error', {
              upstream_url: upstreamUrl,
              status: res.status,
              body_snippet: bodySnippet
            });
            if ([502, 503, 504].includes(res.status) && attempt < backoffs.length) {
              await sleep(backoffs[attempt]);
              continue;
            }
            synthError = { status: res.status, bodySnippet };
            break;
          }
          try {
            synthData = JSON.parse(bodyText);
          } catch (err) {
            synthError = { status: res.status, bodySnippet };
          }
          break;
        } catch (err) {
          clearTimeout(timeout);
          const isTimeout = err.name === 'AbortError';
          if (isTimeout && attempt < backoffs.length) {
            await sleep(backoffs[attempt]);
            continue;
          }
          synthError = {
            status: isTimeout ? 504 : 502,
            bodySnippet: ''
          };
          break;
        }
      }
      if (synthError || !synthData) {
        const status = synthError?.status;
        return res.status(502).json({
          error: 'UPSTREAM_FAILED',
          upstream_status: status,
          upstream_body_snippet: synthError?.bodySnippet || '',
          upstream_url: status === 404 ? upstreamUrl : undefined,
          message: status === 404 ? 'AI service route mismatch; expected /synthesize' : undefined,
          hint: status === 404
            ? 'AI service route mismatch; expected /synthesize'
            : 'likely payload too large or AI service timeout'
        });
      }
      const upstreamThemes = Array.isArray(synthData.themes) ? synthData.themes : [];
      const upstreamConnections = Array.isArray(synthData.connections) ? synthData.connections : [];
      const upstreamQuestions = Array.isArray(synthData.questions) ? synthData.questions : [];
      themes = upstreamThemes.map(title => ({
        title,
        evidence: [],
        representative: []
      }));
      connections = upstreamConnections.map(description => ({ description }));
      questions = upstreamQuestions;
    }

    const queryText = sourceTexts.slice(0, 6).join(' ');
    let suggestedLinks = [];
    if (queryText.trim()) {
      let response;
      try {
        response = await aiSemanticSearch({
          userId: String(userId),
          query: queryText,
          limit: 12
        }, { requestId: req.requestId });
      } catch (error) {
        return res.status(502).json({
          error: 'UPSTREAM_FAILED',
          upstream: 'ai_service',
          message: error.message,
          details: error.payload || error.response?.data || ''
        });
      }
      const matches = Array.isArray(response?.results) ? response.results : [];
      const hydrated = await hydrateSemanticResults({ matches, userId });
      suggestedLinks = hydrated
        .filter(item => !scopeSets[item.objectType]?.has(String(item.objectId)))
        .slice(0, 10)
        .map(item => ({
          objectType: item.objectType,
          objectId: item.objectId,
          score: item.score,
          title: item.title,
          snippet: item.snippet,
          metadata: item.metadata || {}
        }));
    }

    let draftInsights = null;
    if (isGenerationEnabled()) {
      try {
        draftInsights = await generateDraftInsights({
          highlights: highlightRecords,
          themes,
          connections,
          questions
        });
      } catch (err) {
        console.error('Draft insights failed:', err);
      }
    }

    res.status(200).json({
      themes,
      connections,
      questions,
      suggestedLinks,
      draftInsights
    });
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
});

// POST /api/concepts/:id/suggestions/dismiss - dismiss a highlight suggestion
app.post('/api/concepts/:id/suggestions/dismiss', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { highlightId } = req.body || {};
    if (!highlightId) {
      return res.status(400).json({ error: 'highlightId is required.' });
    }
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, userId }
      : { name: id, userId };
    const updated = await TagMeta.findOneAndUpdate(
      query,
      { $addToSet: { dismissedHighlightIds: highlightId } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: 'Concept not found.' });
    }
    res.status(200).json({ dismissedHighlightIds: updated.dismissedHighlightIds || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to dismiss suggestion.' });
  }
});

// POST /api/concepts/:id/add-highlight - attach highlight to concept
app.post('/api/concepts/:id/add-highlight', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { highlightId } = req.body;
    if (!highlightId) return res.status(400).json({ error: "highlightId is required." });
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, userId }
      : { name: id, userId };
    const update = {
      $setOnInsert: { name: String(id) },
      $addToSet: { pinnedHighlightIds: highlightId }
    };
    const concept = await TagMeta.findOneAndUpdate(query, update, {
      new: true,
      upsert: true
    });
    res.status(200).json(concept);
  } catch (error) {
    console.error("❌ Error adding highlight to concept:", error);
    res.status(500).json({ error: "Failed to add highlight to concept." });
  }
});

// Update concept pins (highlights/articles)
app.put('/api/concepts/:name/pins', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const cleanName = String(req.params.name || '').trim();
    const {
      addHighlightIds = [],
      removeHighlightIds = [],
      addArticleIds = [],
      removeArticleIds = []
    } = req.body || {};

    const update = {};
    if (addHighlightIds.length) {
      update.$addToSet = { ...(update.$addToSet || {}), pinnedHighlightIds: { $each: addHighlightIds } };
    }
    if (removeHighlightIds.length) {
      update.$pull = { ...(update.$pull || {}), pinnedHighlightIds: { $in: removeHighlightIds } };
    }
    if (addArticleIds.length) {
      update.$addToSet = { ...(update.$addToSet || {}), pinnedArticleIds: { $each: addArticleIds } };
    }
    if (removeArticleIds.length) {
      update.$pull = { ...(update.$pull || {}), pinnedArticleIds: { $in: removeArticleIds } };
    }

    const updated = await TagMeta.findOneAndUpdate(
      { name: new RegExp(`^${cleanName}$`, 'i'), userId },
      { name: cleanName, ...update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating concept pins:", error);
    res.status(500).json({ error: "Failed to update concept pins." });
  }
});

// GET /api/tags/cooccurrence - top tag pairs
app.get('/api/tags/cooccurrence', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const highlights = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $project: { tags: '$highlights.tags' } }
    ]);

    const pairCounts = {};
    highlights.forEach(h => {
      const tags = Array.isArray(h.tags) ? [...new Set(h.tags.filter(Boolean))] : [];
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const a = tags[i];
          const b = tags[j];
          if (!a || !b) continue;
          const [tagA, tagB] = a.localeCompare(b) <= 0 ? [a, b] : [b, a];
          const key = `${tagA}:::${tagB}`;
          pairCounts[key] = (pairCounts[key] || 0) + 1;
        }
      }
    });

    const pairs = Object.entries(pairCounts)
      .map(([key, count]) => {
        const [tagA, tagB] = key.split(':::');
        return { tagA, tagB, count };
      })
      .sort((a, b) => b.count - a.count || a.tagA.localeCompare(b.tagA))
      .slice(0, 20);

    res.status(200).json(pairs);
  } catch (error) {
    console.error("❌ Error computing tag cooccurrence:", error);
    res.status(500).json({ error: "Failed to compute tag cooccurrence." });
  }
});

// GET /api/tags/filter?tags=a,b - highlights containing any of the selected tags
app.get('/api/tags/filter', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const tagsParam = (req.query.tags || '').trim();
    if (!tagsParam) {
      return res.status(400).json({ error: "Query parameter 'tags' is required (comma-separated)." });
    }
    const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length === 0) {
      return res.status(400).json({ error: "At least one tag is required." });
    }

    const highlights = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': { $in: tags } } },
      { $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          createdAt: '$highlights.createdAt'
      } },
      { $sort: { createdAt: -1 } },
      { $limit: 200 }
    ]);

    res.status(200).json(highlights);
  } catch (error) {
    console.error("❌ Error filtering highlights by tags:", error);
    res.status(500).json({ error: "Failed to fetch highlights by tags." });
  }
});

// GET /api/tags/:tag - highlights for a tag and related tags
app.get('/api/tags/:tag', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const tag = req.params.tag;
    const highlights = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': tag } },
      { $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          createdAt: '$highlights.createdAt'
      } },
      { $sort: { createdAt: -1 } }
    ]);

    const relatedCounts = {};
    highlights.forEach(h => {
      (h.tags || []).forEach(t => {
        if (t !== tag) {
          relatedCounts[t] = (relatedCounts[t] || 0) + 1;
        }
      });
    });
    const relatedTags = Object.entries(relatedCounts)
      .map(([t, count]) => ({ tag: t, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    res.status(200).json({ tag, count: highlights.length, highlights, relatedTags });
  } catch (error) {
    console.error("❌ Error fetching tag details:", error);
    res.status(500).json({ error: "Failed to fetch tag details." });
  }
});

// GET /api/tags/:name/meta - tag concept metadata
app.get('/api/tags/:name/meta', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const name = req.params.name;

    const meta = await TagMeta.findOne({ name: new RegExp(`^${name}$`, 'i'), userId });
    const pinnedIds = meta?.pinnedHighlightIds || [];

    let pinnedHighlights = [];
    if (pinnedIds.length > 0) {
      pinnedHighlights = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights._id': { $in: pinnedIds } } },
        { $project: {
            _id: '$highlights._id',
            text: '$highlights.text',
            tags: '$highlights.tags',
            articleTitle: '$title',
            articleId: '$_id',
            createdAt: '$highlights.createdAt'
        } }
      ]);
    }

    // related tags
    const relatedAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': name } },
      { $unwind: '$highlights.tags' },
      { $match: { 'highlights.tags': { $ne: name } } },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]);
    const relatedTags = relatedAgg.map(r => ({ tag: r._id, count: r.count }));

    const countAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': name } },
      { $count: 'total' }
    ]);
    const allHighlightCount = countAgg[0]?.total || 0;

    res.status(200).json({
      name,
      description: meta?.description || '',
      pinnedHighlights,
      relatedTags,
      allHighlightCount,
      pinnedHighlightIds: pinnedIds
    });
  } catch (error) {
    console.error("❌ Error fetching tag meta:", error);
    res.status(500).json({ error: "Failed to fetch tag meta." });
  }
});

// PUT /api/tags/:name/meta - upsert tag meta
app.put('/api/tags/:name/meta', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const name = req.params.name;
    const { description = '', pinnedHighlightIds = [] } = req.body;

    const updated = await TagMeta.findOneAndUpdate(
      { name: new RegExp(`^${name}$`, 'i'), userId },
      { name, description, pinnedHighlightIds },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating tag meta:", error);
    res.status(500).json({ error: "Failed to update tag meta." });
  }
});

// GET /api/tags/:name/highlights - all highlights for a tag
app.get('/api/tags/:name/highlights', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const name = req.params.name;
    const highlights = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': name } },
      { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleTitle: '$title',
          articleId: '$_id',
          createdAt: '$highlights.createdAt'
      } },
      { $sort: { createdAt: -1 } }
    ]);
    res.status(200).json(highlights);
  } catch (error) {
    console.error("❌ Error fetching tag highlights:", error);
    res.status(500).json({ error: "Failed to fetch highlights for tag." });
  }
});

// Onboarding summary (lightweight counts)
app.get('/api/onboarding/summary', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const [articleCount, notebookCount, highlightCountAgg, taggedHighlightAgg, linkedHighlightEdge] = await Promise.all([
      Article.countDocuments({ userId }),
      NotebookEntry.countDocuments({ userId }),
      Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $count: 'total' }
      ]),
      Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.tags.0': { $exists: true } } },
        { $limit: 1 }
      ]),
      ReferenceEdge.findOne({ userId, sourceType: 'notebook', targetType: 'highlight' }).lean()
    ]);

    const hasHighlights = (highlightCountAgg[0]?.total || 0) > 0;
    const hasTaggedHighlight = taggedHighlightAgg.length > 0;

    res.status(200).json({
      hasArticle: articleCount > 0,
      hasHighlight: hasHighlights,
      hasTaggedHighlight,
      hasNote: notebookCount > 0,
      hasLinkedHighlight: Boolean(linkedHighlightEdge)
    });
  } catch (error) {
    console.error('❌ Error building onboarding summary:', error);
    res.status(500).json({ error: 'Failed to load onboarding summary.' });
  }
});

// --- Concept Notes CRUD ---
app.get('/api/concepts/:tagName/notes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const tagName = req.params.tagName;
    const notes = await ConceptNote.find({
      userId,
      tagName: { $regex: new RegExp(`^${tagName}$`, 'i') }
    }).sort({ updatedAt: -1 });
    res.status(200).json(notes);
  } catch (error) {
    console.error("❌ Error fetching concept notes:", error);
    res.status(500).json({ error: "Failed to fetch concept notes." });
  }
});

// Concept timeline (weekly activity)
app.get('/api/concepts/:tagName/timeline', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { tagName } = req.params;
    const range = req.query.range || '90d';

    const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagRegex = new RegExp(`^${escapeRegExp(tagName)}$`, 'i');

    let startDate = null;
    if (range !== 'all') {
      const days = parseInt(range.replace(/d/i, ''), 10);
      const validDays = Number.isNaN(days) ? 90 : days;
      startDate = new Date(Date.now() - validDays * 24 * 60 * 60 * 1000);
    }

    const highlightMatch = {
      userId,
      ...(startDate ? { 'highlights.createdAt': { $gte: startDate } } : {})
    };

    const highlightPipeline = [
      { $match: { userId } },
      { $unwind: '$highlights' },
      ...(startDate ? [{ $match: { 'highlights.createdAt': { $gte: startDate } } }] : []),
      { $match: { 'highlights.tags': { $regex: tagRegex } } },
      {
        $group: {
          _id: {
            $dateTrunc: { date: '$highlights.createdAt', unit: 'week', timezone: 'UTC' }
          },
          count: { $sum: 1 }
        }
      },
      { $project: { _id: 0, weekStartDate: '$_id', count: 1 } },
      { $sort: { weekStartDate: 1 } }
    ];

    const topArticlesPipeline = [
      { $match: { userId } },
      { $unwind: '$highlights' },
      ...(startDate ? [{ $match: { 'highlights.createdAt': { $gte: startDate } } }] : []),
      { $match: { 'highlights.tags': { $regex: tagRegex } } },
      {
        $group: {
          _id: '$_id',
          title: { $first: '$title' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, articleId: '$_id', title: 1, count: 1 } }
    ];

    const noteEdgesPipeline = [
      { $match: { userId, targetType: 'concept', targetTagName: { $regex: tagRegex } } },
      {
        $lookup: {
          from: 'notebookentries',
          localField: 'sourceId',
          foreignField: '_id',
          as: 'entry'
        }
      },
      { $unwind: '$entry' },
      ...(startDate ? [{ $match: { 'entry.createdAt': { $gte: startDate } } }] : []),
      { $group: { _id: '$entry._id', createdAt: { $first: '$entry.createdAt' } } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit: 'week', timezone: 'UTC' } },
          count: { $sum: 1 }
        }
      },
      { $project: { _id: 0, weekStartDate: '$_id', count: 1 } },
      { $sort: { weekStartDate: 1 } }
    ];

    const conceptNotesPipeline = [
      { $match: { userId, tagName: { $regex: tagRegex } } },
      ...(startDate ? [{ $match: { createdAt: { $gte: startDate } } }] : []),
      {
        $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit: 'week', timezone: 'UTC' } },
          count: { $sum: 1 }
        }
      },
      { $project: { _id: 0, weekStartDate: '$_id', count: 1 } },
      { $sort: { weekStartDate: 1 } }
    ];

    const [highlightsPerWeek, topReferencedArticles, noteEdgesPerWeek, conceptNotesPerWeek] = await Promise.all([
      Article.aggregate(highlightPipeline),
      Article.aggregate(topArticlesPipeline),
      ReferenceEdge.aggregate(noteEdgesPipeline),
      ConceptNote.aggregate(conceptNotesPipeline)
    ]);

    const notesByWeek = new Map();
    const addWeekCounts = (rows) => {
      rows.forEach(row => {
        const key = new Date(row.weekStartDate).toISOString();
        const current = notesByWeek.get(key) || 0;
        notesByWeek.set(key, current + row.count);
      });
    };
    addWeekCounts(noteEdgesPerWeek);
    addWeekCounts(conceptNotesPerWeek);

    const notesCreatedPerWeek = Array.from(notesByWeek.entries())
      .map(([weekStartDate, count]) => ({ weekStartDate, count }))
      .sort((a, b) => new Date(a.weekStartDate) - new Date(b.weekStartDate));

    res.status(200).json({
      highlightsPerWeek,
      notesCreatedPerWeek,
      topReferencedArticles
    });
  } catch (error) {
    console.error('❌ Error building concept timeline:', error);
    res.status(500).json({ error: 'Failed to load concept timeline.' });
  }
});

app.post('/api/concepts/:tagName/notes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const tagName = req.params.tagName;
    const { title = '', content = '' } = req.body;
    const note = await ConceptNote.create({ tagName, title, content, userId });
    res.status(201).json(note);
  } catch (error) {
    console.error("❌ Error creating concept note:", error);
    res.status(500).json({ error: "Failed to create concept note." });
  }
});

app.put('/api/concepts/notes/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title = '', content = '' } = req.body;
    const updated = await ConceptNote.findOneAndUpdate(
      { _id: id, userId },
      { title, content },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Note not found." });
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating concept note:", error);
    res.status(500).json({ error: "Failed to update concept note." });
  }
});

app.delete('/api/concepts/notes/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const removed = await ConceptNote.findOneAndDelete({ _id: id, userId });
    if (!removed) return res.status(404).json({ error: "Note not found." });
    res.status(200).json({ message: "Note deleted." });
  } catch (error) {
    console.error("❌ Error deleting concept note:", error);
    res.status(500).json({ error: "Failed to delete concept note." });
  }
});

// GET /api/concepts/:name/questions - open questions for a concept
app.get('/api/concepts/:name/questions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const conceptName = req.params.name;
    const status = req.query.status || 'open';
    const nameRegex = new RegExp(`^${conceptName}$`, 'i');
    const questions = await Question.find({
      userId,
      status,
      linkedTagName: nameRegex
    }).sort({ createdAt: -1 });
    res.status(200).json(questions);
  } catch (error) {
    console.error("❌ Error fetching concept questions:", error);
    res.status(500).json({ error: "Failed to fetch questions." });
  }
});

// --- QUESTIONS CRUD ---
app.get('/api/questions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, tag, conceptName, highlightId, notebookEntryId } = req.query;
    const filter = { userId };
    if (status) filter.status = status;
    if (tag) filter.linkedTagName = tag;
    if (conceptName) filter.linkedTagName = new RegExp(`^${conceptName}$`, 'i');
    if (highlightId) filter.linkedHighlightId = highlightId;
    if (notebookEntryId) filter.linkedNotebookEntryId = notebookEntryId;
    const questions = await Question.find(filter).sort({ createdAt: -1 });
    res.status(200).json(questions);
  } catch (error) {
    console.error("❌ Error fetching questions:", error);
    res.status(500).json({ error: "Failed to fetch questions." });
  }
});

app.get('/api/questions/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const question = await Question.findOne({ _id: id, userId });
    if (!question) return res.status(404).json({ error: "Question not found." });
    res.status(200).json(question);
  } catch (error) {
    console.error("❌ Error fetching question:", error);
    res.status(500).json({ error: "Failed to fetch question." });
  }
});

app.post('/api/questions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      text,
      status = 'open',
      linkedTagName = '',
      conceptName = '',
      blocks = [],
      linkedHighlightId = null,
      linkedHighlightIds = [],
      linkedNotebookEntryId = null
    } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Question text is required." });
    const highlightIds = [
      ...(Array.isArray(linkedHighlightIds) ? linkedHighlightIds : []),
      ...(linkedHighlightId ? [linkedHighlightId] : [])
    ].filter(Boolean);
    const normalizedConcept = (conceptName || linkedTagName || '').trim();
    const question = await Question.create({
      text: text.trim(),
      status,
      linkedTagName: (linkedTagName || normalizedConcept || '').trim(),
      conceptName: normalizedConcept,
      blocks: Array.isArray(blocks) ? blocks : [],
      linkedHighlightId,
      linkedHighlightIds: highlightIds,
      linkedNotebookEntryId,
      userId
    });
    enqueueQuestionEmbedding(question);
    res.status(201).json(question);
  } catch (error) {
    console.error("❌ Error creating question:", error);
    res.status(500).json({ error: "Failed to create question." });
  }
});

app.put('/api/questions/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { text, status, linkedTagName, conceptName, blocks, linkedHighlightId, linkedHighlightIds, linkedNotebookEntryId } = req.body;
    const payload = {};
    if (text !== undefined) payload.text = text;
    if (status !== undefined) payload.status = status;
    if (linkedTagName !== undefined) payload.linkedTagName = linkedTagName;
    if (conceptName !== undefined) {
      payload.conceptName = conceptName;
      if (linkedTagName === undefined) payload.linkedTagName = conceptName;
    }
    if (blocks !== undefined) payload.blocks = Array.isArray(blocks) ? blocks : [];
    if (linkedHighlightId !== undefined) payload.linkedHighlightId = linkedHighlightId;
    if (linkedHighlightIds !== undefined) payload.linkedHighlightIds = linkedHighlightIds;
    if (linkedNotebookEntryId !== undefined) payload.linkedNotebookEntryId = linkedNotebookEntryId;
    const updated = await Question.findOneAndUpdate({ _id: id, userId }, payload, { new: true });
    if (!updated) return res.status(404).json({ error: "Question not found." });
    enqueueQuestionEmbedding(updated);
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating question:", error);
    res.status(500).json({ error: "Failed to update question." });
  }
});

// POST /api/questions/:id/add-highlight - attach highlight to question
app.post('/api/questions/:id/add-highlight', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { highlightId } = req.body;
    if (!highlightId) return res.status(400).json({ error: "highlightId is required." });
    const question = await Question.findOne({ _id: id, userId });
    if (!question) return res.status(404).json({ error: "Question not found." });
    const highlight = await findHighlightById(userId, highlightId);
    if (!highlight) return res.status(404).json({ error: "Highlight not found." });

    const hasBlock = (question.blocks || []).some(block =>
      block.type === 'highlight-ref' && String(block.highlightId) === String(highlightId)
    );
    if (!hasBlock) {
      question.blocks = question.blocks || [];
      question.blocks.push({
        id: createBlockId(),
        type: 'highlight-ref',
        text: highlight.text || '',
        highlightId
      });
    }
    question.linkedHighlightIds = question.linkedHighlightIds || [];
    if (!question.linkedHighlightIds.some(idValue => String(idValue) === String(highlightId))) {
      question.linkedHighlightIds.push(highlightId);
    }
    await question.save();
    res.status(200).json(question);
  } catch (error) {
    console.error("❌ Error adding highlight to question:", error);
    res.status(500).json({ error: "Failed to add highlight to question." });
  }
});

app.delete('/api/questions/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const removed = await Question.findOneAndDelete({ _id: id, userId });
    if (!removed) return res.status(404).json({ error: "Question not found." });
    res.status(200).json({ message: "Deleted." });
  } catch (error) {
    console.error("❌ Error deleting question:", error);
    res.status(500).json({ error: "Failed to delete question." });
  }
});

app.post('/api/questions/:id/link-highlight', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { highlightId } = req.body;
    if (!highlightId) return res.status(400).json({ error: "highlightId is required." });
    const updated = await Question.findOneAndUpdate(
      { _id: id, userId },
      { $addToSet: { linkedHighlightIds: highlightId } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Question not found." });
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error linking highlight to question:", error);
    res.status(500).json({ error: "Failed to link highlight." });
  }
});

app.get('/api/boards/:scopeType/:scopeId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const scopeType = normalizeBoardScopeType(req.params.scopeType);
    if (!scopeType) return res.status(400).json({ error: 'Invalid scopeType.' });
    let scopeId = normalizeBoardScopeId(scopeType, req.params.scopeId);
    if (!scopeId) return res.status(400).json({ error: 'scopeId is required.' });
    if (scopeType === 'concept') {
      if (mongoose.Types.ObjectId.isValid(scopeId)) {
        const conceptExists = await TagMeta.exists({ _id: scopeId, userId });
        if (!conceptExists) return res.status(404).json({ error: 'Concept not found.' });
        scopeId = String(scopeId);
      } else {
        const conceptByName = await TagMeta.findOne({
          name: new RegExp(`^${escapeRegExp(scopeId)}$`, 'i'),
          userId
        }).select('_id');
        if (!conceptByName) return res.status(404).json({ error: 'Concept not found.' });
        scopeId = String(conceptByName._id);
      }
    }
    if (scopeType === 'question') {
      if (!mongoose.Types.ObjectId.isValid(scopeId)) {
        return res.status(400).json({ error: 'Invalid question scopeId.' });
      }
      const questionExists = await Question.exists({ _id: scopeId, userId });
      if (!questionExists) return res.status(404).json({ error: 'Question not found.' });
    }

    const board = await Board.findOneAndUpdate(
      { userId, scopeType, scopeId },
      { $setOnInsert: { userId, scopeType, scopeId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const items = await BoardItem.find({ boardId: board._id }).sort({ createdAt: 1, _id: 1 });
    const edges = await BoardEdge.find({ boardId: board._id }).sort({ createdAt: 1, _id: 1 });
    res.status(200).json({ board, items, edges });
  } catch (error) {
    console.error('❌ Error loading board:', error);
    res.status(500).json({ error: 'Failed to load board.' });
  }
});

app.post('/api/boards/:boardId/items', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const board = await ensureBoardOwnership(userId, req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found.' });

    const type = normalizeBoardItemType(req.body?.type);
    if (!type) return res.status(400).json({ error: 'Invalid item type.' });
    const role = normalizeBoardItemRole(req.body?.role, 'idea');

    const payload = await resolveBoardItemPayload({
      userId,
      type,
      sourceId: req.body?.sourceId,
      text: req.body?.text
    });
    if (!payload) {
      return res.status(400).json({ error: 'sourceId is invalid for this item type.' });
    }

    const item = await BoardItem.create({
      boardId: board._id,
      type,
      role,
      sourceId: payload.sourceId,
      noteId: payload.noteId,
      articleId: payload.articleId,
      highlightId: payload.highlightId,
      text: payload.text,
      x: normalizeBoardNumber(req.body?.x, 40),
      y: normalizeBoardNumber(req.body?.y, 40),
      w: normalizeBoardNumber(req.body?.w, 320, { min: 180, max: 1800 }),
      h: normalizeBoardNumber(req.body?.h, 220, { min: 120, max: 1400 })
    });

    await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
    res.status(201).json(item);
  } catch (error) {
    console.error('❌ Error creating board item:', error);
    res.status(500).json({ error: 'Failed to create board item.' });
  }
});

app.put('/api/boards/:boardId/items', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const board = await ensureBoardOwnership(userId, req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found.' });

    const updates = Array.isArray(req.body?.items) ? req.body.items : [];
    if (updates.length === 0) return res.status(200).json({ items: [] });

    const ops = updates
      .filter(item => item && mongoose.Types.ObjectId.isValid(item._id))
      .map(item => ({
        updateOne: {
          filter: { _id: item._id, boardId: board._id },
          update: {
            $set: {
              x: normalizeBoardNumber(item.x, 0),
              y: normalizeBoardNumber(item.y, 0),
              w: normalizeBoardNumber(item.w, 320, { min: 180, max: 1800 }),
              h: normalizeBoardNumber(item.h, 220, { min: 120, max: 1400 })
            }
          }
        }
      }));

    if (ops.length > 0) {
      await BoardItem.bulkWrite(ops, { ordered: false });
      await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
    }

    const items = await BoardItem.find({ boardId: board._id }).sort({ createdAt: 1, _id: 1 });
    res.status(200).json({ items });
  } catch (error) {
    console.error('❌ Error updating board items:', error);
    res.status(500).json({ error: 'Failed to update board items.' });
  }
});

app.patch('/api/boards/:boardId/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const board = await ensureBoardOwnership(userId, req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found.' });

    const existing = await BoardItem.findOne({ _id: req.params.itemId, boardId: board._id });
    if (!existing) return res.status(404).json({ error: 'Board item not found.' });

    const patch = {};
    if (typeof req.body?.role !== 'undefined') {
      patch.role = normalizeBoardItemRole(req.body.role, '');
      if (!patch.role) return res.status(400).json({ error: 'Invalid role.' });
      if (patch.role === 'evidence') {
        const sourceId = String(existing.sourceId || '').trim();
        if (sourceId) {
          if (existing.type === 'note' && !existing.noteId) patch.noteId = sourceId;
          if (existing.type === 'article' && !existing.articleId) patch.articleId = sourceId;
          if (existing.type === 'highlight' && !existing.highlightId) patch.highlightId = sourceId;
        }
      }
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No updates provided.' });
    }

    const item = await BoardItem.findOneAndUpdate(
      { _id: existing._id, boardId: board._id },
      { $set: patch },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Board item not found.' });

    await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
    res.status(200).json(item);
  } catch (error) {
    console.error('❌ Error patching board item:', error);
    res.status(500).json({ error: 'Failed to update board item.' });
  }
});

app.post('/api/boards/:boardId/edges', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const board = await ensureBoardOwnership(userId, req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found.' });

    const fromItemId = String(req.body?.fromItemId || '').trim();
    const toItemId = String(req.body?.toItemId || '').trim();
    const relation = normalizeBoardRelation(req.body?.relation);
    if (!mongoose.Types.ObjectId.isValid(fromItemId) || !mongoose.Types.ObjectId.isValid(toItemId)) {
      return res.status(400).json({ error: 'fromItemId and toItemId are required.' });
    }
    if (!relation) return res.status(400).json({ error: 'Invalid relation.' });
    if (fromItemId === toItemId) return res.status(400).json({ error: 'Cannot link a card to itself.' });

    const [fromItem, toItem] = await Promise.all([
      BoardItem.findOne({ _id: fromItemId, boardId: board._id }).select('_id'),
      BoardItem.findOne({ _id: toItemId, boardId: board._id }).select('_id')
    ]);
    if (!fromItem || !toItem) return res.status(404).json({ error: 'Board item not found.' });

    let edge;
    try {
      edge = await BoardEdge.create({
        boardId: board._id,
        fromItemId: fromItem._id,
        toItemId: toItem._id,
        relation
      });
    } catch (error) {
      if (error?.code === 11000) {
        edge = await BoardEdge.findOne({
          boardId: board._id,
          fromItemId: fromItem._id,
          toItemId: toItem._id,
          relation
        });
      } else {
        throw error;
      }
    }

    await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
    res.status(201).json(edge);
  } catch (error) {
    console.error('❌ Error creating board edge:', error);
    res.status(500).json({ error: 'Failed to create board edge.' });
  }
});

app.delete('/api/boards/:boardId/edges/:edgeId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const board = await ensureBoardOwnership(userId, req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found.' });

    const removed = await BoardEdge.findOneAndDelete({ _id: req.params.edgeId, boardId: board._id });
    if (!removed) return res.status(404).json({ error: 'Board edge not found.' });

    await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
    res.status(200).json({ message: 'Deleted.' });
  } catch (error) {
    console.error('❌ Error deleting board edge:', error);
    res.status(500).json({ error: 'Failed to delete board edge.' });
  }
});

app.delete('/api/boards/:boardId/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const board = await ensureBoardOwnership(userId, req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found.' });
    const removed = await BoardItem.findOneAndDelete({ _id: req.params.itemId, boardId: board._id });
    if (!removed) return res.status(404).json({ error: 'Board item not found.' });
    await BoardEdge.deleteMany({
      boardId: board._id,
      $or: [
        { fromItemId: removed._id },
        { toItemId: removed._id }
      ]
    });
    await Board.updateOne({ _id: board._id }, { $set: { updatedAt: new Date() } });
    res.status(200).json({ message: 'Deleted.' });
  } catch (error) {
    console.error('❌ Error deleting board item:', error);
    res.status(500).json({ error: 'Failed to delete board item.' });
  }
});

// GET /api/concepts/:tagName/references - where concept is used
app.get('/api/concepts/:tagName/references', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { tagName } = req.params;

    const highlightAgg = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': tagName } },
      { $project: { _id: '$highlights._id' } }
    ]);
    const highlightIds = highlightAgg.map(h => h._id);

    const notebookEntries = await NotebookEntry.find({
      userId,
      $or: [
        { linkedHighlightIds: { $in: highlightIds } },
        { content: { $regex: new RegExp(`#${tagName}\\b`, 'i') } }
      ]
    }).select('title updatedAt');

    const collections = await Collection.find({
      userId,
      highlightIds: { $in: highlightIds }
    }).select('name slug');

    const notesCount = await ConceptNote.countDocuments({
      userId,
      tagName: { $regex: new RegExp(`^${tagName}$`, 'i') }
    });

    res.status(200).json({
      notebookEntries,
      collections,
      conceptNotesCount: notesCount
    });
  } catch (error) {
    console.error("❌ Error fetching concept references:", error);
    res.status(500).json({ error: "Failed to fetch concept references." });
  }
});

// GET /api/highlights/:id/related - semantic neighbors
app.get('/api/highlights/:id/related', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const sourceId = buildEmbeddingId({
      userId: String(userId),
      objectType: 'highlight',
      objectId: String(id)
    });
    const matches = await fetchSimilarEmbeddings({
      userId,
      sourceId,
      types: ['highlight'],
      limit: 6,
      requestId: req.requestId
    });
    const results = await hydrateSemanticResults({ matches, userId });
    res.status(200).json({ results });
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/concepts/:id/related - semantic neighbors
app.get('/api/concepts/:id/related', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, userId }
      : { name: id, userId };
    const concept = await TagMeta.findOne(query)
      .select('name pinnedHighlightIds');
    if (!concept) {
      return res.status(404).json({ error: 'Concept not found.' });
    }
    const sourceId = buildEmbeddingId({
      userId: String(userId),
      objectType: 'concept',
      objectId: String(concept._id || concept.name)
    });
    const matches = await fetchSimilarEmbeddings({
      userId,
      sourceId,
      types: ['highlight', 'concept'],
      limit: 12,
      requestId: req.requestId
    });
    let results = await hydrateSemanticResults({ matches, userId });
    const pinnedSet = new Set((concept.pinnedHighlightIds || []).map(item => String(item)));
    results = filterOutIds(results, 'highlight', pinnedSet);
    results = results.filter(item => {
      if (item.objectType !== 'concept') return true;
      const metadataName = item.metadata?.name || '';
      if (metadataName && metadataName === concept.name) return false;
      if (String(item.objectId) === String(concept._id)) return false;
      return true;
    });
    res.status(200).json({ results });
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/questions/:id/related - semantic neighbors
app.get('/api/questions/:id/related', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const question = await Question.findOne({ _id: id, userId })
      .select('conceptName linkedTagName linkedHighlightIds');
    if (!question) {
      return res.status(404).json({ error: 'Question not found.' });
    }
    const sourceId = buildEmbeddingId({
      userId: String(userId),
      objectType: 'question',
      objectId: String(question._id)
    });
    const matches = await fetchSimilarEmbeddings({
      userId,
      sourceId,
      types: ['highlight', 'concept'],
      limit: 12,
      requestId: req.requestId
    });
    let results = await hydrateSemanticResults({ matches, userId });
    const linkedSet = new Set((question.linkedHighlightIds || []).map(item => String(item)));
    results = filterOutIds(results, 'highlight', linkedSet);
    const conceptName = question.conceptName || question.linkedTagName || '';
    if (conceptName) {
      results = results.filter(item => {
        if (item.objectType !== 'concept') return true;
        const metadataName = item.metadata?.name || item.title || '';
        return metadataName !== conceptName;
      });
    }
    res.status(200).json({ results });
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/notebook/:id/related - semantic neighbors
app.get('/api/notebook/:id/related', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const entry = await NotebookEntry.findOne({ _id: id, userId })
      .select('blocks title');
    if (!entry) {
      return res.status(404).json({ error: 'Notebook entry not found.' });
    }
    const firstBlock = entry.blocks?.[0];
    if (!firstBlock?.id) {
      return res.status(200).json({ results: [] });
    }
    const sourceId = buildEmbeddingId({
      userId: String(userId),
      objectType: 'notebook_block',
      objectId: String(entry._id),
      subId: String(firstBlock.id)
    });
    const matches = await fetchSimilarEmbeddings({
      userId,
      sourceId,
      types: ['highlight', 'concept', 'question', 'article'],
      limit: 12,
      requestId: req.requestId
    });
    const results = await hydrateSemanticResults({ matches, userId });
    res.status(200).json({ results });
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/highlights/:id/references - notebook entries & collections containing highlight
app.get('/api/highlights/:id/references', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const notebookEntries = await NotebookEntry.find({ userId, linkedHighlightIds: id })
      .select('title updatedAt');
    const collections = await Collection.find({ userId, highlightIds: id })
      .select('name slug');
    res.status(200).json({ notebookEntries, collections });
  } catch (error) {
    console.error("❌ Error fetching highlight references:", error);
    res.status(500).json({ error: "Failed to fetch highlight references." });
  }
});

// GET /api/articles/:id/references - where article's highlights are used
app.get('/api/articles/:id/references', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const article = await Article.findOne({ _id: id, userId }).select('highlights');
    if (!article) {
      return res.status(404).json({ error: "Article not found." });
    }
    const highlightIds = (article.highlights || []).map(h => h._id);
    if (highlightIds.length === 0) {
      return res.status(200).json({ highlightCount: 0, notebookEntries: [], collections: [] });
    }
    const notebookEntries = await NotebookEntry.find({ userId, linkedHighlightIds: { $in: highlightIds } })
      .select('title updatedAt');
    const collections = await Collection.find({ userId, highlightIds: { $in: highlightIds } })
      .select('name slug');
    res.status(200).json({
      highlightCount: highlightIds.length,
      notebookEntries,
      collections
    });
  } catch (error) {
    console.error("❌ Error fetching article references:", error);
    res.status(500).json({ error: "Failed to fetch article references." });
  }
});

// GET /api/articles/:id/backlinks - all "used in" backlinks for an article
app.get('/api/articles/:id/backlinks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const article = await Article.findOne({ _id: id, userId }).select('highlights title');
    if (!article) {
      return res.status(404).json({ error: 'Article not found.' });
    }
    const highlightIds = (article.highlights || []).map(h => h._id);
    const directEdges = await ReferenceEdge.find({
      userId,
      targetType: 'article',
      targetId: id
    }).lean();
    const highlightEdges = highlightIds.length > 0
      ? await ReferenceEdge.find({
        userId,
        targetType: 'highlight',
        targetId: { $in: highlightIds }
      }).lean()
      : [];
    const notebookBlocks = await buildNotebookBlocksFromEdges({
      userId,
      edges: [...directEdges, ...highlightEdges]
    });
    const concepts = await TagMeta.find({ userId, pinnedArticleIds: id })
      .select('name description updatedAt');
    const collections = await Collection.find({
      userId,
      $or: [
        { articleIds: id },
        { highlightIds: { $in: highlightIds } }
      ]
    }).select('name slug updatedAt');
    res.status(200).json({
      notebookBlocks,
      concepts,
      questions: [],
      collections
    });
  } catch (error) {
    console.error('❌ Error fetching article backlinks:', error);
    res.status(500).json({ error: 'Failed to fetch backlinks.' });
  }
});

// GET /api/highlights/:id/backlinks - all "used in" backlinks for a highlight
app.get('/api/highlights/:id/backlinks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const highlightAgg = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $match: { 'highlights._id': new mongoose.Types.ObjectId(id) } },
      { $project: { _id: '$highlights._id' } }
    ]);
    if (highlightAgg.length === 0) {
      return res.status(404).json({ error: 'Highlight not found.' });
    }
    const notebookBlocks = await loadNotebookBacklinks({
      userId,
      targetType: 'highlight',
      targetId: id
    });
    const concepts = await TagMeta.find({ userId, pinnedHighlightIds: id })
      .select('name description updatedAt');
    const questions = await Question.find({ userId, linkedHighlightIds: id })
      .select('text status conceptName linkedTagName updatedAt');
    const collections = await Collection.find({ userId, highlightIds: id })
      .select('name slug updatedAt');
    res.status(200).json({
      notebookBlocks,
      concepts,
      questions,
      collections
    });
  } catch (error) {
    console.error('❌ Error fetching highlight backlinks:', error);
    res.status(500).json({ error: 'Failed to fetch backlinks.' });
  }
});

// GET /api/concepts/:id/backlinks - all "used in" backlinks for a concept
app.get('/api/concepts/:id/backlinks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    let concept = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      concept = await TagMeta.findOne({ _id: id, userId });
    }
    if (!concept) {
      concept = await TagMeta.findOne({ userId, name: new RegExp(`^${id}$`, 'i') });
    }
    if (!concept) {
      return res.status(404).json({ error: 'Concept not found.' });
    }
    const tagName = String(concept.name || '').toLowerCase();
    const notebookBlocks = await loadNotebookBacklinks({
      userId,
      targetType: 'concept',
      targetTagName: tagName
    });
    const questions = await Question.find({
      userId,
      $or: [
        { conceptName: new RegExp(`^${tagName}$`, 'i') },
        { linkedTagName: new RegExp(`^${tagName}$`, 'i') }
      ]
    }).select('text status conceptName linkedTagName updatedAt');
    res.status(200).json({
      notebookBlocks,
      concepts: [],
      questions,
      collections: []
    });
  } catch (error) {
    console.error('❌ Error fetching concept backlinks:', error);
    res.status(500).json({ error: 'Failed to fetch backlinks.' });
  }
});

// GET /api/questions/:id/backlinks - all "used in" backlinks for a question
app.get('/api/questions/:id/backlinks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const question = await Question.findOne({ _id: id, userId }).select('_id text');
    if (!question) {
      return res.status(404).json({ error: 'Question not found.' });
    }
    const notebookBlocks = await loadNotebookBacklinks({
      userId,
      targetType: 'question',
      targetId: id
    });
    res.status(200).json({
      notebookBlocks,
      concepts: [],
      questions: [],
      collections: []
    });
  } catch (error) {
    console.error('❌ Error fetching question backlinks:', error);
    res.status(500).json({ error: 'Failed to fetch backlinks.' });
  }
});

// Reference edges endpoints
app.get('/api/references/for-highlight/:highlightId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { highlightId } = req.params;
    const edges = await ReferenceEdge.find({
      userId,
      targetType: 'highlight',
      targetId: highlightId
    });

    const entryIds = edges.map(edge => edge.sourceId);
    const entries = await NotebookEntry.find({ userId, _id: { $in: entryIds } })
      .select('title updatedAt');
    const entryMap = new Map(entries.map(entry => [entry._id.toString(), entry]));

    const notebookBlocks = edges.map(edge => {
      const entry = entryMap.get(edge.sourceId.toString());
      return {
        notebookEntryId: edge.sourceId,
        notebookTitle: entry?.title || 'Untitled',
        blockId: edge.sourceBlockId,
        blockPreviewText: edge.blockPreviewText || '',
        updatedAt: entry?.updatedAt
      };
    });

    const collections = await Collection.find({ userId, highlightIds: highlightId })
      .select('name slug');

    res.status(200).json({ notebookBlocks, collections });
  } catch (error) {
    console.error('❌ Error fetching references for highlight:', error);
    res.status(500).json({ error: 'Failed to load references.' });
  }
});

app.get('/api/references/for-article/:articleId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { articleId } = req.params;
    const article = await Article.findOne({ _id: articleId, userId }).select('highlights title');
    if (!article) {
      return res.status(404).json({ error: 'Article not found.' });
    }

    const highlightIds = (article.highlights || []).map(h => h._id);
    const edges = await ReferenceEdge.find({
      userId,
      targetType: 'highlight',
      targetId: { $in: highlightIds }
    });

    const entryIds = edges.map(edge => edge.sourceId);
    const entries = await NotebookEntry.find({ userId, _id: { $in: entryIds } })
      .select('title updatedAt');
    const entryMap = new Map(entries.map(entry => [entry._id.toString(), entry]));

    const notebookBlocks = edges.map(edge => {
      const entry = entryMap.get(edge.sourceId.toString());
      return {
        notebookEntryId: edge.sourceId,
        notebookTitle: entry?.title || 'Untitled',
        blockId: edge.sourceBlockId,
        blockPreviewText: edge.blockPreviewText || '',
        updatedAt: entry?.updatedAt
      };
    });

    const collections = await Collection.find({
      userId,
      $or: [
        { articleIds: articleId },
        { highlightIds: { $in: highlightIds } }
      ]
    }).select('name slug');

    res.status(200).json({ notebookBlocks, collections });
  } catch (error) {
    console.error('❌ Error fetching references for article:', error);
    res.status(500).json({ error: 'Failed to load references.' });
  }
});

app.get('/api/references/for-concept/:tagName', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const tagName = String(req.params.tagName || '').toLowerCase();
    const edges = await ReferenceEdge.find({
      userId,
      targetType: 'concept',
      targetTagName: tagName
    });

    const entryIds = edges.map(edge => edge.sourceId);
    const entries = await NotebookEntry.find({ userId, _id: { $in: entryIds } })
      .select('title updatedAt');
    const entryMap = new Map(entries.map(entry => [entry._id.toString(), entry]));

    const notebookBlocks = edges.map(edge => {
      const entry = entryMap.get(edge.sourceId.toString());
      return {
        notebookEntryId: edge.sourceId,
        notebookTitle: entry?.title || 'Untitled',
        blockId: edge.sourceBlockId,
        blockPreviewText: edge.blockPreviewText || '',
        updatedAt: entry?.updatedAt
      };
    });

    res.status(200).json({ notebookBlocks, collections: [] });
  } catch (error) {
    console.error('❌ Error fetching references for concept:', error);
    res.status(500).json({ error: 'Failed to load references.' });
  }
});

app.get('/api/references/for-notebook/:notebookId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { notebookId } = req.params;
    const edges = await ReferenceEdge.find({
      userId,
      sourceType: 'notebook',
      sourceId: notebookId
    });

    const entry = await NotebookEntry.findOne({ userId, _id: notebookId }).select('title updatedAt');
    const notebookBlocks = edges.map(edge => ({
      notebookEntryId: edge.sourceId,
      notebookTitle: entry?.title || 'Untitled',
      blockId: edge.sourceBlockId,
      blockPreviewText: edge.blockPreviewText || '',
      updatedAt: entry?.updatedAt,
      targetType: edge.targetType,
      targetId: edge.targetId,
      targetTagName: edge.targetTagName
    }));

    res.status(200).json({ notebookBlocks, collections: [] });
  } catch (error) {
    console.error('❌ Error fetching references for notebook:', error);
    res.status(500).json({ error: 'Failed to load references.' });
  }
});

// --- SAVED VIEWS CRUD ---
app.get('/api/views', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const views = await SavedView.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json(views);
  } catch (error) {
    console.error("❌ Error fetching views:", error);
    res.status(500).json({ error: "Failed to fetch views." });
  }
});

app.post('/api/views', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description = '', targetType = 'highlights', filters = {} } = req.body;
    const view = new SavedView({ name, description, targetType, filters, userId });
    await view.save();
    res.status(201).json(view);
  } catch (error) {
    console.error("❌ Error creating view:", error);
    res.status(500).json({ error: "Failed to create view." });
  }
});

app.get('/api/views/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const view = await SavedView.findOne({ _id: req.params.id, userId });
    if (!view) return res.status(404).json({ error: "View not found." });
    res.status(200).json(view);
  } catch (error) {
    console.error("❌ Error fetching view:", error);
    res.status(500).json({ error: "Failed to fetch view." });
  }
});

app.put('/api/views/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, targetType, filters } = req.body;
    const updated = await SavedView.findOneAndUpdate(
      { _id: req.params.id, userId },
      { name, description, targetType, filters },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "View not found." });
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating view:", error);
    res.status(500).json({ error: "Failed to update view." });
  }
});

app.delete('/api/views/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const deleted = await SavedView.findOneAndDelete({ _id: req.params.id, userId });
    if (!deleted) return res.status(404).json({ error: "View not found." });
    res.status(200).json({ message: "View deleted." });
  } catch (error) {
    console.error("❌ Error deleting view:", error);
    res.status(500).json({ error: "Failed to delete view." });
  }
});

// Execute a saved view
app.get('/api/views/:id/run', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const view = await SavedView.findOne({ _id: req.params.id, userId });
    if (!view) return res.status(404).json({ error: "View not found." });

    const { targetType, filters = {} } = view;
    const { tags = [], textQuery = '', dateFrom, dateTo, folders = [] } = filters;
    const regex = textQuery ? new RegExp(textQuery, 'i') : null;
    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo);

    let items = [];

    if (targetType === 'articles') {
      const pipeline = [
        { $match: { userId: new mongoose.Types.ObjectId(userId) } }
      ];
      if (folders && folders.length > 0) {
        pipeline.push({ $match: { $or: [{ folder: { $in: folders.map(f => new mongoose.Types.ObjectId(f)) } }, { folder: { $exists: false } }] } });
      }
      if (regex) {
        pipeline.push({ $match: { $or: [{ title: regex }, { content: regex }] } });
      }
      if (tags && tags.length > 0) {
        pipeline.push({ $unwind: '$highlights' });
        pipeline.push({ $match: { 'highlights.tags': { $in: tags } } });
        pipeline.push({
          $group: {
            _id: '$_id',
            title: { $first: '$title' },
            url: { $first: '$url' },
            createdAt: { $first: '$createdAt' },
            updatedAt: { $first: '$updatedAt' }
          }
        });
      }
      if (Object.keys(dateFilter).length > 0) {
        pipeline.push({ $match: { createdAt: dateFilter } });
      }
      items = await Article.aggregate(pipeline);
    } else if (targetType === 'notebook') {
      const query = { userId };
      if (regex) query.$or = [{ title: regex }, { content: regex }];
      if (tags && tags.length > 0) query.tags = { $in: tags };
      if (Object.keys(dateFilter).length > 0) query.createdAt = dateFilter;
      items = await NotebookEntry.find(query).sort({ updatedAt: -1 });
    } else {
      // highlights
      const pipeline = [
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' }
      ];
      if (tags && tags.length > 0) {
        pipeline.push({ $match: { 'highlights.tags': { $in: tags } } });
      }
      if (regex) {
        pipeline.push({ $match: { $or: [{ 'highlights.text': regex }, { 'highlights.note': regex }] } });
      }
      if (Object.keys(dateFilter).length > 0) {
        pipeline.push({ $match: { 'highlights.createdAt': dateFilter } });
      }
      pipeline.push({
        $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          createdAt: '$highlights.createdAt',
          articleId: '$_id',
          articleTitle: '$title'
        }
      });
      items = await Article.aggregate(pipeline);
    }

    res.status(200).json({ targetType, items });
  } catch (error) {
    console.error("❌ Error running view:", error);
    res.status(500).json({ error: "Failed to run view." });
  }
});

const dailyPrompts = [
  'What did you learn today?',
  'Which two ideas connect from what you read?',
  'What would you teach someone from today’s highlights?',
  'What surprised you today?',
  'What’s a question you want to chase tomorrow?',
  'What should you remember six months from now?',
  'What did you disagree with, and why?'
];

const getDailyPrompt = (date = new Date()) => {
  const key = date.toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % dailyPrompts.length;
  }
  return { id: hash, text: dailyPrompts[hash] };
};

// Aggregate "today" endpoint (optional wrapper)
app.get('/api/today', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const now = new Date();
    const cutoff7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const highlightCountAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $count: 'total' }
    ]);
    const totalHighlights = highlightCountAgg[0]?.total || 0;
    const sampleSize = Math.min(5, totalHighlights);

    const resurfacePromise = totalHighlights === 0 ? Promise.resolve([]) : Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleTitle: '$title',
          articleId: '$_id',
          createdAt: '$highlights.createdAt'
      } },
      { $sample: { size: sampleSize } }
    ]);

    const journeyPromise = Article.find({ userId, createdAt: { $gte: cutoff7 } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title createdAt url');

    const notebookPromise = NotebookEntry.find({ userId }).sort({ updatedAt: -1 }).limit(3).select('title updatedAt');

    const activeConceptsPromise = Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: cutoff7 } } },
      { $unwind: '$highlights.tags' },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 5 }
    ]);

    const [resurfacedHighlights, recentArticles, recentNotebookEntries, activeConceptsAgg] = await Promise.all([
      resurfacePromise,
      journeyPromise,
      notebookPromise,
      activeConceptsPromise
    ]);

    res.status(200).json({
      resurfacedHighlights: resurfacedHighlights || [],
      recentArticles,
      recentNotebookEntries,
      activeConcepts: activeConceptsAgg.map(t => ({ tag: t._id, count: t.count })),
      dailyPrompt: getDailyPrompt(now)
    });
  } catch (error) {
    console.error("❌ Error building today snapshot:", error);
    res.status(500).json({ error: "Failed to load today snapshot." });
  }
});

const handleReadwiseImport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required.' });
    }

    const csvText = req.file.buffer.toString('utf8');
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = Array.isArray(parsed.data) ? parsed.data : [];

    let importedArticles = 0;
    let importedHighlights = 0;
    let skippedRows = 0;

    const articleCache = new Map();
    const dirtyArticles = new Set();
    const userId = req.user.userId;

    for (const row of rows) {
      const highlightText = String(findRowValue(row, ['Highlight', 'Text', 'Highlight text'])).trim();
      if (!highlightText) {
        skippedRows += 1;
        continue;
      }

      const title = String(findRowValue(row, ['Title', 'Book Title', 'Article Title'])).trim() || 'Untitled';
      const author = String(findRowValue(row, ['Author'])).trim();
      let url = String(findRowValue(row, ['URL', 'Source URL', 'Link'])).trim();
      if (!url) {
        const base = `${slugify(title)}-${slugify(author || 'source')}`;
        url = `import://readwise/${base || 'untitled'}`;
      }

      const note = String(findRowValue(row, ['Note', 'Notes'])).trim();
      const tagsValue = findRowValue(row, ['Tags', 'Tag']);
      const tags = parseTagList(tagsValue);
      const tagList = tags.length > 0 ? tags : ['imported'];

      const dateValue = findRowValue(row, ['Highlighted at', 'Created at', 'Added', 'Date']);
      const parsedDate = dateValue ? new Date(dateValue) : null;
      const createdAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date();

      let article = articleCache.get(url);
      if (!article) {
        article = await Article.findOne({ userId, url });
        if (!article) {
          article = new Article({
            url,
            title,
            content: '',
            userId
          });
          importedArticles += 1;
        }
        articleCache.set(url, article);
      }

      const alreadyExists = (article.highlights || []).some(h => (
        h.text === highlightText
      ));

      if (alreadyExists) {
        skippedRows += 1;
        continue;
      }

      article.highlights.push({
        text: highlightText,
        note,
        tags: tagList,
        createdAt
      });
      dirtyArticles.add(article._id.toString());
      importedHighlights += 1;
    }

    await Promise.all(
      Array.from(articleCache.values())
        .filter(article => dirtyArticles.has(article._id.toString()))
        .map(article => article.save())
    );

    res.status(200).json({
      importedArticles,
      importedHighlights,
      skippedRows,
      parseErrors: parsed.errors ? parsed.errors.length : 0
    });
  } catch (err) {
    console.error('Readwise CSV import failed:', err);
    res.status(500).json({ error: 'Failed to import Readwise CSV.' });
  }
};

// POST /api/import/readwise-csv - import highlights from Readwise CSV export
app.post('/api/import/readwise-csv', authenticateToken, upload.single('file'), handleReadwiseImport);
// POST /api/import/readwise - MVP Readwise CSV import
app.post('/api/import/readwise', authenticateToken, upload.single('file'), handleReadwiseImport);

// POST /api/import/markdown - import a markdown file as a notebook entry
app.post('/api/import/markdown', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Markdown file is required.' });
    }
    const originalName = req.file.originalname || 'imported-note.md';
    const title = path.basename(originalName, path.extname(originalName)) || 'Imported note';
    const markdown = req.file.buffer.toString('utf8');

    const createBlockId = () => {
      if (crypto.randomUUID) return crypto.randomUUID();
      return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };
    const escapeHtml = (value = '') =>
      String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const lines = markdown.split(/\r?\n/);
    const blocks = [];
    const htmlParts = [];
    let listItems = [];

    const flushList = () => {
      if (listItems.length === 0) return;
      htmlParts.push(`<ul>${listItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
      listItems = [];
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        return;
      }
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const text = trimmed.slice(2).trim();
        listItems.push(text);
        blocks.push({
          id: createBlockId(),
          type: 'bullet',
          text,
          indent: 0
        });
        return;
      }
      flushList();
      htmlParts.push(`<p>${escapeHtml(trimmed)}</p>`);
      blocks.push({
        id: createBlockId(),
        type: 'paragraph',
        text: trimmed
      });
    });
    flushList();

    const content = htmlParts.join('') || `<p>${escapeHtml(markdown.trim())}</p>`;

    const entry = new NotebookEntry({
      title,
      content,
      blocks,
      userId: req.user.id
    });
    await entry.save();
    if (blocks.length > 0) {
      await syncNotebookReferences(req.user.id, entry._id, blocks);
    }

    res.status(200).json({ importedNotes: 1, entryId: entry._id });
  } catch (err) {
    console.error('Markdown import failed:', err);
    res.status(500).json({ error: 'Failed to import markdown file.' });
  }
});

// GET /api/export/notebook/:id - export a notebook entry as markdown
app.get('/api/export/notebook/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const entry = await NotebookEntry.findOne({ _id: id, userId });
    if (!entry) {
      return res.status(404).json({ error: 'Notebook entry not found.' });
    }
    ensureNotebookBlocks(entry, createBlockId);
    const markdown = buildNotebookMarkdown(entry);
    const fileName = `${slugify(entry.title || 'notebook-entry') || 'notebook-entry'}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(markdown);
  } catch (error) {
    console.error('❌ Error exporting notebook entry:', error);
    res.status(500).json({ error: 'Failed to export notebook entry.' });
  }
});

// GET /api/export/concepts/:id - export a concept as markdown
app.get('/api/export/concepts/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    let concept = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      concept = await TagMeta.findOne({ _id: id, userId });
    }
    if (!concept) {
      concept = await TagMeta.findOne({ userId, name: new RegExp(`^${id}$`, 'i') });
    }
    if (!concept) {
      return res.status(404).json({ error: 'Concept not found.' });
    }
    const meta = await getConceptMeta(userId, concept.name);
    const related = await getConceptRelated(userId, concept.name, { limit: 50, offset: 0 });
    const questions = await Question.find({
      userId,
      $or: [
        { conceptName: new RegExp(`^${concept.name}$`, 'i') },
        { linkedTagName: new RegExp(`^${concept.name}$`, 'i') }
      ]
    }).select('text').lean();
    const markdown = buildConceptMarkdown({ concept: meta, related, questions });
    const fileName = `${slugify(meta.name || 'concept') || 'concept'}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(markdown);
  } catch (error) {
    console.error('❌ Error exporting concept:', error);
    res.status(500).json({ error: 'Failed to export concept.' });
  }
});

// GET /public/concepts/:slug - public concept view (no auth)
app.get('/public/concepts/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const concept = await TagMeta.findOne({ slug, isPublic: true }).lean();
    if (!concept) {
      return res.status(404).json({ error: 'Public concept not found.' });
    }
    const userId = concept.userId;
    const related = await getConceptRelated(userId, concept.name, { limit: 50, offset: 0 });
    const questions = await Question.find({
      userId,
      $or: [
        { conceptName: new RegExp(`^${concept.name}$`, 'i') },
        { linkedTagName: new RegExp(`^${concept.name}$`, 'i') }
      ]
    }).select('text status updatedAt').lean();
    res.status(200).json({
      concept: {
        name: concept.name,
        description: concept.description || '',
        slug: concept.slug
      },
      highlights: related.highlights || [],
      articles: related.articles || [],
      questions: questions || []
    });
  } catch (error) {
    console.error('❌ Error loading public concept:', error);
    res.status(500).json({ error: 'Failed to load public concept.' });
  }
});

// --- EXPORT JSON ---
app.get('/api/export/json', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [articles, notebookEntries, collections, tagsMeta, views] = await Promise.all([
      Article.find({ userId }).lean(),
      NotebookEntry.find({ userId }).lean(),
      Collection.find({ userId }).lean(),
      TagMeta.find({ userId }).lean(),
      SavedView.find({ userId }).lean()
    ]);

    // Flatten highlights across articles for convenience
    const highlights = [];
    articles.forEach(a => {
      (a.highlights || []).forEach(h => {
        highlights.push({
          _id: h._id,
          text: h.text,
          note: h.note,
          tags: h.tags,
          createdAt: h.createdAt,
          articleId: a._id,
          articleTitle: a.title
        });
      });
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      articles,
      highlights,
      notebookEntries,
      collections,
      tagsMeta,
      views
    };

    res.status(200).json(payload);
  } catch (error) {
    console.error("❌ Error exporting data:", error);
    res.status(500).json({ error: "Failed to export data." });
  }
});

// --- EXPORT PDF ZIP (per-item PDFs) ---
app.get('/api/export/pdf-zip', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [articles, notebookEntries, collections, tagsMeta] = await Promise.all([
      Article.find({ userId }).lean(),
      NotebookEntry.find({ userId }).lean(),
      Collection.find({ userId }).lean(),
      TagMeta.find({ userId }).lean()
    ]);

    const highlights = [];
    articles.forEach(a => {
      (a.highlights || []).forEach(h => {
        highlights.push({
          _id: h._id,
          text: h.text,
          note: h.note,
          tags: h.tags,
          createdAt: h.createdAt,
          articleId: a._id,
          articleTitle: a.title
        });
      });
    });

    const slugify = (str) => {
      const base = (str || 'untitled').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return base || 'item';
    };

    const makePdfBuffer = async (title, lines = []) => {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margins: { top: 50, bottom: 50, left: 50, right: 50 } });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.addPage();
        doc.fontSize(18).text(title || 'Untitled', { underline: false });
        doc.moveDown();
        doc.fontSize(11);
        lines.forEach((line) => {
          doc.text(line || '', { lineGap: 4 });
          doc.moveDown(0.3);
        });
        doc.end();
      });
    };

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="note-taker-export-pdfs.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('❌ Error building PDF zip:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to build PDF export.' });
      } else {
        res.end();
      }
    });
    archive.pipe(res);

    const articleTitleMap = new Map();
    articles.forEach(a => articleTitleMap.set(a._id.toString(), a.title || 'Untitled article'));

    // Articles
    for (const a of articles) {
      const lines = [
        `URL: ${a.url || 'n/a'}`,
        `Folder ID: ${a.folder || 'none'}`,
        `Created: ${a.createdAt ? new Date(a.createdAt).toLocaleString() : 'n/a'}`,
        `Updated: ${a.updatedAt ? new Date(a.updatedAt).toLocaleString() : 'n/a'}`,
        '',
        'Content:',
        (a.content || '').slice(0, 4000)
      ];
      const buf = await makePdfBuffer(a.title || 'Article', lines);
      archive.append(buf, { name: `articles/${slugify(a.title)}-${a._id}.pdf` });
    }

    // Highlights
    for (const h of highlights) {
      const lines = [
        `Article: ${h.articleTitle || 'Untitled'}`,
        `Created: ${h.createdAt ? new Date(h.createdAt).toLocaleString() : 'n/a'}`,
        `Tags: ${(h.tags || []).join(', ') || 'none'}`,
        '',
        'Text:',
        h.text || '',
        '',
        'Note:',
        h.note || 'No note.'
      ];
      const buf = await makePdfBuffer('Highlight', lines);
      archive.append(buf, { name: `highlights/${slugify(h.articleTitle)}-${h._id}.pdf` });
    }

    // Notebook entries
    for (const n of notebookEntries) {
      const lines = [
        `Created: ${n.createdAt ? new Date(n.createdAt).toLocaleString() : 'n/a'}`,
        `Updated: ${n.updatedAt ? new Date(n.updatedAt).toLocaleString() : 'n/a'}`,
        '',
        n.content || 'No content.'
      ];
      const buf = await makePdfBuffer(n.title || 'Notebook Entry', lines);
      archive.append(buf, { name: `notebook/${slugify(n.title)}-${n._id}.pdf` });
    }

    // Collections
    for (const c of collections) {
      const lines = [
        `Description: ${c.description || ''}`,
        `Article IDs: ${(c.articleIds || []).join(', ') || 'none'}`,
        `Highlight IDs: ${(c.highlightIds || []).join(', ') || 'none'}`,
        `Created: ${c.createdAt ? new Date(c.createdAt).toLocaleString() : 'n/a'}`
      ];
      const buf = await makePdfBuffer(c.name || 'Collection', lines);
      archive.append(buf, { name: `collections/${slugify(c.name)}-${c._id}.pdf` });
    }

    // Tag metadata
    for (const t of tagsMeta) {
      const lines = [
        `Description: ${t.description || ''}`,
        `Pinned highlights: ${(t.pinnedHighlightIds || []).length}`,
        `Created: ${t.createdAt ? new Date(t.createdAt).toLocaleString() : 'n/a'}`
      ];
      const buf = await makePdfBuffer(t.name || 'Tag', lines);
      archive.append(buf, { name: `tags/${slugify(t.name)}-${t._id}.pdf` });
    }

    archive.finalize();
  } catch (error) {
    console.error("❌ Error exporting PDF zip:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to export PDF bundle." });
    }
  }
});

// POST /api/brain/generate - enqueue AI summary
app.post('/api/brain/generate', authenticateToken, async (req, res) => {
  const { timeRange = '30d' } = req.body || {};
  const allowedRanges = ['7d', '30d', '90d'];
  const safeRange = allowedRanges.includes(timeRange) ? timeRange : '30d';
  enqueueBrainSummary({ userId: req.user.id, timeRange: safeRange });
  res.status(202).json({ status: 'queued' });
});

// GET /api/brain/summary?timeRange=7d - cached AI summary
app.get('/api/brain/summary', authenticateToken, async (req, res) => {
  try {
    const timeRange = req.query.timeRange || '30d';
    const summary = await BrainSummary.findOne({
      userId: req.user.id,
      timeRange
    }).sort({ generatedAt: -1 });

    if (!summary) {
      return res.status(200).json({ status: 'missing' });
    }

    const maxAgeMs = 24 * 60 * 60 * 1000;
    const isFresh = Date.now() - new Date(summary.generatedAt).getTime() < maxAgeMs;
    res.status(200).json({
      status: isFresh ? 'fresh' : 'stale',
      summary
    });
  } catch (error) {
    console.error("❌ Error fetching brain summary:", error);
    res.status(500).json({ error: "Failed to fetch brain summary." });
  }
});

// Reflection snapshot (lightweight)
app.get('/api/reflection', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const range = req.query.range || '30d';
    const days = parseInt(range.replace(/d/i, ''), 10);
    const windowDays = Number.isNaN(days) ? 30 : days;
    const now = new Date();
    const currentStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const previousStart = new Date(now.getTime() - windowDays * 2 * 24 * 60 * 60 * 1000);

    const tagAggForRange = async (start, end) => Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: start, ...(end ? { $lt: end } : {}) } } },
      { $unwind: '$highlights.tags' },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]);

    const [currentTags, previousTags, openQuestions] = await Promise.all([
      tagAggForRange(currentStart, null),
      tagAggForRange(previousStart, currentStart),
      Question.find({ userId, status: 'open' }).sort({ createdAt: -1 }).lean()
    ]);

    const prevMap = new Map(previousTags.map(t => [t._id, t.count]));
    const mostActiveConcepts = currentTags.slice(0, 5).map(t => ({ tag: t._id, count: t.count }));

    const increasedConcepts = currentTags
      .map(t => {
        const prevCount = prevMap.get(t._id) || 0;
        return { tag: t._id, currentCount: t.count, previousCount: prevCount, delta: t.count - prevCount };
      })
      .filter(t => t.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);

    res.status(200).json({
      mostActiveConcepts,
      increasedConcepts,
      openQuestions
    });
  } catch (error) {
    console.error('❌ Error building reflection snapshot:', error);
    res.status(500).json({ error: 'Failed to load reflection snapshot.' });
  }
});

// Structured reflections (editorial snapshot)
app.get('/api/reflections', authenticateToken, async (req, res) => {
  try {
    const range = req.query.range || '14d';
    const data = await getReflections(req.user.id, range);
    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error building reflections snapshot:', error);
    res.status(500).json({ error: 'Failed to load reflections.' });
  }
});

// GET /api/journey?range=30d - article activity snapshot
app.get('/api/journey', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const range = (req.query.range || '30d').toLowerCase();
    const rangeDays = { '7d': 7, '30d': 30, '90d': 90 };
    const days = rangeDays[range] || null;
    const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

    const pipeline = [
      { $match: { userId } },
      { $unwind: '$highlights' }
    ];

    if (cutoff) {
      pipeline.push({ $match: { 'highlights.createdAt': { $gte: cutoff } } });
    }

    pipeline.push({
      $group: {
        _id: '$_id',
        title: { $first: '$title' },
        url: { $first: '$url' },
        createdAt: { $first: '$createdAt' },
        highlightCount: { $sum: 1 },
        tags: { $push: '$highlights.tags' }
      }
    });

    pipeline.push({ $sort: { highlightCount: -1, createdAt: -1 } });

    const aggregated = await Article.aggregate(pipeline);

    const results = aggregated.map(doc => {
      const flatTags = (doc.tags || []).flat().filter(Boolean);
      const counts = {};
      flatTags.forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
      });
      const topTags = Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([tag]) => tag);

      return {
        _id: doc._id,
        title: doc.title,
        url: doc.url,
        createdAt: doc.createdAt,
        highlightCount: doc.highlightCount,
        topTags
      };
    });

    res.status(200).json(results);
  } catch (error) {
    console.error("❌ Error building journey feed:", error);
    res.status(500).json({ error: "Failed to load journey." });
  }
});

// --- COLLECTIONS ---
// GET /api/collections
app.get('/api/collections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const collections = await Collection.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json(collections);
  } catch (error) {
    console.error("❌ Error fetching collections:", error);
    res.status(500).json({ error: "Failed to fetch collections." });
  }
});

// POST /api/collections
app.post('/api/collections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description = '', slug, articleIds = [], highlightIds = [] } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required." });
    const computedSlug = slug ? slugify(slug) : slugify(name);
    const newCollection = new Collection({
      name: name.trim(),
      description: description.trim(),
      slug: computedSlug,
      articleIds,
      highlightIds,
      userId
    });
    await newCollection.save();
    res.status(201).json(newCollection);
  } catch (error) {
    console.error("❌ Error creating collection:", error);
    if (error.code === 11000) {
      return res.status(409).json({ error: "Slug already exists." });
    }
    res.status(500).json({ error: "Failed to create collection." });
  }
});

// GET /api/collections/:slug
app.get('/api/collections/:slug', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const collection = await Collection.findOne({ slug, userId });
    if (!collection) {
      return res.status(404).json({ error: "Collection not found." });
    }

    const articles = await Article.find({ _id: { $in: collection.articleIds }, userId })
      .select('title url createdAt highlights');

    const highlightIdSet = new Set((collection.highlightIds || []).map(id => id.toString()));
    let highlights = [];
    if (highlightIdSet.size > 0) {
      const highlightAgg = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights._id': { $in: Array.from(highlightIdSet).map(id => new mongoose.Types.ObjectId(id)) } } },
        { $project: {
            _id: '$highlights._id',
            text: '$highlights.text',
            tags: '$highlights.tags',
            articleTitle: '$title',
            articleId: '$_id',
            createdAt: '$highlights.createdAt'
        } }
      ]);
      highlights = highlightAgg;
    }

    res.status(200).json({
      collection,
      articles: articles.map(a => ({
        _id: a._id,
        title: a.title,
        url: a.url,
        createdAt: a.createdAt,
        highlightCount: (a.highlights || []).length
      })),
      highlights
    });
  } catch (error) {
    console.error("❌ Error fetching collection detail:", error);
    res.status(500).json({ error: "Failed to fetch collection." });
  }
});

// PUT /api/collections/:id
app.put('/api/collections/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, slug, articleIds, highlightIds } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (slug !== undefined) updates.slug = slugify(slug || name || '');
    if (articleIds !== undefined) updates.articleIds = articleIds;
    if (highlightIds !== undefined) updates.highlightIds = highlightIds;

    const updated = await Collection.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: "Collection not found." });
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating collection:", error);
    if (error.code === 11000) {
      return res.status(409).json({ error: "Slug already exists." });
    }
    res.status(500).json({ error: "Failed to update collection." });
  }
});

// DELETE /api/collections/:id
app.delete('/api/collections/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await Collection.findOneAndDelete({ _id: id, userId });
    if (!deleted) return res.status(404).json({ error: "Collection not found." });
    res.status(200).json({ message: "Collection deleted." });
  } catch (error) {
    console.error("❌ Error deleting collection:", error);
    res.status(500).json({ error: "Failed to delete collection." });
  }
});

// --- RESURFACE HIGHLIGHTS (random sample) ---
app.get('/api/resurface', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Count total highlights for this user
    const countAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $count: 'total' }
    ]);
    const totalHighlights = countAgg[0]?.total || 0;

    if (totalHighlights === 0) {
      return res.status(200).json({ dailyRandomHighlights: [] });
    }

    const sampleSize = Math.min(5, totalHighlights);

    const dailyRandomHighlights = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleTitle: '$title',
          articleId: '$_id',
          createdAt: '$highlights.createdAt'
      } },
      { $sample: { size: sampleSize } }
    ]);

    res.status(200).json({ dailyRandomHighlights });
  } catch (error) {
    console.error("❌ Error building resurface feed:", error);
    res.status(500).json({ error: "Failed to load resurfacing highlights." });
  }
});

// POST /articles/:id/highlights - MODIFIED FOR USER AUTHENTICATION
app.post('/articles/:id/highlights', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { text, note, tags, anchor } = req.body;
    const userId = req.user.id; // Get user ID from authenticated token

    const trimmedText = typeof text === 'string' ? text.trim() : '';
    if (trimmedText.length < 3) {
      return res.status(400).json({ error: "Highlight text is required." });
    }

    const newHighlight = {
        text: trimmedText,
        note: note || '',
        tags: normalizeTags(tags),
        type: 'note',
        claimId: null,
        anchor: anchor ? {
          text: anchor.text || trimmedText,
          prefix: anchor.prefix || '',
          suffix: anchor.suffix || '',
          startOffsetApprox: Number.isFinite(anchor.startOffsetApprox)
            ? anchor.startOffsetApprox
            : undefined
        } : undefined
    };

    // Find article by ID AND ensure it belongs to the authenticated user
    const updatedArticle = await Article.findOneAndUpdate(
      { _id: id, userId: userId },
      { $push: { highlights: newHighlight } },
      { new: true, populate: ['highlights', 'folder'] } // Populate highlights and folder for full response
    );

    if (!updatedArticle) {
      return res.status(404).json({ error: "Article not found or you do not have permission to add highlight." });
    }
    const createdHighlight = updatedArticle.highlights?.[updatedArticle.highlights.length - 1];
    if (createdHighlight) {
      enqueueHighlightEmbedding({ highlight: createdHighlight, article: updatedArticle });
      const highlightItem = safeMapEmbedding(
        () => highlightToEmbeddingItem(
          { ...createdHighlight, articleId: updatedArticle._id, articleTitle: updatedArticle.title },
          String(userId)
        ),
        'highlight'
      );
      if (highlightItem) queueEmbeddingUpsert([highlightItem]);
    }
    res.status(200).json({ article: updatedArticle, highlight: createdHighlight });
  } catch (error) {
    console.error("❌ Error adding highlight:", error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid article ID format." });
    }
    res.status(500).json({ error: "Failed to add highlight.", details: error.message });
  }
});

// PATCH /articles/:articleId/highlights/:highlightId: Update a specific highlight - MODIFIED FOR USER AUTHENTICATION
app.patch('/articles/:articleId/highlights/:highlightId', authenticateToken, async (req, res) => {
  try {
      const { articleId, highlightId } = req.params;
      const { note, tags, type, claimId } = req.body;
      const userId = req.user.id;

      // Find the article by ID AND ensure it belongs to the authenticated user
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) {
          return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      }

      // Find the highlight within the article's highlights array
      const highlight = article.highlights.id(highlightId);
      if (!highlight) {
          return res.status(404).json({ error: "Highlight not found in this article." });
      }

      // Update its properties
      highlight.note = note !== undefined ? note : highlight.note;
      highlight.tags = tags !== undefined ? normalizeTags(tags) : highlight.tags;
      if (type !== undefined) {
        const nextType = normalizeItemType(type, '');
        if (!nextType) {
          return res.status(400).json({ error: 'type must be one of claim, evidence, note.' });
        }
        highlight.type = nextType;
        if (nextType !== 'evidence') {
          highlight.claimId = null;
        }
      }
      if (claimId !== undefined) {
        const nextClaimId = parseClaimId(claimId);
        if (claimId !== null && claimId !== '' && !nextClaimId) {
          return res.status(400).json({ error: 'Invalid claimId.' });
        }
        highlight.claimId = nextClaimId;
      }
      const finalType = normalizeItemType(highlight.type, 'note');
      if (finalType === 'evidence' && highlight.claimId) {
        const claimArticle = await Article.findOne({ userId, 'highlights._id': highlight.claimId }).select('highlights');
        const claimHighlight = claimArticle?.highlights?.id(highlight.claimId) || null;
        if (!claimHighlight || normalizeItemType(claimHighlight.type, 'note') !== 'claim') {
          return res.status(400).json({ error: 'claimId must reference one of your claim highlights.' });
        }
        if (String(claimHighlight._id) === String(highlight._id)) {
          return res.status(400).json({ error: 'An evidence highlight cannot link to itself as a claim.' });
        }
      } else if (finalType !== 'evidence') {
        highlight.claimId = null;
      }

      await article.save();

      // Return just the updated highlight with article info
      const refreshed = await Article.findById(articleId);
      const updatedHighlight = refreshed.highlights.id(highlightId);
      enqueueHighlightEmbedding({ highlight: updatedHighlight, article: refreshed });
      const highlightItem = safeMapEmbedding(
        () => highlightToEmbeddingItem(
          { ...updatedHighlight, articleId: refreshed._id, articleTitle: refreshed.title },
          String(userId)
        ),
        'highlight'
      );
      if (highlightItem) queueEmbeddingUpsert([highlightItem]);
      res.status(200).json({
        _id: updatedHighlight._id,
        articleId: refreshed._id,
        articleTitle: refreshed.title,
        text: updatedHighlight.text,
        note: updatedHighlight.note,
        tags: updatedHighlight.tags,
        type: normalizeItemType(updatedHighlight.type, 'note'),
        claimId: updatedHighlight.claimId || null,
        createdAt: updatedHighlight.createdAt
      });
  } catch (error) {
      console.error("❌ Error updating highlight:", error);
      if (error.name === 'CastError') {
          return res.status(400).json({ error: "Invalid ID format." });
      }
      res.status(500).json({ error: "Failed to update highlight.", details: error.message });
  }
});

// DELETE /articles/:articleId/highlights/:highlightId: Delete a specific highlight - MODIFIED FOR USER AUTHENTICATION
app.delete('/articles/:articleId/highlights/:highlightId', authenticateToken, async (req, res) => {
  try {
      const { articleId, highlightId } = req.params;
      const userId = req.user.id;

      // Find the article by ID AND ensure it belongs to the authenticated user
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) {
          return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      }

      // Use Mongoose's .pull() method to remove the subdocument
      article.highlights.pull(highlightId);
      await article.save();

      // Re-fetch and populate to ensure correct response
      const updatedArticle = await Article.findById(articleId).populate('folder');
      const deleteId = buildEmbeddingId({
        userId: String(userId),
        objectType: 'highlight',
        objectId: String(highlightId)
      });
      queueEmbeddingDelete([deleteId]);
      res.status(200).json(updatedArticle);
  } catch (error) {
      console.error("❌ Error deleting highlight:", error);
      if (error.name === 'CastError') {
          return res.status(400).json({ error: "Invalid ID format." });
      }
      res.status(500).json({ error: "Failed to delete highlight.", details: error.message });
  }
});

// --- AI Reindex ---
app.post('/api/ai/reindex', authenticateToken, async (req, res) => {
  try {
    if (!isAiEnabled()) {
      return res.status(400).json({ error: 'AI indexing is disabled.' });
    }
    if (process.env.NODE_ENV === 'production') {
      const secret = process.env.AI_REINDEX_SECRET || '';
      const header = req.headers['x-ai-reindex-secret'];
      if (!secret || header !== secret) {
        return res.status(403).json({ error: 'Reindex not permitted.' });
      }
    }

    const userId = req.user.id;
    const [articles, notebookEntries, concepts, questions] = await Promise.all([
      Article.find({ userId }).lean(),
      NotebookEntry.find({ userId }).lean(),
      TagMeta.find({ userId }).lean(),
      Question.find({ userId }).lean()
    ]);

    const items = [];

    articles.forEach(article => {
      const articleItems = safeMapEmbedding(
        () => articleToEmbeddingItems(article, String(userId)),
        'article'
      );
      if (Array.isArray(articleItems)) items.push(...articleItems);
      (article.highlights || []).forEach(highlight => {
        const highlightItem = safeMapEmbedding(
          () => highlightToEmbeddingItem(
            { ...highlight, articleId: article._id, articleTitle: article.title },
            String(userId)
          ),
          'highlight'
        );
        if (highlightItem) items.push(highlightItem);
      });
    });

    notebookEntries.forEach(entry => {
      const blockItems = safeMapEmbedding(
        () => notebookEntryToEmbeddingItems(entry, String(userId)),
        'notebook'
      );
      if (Array.isArray(blockItems)) items.push(...blockItems);
    });

    concepts.forEach(concept => {
      const conceptItem = safeMapEmbedding(
        () => conceptToEmbeddingItem(concept, String(userId)),
        'concept'
      );
      if (conceptItem) items.push(conceptItem);
    });

    questions.forEach(question => {
      const questionItem = safeMapEmbedding(
        () => questionToEmbeddingItem(question, String(userId)),
        'question'
      );
      if (questionItem) items.push(questionItem);
    });

    const batchSize = Number(process.env.AI_UPSERT_BATCH || 100);
    let indexed = 0;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await upsertEmbeddings(batch);
      indexed += batch.length;
    }

    res.status(200).json({ indexed });
  } catch (error) {
    console.error('❌ AI reindex failed:', error);
    res.status(500).json({ error: 'Failed to reindex embeddings.' });
  }
});

// --- AI / AI SERVICE HEALTH ---
app.get('/api/ai/health', authenticateToken, async (req, res) => {
  if (!isAiEnabled()) {
    return res.status(503).json({
      error: 'AI_DISABLED',
      hint: 'Set AI_ENABLED=true to enable AI features.'
    });
  }
  try {
    const data = await checkUpstreamHealth({ requestId: req.requestId });
    res.status(200).json(data);
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(502).json({ error: 'UPSTREAM_FAILED', message: error.message });
  }
});

// --- AI service smoke test ---
app.get('/api/ai/hf-smoke', authenticateToken, async (req, res) => {
  try {
    const data = await checkUpstreamHealth({ requestId: req.requestId });
    res.status(200).json(data);
  } catch (error) {
    if (error.payload || error instanceof EmbeddingError) {
      return sendEmbeddingError(res, error);
    }
    res.status(502).json({ error: 'UPSTREAM_FAILED', message: error.message });
  }
});

// --- DEBUG ---
app.get('/api/debug/time', (req, res) => {
  const serverNowSec = Math.floor(Date.now() / 1000);
  res.status(200).json({ serverNowISO: new Date().toISOString(), serverNowSec });
});

app.get('/api/debug/auth', authenticateToken, (req, res) => {
  const serverNowSec = Math.floor(Date.now() / 1000);
  res.status(200).json({
    tokenSource: req.authInfo?.tokenSource || 'unknown',
    serverNowSec,
    iat: req.authInfo?.iat,
    exp: req.authInfo?.exp
  });
});

app.get('/api/debug/ai-upstream', (req, res) => {
  const { origin, hasPath } = parseAiServiceUrl(process.env.AI_SERVICE_URL || '');
  const synthesizeUrl = origin ? joinUrl(origin, '/synthesize') : '';
  res.status(200).json({
    ai_service_origin: origin,
    synthesize_url: synthesizeUrl,
    looks_valid: Boolean(origin) && !hasPath,
    has_path: hasPath
  });
});

// --- HEALTH CHECK ENDPOINT to prevent cold starts ---
app.get("/health", (req, res) => {
  // This route does nothing but send a success status.
  // It's a lightweight way for a pinging service to keep the server alive.
  console.log("Health check ping received.");
  res.status(200).json({ status: "ok", message: "Server is warm." });
});

// Root endpoint for health check
app.get('/', (req, res) => res.send('✅ Note Taker backend is running!'));

// Start the server (explicit host binding for Render/containers)
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
  const { origin, hasPath } = parseAiServiceUrl(process.env.AI_SERVICE_URL || '');
  const synthUrl = origin ? joinUrl(origin, '/synthesize') : '';
  if (synthUrl) {
    console.log('AI upstream URL:', synthUrl);
  }
  if (hasPath) {
    console.warn('[AI-UPSTREAM] AI_SERVICE_URL includes a path; using origin only.');
  }
});
