const assert = require('assert');
const { buildConceptService } = require('./conceptService');

const USER_ID = '64f100000000000000000001';

function ObjectId(value) { return String(value); }
ObjectId.isValid = value => /^[a-f\d]{24}$/i.test(String(value || ''));

const emptyFind = () => ({ select: async () => [] });

/* Think saves a concept with nothing but a description — when the reader edits
   one, and twice more only to be sure the row exists before pulling material
   in. Every one of those writes used to arrive here with the pinned ids
   defaulted to empty arrays and set anyway, so the ordinary act of adding
   something to a concept emptied what was already pinned to it. */
const buildService = (existing) => {
  const writes = [];
  const TagMeta = {
    find: () => ({ lean: async () => (existing ? [existing] : []) }),
    findOne: async () => existing,
    findOneAndUpdate: async (query, update, options) => {
      writes.push({ query, update, options });
      return { ...(existing || {}), ...update.$set };
    }
  };
  return {
    writes,
    service: buildConceptService({
      Article: { aggregate: async () => [], find: emptyFind },
      TagMeta,
      NotebookEntry: { find: emptyFind },
      ReferenceEdge: {},
      mongoose: { Types: { ObjectId } },
      workspaceAuthorization: { sanitizeConceptWorkspace: async () => ({ workspace: null }) }
    })
  };
};

const PINNED = {
  _id: '64f100000000000000000020',
  name: 'Founder mode',
  description: 'Proximity as a management claim.',
  pinnedHighlightIds: ['h1', 'h2'],
  pinnedArticleIds: ['a1'],
  pinnedNoteIds: ['n1'],
  isPublic: false
};

(async () => {
  // A description-only save is not a request to unpin everything.
  {
    const { service, writes } = buildService(PINNED);
    await service.updateConceptMeta(USER_ID, 'Founder mode', { description: 'A sharper line.' });
    const { $set } = writes[0].update;
    assert.strictEqual($set.description, 'A sharper line.');
    assert.ok(!('pinnedHighlightIds' in $set), 'pins must not be written by a description save');
    assert.ok(!('pinnedArticleIds' in $set));
    assert.ok(!('pinnedNoteIds' in $set));
  }

  // The touch Think does before pulling a reference in writes nothing but the
  // description it already had, and must leave the concept exactly as it was.
  {
    const { service, writes } = buildService(PINNED);
    await service.updateConceptMeta(USER_ID, 'Founder mode', { description: PINNED.description });
    assert.deepStrictEqual(Object.keys(writes[0].update.$set).sort(), ['description', 'isPublic', 'name']);
  }

  // Clearing a description clears the description, and only that.
  {
    const { service, writes } = buildService(PINNED);
    await service.updateConceptMeta(USER_ID, 'Founder mode', { description: '' });
    assert.strictEqual(writes[0].update.$set.description, '');
    assert.ok(!('pinnedHighlightIds' in writes[0].update.$set));
  }

  // Pins named explicitly are still written, including an explicit unpin.
  {
    const { service, writes } = buildService(PINNED);
    await service.updateConceptMeta(USER_ID, 'Founder mode', { pinnedHighlightIds: [] });
    assert.deepStrictEqual(writes[0].update.$set.pinnedHighlightIds, []);
    assert.ok(!('description' in writes[0].update.$set));
  }

  {
    const { service, writes } = buildService(PINNED);
    await service.updateConceptMeta(USER_ID, 'Founder mode', { pinnedArticleIds: ['a1', 'a2'] });
    assert.deepStrictEqual(writes[0].update.$set.pinnedArticleIds, ['a1', 'a2']);
  }

  // A concept that does not exist yet is still created by the same call, and
  // the schema supplies the empty description and empty pins on insert.
  {
    const { service, writes } = buildService(null);
    await service.updateConceptMeta(USER_ID, 'Brand new', {});
    assert.strictEqual(writes[0].update.$set.name, 'Brand new');
    assert.strictEqual(writes[0].options.upsert, true);
    assert.strictEqual(writes[0].options.setDefaultsOnInsert, true);
    assert.ok(!('description' in writes[0].update.$set));
  }

  console.log('conceptService pin preservation tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
