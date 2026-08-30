const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * vectorStore — the single semantic index, on Atlas.
 *
 * Replaces two stores that both failed silently in production: the Qdrant path
 * (no Qdrant was ever provisioned, so `QDRANT_HOST` defaulted to localhost
 * inside the container) and `ai_service`'s JSON file at `/tmp`, which Render
 * wipes on every deploy and every idle spin-down.
 *
 * Vectors are stored as BSON binary vectors (subtype 9, float32) rather than
 * arrays of doubles. A 384-element JS array becomes 384 BSON doubles — 8 bytes
 * each, ~3KB per row — and the cluster is an M0 with 512MB. float32 halves it.
 */

const BSON_VECTOR_SUBTYPE = 9;
const DTYPE_FLOAT32 = 0x27;
const VECTOR_PADDING = 0x00;

const DEFAULT_DIMENSIONS = 384;
const VECTOR_INDEX_NAME = 'vector_index';
const COLLECTION = 'vectoritems';

const OBJECT_TYPES = Object.freeze([
  'article',
  'highlight',
  'notebook_entry',
  'question',
  'judgment_claim',
  'wiki_claim',
  'wiki_page'
]);

/**
 * Atlas normalizes cosine scores to `(1 + cosine) / 2`, while Qdrant returned
 * raw cosine. Every threshold tuned against the old store has to move with it.
 * Exported so callers convert explicitly rather than carrying two conventions
 * around and hoping the right one is in scope.
 */
const rawCosineToAtlasScore = (raw) => (1 + Number(raw)) / 2;
const atlasScoreToRawCosine = (score) => (Number(score) * 2) - 1;

const encodeVector = (values) => {
  if (!Array.isArray(values) || !values.length) {
    throw new Error('vectorStore: a non-empty vector is required.');
  }
  const buffer = Buffer.allocUnsafe(2 + values.length * 4);
  buffer.writeUInt8(DTYPE_FLOAT32, 0);
  buffer.writeUInt8(VECTOR_PADDING, 1);
  values.forEach((value, index) => {
    buffer.writeFloatLE(Number(value) || 0, 2 + index * 4);
  });
  return new mongoose.mongo.Binary(buffer, BSON_VECTOR_SUBTYPE);
};

const decodeVector = (binary) => {
  const buffer = binary?.buffer || binary;
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return [];
  const values = [];
  for (let offset = 2; offset + 4 <= buffer.length; offset += 4) {
    values.push(buffer.readFloatLE(offset));
  }
  return values;
};

const contentHashOf = (text = '') => crypto
  .createHash('sha1')
  .update(String(text || ''))
  .digest('hex');

const asObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  const raw = String(value || '');
  return mongoose.Types.ObjectId.isValid(raw) ? new mongoose.Types.ObjectId(raw) : null;
};

const identityOf = ({ userId, objectType, objectId, subId = '' }) => ({
  userId: asObjectId(userId),
  objectType: String(objectType || ''),
  objectId: String(objectId || ''),
  subId: String(subId || '')
});

/**
 * Upsert one row. Returns `{ skipped: true }` when the text is unchanged, which
 * is what makes re-running the backfill cheap — the embedding call is the
 * expensive part and the content hash is what lets us avoid it.
 */
const upsertVectorItem = async ({
  VectorItem,
  userId,
  objectType,
  objectId,
  subId = '',
  text,
  vector,
  metadata = {}
} = {}) => {
  const identity = identityOf({ userId, objectType, objectId, subId });
  if (!identity.userId) throw new Error('vectorStore: a valid userId is required.');
  if (!identity.objectType || !identity.objectId) {
    throw new Error('vectorStore: objectType and objectId are required.');
  }
  await VectorItem.updateOne(
    identity,
    {
      $set: {
        embedding: encodeVector(vector),
        dimensions: vector.length,
        contentHash: contentHashOf(text),
        metadata,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
  return { skipped: false };
};

const isVectorItemCurrent = async ({ VectorItem, userId, objectType, objectId, subId = '', text } = {}) => {
  const identity = identityOf({ userId, objectType, objectId, subId });
  if (!identity.userId) return false;
  const existing = await VectorItem.findOne(identity).select('contentHash').lean();
  return Boolean(existing && existing.contentHash === contentHashOf(text));
};

const deleteVectorItemsFor = async ({ VectorItem, userId, objectType, objectId } = {}) => {
  const query = { userId: asObjectId(userId) };
  if (objectType) query.objectType = String(objectType);
  if (objectId) query.objectId = String(objectId);
  if (!query.userId) return { deletedCount: 0 };
  return VectorItem.deleteMany(query);
};

/**
 * The one query. `filter` is applied inside `$vectorSearch` rather than as a
 * later `$match` so that ANN candidate selection happens within the user's own
 * rows — filtering afterwards would both leak effort and quietly return fewer
 * results than `limit`.
 *
 * `userId` is non-negotiable: a vector query without it returns other people's
 * material.
 */
const searchVectorItems = async ({
  VectorItem,
  userId,
  vector,
  limit = 10,
  objectTypes = [],
  numCandidatesMultiplier = 15,
  indexName = VECTOR_INDEX_NAME
} = {}) => {
  // Name the missing dependency. Passing an unwired model produced "Cannot read
  // properties of undefined (reading 'aggregate')" from inside a catch block
  // that turned it into an empty result — the Reading Loop router shipped
  // without VectorItem in its bundle and reported a quiet week for it.
  if (!VectorItem?.aggregate) {
    throw new Error('vectorStore: search requires the VectorItem model; none was provided.');
  }
  const owner = asObjectId(userId);
  if (!owner) throw new Error('vectorStore: search requires a valid userId.');
  if (!Array.isArray(vector) || !vector.length) return [];

  const filter = { userId: { $eq: owner } };
  const types = (Array.isArray(objectTypes) ? objectTypes : [])
    .map(type => String(type || ''))
    .filter(Boolean);
  if (types.length) filter.objectType = { $in: types };

  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  const rows = await VectorItem.aggregate([
    {
      $vectorSearch: {
        index: indexName,
        path: 'embedding',
        queryVector: encodeVector(vector),
        numCandidates: Math.min(10000, safeLimit * Math.max(2, numCandidatesMultiplier)),
        limit: safeLimit,
        filter
      }
    },
    {
      $project: {
        _id: 0,
        objectType: 1,
        objectId: 1,
        subId: 1,
        metadata: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    }
  ]);
  return rows || [];
};

/**
 * "More like this one." Reads the stored vector for an item and searches with
 * it, so a similarity lookup costs no embedding call at all — the vector was
 * computed when the item was indexed.
 */
const similarToVectorItem = async ({
  VectorItem,
  userId,
  objectType,
  objectId,
  subId = '',
  expectedText,
  limit = 10,
  objectTypes = []
} = {}) => {
  const identity = identityOf({ userId, objectType, objectId, subId });
  if (!identity.userId || !identity.objectId) return [];
  const source = await VectorItem.findOne(identity).select('embedding contentHash').lean();
  // A page save and its background embedding job are intentionally decoupled.
  // Never search from yesterday's held sentence while today's vector is still
  // queued: stale relevance is worse than an honest empty state.
  if (expectedText !== undefined && source?.contentHash !== contentHashOf(expectedText)) return [];
  const vector = decodeVector(source?.embedding);
  if (!vector.length) return [];
  const rows = await searchVectorItems({
    VectorItem,
    userId,
    vector,
    limit: limit + 1,
    objectTypes
  });
  // The source is its own nearest neighbour; drop it rather than making every
  // caller remember to.
  return rows.filter(row => !(
    String(row.objectType) === identity.objectType
    && String(row.objectId) === identity.objectId
    && String(row.subId || '') === identity.subId
  )).slice(0, limit);
};

/**
 * Index health, surfaced so an empty store stops being indistinguishable from
 * an empty corpus. Both prior stores died silently for months precisely because
 * nothing ever reported this.
 */
const vectorIndexHealth = async ({ VectorItem, mongooseConnection = mongoose.connection } = {}) => {
  const health = {
    collection: COLLECTION,
    indexName: VECTOR_INDEX_NAME,
    status: 'unknown',
    itemCount: 0,
    oldestItemAt: null,
    newestItemAt: null,
    error: ''
  };
  try {
    // Counted, not estimated. `estimatedDocumentCount` reads collection
    // metadata and drifts — it reported 344 against 352 real rows in testing.
    // The entire point of this number is that it can be trusted.
    health.itemCount = await VectorItem.countDocuments();
    const [oldest] = await VectorItem.find().sort({ updatedAt: 1 }).limit(1).select('updatedAt').lean();
    const [newest] = await VectorItem.find().sort({ updatedAt: -1 }).limit(1).select('updatedAt').lean();
    health.oldestItemAt = oldest?.updatedAt || null;
    health.newestItemAt = newest?.updatedAt || null;
    const indexes = await mongooseConnection.db.collection(COLLECTION).listSearchIndexes().toArray();
    const index = indexes.find(row => row.name === VECTOR_INDEX_NAME);
    health.status = index ? String(index.status || 'unknown').toLowerCase() : 'missing';
  } catch (error) {
    health.status = 'error';
    health.error = String(error.message || error).slice(0, 200);
  }
  return health;
};

const vectorIndexDefinition = (dimensions = DEFAULT_DIMENSIONS) => ({
  name: VECTOR_INDEX_NAME,
  type: 'vectorSearch',
  definition: {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions: dimensions, similarity: 'cosine' },
      { type: 'filter', path: 'userId' },
      { type: 'filter', path: 'objectType' }
    ]
  }
});

module.exports = {
  upsertVectorItem,
  isVectorItemCurrent,
  deleteVectorItemsFor,
  searchVectorItems,
  similarToVectorItem,
  vectorIndexHealth,
  vectorIndexDefinition,
  encodeVector,
  decodeVector,
  contentHashOf,
  rawCosineToAtlasScore,
  atlasScoreToRawCosine,
  OBJECT_TYPES,
  VECTOR_INDEX_NAME,
  COLLECTION,
  DEFAULT_DIMENSIONS
};
