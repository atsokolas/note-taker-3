#!/usr/bin/env node
/**
 * Create (or report on) the Atlas Vector Search index.
 *
 * Index builds are asynchronous and a query against a building index returns
 * an empty result set rather than an error — the exact failure mode that let
 * two previous vector stores die unnoticed. So this polls to READY and says so.
 *
 * Safe to re-run: an existing index is reported, never recreated.
 *
 * Usage: node scripts/create_vector_index.js [--dimensions 384] [--wait 300]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { vectorIndexDefinition, VECTOR_INDEX_NAME, COLLECTION, DEFAULT_DIMENSIONS } = require('../server/ai/vectorStore');

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const dimensions = Number(arg('dimensions', DEFAULT_DIMENSIONS));
  const waitSeconds = Number(arg('wait', 300));

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;

  // The collection must exist before an index can be built against it.
  const existing = await db.listCollections({ name: COLLECTION }).toArray();
  if (!existing.length) {
    await db.createCollection(COLLECTION);
    console.log(`created collection ${COLLECTION}`);
  }

  const collection = db.collection(COLLECTION);
  const current = await collection.listSearchIndexes().toArray();
  const found = current.find(row => row.name === VECTOR_INDEX_NAME);

  if (found) {
    console.log(`index "${VECTOR_INDEX_NAME}" already exists — status: ${found.status}`);
  } else {
    const definition = vectorIndexDefinition(dimensions);
    console.log(`creating "${definition.name}" (${dimensions} dims, cosine, filters: userId + objectType)`);
    await collection.createSearchIndex(definition);
  }

  const deadline = Date.now() + waitSeconds * 1000;
  let status = '';
  while (Date.now() < deadline) {
    const rows = await collection.listSearchIndexes().toArray();
    const row = rows.find(entry => entry.name === VECTOR_INDEX_NAME);
    status = String(row?.status || 'missing');
    if (status.toUpperCase() === 'READY') break;
    if (status.toUpperCase() === 'FAILED') {
      console.error('index build FAILED:', JSON.stringify(row?.statusDetail || row));
      process.exitCode = 1;
      break;
    }
    process.stdout.write(`  status: ${status}\r`);
    await sleep(5000);
  }
  console.log(`\nfinal status: ${status}`);
  if (status.toUpperCase() !== 'READY') {
    console.error('index is not READY — do not run acceptance tests against it yet.');
    process.exitCode = 1;
  }
  await mongoose.disconnect();
})().catch(error => { console.error(error); process.exit(1); });
