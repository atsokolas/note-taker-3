// What the reader saves: sources, folders, highlights and the threads between them.
const mongoose = require('mongoose');
const { importMetaSchema, pencilSchema } = require('./pieces');

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

// Folder Schema and Model - MODIFIED TO INCLUDE userId
const folderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  /* The cabinet is a tree. Null is a top-level drawer, which is what every
     folder was until now — the field is additive and every existing folder
     keeps its place without a migration. Same shape notebookFolderSchema has
     used since it was written. */
  parentFolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  asFeed: { type: Boolean, default: false },
  /* When this folder was screened, so the masthead of a scroll can leave a
     receipt. updatedAt is last-touched and would date the receipt from an
     unrelated rename; a decision needs the day the decision was made. */
  asFeedAt: { type: Date, default: null }
}, { timestamps: true });

folderSchema.index({ name: 1, userId: 1 }, { unique: true });
folderSchema.index({ userId: 1, name: 1 });
folderSchema.index({ userId: 1, parentFolderId: 1, name: 1 });

const Folder = mongoose.model('Folder', folderSchema);

const articleSchema = new mongoose.Schema({
  url: { type: String, required: true },
  title: { type: String, required: true },
  content: String,
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  highlights: [{
    text: String,
    note: String,
    noteRevision: { type: Number, default: 0 },
    thoughtOperations: [{
      _id: false,
      operationId: String,
      requestHash: String,
      noteHash: String,
      noteRevision: Number,
      savedAt: Date
    }],
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
    /* How many times its passage has been opened. The reader deepens the ink
       a step or two; the number itself is never shown. */
    opens: { type: Number, default: 0, min: 0 },
    /* The printed page, for a mark made at the reading desk. A Kindle mark
       has a location instead, kept where its import put it. */
    page: { type: Number, min: 1 },
    importMeta: { type: importMetaSchema, default: /** @returns {object} */ () => ({}) },
    pencil: { type: pencilSchema, default: null }
  }],
  pencil: { type: pencilSchema, default: null },
  pdfs: { type: [pdfAttachmentSchema], default: [] },
  author: { type: String, default: '' },
  publicationDate: { type: String, default: '' },
  siteName: { type: String, default: '' },
  importMeta: { type: importMetaSchema, default: /** @returns {object} */ () => ({}) },
  /* Evergreen: the reader's own declaration that this one is permanent.
     Everything else in the product is measured against a clock — what changed
     overnight, what has gone unread, what is drifting. Some reading is not
     like that. It is held for life, and it should be reachable forever and
     never counted as neglected. This is the only flag on either object that
     the human sets and no agent may. */
  evergreen: { type: Boolean, default: false },
  evergreenAt: { type: Date, default: null },
  /* Closing a book: the day you finished it, as your own calendar named it
     ("2026-10-19"), and the one sentence you said you would remember. The
     sentence comes back to you on that day a year later. */
  finishedOn: { type: String, default: '' },
  closingLine: { type: String, default: '', trim: true },
  /* Each earlier reading of a book read again: its day, its sentence, and
     the moment you started over. Marks made before that moment belong to
     it and stay, in fainter ink. */
  readBefore: [{
    _id: false,
    finishedOn: String,
    closingLine: String,
    until: Date
  }],
  /* Lending a book: the address a friend reads your copy at, your marks and
     your sentence as they stand, until you take it back. Empty when not lent. */
  lentAs: { type: String, default: '' },
  /* Placement is the Hey pile. Keep is forever and orthogonal. Later is owed
     a move; set aside is at hand this week; stream is home. Agents may move
     piles too (place_article), as they may delete what they wrote. */
  placement: { type: String, enum: ['stream', 'later', 'setAside'], default: 'stream', index: true },
  placementAt: { type: Date, default: null },
  placementReason: { type: String, default: '', trim: true },
  hiddenFromHome: { type: Boolean, default: false },
  debugOnly: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  // A book moved onto the shelf from a second copy: where its marks went.
  mergedInto: { type: mongoose.Schema.Types.ObjectId, default: null },
  /* Stamped by GET /articles/:id. lastOpenedAt is read by the reading loop.
     Opens within half an hour are one visit; previousVisitAt is when the
     visit before this one began, which the reader's return greeting reads. */
  lastOpenedAt: { type: Date, default: null },
  visitStartedAt: { type: Date, default: null },
  previousVisitAt: { type: Date, default: null },
  /* Set only when we already learned it: a fetch, or the reader's own Open
     source check, answered 404 or 410. Never crawled for. */
  sourceGoneAt: { type: Date, default: null },
  sourceCheckedAt: { type: Date, default: null }
}, { timestamps: true });

articleSchema.index({ url: 1, userId: 1 }, { unique: true });
articleSchema.index({ lentAs: 1 }, { unique: true, partialFilterExpression: { lentAs: { $gt: '' } } });
articleSchema.index({ userId: 1, evergreen: 1, updatedAt: -1 });
articleSchema.index({ userId: 1, placement: 1, placementAt: -1 });
articleSchema.index({ userId: 1, createdAt: -1 });
articleSchema.index({ userId: 1, createdAt: -1, _id: -1 });
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

// Reading is private continuity, not an edit to the source or its saved date.
const articleReadingStateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  articleId: { type: mongoose.Schema.Types.ObjectId, required: true },
  anchor: {
    text: { type: String, required: true, maxlength: 6000 },
    prefix: { type: String, default: '', maxlength: 240 },
    suffix: { type: String, default: '', maxlength: 240 },
    startOffsetApprox: { type: Number, required: true, min: 0 }
  },
  ratio: { type: Number, required: true, min: 0, max: 1 },
  visitedAt: { type: Date, required: true }
}, { timestamps: true });
articleReadingStateSchema.index({ userId: 1, articleId: 1 }, { unique: true });
articleReadingStateSchema.index({ userId: 1, visitedAt: -1, _id: -1 });
const ArticleReadingState = mongoose.model('ArticleReadingState', articleReadingStateSchema);

const returnQueueFiredSchema = new mongoose.Schema({
  title: { type: String, default: '', trim: true },
  href: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true },
  fromPlacement: { type: String, default: '', trim: true },
  home: { type: String, default: 'imbox', trim: true },
  fromAt: { type: Date, default: null }
}, { _id: false });

const returnQueueEntrySchema = new mongoose.Schema({
  itemType: { type: String, required: true, trim: true },
  itemId: { type: String, required: true, trim: true },
  reason: { type: String, default: '', trim: true },
  dueAt: { type: Date, default: null },
  cadence: { type: String, enum: ['weekly', 'monthly'], default: null },
  lastFiredOn: { type: String, default: '', trim: true },
  fired: { type: returnQueueFiredSchema, default: null },
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
connectionSchema.index({ userId: 1, fromType: 1, fromId: 1, createdAt: -1 });
connectionSchema.index({ userId: 1, toType: 1, toId: 1, createdAt: -1 });

const Connection = mongoose.model('Connection', connectionSchema);

/* How a source bears on something it seems close to, as the model judged
   it once: about is "source>type:id"; relation is argues, bears or none;
   says is the source's side when it argues. */
const connectionJudgmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  about: { type: String, required: true },
  relation: { type: String, enum: ['argues', 'bears', 'none'], required: true },
  says: { type: String, default: '' }
}, { timestamps: true });
connectionJudgmentSchema.index({ userId: 1, about: 1 }, { unique: true });

const ConnectionJudgment = mongoose.model('ConnectionJudgment', connectionJudgmentSchema);

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
  } catch (/** @type {any} */ error) {
    if (error?.codeName === 'IndexNotFound' || error?.code === 27) return;
    console.warn('⚠️ Unable to drop legacy connection index:', error?.message || error);
  }
};


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
referenceEdgeSchema.index({ userId: 1, sourceType: 1, sourceId: 1 });

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
  Folder,
  Article,
  ArticleReadingState,
  ReturnQueueEntry,
  Connection,
  ConnectionJudgment,
  ItemViewEvent,
  dropLegacyConnectionIndex,
  ReferenceEdge,
  SavedView,
  Collection
};
