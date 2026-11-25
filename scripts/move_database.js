#!/usr/bin/env node
/**
 * Copy every database on one MongoDB deployment to another: collections with
 * their options, documents, indexes, and the Atlas Vector Search index.
 * Used to move Noeis from Atlas in N. Virginia to Atlas in Oregon, next to
 * the Render server.
 *
 * Reads FROM_URI and TO_URI from the environment and never prints either.
 * Without --apply it only counts what would be copied. It refuses a target
 * that already holds documents, so it can never merge into live data.
 *
 * Usage: node --env-file=<file with FROM_URI and TO_URI> scripts/move_database.js [--apply]
 */
const { MongoClient } = require('mongodb');
const { vectorIndexDefinition, COLLECTION: VECTORS } = require('../server/ai/vectorStore');

const BATCH = 1000;
const SYSTEM = new Set(['admin', 'local', 'config']);
const apply = process.argv.includes('--apply');

const databasesOf = async client =>
  (await client.db().admin().listDatabases({ nameOnly: true })).databases
    .map(row => row.name)
    .filter(name => !SYSTEM.has(name));

const collectionsOf = async db =>
  (await db.listCollections({ type: 'collection' }).toArray())
    .filter(row => !row.name.startsWith('system.'));

const copyCollection = async (from, to, { name, options }) => {
  const { uuid, ...kept } = options || {};
  await to.createCollection(name, kept).catch(error => { if (error.codeName !== 'NamespaceExists') throw error; });
  const target = to.collection(name);
  let copied = 0;
  let batch = [];
  for await (const doc of from.collection(name).find({}, { batchSize: BATCH })) {
    batch.push(doc);
    if (batch.length === BATCH) {
      await target.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
    }
  }
  if (batch.length) await target.insertMany(batch, { ordered: false });
  copied += batch.length;

  const indexes = (await from.collection(name).listIndexes().toArray())
    .filter(index => index.name !== '_id_')
    .map(({ v, ns, ...index }) => index);
  if (indexes.length) await to.command({ createIndexes: name, indexes });
  return { copied, indexes: indexes.length };
};

/* Search indexes live outside the collection's own indexes, so each is asked
   for again by its definition. A deployment without Atlas Search has none. */
const copyVectorIndex = async (from, to, log) => {
  const found = await from.collection(VECTORS).listSearchIndexes().toArray().catch(() => []);
  for (const index of found) {
    const dimensions = index.latestDefinition?.fields?.find(field => field.type === 'vector')?.numDimensions;
    await to.collection(VECTORS).createSearchIndex(vectorIndexDefinition(dimensions));
    log(`  search index ${index.name} (${dimensions} dims) asked to build`);
  }
};

/* Copies source into target; without apply it only counts. Returns what landed. */
const moveDatabase = async ({ source, target, apply = false, log = console.log }) => {
  for (const name of await databasesOf(target)) {
    for (const { name: collection } of await collectionsOf(target.db(name))) {
      if (await target.db(name).collection(collection).estimatedDocumentCount()) {
        throw new Error(`The target already holds ${name}.${collection}; refusing to copy into it.`);
      }
    }
  }
  const landed = {};
  for (const name of await databasesOf(source)) {
    const from = source.db(name);
    const to = target.db(name);
    const collections = await collectionsOf(from);
    for (const collection of collections) {
      const key = `${name}.${collection.name}`;
      const count = await from.collection(collection.name).countDocuments();
      if (!apply) {
        log(`${key}: ${count}`);
        continue;
      }
      const { copied, indexes } = await copyCollection(from, to, collection);
      const arrived = await to.collection(collection.name).countDocuments();
      landed[key] = { count, arrived };
      log(`${key}: ${copied} copied, ${arrived}/${count} landed, ${indexes} indexes`);
    }
    if (apply && collections.some(row => row.name === VECTORS)) await copyVectorIndex(from, to, log);
  }
  const short = Object.entries(landed).filter(([, row]) => row.arrived !== row.count);
  if (short.length) throw new Error(`Landed with a different count: ${short.map(([key]) => key).join(', ')}.`);
  return landed;
};

if (require.main === module) {
  (async () => {
    const { FROM_URI, TO_URI } = process.env;
    if (!FROM_URI || !TO_URI) throw new Error('Set FROM_URI and TO_URI.');
    if (FROM_URI === TO_URI) throw new Error('FROM_URI and TO_URI are the same deployment.');
    const source = await MongoClient.connect(FROM_URI);
    const target = await MongoClient.connect(TO_URI);
    try {
      /* The app reads the database its URI names, so both must name the same one. */
      if (source.db().databaseName !== target.db().databaseName) {
        throw new Error(`FROM_URI names database "${source.db().databaseName}" but TO_URI names "${target.db().databaseName}".`);
      }
      console.log(`App database: ${source.db().databaseName}`);
      await moveDatabase({ source, target, apply });
      console.log(apply
        ? '\nEvery collection landed whole. Wait for the search index to read READY before switching.'
        : '\nDry run. Run again with --apply to copy.');
    } finally {
      await Promise.all([source.close(), target.close()]);
    }
  })().catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { moveDatabase };
