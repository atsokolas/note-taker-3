// Think: notes, notebooks, concepts, questions and boards.
const mongoose = require('mongoose');
const { knowledgeContext, workOperationIndex } = require('./knowledgeContext');
const { buildAuthoredExplorationModel } = require('./authoredExploration');
const { pencilSchema, importMetaSchema } = require('./pieces');

// --- NOTEBOOK: Schema for freeform notes with checklists ---
const checklistItemSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  checked: { type: Boolean, default: false }
}, { _id: true });

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, default: '' },
  checklist: [checklistItemSchema],
  editionContext: {
    type: new mongoose.Schema({
      editionId: { type: mongoose.Schema.Types.ObjectId, required: true },
      itemId: { type: String, default: '' },
      quote: { type: String, default: '', maxlength: 1000 },
      revision: { type: Number, required: true, min: 1 }
    }, { _id: false }),
    default: undefined
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

noteSchema.index({ userId: 1, updatedAt: -1 });

noteSchema.index({ userId: 1, 'editionContext.editionId': 1, 'editionContext.itemId': 1 }, {
  unique: true, partialFilterExpression: { 'editionContext.editionId': { $type: 'objectId' } }
});

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
  sourcePath: { type: String, default: '' },
  conceptId: { type: mongoose.Schema.Types.ObjectId, default: null },
  conceptName: { type: String, default: '' },
  questionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  questionText: { type: String, default: '' },
  status: { type: String, enum: ['open', 'answered'], default: 'open' },
  // A line written out from the outline and not yet written over.
  pencil: { type: Boolean }
}, { _id: false });

const notebookAsidePieceSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, default: '' },
  index: { type: Number, default: 0 },
  beforeId: { type: String, default: '' },
  afterId: { type: String, default: '' },
  nodes: { type: [mongoose.Schema.Types.Mixed], default: [] },
  blocks: { type: [notebookBlockSchema] }
}, { _id: false });

const notebookWorkbenchTargetSchema = new mongoose.Schema({
  blockId: { type: String, default: '', maxlength: 160 },
  offset: { type: Number, default: 0, min: 0 },
  baseText: { type: String, default: '', maxlength: 20000 },
  scope: { type: String, enum: ['word', 'sentence', 'range'] },
  rangeStart: { type: Number, min: 0 },
  rangeEnd: { type: Number, min: 0 }
}, { _id: false });

const notebookWorkbenchMaterialSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 160 },
  kind: { type: String, enum: ['highlight', 'article', 'concept', 'question', 'wiki'], required: true },
  title: { type: String, default: '', maxlength: 1000 },
  text: { type: String, default: '', maxlength: 30000 },
  sourceId: { type: String, default: '', maxlength: 200 },
  articleId: { type: String, default: '', maxlength: 200 },
  highlightId: { type: String, default: '', maxlength: 200 },
  sourcePath: { type: String, default: '', maxlength: 3000 },
  target: { type: notebookWorkbenchTargetSchema, default: () => ({}) },
  insertedBlockId: { type: String, default: '', maxlength: 160 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const notebookWorkbenchTrialSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 160 },
  target: { type: notebookWorkbenchTargetSchema, required: true },
  alternative: { type: String, default: '', maxlength: 30000 },
  origin: { type: String, enum: ['human', 'partner'], default: 'human' },
  // Absent on ordinary wording. Present only for a Read tighter proposal.
  intent: { type: String, enum: ['tighter'] },
  partnerExplanation: { type: String, maxlength: 240 },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const notebookWorkbenchThoughtSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 160 },
  text: { type: String, required: true, maxlength: 30000 },
  target: { type: notebookWorkbenchTargetSchema, default: () => ({}) },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

// A passage the writer has dimmed: still on the page, left out of the piece.
const notebookWorkbenchDimmedSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 160 },
  blockId: { type: String, required: true, maxlength: 160 },
  text: { type: String, required: true, maxlength: 20000 },
  offset: { type: Number, default: 0, min: 0 },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const notebookWorkbenchOutlinePointSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 160 },
  text: { type: String, default: '', maxlength: 500 },
  depth: { type: Number, default: 0, min: 0, max: 5 },
  folded: { type: Boolean, default: false },
  blockId: { type: String, default: '', maxlength: 160 }
}, { _id: false });

const notebookWorkbenchNextLineSchema = new mongoose.Schema({
  text: { type: String, default: '', maxlength: 4000 },
  target: { type: notebookWorkbenchTargetSchema, default: () => ({}) },
  updatedAt: { type: Date, default: null }
}, { _id: false });

const notebookWorkbenchContinuitySchema = new mongoose.Schema({
  target: { type: notebookWorkbenchTargetSchema, default: () => ({}) },
  scrollY: { type: Number, default: 0, min: 0 },
  updatedAt: { type: Date, default: null }
}, { _id: false });

const notebookWorkbenchSchema = new mongoose.Schema({
  revision: { type: Number, default: 0, min: 0 },
  materials: { type: [notebookWorkbenchMaterialSchema], default: [] },
  trials: { type: [notebookWorkbenchTrialSchema], default: [] },
  looseThoughts: { type: [notebookWorkbenchThoughtSchema], default: [] },
  dimmed: { type: [notebookWorkbenchDimmedSchema], default: [] },
  outline: { type: [notebookWorkbenchOutlinePointSchema], default: [] },
  nextTimeLine: { type: notebookWorkbenchNextLineSchema, default: () => ({}) },
  continuity: { type: notebookWorkbenchContinuitySchema, default: () => ({}) }
}, { _id: false });

// Where a piece of writing stands for its writer: an idea, being worked on
// (in_progress, "Working"), or done ("Closed"), with the one line of what it
// became. archivedAt is the older "set aside", which reads as closed. Moving it
// is not writing in it, so the stage never touches updatedAt.
const NOTEBOOK_STAGES = ['idea', 'in_progress', 'done'];
const notebookBoardSchema = new mongoose.Schema({
  stage: { type: String, enum: NOTEBOOK_STAGES, default: 'idea' },
  movedAt: { type: Date, default: null },
  archivedAt: { type: Date, default: null },
  became: { type: String, default: '', maxlength: 200 }
}, { _id: false });

const notebookEntrySchema = new mongoose.Schema({
  title: { type: String, default: '', trim: true },
  pencil: { type: pencilSchema, default: null },
  content: { type: String, default: '' },
  blocks: { type: [notebookBlockSchema], default: [] },
  asidePieces: { type: [notebookAsidePieceSchema], default: [] },
  workingState: { type: notebookWorkbenchSchema, default: () => ({}) },
  /* Each sentence of this note read once against a view the reader holds:
     the verdict, and whether the reader set the line aside. */
  viewReadings: {
    type: [new mongoose.Schema({
      key: { type: String, required: true },
      pageId: { type: String, default: '' },
      sentence: { type: String, default: '' },
      verdict: { type: String, enum: ['contradicts', 'supports', 'unrelated', 'unsure'], required: true },
      at: { type: Date, default: Date.now },
      dismissedAt: { type: Date, default: null }
    }, { _id: false })],
    default: [],
    select: false
  },
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'NotebookFolder', default: null },
  type: { type: String, enum: ['claim', 'evidence', 'note'], default: 'note' },
  claimId: { type: mongoose.Schema.Types.ObjectId, default: null },
  tags: { type: [String], default: [] },
  linkedArticleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
  linkedHighlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  importMeta: { type: importMetaSchema, default: () => ({}) },
  hiddenFromHome: { type: Boolean, default: false },
  debugOnly: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  board: { type: notebookBoardSchema, default: () => ({}) },
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
notebookEntrySchema.index({ userId: 1, createdAt: -1, _id: -1 });
notebookEntrySchema.index({ userId: 1, type: 1, updatedAt: -1 });
notebookEntrySchema.index({ userId: 1, tags: 1, updatedAt: -1 });
notebookEntrySchema.index({ userId: 1, linkedHighlightIds: 1 });

notebookEntrySchema.plugin(knowledgeContext);
notebookEntrySchema.add({
  revision: { type: Number, default: 0, min: 0 },
  occurredOn: { type: String, default: '' },
  trashedAt: { type: Date, default: null },
  deletionBatchId: { type: String, default: null },
  erasedAt: { type: Date, default: null },
  withText: { type: String, default: '' },
  capturedAt: { type: Date, immutable: true },
  takenOn: { type: String, immutable: true },
  timeZone: { type: String, immutable: true },
  workItem: { type: mongoose.Schema.Types.Mixed, default: undefined },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'NotebookFolder', default: null },
  operationId: { type: String, immutable: true },
  operationSource: { type: String, immutable: true },
  continuesFromEntryId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
  continuationFence: { type: Number, select: false },
  continuationBridge: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true }
});
notebookEntrySchema.index(workOperationIndex.keys, workOperationIndex.options);
const NotebookEntry = mongoose.model('NotebookEntry', notebookEntrySchema);

const notebookFolderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parentFolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotebookFolder', default: null },
  sortOrder: { type: Number, default: 0 },
  revision: { type: Number, default: 0, min: 0 },
  archivedAt: { type: Date, default: null },
  /* In Work a folder is where a note is filed; a project is an effort with an end,
     and a note in any folder can also be part of one. Paused keeps a project in
     the list but out of the way; done is archivedAt, and the closing line is how
     it ended. The brief is the project's one undated page; links are things
     elsewhere in Noeis kept with it, stored only here so a personal article never
     learns it is in Work. Check-ins are the dated answers to its Monday question. */
  kind: { type: String, enum: ['folder', 'project'], default: 'folder' },
  pausedAt: { type: Date, default: null },
  mutationFence: { type: Number, default: 0, select: false },
  deleted: { type: new mongoose.Schema({ batchId: String, deletedAt: Date, expiresAt: Date, autoErase: { type: Boolean, default: false }, consentVersion: Number, consentedAt: Date, erasedAt: Date, erasureBlocked: String, erasureAttemptedAt: Date, restoredAt: { type: Date, default: null }, entryIds: [{ type: mongoose.Schema.Types.ObjectId }], counts: { notes: Number, tasks: Number, alreadyDeleted: Number, excludedTasks: Number } }, { _id: false }), default: null },
  brief: { type: String, default: '', maxlength: 8000 },
  closingLine: { type: String, default: '', maxlength: 280 },
  links: { type: [new mongoose.Schema({ kind: { type: String, enum: ['article', 'wiki', 'book'], required: true }, id: { type: String, required: true, maxlength: 64 }, title: { type: String, default: '', maxlength: 300 } }, { _id: false })], default: [] },
  checkIns: { type: [new mongoose.Schema({ on: { type: String, required: true }, text: { type: String, required: true, maxlength: 500 } }, { _id: false })], default: [] },
  operationId: { type: String, immutable: true },
  lastMutationId: { type: String },
  importMeta: { type: importMetaSchema, default: () => ({}) }
}, { timestamps: true });

notebookFolderSchema.index({ userId: 1, parentFolderId: 1, sortOrder: 1, name: 1 });

notebookFolderSchema.plugin(knowledgeContext);
notebookFolderSchema.index(workOperationIndex.keys, workOperationIndex.options);
const NotebookFolder = mongoose.model('NotebookFolder', notebookFolderSchema);

/* What a note, concept or question said at a moment, kept so its history can
   be read as sentences and an earlier version restored. One row per stretch of
   editing (see services/entryHistory.js), a few dozen per entry at most. */
const entryRevisionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['note', 'concept', 'question'], required: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: { type: String, enum: ['before', 'edit', 'restore'], default: 'edit' },
  restoredFromAt: { type: Date, default: null },
  // The connection whose words these are; '' is the reader's own hand.
  hand: { type: String, default: '' },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true, minimize: false });

entryRevisionSchema.index({ userId: 1, kind: 1, entryId: 1, createdAt: -1 });

const EntryRevision = mongoose.model('EntryRevision', entryRevisionSchema);

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
  type: { type: String, enum: ['highlight', 'article', 'note', 'question', 'concept', 'wiki_page', 'wiki_claim'], required: true },
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
  type: { type: String, enum: ['highlight', 'article', 'note', 'question', 'concept', 'wiki_page', 'wiki_claim'], required: true },
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

const conceptContinuityAnchorSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['wiki_investigation'],
    default: undefined
  },
  objectType: {
    type: String,
    enum: ['wiki_page'],
    default: undefined
  },
  objectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WikiPage',
    default: undefined
  },
  linkedAt: { type: Date, default: undefined },
  linkedBy: { type: String, enum: ['user'], default: undefined }
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
  continuityAnchor: { type: conceptContinuityAnchorSchema, default: undefined },
  isPublic: { type: Boolean, default: false },
  slug: {
    type: String,
    trim: true,
    default: undefined,
    set: (/** @type {unknown} */ value) => {
      const normalized = String(value || '').trim();
      return normalized || undefined;
    }
  },
  hiddenFromHome: { type: Boolean, default: false },
  debugOnly: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

tagMetaSchema.index({ name: 1, userId: 1 }, { unique: true });
tagMetaSchema.index({ slug: 1 }, { unique: true, sparse: true });
tagMetaSchema.index({ userId: 1, pinnedHighlightIds: 1 });
tagMetaSchema.index({ userId: 1, pinnedArticleIds: 1 });
tagMetaSchema.index({ userId: 1, pinnedNoteIds: 1 });
tagMetaSchema.index(
  {
    userId: 1,
    'continuityAnchor.kind': 1,
    'continuityAnchor.objectType': 1,
    'continuityAnchor.objectId': 1
  },
  {
    unique: true,
    partialFilterExpression: {
      'continuityAnchor.kind': 'wiki_investigation',
      'continuityAnchor.objectType': 'wiki_page',
      'continuityAnchor.objectId': { $type: 'objectId' }
    }
  }
);

const TagMeta = mongoose.model('TagMeta', tagMetaSchema);

const conceptDecisionLessonEvidenceSchema = new mongoose.Schema({
  adoptionId: { type: String, required: true, trim: true },
  targetConceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'TagMeta', required: true },
  sourcePageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiPage', required: true },
  decisionId: { type: String, required: true, trim: true },
  lessonId: { type: String, required: true, trim: true },
  role: { type: String, enum: ['support', 'tension', 'context'], required: true },
  lessonSnapshot: { type: String, required: true, trim: true },
  result: { type: String, enum: ['positive', 'negative', 'mixed'], required: true },
  processScore: { type: Number, default: null, min: 0, max: 1 },
  calibrationNoteSnapshot: { type: String, required: true, trim: true },
  observedAt: { type: Date, required: true },
  observedEvidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
  decisionSourceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
  relatedClaimRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
  acceptedRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', required: true },
  recordedRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', required: true },
  outcomeRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WikiRevision', required: true },
  decisionReceiptId: { type: String, required: true, trim: true },
  outcomeReceiptId: { type: String, required: true, trim: true },
  receiptId: { type: String, required: true, trim: true },
  requestId: { type: String, required: true, trim: true },
  decisionSnapshotHash: { type: String, required: true, trim: true },
  outcomeRecordHash: { type: String, required: true, trim: true },
  payloadHash: { type: String, required: true, trim: true },
  acceptedAt: { type: Date, required: true },
  acceptedBy: { type: String, enum: ['user'], required: true },
  version: { type: Number, default: 1 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

conceptDecisionLessonEvidenceSchema.index({ userId: 1, adoptionId: 1 }, { unique: true });
conceptDecisionLessonEvidenceSchema.index(
  { userId: 1, targetConceptId: 1, sourcePageId: 1, decisionId: 1 },
  { unique: true }
);
conceptDecisionLessonEvidenceSchema.index({ userId: 1, targetConceptId: 1, acceptedAt: -1 });

const ConceptDecisionLessonEvidence = mongoose.model(
  'ConceptDecisionLessonEvidence',
  conceptDecisionLessonEvidenceSchema
);

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

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  /* What would close the loop. A question nothing could settle is a mood,
     and a mood sits on the desk forever looking like work. Optional, because
     catching the question is more urgent than knowing its answer shape — but
     an empty one is said out loud rather than left blank. */
  settledBy: { type: String, default: '', trim: true },
  /* A requested Library look bound to this question. Not an agent run:
     the companion and AgentRun stay out of this write path. Looking is
     session-local; only terminal states are stored. */
  inquiry: {
    brief: { type: String, default: '', trim: true },
    scope: { type: String, default: 'library', trim: true },
    run: {
      id: { type: String, default: '' },
      status: {
        type: String,
        enum: ['idle', 'stopped', 'partial', 'miss', 'complete'],
        default: 'idle'
      },
      boundQuestion: { type: String, default: '' },
      boundBrief: { type: String, default: '' },
      boundScope: { type: String, default: 'library' },
      boundEnough: { type: String, default: '' },
      startedAt: { type: Date, default: null },
      finishedAt: { type: Date, default: null },
      passages: [{
        _id: false,
        key: { type: String, default: '' },
        kind: { type: String, default: 'article' },
        articleId: { type: String, default: '' },
        highlightId: { type: String, default: '' },
        title: { type: String, default: '' },
        passage: { type: String, default: '' },
        href: { type: String, default: '' }
      }],
      gaps: { type: String, default: '' },
      silence: { type: String, default: '' }
    }
  },
  status: { type: String, enum: ['open', 'answered'], default: 'open' },
  linkedTagName: { type: String, default: '' },
  conceptName: { type: String, default: '' },
  blocks: [{
    id: { type: String, required: true },
    type: { type: String, enum: ['paragraph', 'highlight-ref'], default: 'paragraph' },
    text: { type: String, default: '' },
    highlightId: { type: mongoose.Schema.Types.ObjectId, default: null },
    articleId: { type: mongoose.Schema.Types.ObjectId, default: null },
    articleTitle: { type: String, default: '' },
    sourcePath: { type: String, default: '' },
    challenge: {
      enabled: { type: Boolean, default: false },
      createdAt: { type: Date, default: null },
      note: { type: String, default: '' },
      support: { type: [mongoose.Schema.Types.Mixed], default: [] },
      counter: { type: [mongoose.Schema.Types.Mixed], default: [] },
      evidence: { type: [mongoose.Schema.Types.Mixed], default: [] }
    }
  }],
  linkedHighlightId: { type: mongoose.Schema.Types.ObjectId, default: null },
  linkedHighlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  linkedNotebookEntryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  importMeta: { type: importMetaSchema, default: () => ({}) },
  hiddenFromHome: { type: Boolean, default: false },
  debugOnly: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
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

/* A concept Think once shared at a link. Think no longer publishes; the rows
   stay (and follow a rename) so an old link can still find the wiki page the
   concept settled into (routes/retiredShareRoutes.js). */
const sharedConceptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conceptName: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true }
}, { timestamps: true });

sharedConceptSchema.index({ userId: 1, conceptName: 1 }, { unique: true });

const SharedConcept = mongoose.model('SharedConcept', sharedConceptSchema);

/**
 * SharedQuestion — a frozen public snapshot of a question thread.
 *
 * The slug is the URL, the snapshot is the version. Public reads expose only authored
 * paragraph blocks; highlight refs and library material stay private.
 * A later reading sits beside the snapshot, counted on this door.
 * A brief may close the page; it is not inside the snapshot.
 * A successor handoff freezes the decision beside that brief. It is
 * not inside the snapshot. Empty outcome stays off the page.
 * An agent mandate on the same door names owner, scope, tools, budget,
 * stop, and review. It is not inside the snapshot.
 */
const sharedQuestionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  slug: { type: String, required: true, unique: true, index: true },
  ownerDisplayName: { type: String, default: '' },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  contentHash: { type: String, default: '' },
  publishedAt: { type: Date, default: null },
  contributionCount: { type: Number, default: 0 },
  brief: {
    type: new mongoose.Schema({
      agreement: { type: String, default: '' },
      remainder: { type: String, default: '' },
      observation: { type: String, default: '' }
    }, { _id: false }),
    default: () => ({ agreement: '', remainder: '', observation: '' })
  },
  succession: { type: mongoose.Schema.Types.Mixed, default: null },
  mandate: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

sharedQuestionSchema.index({ userId: 1, questionId: 1 }, { unique: true });

const SharedQuestion = mongoose.model('SharedQuestion', sharedQuestionSchema);

/* A bounded reading offered beside a published question.

   It is attributed writing the second person chose to put on the public
   door, not a view of their Library. It never merges into the frozen
   snapshot.    Revoking the share closes the door; the reading stays keyed
   to that slug, so a later publish is a new address. A new reading
   is held until the owner places it beside the question. The owner may
   later say how they take that reading. The original writing and remainder
   stay. Inclusion in a later edition is a later, explicit act.
   userId is the question owner. If the offerer was signed in,
   contributorUserId is theirs so they can see a still-held reading
   and take it back while the door stays open. withdrawnAt is a tombstone
   for concurrent owner acts. The public page stays silent.
   It is not a Library and it is never shown to anyone else. */
const questionContributionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
  slug: { type: String, default: '', index: true },
  by: { type: String, required: true },
  text: { type: String, required: true },
  remainder: { type: String, default: '' },
  interpretation: { type: String, default: '' },
  held: { type: Boolean },
  contributorUserId: { type: String },
  withdrawnAt: { type: Date }
}, { timestamps: true });

questionContributionSchema.index({ slug: 1, createdAt: 1 });
questionContributionSchema.index({ userId: 1, questionId: 1, createdAt: 1 });

const QuestionContribution = mongoose.model('QuestionContribution', questionContributionSchema);

/* Who is at a published question's door.

   Named presence only: the owner, or a signed-in person who already has
   an attributed reading on this slug (placed, held, or withdrawn).
   Unsigned visitors and lurkers are not listed. It is not a visit log,
   not a cursor, and it never enters the frozen snapshot. TTL is applied
   when reading, not with a Mongo expire index, so a fake store can
   project the same cutoff. */
const questionPresenceSchema = new mongoose.Schema({
  slug: { type: String, required: true },
  userId: { type: String, required: true },
  by: { type: String, required: true },
  at: { type: Date, required: true }
});

questionPresenceSchema.index({ slug: 1, userId: 1 }, { unique: true });

const QuestionPresence = mongoose.model('QuestionPresence', questionPresenceSchema);

/* A notebook essay Think once shared at a link. Think no longer publishes;
   the rows stay so an old link can still find the wiki page its note settled
   into (routes/retiredShareRoutes.js). */
const sharedNotebookSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notebookId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotebookEntry', required: true },
  slug: { type: String, required: true, unique: true, index: true }
}, { timestamps: true });

sharedNotebookSchema.index({ userId: 1, notebookId: 1 }, { unique: true });

const SharedNotebook = mongoose.model('SharedNotebook', sharedNotebookSchema);

/* Volumes and the reader letters left on shared notes, from when Think
   published. Nothing reads or writes them now; the models stay so account
   erasure still finds every row that belongs to a reader. */
const retiredShareRows = (/** @type {string} */ name) => mongoose.model(name, new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true }));
const SharedNotebookVolume = retiredShareRows('SharedNotebookVolume');
const NotebookCorrespondence = retiredShareRows('NotebookCorrespondence');
const AuthoredExploration = buildAuthoredExplorationModel(mongoose);

module.exports = {
  Note,
  NotebookEntry,
  NotebookFolder,
  EntryRevision,
  TagMeta,
  ConceptDecisionLessonEvidence,
  ConceptNote,
  Question,
  Board,
  BoardItem,
  BoardEdge,
  WorkingMemoryItem,
  ConceptPath,
  ConceptPathProgress,
  SharedConcept,
  SharedQuestion,
  QuestionContribution,
  QuestionPresence,
  SharedNotebook,
  SharedNotebookVolume,
  NotebookCorrespondence,
  AuthoredExploration
};
