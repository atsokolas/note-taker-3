const assert = require('assert');
const { buildConceptService } = require('./conceptService');

const USER_ID = '64f100000000000000000001';
const CONCEPT_ID = '64f100000000000000000020';
const MISSING_CONCEPT_ID = '64f100000000000000000099';

function ObjectId(value) { return String(value); }
ObjectId.isValid = value => /^[a-f\d]{24}$/i.test(String(value || ''));

const emptyFind = () => ({ select: async () => [] });

const buildService = concept => {
  const queries = [];
  const TagMeta = {
    find: () => ({ lean: async () => [concept] }),
    findOne: async query => {
      queries.push(query);
      if (query._id === CONCEPT_ID) return concept;
      if (query.name instanceof RegExp && query.name.test(concept.name)) return concept;
      return null;
    }
  };
  return {
    queries,
    service: buildConceptService({
      Article: { aggregate: async () => [], find: emptyFind },
      TagMeta,
      NotebookEntry: { find: emptyFind },
      ReferenceEdge: {},
      mongoose: { Types: { ObjectId } }
    })
  };
};

(async () => {
  const concept = {
    _id: CONCEPT_ID,
    name: 'Inference economics',
    description: 'Canonical metadata',
    pinnedHighlightIds: [],
    pinnedArticleIds: [],
    pinnedNoteIds: []
  };

  const byId = buildService(concept);
  const exact = await byId.service.getConceptMeta(USER_ID, CONCEPT_ID);
  assert.strictEqual(exact._id, CONCEPT_ID);
  assert.strictEqual(exact.name, concept.name);
  assert.strictEqual(exact.description, concept.description);
  assert.strictEqual(byId.queries[0]._id, CONCEPT_ID);
  assert.ok(byId.queries[0].userId);

  const idShapedName = { ...concept, name: MISSING_CONCEPT_ID };
  const missing = buildService(idShapedName);
  const missingExact = await missing.service.getConceptMeta(USER_ID, MISSING_CONCEPT_ID);
  assert.strictEqual(missingExact._id, '');
  assert.strictEqual(missing.queries.length, 1);
  assert.strictEqual(missing.queries[0]._id, MISSING_CONCEPT_ID);
  assert.strictEqual(missing.queries[0].name, undefined);

  const special = { ...concept, name: 'C++ unit economics (50%)' };
  const byName = buildService(special);
  const named = await byName.service.getConceptMeta(USER_ID, special.name);
  assert.strictEqual(named._id, CONCEPT_ID);
  assert.strictEqual(named.name, special.name);
  assert.ok(byName.queries[0].name instanceof RegExp);
  assert.ok(byName.queries[0].name.test(special.name));

  console.log('conceptService ObjectId tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
