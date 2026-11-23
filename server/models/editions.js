// Papers: the morning paper, Editions and Weekend Readings.
const mongoose = require('mongoose');

// Questions - lightweight thinking queue
/* What the morning paper said, on the morning it said it.

   The paper was a pure function of current state: every load recomputed it,
   yesterday's paper existed nowhere, and it could not be wrong because
   nothing it said survived long enough to be checked. That made it the one
   object in a product built on accountability to your own past claims that
   kept no record of itself.

   What is kept is the assertions, not the rendered page. A page is a blob and
   it rots as titles change and links die; a dated claim about the reader,
   pointing at something, stays legible. */
const paperAssertionSchema = new mongoose.Schema({
  kind: { type: String, required: true, trim: true },
  /* One key per question, not per object — a belief you have not revisited
     and a belief your sources contradict are two different things to be
     asked, and each is counted on its own. */
  targetKey: { type: String, required: true, trim: true },
  pageId: { type: String, default: '', trim: true },
  label: { type: String, default: '', trim: true },
  text: { type: String, default: '', trim: true }
}, { _id: false });

const morningPaperRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /* The edition day, not a timestamp. Reloading the paper is not the paper
     asking again, so a morning has one record however often it is read. */
  day: { type: String, required: true, trim: true },
  assertions: { type: [paperAssertionSchema], default: [] }
}, { timestamps: true });

morningPaperRecordSchema.index({ userId: 1, day: -1 });
morningPaperRecordSchema.index({ userId: 1, day: 1 }, { unique: true });

const MorningPaperRecord = mongoose.model('MorningPaperRecord', morningPaperRecordSchema);

/* Who signed something on a paper: the token's label as evidence, and the
   runtime it connected from (empty when unknown or written by a person). */
const editionSigner = () => ({
  label: { type: String, default: '', trim: true },
  agentTokenId: { type: String, default: '', trim: true },
  runtime: { type: String, default: '', trim: true }
});

/* An edition of a paper an agent maintains for its reader.

   Its own object, not a wiki page. A wiki page is timeless and is built out
   of what you already own; an edition has a window, a run, and cites things
   you have not saved yet. Forcing the second into the first is what buried
   the good one that already existed.

   `savedArticleId` is the door back: it is null until the reader saves the
   source, and then it points at their own library row. That is the arrow
   this object reverses — every other surface here reads library to wiki. */
const editionItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  sourceLabel: { type: String, default: '', trim: true },
  sourceDate: { type: String, default: '', trim: true },
  section: { type: String, default: '', trim: true },
  finding: { type: String, required: true, trim: true },
  /* What would limit the finding. Required by the shape validator rather than
     by mongoose, so the refusal can name the item instead of the path. */
  boundary: { type: String, required: true, trim: true },
  note: { type: String, default: '', trim: true },
  /* The reader's layer, written by the agent: the finding in one plain
     sentence, the source's own words it rests on, what kind of source it is,
     how sure to be, the numbers it turns on, and why the agent picked it for
     this reader. All optional. */
  plain: { type: String, default: '', trim: true },
  why: { type: String, default: '', trim: true },
  passage: { type: String, default: '', trim: true },
  /* Set by the server when the reader saves the source: whether the passage
     is there, word for word. Empty until then. */
  passageCheck: { type: String, enum: ['', 'found', 'missing'], default: '' },
  sourceKind: { type: String, default: '', trim: true },
  confidence: { type: String, default: '', trim: true },
  figures: {
    type: [new mongoose.Schema({
      label: { type: String, required: true, trim: true },
      value: { type: String, required: true, trim: true }
    }, { _id: false })],
    default: undefined
  },
  /* Which agent filed this one. The masthead names whoever wrote the issue
     last, which stops being the whole truth the moment two agents keep the
     same paper — a section is entitled to its own byline. Stored as a string
     because we print the label, we never join on the token — ObjectId here
     turned a malformed token id into a 500 on the paper. */
  filedBy: editionSigner(),
  filedAt: { type: Date, default: null },
  /* Another agent's reading of the same source, filed on its own. Kept beside
     the first rather than dropped: two hands on one source is the most
     editorial thing a paper can show. At most three. */
  readings: {
    type: [new mongoose.Schema({
      filedBy: editionSigner(),
      filedAt: { type: Date, default: null },
      finding: { type: String, required: true, trim: true },
      boundary: { type: String, required: true, trim: true },
      note: { type: String, default: '', trim: true }
    }, { _id: false })],
    default: undefined
  },
  savedArticleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
  /* What the reader did with this arrival. Missing means new. An agent rewrite
     keeps this by URL; the agent cannot set it. */
  readerState: {
    status: { type: String, enum: ['opened', 'later', 'dismissed'], default: undefined },
    at: { type: Date, default: null }
  }
}, { _id: false });

const editionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  profile: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  number: { type: Number, default: null },
  windowStart: { type: Date, required: true },
  windowEnd: { type: Date, required: true },
  headline: { type: String, default: '', trim: true },
  standfirst: { type: String, default: '', trim: true },
  throughLine: { type: String, default: '', trim: true },
  watchNext: { type: [String], default: [] },
  /* What became of the last issue's watch list, line by line. */
  followUps: {
    type: [new mongoose.Schema({
      watch: { type: String, required: true, trim: true },
      status: { type: String, enum: ['happened', 'not_yet', 'dropped'], required: true },
      note: { type: String, default: '', trim: true }
    }, { _id: false })],
    default: undefined
  },
  items: { type: [editionItemSchema], default: [] },
  /* "Looked here; nothing met the bar." One per section per filer, so an empty
     section can say which silence it is. Never an item, a count or an arrival. */
  checks: {
    type: [new mongoose.Schema({
      section: { type: String, required: true, trim: true },
      note: { type: String, default: '', trim: true, maxlength: 280 },
      by: editionSigner(),
      at: { type: Date, default: null }
    }, { _id: false })],
    default: []
  },
  /* Who wrote it. A paper written by an agent says so on its masthead — the
     reader is entitled to know which of their agents to argue with. */
  writtenBy: editionSigner()
}, { timestamps: true });

/* The newsstand reads newest first, per reader. */
editionSchema.index({ userId: 1, windowEnd: -1, createdAt: -1 });
/* One edition per profile per window: an agent asked twice for the same week
   replaces its own draft rather than printing a second copy of Tuesday. */
editionSchema.index({ userId: 1, profile: 1, windowStart: 1, windowEnd: 1 }, { unique: true });

const Edition = mongoose.model('Edition', editionSchema);

/* A topic the reader wants an edition of, and how often.

   The two profiles Noeis ships with are opinions about AI and about a reading
   weekend. They are not the only two subjects a person has. A reader tells
   their agent to keep an edition on biotech, monthly, in four sections, and
   this is where that instruction lives — so every agent they own agrees on
   what the topic is called, what its sections are, and which window today
   belongs to.

   Cadence is stored rather than the window, because a window is a fact about
   a particular issue and the cadence is the standing instruction. Noeis works
   the window out from it, so two agents filing on the same morning file into
   the same issue instead of two. */
const editionProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  key: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  issueLabel: { type: String, default: 'Issue', trim: true },
  cadence: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
  sections: {
    type: [new mongoose.Schema({
      key: { type: String, required: true, trim: true },
      label: { type: String, required: true, trim: true },
      /* Which agent keeps this column, when more than one files into the
         paper. Absent means nobody was named; the paper may still say who
         usually files here, and says it as that. */
      keeper: {
        type: new mongoose.Schema({
          runtime: { type: String, default: '', trim: true },
          label: { type: String, default: '', trim: true, maxlength: 60 }
        }, { _id: false }),
        default: undefined
      }
    }, { _id: false })],
    default: []
  },
  minItems: { type: Number, default: 1 },
  maxItems: { type: Number, default: 15 },
  /* Who asked for it. A topic configured by an agent says which one. */
  configuredBy: editionSigner()
}, { timestamps: true });

/* One topic per key per reader: telling an agent twice to keep a biotech
   edition edits the topic rather than making a second one beside it. */
editionProfileSchema.index({ userId: 1, key: 1 }, { unique: true });

const EditionProfile = mongoose.model('EditionProfile', editionProfileSchema);

const noeisReceiptSchema = new mongoose.Schema({
  receiptId: { type: String, required: true, trim: true },
  kind: { type: String, required: true, trim: true },
  source: { type: String, required: true, trim: true },
  sourceLabel: { type: String, default: '', trim: true },
  status: { type: String, required: true, trim: true },
  title: { type: String, default: '', trim: true },
  summary: { type: String, default: '', trim: true },
  metrics: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  touched: { type: [mongoose.Schema.Types.Mixed], default: [] },
  nextAction: { type: mongoose.Schema.Types.Mixed, default: null },
  provenance: { type: mongoose.Schema.Types.Mixed, default: null },
  error: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAtExternal: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

noeisReceiptSchema.index({ userId: 1, completedAt: -1 });
noeisReceiptSchema.index({ userId: 1, kind: 1, status: 1, completedAt: -1 });
noeisReceiptSchema.index({ userId: 1, kind: 1, 'provenance.eventId': 1, completedAt: -1 });
noeisReceiptSchema.index({ userId: 1, receiptId: 1 }, { unique: true });

const NoeisReceipt = mongoose.model('NoeisReceipt', noeisReceiptSchema);

const morningPaperDeliverySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  localDate: { type: String, required: true, trim: true },
  briefingVersion: { type: String, required: true, trim: true },
  status: { type: String, enum: ['attempting', 'sent', 'skipped', 'failed'], default: 'attempting', index: true },
  provider: { type: String, default: 'resend', trim: true },
  providerMessageId: { type: String, default: '', trim: true },
  recipient: { type: String, default: '', trim: true, lowercase: true },
  attemptedAt: { type: Date, default: Date.now },
  sentAt: { type: Date, default: null },
  skippedAt: { type: Date, default: null },
  skipReason: { type: String, default: '', trim: true },
  failedAt: { type: Date, default: null },
  errorMessage: { type: String, default: '', trim: true }
}, { timestamps: true });

morningPaperDeliverySchema.index(
  { userId: 1, localDate: 1, briefingVersion: 1 },
  { unique: true }
);

const MorningPaperDelivery = mongoose.model('MorningPaperDelivery', morningPaperDeliverySchema);

/**
 * ReadingLoopEdition — the Reading Loop's current edition, one row per user.
 *
 * Where the daily loop borrows the world's clock (watchers, filings), the
 * Reading Loop borrows the corpus's: this week's reading paired against the
 * dormant library, with the agent naming what the two things do to each other.
 *
 * Cards hold denormalized display copy plus IDs; the render path resolves the
 * IDs so a renamed or deleted source never leaves a stale card on the page.
 * `history` is the 60-day no-repeat ledger — a pair shown once does not come
 * back. `suppressed` holds user rejections ("not a thing") and expires.
 */
const readingLoopMechanicSchema = new mongoose.Schema({
  card: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: ['idle', 'ready', 'empty', 'error'], default: 'idle' },
  reason: { type: String, default: '', trim: true },
  generatedAt: { type: Date, default: null },
  model: { type: String, default: '', trim: true }
}, { _id: false });

const readingLoopEditionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
  connection: { type: readingLoopMechanicSchema, default: () => ({}) },
  collision: { type: readingLoopMechanicSchema, default: () => ({}) },
  resolution: { type: readingLoopMechanicSchema, default: () => ({}) },
  convergence: { type: readingLoopMechanicSchema, default: () => ({}) },
  thread: { type: readingLoopMechanicSchema, default: () => ({}) },
  suppressed: [{
    _id: false,
    kind: { type: String, default: '', trim: true },
    key: { type: String, default: '', trim: true },
    until: { type: Date, default: null }
  }],
  history: [{
    _id: false,
    kind: { type: String, default: '', trim: true },
    key: { type: String, default: '', trim: true },
    shownAt: { type: Date, default: Date.now }
  }],
  runCounts: [{
    _id: false,
    kind: { type: String, default: '', trim: true },
    localDate: { type: String, default: '', trim: true },
    count: { type: Number, min: 0, default: 0 }
  }]
}, { timestamps: true });

readingLoopEditionSchema.index({ userId: 1, 'history.key': 1 });

const ReadingLoopEdition = mongoose.model('ReadingLoopEdition', readingLoopEditionSchema);

/* A paper an agent wrote, shared at a link.

   Same shape as a shared question, because it is the same idea: the reader
   owns it, one share per edition, and revoking removes the row rather than
   flagging it. What is different is what a reader is publishing — not a
   sentence of their own but a paper their agent kept for them, which is
   exactly why the boundary rule matters. Anyone can share a list of links.
   An edition cannot exist unless every item said what would limit it.

   The slug is the URL. The snapshot is the version. An agent rewrite of the
   private issue does not touch the snapshot; only an explicit owner update
   replaces it, under the same live URL. */
const sharedEditionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Edition', required: true },
  slug: { type: String, required: true, unique: true, index: true },
  ownerDisplayName: { type: String, default: '' },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  contentHash: { type: String, default: '' },
  publishedAt: { type: Date, default: null }
}, { timestamps: true });

sharedEditionSchema.index({ userId: 1, editionId: 1 }, { unique: true });

const SharedEdition = mongoose.model('SharedEdition', sharedEditionSchema);

module.exports = {
  MorningPaperRecord,
  Edition,
  EditionProfile,
  NoeisReceipt,
  MorningPaperDelivery,
  ReadingLoopEdition,
  SharedEdition
};
