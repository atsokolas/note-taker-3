/* Replace the Wiki-only uniqueness constraint without an unprotected interval.
   Dry run by default. Supply MONGODB_URI explicitly; this script loads no .env. */
const mongoose = require('mongoose');
const { buildAuthoredExplorationModel } = require('../server/models/authoredExploration');

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    const Model = buildAuthoredExplorationModel(mongoose);
    const before = await Model.collection.indexes();
    const legacyName = 'userId_1_pageId_1_claimId_1';
    const legacy = before.find(index => index.name === legacyName);
    const apply = process.argv.includes('--apply');
    if (apply) {
      await Model.createIndexes();
      const ready = await Model.collection.indexes();
      for (const [name, field] of [['owned_wiki_exploration', 'pageId'], ['owned_library_exploration', 'articleId']]) {
        if (!ready.some(index => index.name === name && index.unique && index.partialFilterExpression?.[field]?.$type === 'objectId')) {
          throw new Error(`Replacement index ${name} is not ready; legacy constraint retained.`);
        }
      }
      if (legacy) {
        if (!legacy.unique || JSON.stringify(legacy.key) !== JSON.stringify({ userId: 1, pageId: 1, claimId: 1 })) {
          throw new Error('Unexpected legacy index definition; retained for inspection.');
        }
        await Model.collection.dropIndex(legacyName);
      }
    }
    console.log(JSON.stringify({ database: mongoose.connection.name, applied: apply, legacyIndexPresentBefore: Boolean(legacy), indexes: (await Model.collection.indexes()).map(index => index.name) }, null, 2));
  } finally { await mongoose.disconnect(); }
};
run().catch(error => { console.error(error.message); process.exitCode = 1; });
