// Search: the embedding queue and the vectors it fills.
const mongoose = require('mongoose');

const embeddingJobSchema = new mongoose.Schema({
  collection: { type: String, required: true, trim: true },
  objectId: { type: String, required: true, trim: true },
  text: { type: String, default: '' },
  contentHash: { type: String, default: '', trim: true },
  sourceUpdatedAt: { type: Date, default: null },
  payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  status: {
    type: String,
    enum: ['queued', 'running', 'completed', 'failed', 'abandoned', 'held'],
    default: 'queued',
    index: true
  },
  attemptCount: { type: Number, default: 0 },
  nextRunAt: { type: Date, default: Date.now, index: true },
  lockedAt: { type: Date, default: null },
  replayRequired: { type: Boolean, default: false },
  lastAttemptAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  lastError: { type: String, default: '', trim: true }
}, { timestamps: true, suppressReservedKeysWarning: true });

embeddingJobSchema.index({ collection: 1, objectId: 1 }, { unique: true });
embeddingJobSchema.index({ status: 1, nextRunAt: 1, createdAt: 1 });

const EmbeddingJob = mongoose.model('EmbeddingJob', embeddingJobSchema);

/**
 * VectorItem — the semantic index. One row per embeddable unit.
 *
 * Atlas `$vectorSearch` targets one field path and returns whole documents, so
 * vectors cannot live on array subdocuments — and highlights and claims, which
 * are ~4,400 of the embeddable units, are subdocuments. Hence a collection of
 * its own, which also mirrors the point model of the Qdrant store it replaces.
 *
 * `embedding` is a BSON binary vector (subtype 9, float32), not an array: a
 * 384-element array becomes 384 eight-byte doubles, and the cluster is an M0.
 * The embedded text is deliberately *not* stored — the read path already loads
 * the source document, and duplicating text on a 512MB cluster is the wrong
 * trade. `contentHash` carries the "has this changed?" signal instead.
 */
const vectorItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  objectType: {
    type: String,
    required: true,
    enum: ['article', 'highlight', 'notebook_entry', 'question', 'judgment_claim', 'wiki_claim', 'wiki_page'],
    trim: true
  },
  objectId: { type: String, required: true, trim: true },
  subId: { type: String, default: '', trim: true },
  embedding: { type: mongoose.Schema.Types.Buffer, required: true },
  dimensions: { type: Number, default: 0 },
  contentHash: { type: String, default: '', trim: true, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: false, minimize: false });

vectorItemSchema.index(
  { userId: 1, objectType: 1, objectId: 1, subId: 1 },
  { unique: true }
);

const VectorItem = mongoose.model('VectorItem', vectorItemSchema, 'vectoritems');

module.exports = {
  EmbeddingJob,
  VectorItem
};
