const assert = require('assert');
const {
  encodeVector,
  decodeVector,
  contentHashOf,
  rawCosineToAtlasScore,
  atlasScoreToRawCosine,
  searchVectorItems,
  upsertVectorItem,
  isVectorItemCurrent,
  vectorIndexDefinition,
  vectorIndexHealth,
  OBJECT_TYPES,
  DEFAULT_DIMENSIONS
} = require('./vectorStore');

const OWNER = '6873e7773cc513750ec17055';
const OTHER = '68dc7784cd7aef6d9911672c';

/* ------------------------------------------------------------------ *
 * BSON binary vectors — the storage format, chosen because the cluster
 * is an M0 and an array of doubles is twice the size.
 * ------------------------------------------------------------------ */

const sample = [0.1, -0.25, 0.5, 1, -1, 0];
const encoded = encodeVector(sample);

assert.strictEqual(encoded.sub_type, 9, 'BSON binary vector subtype');
assert.strictEqual(encoded.buffer[0], 0x27, 'float32 dtype marker');
assert.strictEqual(encoded.buffer[1], 0x00, 'padding byte');
assert.strictEqual(encoded.buffer.length, 2 + sample.length * 4, 'four bytes per element, not eight');
assert.deepStrictEqual(
  decodeVector(encoded).map(value => Number(value.toFixed(4))),
  sample,
  'round-trips through float32 without drift at this precision'
);
assert.deepStrictEqual(decodeVector(null), [], 'a missing vector decodes to empty, not a throw');
assert.throws(() => encodeVector([]), /non-empty vector/, 'an empty vector is a programming error, not a stored row');

// A 384-dim vector is the real case: 1538 bytes as float32 against 3074 as
// doubles. That difference is the reason this format exists.
assert.strictEqual(encodeVector(new Array(384).fill(0.5)).buffer.length, 1538);

/* ------------------------------------------------------------------ *
 * Score space. Atlas normalizes cosine to (1 + cos) / 2; Qdrant did not.
 * Every threshold tuned against the old store has to move with it, and
 * getting this wrong fails silently in both directions.
 * ------------------------------------------------------------------ */

assert.strictEqual(rawCosineToAtlasScore(0.45), 0.725, 'the Reading Loop floor in Atlas space');
assert.strictEqual(rawCosineToAtlasScore(0.90), 0.95, 'the Reading Loop ceiling in Atlas space');
assert.strictEqual(rawCosineToAtlasScore(1), 1, 'identical vectors');
assert.strictEqual(rawCosineToAtlasScore(-1), 0, 'opposite vectors');
assert.ok(Math.abs(atlasScoreToRawCosine(rawCosineToAtlasScore(0.638)) - 0.638) < 1e-9, 'the conversion round-trips');

/* ------------------------------------------------------------------ *
 * Content hashing — what makes a backfill re-run cheap.
 * ------------------------------------------------------------------ */

assert.strictEqual(contentHashOf('same text'), contentHashOf('same text'));
assert.notStrictEqual(contentHashOf('same text'), contentHashOf('same text.'));
assert.strictEqual(contentHashOf(''), contentHashOf(null), 'empty and missing hash alike');

/* ------------------------------------------------------------------ *
 * Index definition — userId as a filter field is a tenancy boundary,
 * not a performance nicety.
 * ------------------------------------------------------------------ */

const definition = vectorIndexDefinition(DEFAULT_DIMENSIONS);
assert.strictEqual(definition.type, 'vectorSearch');
const fields = definition.definition.fields;
const vectorField = fields.find(field => field.type === 'vector');
assert.strictEqual(vectorField.path, 'embedding');
assert.strictEqual(vectorField.numDimensions, 384);
assert.strictEqual(vectorField.similarity, 'cosine');
assert.ok(fields.some(field => field.type === 'filter' && field.path === 'userId'), 'userId MUST be filterable — without it every query leaks across tenants');
assert.ok(fields.some(field => field.type === 'filter' && field.path === 'objectType'));

assert.deepStrictEqual(
  [...OBJECT_TYPES].sort(),
  ['article', 'highlight', 'notebook_entry', 'question', 'wiki_claim', 'wiki_page'].sort()
);

/* ------------------------------------------------------------------ *
 * Query construction.
 * ------------------------------------------------------------------ */

const captureAggregate = (rows = []) => {
  const calls = [];
  return {
    calls,
    model: {
      aggregate: async (pipeline) => { calls.push(pipeline); return rows; }
    }
  };
};

(async () => {
  const capture = captureAggregate([
    { objectType: 'article', objectId: 'a1', subId: '', metadata: { title: 'One' }, score: 0.9 }
  ]);
  const rows = await searchVectorItems({
    VectorItem: capture.model,
    userId: OWNER,
    vector: [0.1, 0.2],
    limit: 5,
    objectTypes: ['article', 'highlight']
  });
  assert.strictEqual(rows.length, 1);

  const stage = capture.calls[0][0].$vectorSearch;
  assert.strictEqual(stage.index, 'vector_index');
  assert.strictEqual(stage.path, 'embedding');
  assert.strictEqual(stage.limit, 5);
  assert.ok(stage.numCandidates >= stage.limit, 'ANN needs more candidates than it returns');
  assert.strictEqual(String(stage.filter.userId.$eq), OWNER, 'the query is scoped to the owner');
  assert.deepStrictEqual(stage.filter.objectType, { $in: ['article', 'highlight'] });
  assert.strictEqual(stage.queryVector.sub_type, 9, 'the query vector uses the same binary format as storage');

  // The filter belongs inside $vectorSearch. Applied afterwards it would both
  // waste candidate selection on other users' rows and quietly return fewer
  // results than asked for.
  const laterMatch = capture.calls[0].find(entry => entry.$match);
  assert.strictEqual(laterMatch, undefined, 'no post-hoc $match — filtering happens in the ANN stage');

  await assert.rejects(
    () => searchVectorItems({ VectorItem: capture.model, userId: '', vector: [0.1] }),
    /valid userId/,
    'a search without an owner is refused rather than run unscoped'
  );

  // The Reading Loop shipped with VectorItem missing from its router bundle.
  // The failure surfaced as "Cannot read properties of undefined (reading
  // 'aggregate')" from inside a catch that turned it into a quiet empty week.
  // Name the missing dependency instead.
  await assert.rejects(
    () => searchVectorItems({ userId: OWNER, vector: [0.1] }),
    /requires the VectorItem model/,
    'an unwired model is named, not left to fail cryptically deeper in'
  );

  const noVector = await searchVectorItems({ VectorItem: capture.model, userId: OWNER, vector: [] });
  assert.deepStrictEqual(noVector, [], 'an empty vector yields no rows rather than an unfiltered scan');

  const untyped = captureAggregate([]);
  await searchVectorItems({ VectorItem: untyped.model, userId: OWNER, vector: [0.1] });
  assert.strictEqual(
    untyped.calls[0][0].$vectorSearch.filter.objectType,
    undefined,
    'no type filter is added when none is asked for'
  );

  /* ---------------------------------------------------------------- *
   * Upsert identity — a re-index overwrites, never duplicates.
   * ---------------------------------------------------------------- */

  const writes = [];
  const writeModel = { updateOne: async (query, update, options) => { writes.push({ query, update, options }); } };
  await upsertVectorItem({
    VectorItem: writeModel,
    userId: OWNER,
    objectType: 'wiki_claim',
    objectId: 'page1:claim2',
    text: 'a claim worth indexing',
    vector: [0.3, 0.4],
    metadata: { title: 'A page' }
  });
  assert.strictEqual(writes[0].options.upsert, true);
  assert.strictEqual(String(writes[0].query.userId), OWNER);
  assert.strictEqual(writes[0].query.objectType, 'wiki_claim');
  assert.strictEqual(writes[0].query.objectId, 'page1:claim2');
  assert.strictEqual(writes[0].query.subId, '');
  assert.strictEqual(writes[0].update.$set.contentHash, contentHashOf('a claim worth indexing'));
  assert.strictEqual(writes[0].update.$set.dimensions, 2);

  await assert.rejects(
    () => upsertVectorItem({ VectorItem: writeModel, userId: 'not-an-id', objectType: 'article', objectId: 'x', text: 't', vector: [1] }),
    /valid userId/
  );

  /* ---------------------------------------------------------------- *
   * Unchanged detection.
   * ---------------------------------------------------------------- */

  const hashModel = (storedHash) => ({
    findOne: () => ({ select: () => ({ lean: async () => (storedHash ? { contentHash: storedHash } : null) }) })
  });
  assert.strictEqual(
    await isVectorItemCurrent({ VectorItem: hashModel(contentHashOf('unchanged')), userId: OWNER, objectType: 'article', objectId: 'a', text: 'unchanged' }),
    true
  );
  assert.strictEqual(
    await isVectorItemCurrent({ VectorItem: hashModel(contentHashOf('old')), userId: OWNER, objectType: 'article', objectId: 'a', text: 'new' }),
    false
  );
  assert.strictEqual(
    await isVectorItemCurrent({ VectorItem: hashModel(null), userId: OWNER, objectType: 'article', objectId: 'a', text: 'anything' }),
    false,
    'a row that does not exist is not current'
  );

  /* ---------------------------------------------------------------- *
   * Health — the signal whose absence let two stores die unnoticed.
   * ---------------------------------------------------------------- */

  const healthModel = {
    countDocuments: async () => 7,
    find: () => ({ sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [{ updatedAt: new Date('2026-08-13T00:00:00Z') }] }) }) }) })
  };
  const ready = await vectorIndexHealth({
    VectorItem: healthModel,
    mongooseConnection: { db: { collection: () => ({ listSearchIndexes: () => ({ toArray: async () => [{ name: 'vector_index', status: 'READY' }] }) }) } }
  });
  assert.strictEqual(ready.status, 'ready');
  assert.strictEqual(ready.itemCount, 7);

  const missing = await vectorIndexHealth({
    VectorItem: healthModel,
    mongooseConnection: { db: { collection: () => ({ listSearchIndexes: () => ({ toArray: async () => [] }) }) } }
  });
  assert.strictEqual(missing.status, 'missing', 'an absent index reports as missing, not as healthy-and-empty');

  const broken = await vectorIndexHealth({
    VectorItem: { countDocuments: async () => { throw new Error('cluster unreachable'); } },
    mongooseConnection: { db: { collection: () => ({ listSearchIndexes: () => ({ toArray: async () => [] }) }) } }
  });
  assert.strictEqual(broken.status, 'error');
  assert.match(broken.error, /cluster unreachable/);

  console.log('vectorStore tests passed');
})().catch(error => { console.error(error); process.exit(1); });
