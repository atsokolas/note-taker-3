#!/usr/bin/env node
require('dotenv').config();

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const {
  Article,
  NotebookEntry,
  NotebookFolder,
  ReferenceEdge
} = require('../server/models');
const { buildLegacyContentRouter } = require('../server/routes/legacyContentRoutes');
const { buildNotebookRouter } = require('../server/routes/notebookRoutes');

const DATABASE_PREFIX = 'noeis_rtba_accept_';
const OUTPUT_DIR = 'output/reading-talks-back-stage2-cumulative-2026-08-31';
const OWNER_TOKEN = 'reading-loop-owner';
const FOREIGN_TOKEN = 'reading-loop-foreign';

const clean = (value) => String(value || '').trim();

const parseArgs = (argv = []) => {
  const args = {
    mongoUri: process.env.READING_TALKS_BACK_ACCEPTANCE_MONGODB_URI || '',
    outputDir: process.env.READING_TALKS_BACK_ACCEPTANCE_OUTPUT_DIR || OUTPUT_DIR
  };
  argv.forEach((arg) => {
    if (arg.startsWith('--mongo-uri=')) args.mongoUri = arg.slice('--mongo-uri='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = arg.slice('--output-dir='.length);
  });
  return args;
};

const databaseNameFromUri = (uri = '') => {
  try {
    return decodeURIComponent(new URL(clean(uri)).pathname.replace(/^\//, '')).split('/')[0];
  } catch (_error) {
    return '';
  }
};

const assertDisposableDatabaseUri = (uri = '') => {
  const databaseName = databaseNameFromUri(uri);
  if (!databaseName.startsWith(DATABASE_PREFIX)) {
    throw new Error(`Acceptance requires a disposable database named ${DATABASE_PREFIX}<run>.`);
  }
  if (Buffer.byteLength(databaseName, 'utf8') > 38) {
    throw new Error('Disposable database names must fit Atlas\'s 38-byte limit.');
  }
  return databaseName;
};

const buildExactLibraryPath = ({ articleId, highlightId }) => {
  const article = clean(articleId);
  const highlight = clean(highlightId);
  if (!article) return '/library';
  const base = `/library?articleId=${encodeURIComponent(article)}`;
  return highlight ? `${base}&highlightId=${encodeURIComponent(highlight)}` : base;
};

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({
    server,
    url: `http://127.0.0.1:${server.address().port}`
  }));
});

const close = (server) => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

const dropAndVerifyDatabase = async (mongoUri) => {
  await mongoose.disconnect();
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const database = client.db();
    await database.dropDatabase();
    return (await database.listCollections({}, { nameOnly: true }).toArray()).length;
  } finally {
    await client.close();
  }
};

const authenticate = ({ ownerId, foreignId }) => (req, res, next) => {
  const token = clean(req.headers.authorization).replace(/^Bearer\s+/i, '');
  if (token === OWNER_TOKEN) req.user = { id: clean(ownerId) };
  else if (token === FOREIGN_TOKEN) req.user = { id: clean(foreignId) };
  else return res.status(401).json({ error: 'Unauthorized' });
  return next();
};

const findHighlightById = async (userId, highlightId) => {
  if (!mongoose.Types.ObjectId.isValid(highlightId)) return null;
  const matches = await Article.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': new mongoose.Types.ObjectId(highlightId) } },
    { $project: {
      _id: '$highlights._id',
      text: '$highlights.text',
      articleId: '$_id',
      articleTitle: '$title'
    } }
  ]);
  return matches[0] || null;
};

const buildApp = ({ ownerId, foreignId }) => {
  const app = express();
  const authenticateToken = authenticate({ ownerId, foreignId });
  app.use(express.json());
  app.use(buildLegacyContentRouter({
    authenticateToken,
    mongoose,
    Note: {},
    normalizeChecklist: (value) => value,
    Folder: {},
    normalizePdfs: (value) => value,
    Article,
    enqueueArticleEmbedding: () => {},
    deleteArticleEmbeddingState: async () => {},
    safeMapEmbedding: () => {},
    articleToEmbeddingItems: () => [],
    queueEmbeddingUpsert: () => {},
    getFoldersWithCounts: async () => [],
    normalizeItemType: (value, fallback = 'note') => clean(value || fallback),
    buildEmbeddingId: () => '',
    queueEmbeddingDelete: () => {}
  }));
  app.use(buildNotebookRouter({
    authenticateToken,
    NotebookEntry,
    NotebookFolder,
    ReferenceEdge,
    ensureNotebookBlocks: () => {},
    createBlockId: () => new mongoose.Types.ObjectId().toString(),
    stripHtml: (value = '') => clean(value.replace(/<[^>]+>/g, ' ')),
    normalizeItemType: (value, fallback = 'note') => clean(value || fallback),
    parseClaimId: () => null,
    normalizeTags: (value) => (Array.isArray(value) ? value.map(clean).filter(Boolean) : []),
    syncNotebookReferences: async () => {},
    enqueueNotebookEmbedding: () => {},
    trackEvent: () => {},
    EVENT_NAMES: {
      WORKSPACE_CREATED: 'workspace_created',
      CAPTURE_COMPLETED: 'capture_completed'
    },
    findHighlightById
  }));
  return app;
};

const requestJson = async (url, route, { method = 'GET', token = OWNER_TOKEN, body } = {}) => {
  const response = await fetch(`${url}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }
  return { status: response.status, payload };
};

const writeReport = ({ outputDir, report }) => {
  const absoluteOutputDir = path.resolve(outputDir);
  fs.mkdirSync(absoluteOutputDir, { recursive: true });
  const jsonPath = path.join(absoluteOutputDir, 'report.json');
  const markdownPath = path.join(absoluteOutputDir, 'REPORT.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, [
    '# Reading talks back — Stage 2 cumulative acceptance',
    '',
    `- Status: **${report.status.toUpperCase()}**`,
    `- Database: ${report.databaseName}`,
    `- Model calls: ${report.modelCalls}`,
    `- Cleanup: ${report.cleanup}`,
    ...(report.error ? [`- Failure: ${report.error}`] : []),
    '',
    '## Checks',
    '',
    ...report.checks.map((check) => `- ${check}`),
    '',
    'This is disposable local persisted acceptance. It is not merge, deploy, production, or real-account proof.',
    ''
  ].join('\n'), 'utf8');
  return { jsonPath, markdownPath };
};

const runAcceptance = async ({ mongoUri, outputDir = OUTPUT_DIR } = {}) => {
  const databaseName = assertDisposableDatabaseUri(mongoUri);
  const ownerId = new mongoose.Types.ObjectId();
  const foreignId = new mongoose.Types.ObjectId();
  const checks = [];
  let server;
  let report;
  let acceptanceError = null;

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    await mongoose.connection.db.dropDatabase();
    const article = await Article.create({
      url: 'https://acceptance.invalid/reading-talks-back',
      title: 'The source that began the thought',
      content: 'A source whose exact passage should survive the round trip.',
      userId: ownerId,
      siteName: 'Acceptance fixture',
      highlights: [{
        text: 'A sentence becomes useful when it can find its way home.',
        note: 'Exact passage fixture'
      }]
    });
    const highlightId = clean(article.highlights[0]._id);
    const articleId = clean(article._id);

    const listening = await listen(buildApp({ ownerId, foreignId }));
    server = listening.server;

    const created = await requestJson(listening.url, '/api/notebook', {
      method: 'POST',
      body: { title: 'A thought from an exact sentence', content: '', blocks: [], source: 'library-highlight' }
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.payload));
    const notebookId = clean(created.payload._id);

    const appended = await requestJson(listening.url, `/api/notebook/${notebookId}/append-highlight`, {
      method: 'POST',
      body: { highlightId }
    });
    assert.strictEqual(appended.status, 200, JSON.stringify(appended.payload));
    checks.push('The real notebook routes created a thought and attached the exact owned highlight.');

    const reloadedThought = await requestJson(listening.url, `/api/notebook/${notebookId}`);
    assert.strictEqual(reloadedThought.status, 200, JSON.stringify(reloadedThought.payload));
    const sourceBlock = reloadedThought.payload.blocks.find((block) => block.type === 'highlight_embed');
    assert.strictEqual(clean(sourceBlock?.articleId), articleId);
    assert.strictEqual(clean(sourceBlock?.highlightId), highlightId);
    assert.strictEqual(clean(reloadedThought.payload.linkedArticleId), articleId);
    assert.ok(reloadedThought.payload.linkedHighlightIds.map(clean).includes(highlightId));
    checks.push('Reload preserved the thought, article, highlight, and exact passage as one identity chain.');

    const expectedReturn = buildExactLibraryPath({ articleId, highlightId });
    assert.strictEqual(expectedReturn, `/library?articleId=${articleId}&highlightId=${highlightId}`);
    checks.push(`The persisted thought reconstructs the exact return door: ${expectedReturn}`);

    const kept = await requestJson(listening.url, `/articles/${articleId}/evergreen`, {
      method: 'PATCH',
      body: { evergreen: true }
    });
    assert.strictEqual(kept.status, 200, JSON.stringify(kept.payload));
    assert.strictEqual(kept.payload.evergreen, true);

    const reloadedKeep = await requestJson(listening.url, `/articles/${articleId}/evergreen`);
    assert.strictEqual(reloadedKeep.status, 200, JSON.stringify(reloadedKeep.payload));
    assert.strictEqual(reloadedKeep.payload.evergreen, true);
    assert.ok(reloadedKeep.payload.evergreenAt);
    checks.push('Human Keep survived a cache-cold owner-scoped read from the source record.');

    const foreignThought = await requestJson(listening.url, `/api/notebook/${notebookId}`, { token: FOREIGN_TOKEN });
    const foreignKeep = await requestJson(listening.url, `/articles/${articleId}/evergreen`, { token: FOREIGN_TOKEN });
    assert.strictEqual(foreignThought.status, 404);
    assert.strictEqual(foreignKeep.status, 404);
    checks.push('Foreign thought and Keep reads failed closed without revealing state.');

    assert.strictEqual(await Article.countDocuments({ userId: ownerId, evergreen: true }), 1);
    assert.strictEqual(await NotebookEntry.countDocuments({ userId: ownerId }), 1);
    checks.push('The complete loop produced one source and one thought—no duplicate object or model call.');

    report = {
      status: 'pass',
      databaseName,
      modelCalls: 0,
      checks,
      cleanup: 'pending'
    };
  } catch (error) {
    acceptanceError = error;
    report = {
      status: 'fail',
      databaseName,
      modelCalls: 0,
      checks,
      error: clean(error?.message) || 'Acceptance failed.',
      cleanup: 'pending'
    };
  } finally {
    if (server) await close(server);
    const remainingCollections = await dropAndVerifyDatabase(mongoUri);
    report.cleanup = remainingCollections === 0
      ? 'disposable database dropped; zero collections remain'
      : `${remainingCollections} collection(s) remain`;
    if (remainingCollections !== 0 && !acceptanceError) {
      acceptanceError = new Error(report.cleanup);
      report.status = 'fail';
      report.error = report.cleanup;
    }
  }

  const paths = writeReport({ outputDir, report });
  if (acceptanceError) {
    acceptanceError.reportPath = paths.markdownPath;
    throw acceptanceError;
  }
  return { ...report, ...paths };
};

const main = async () => {
  const result = await runAcceptance(parseArgs(process.argv.slice(2)));
  console.log('reading talks back acceptance');
  console.log(`status=${result.status}`);
  console.log(`checks=${result.checks.length}`);
  console.log(`modelCalls=${result.modelCalls}`);
  console.log(`cleanup=${result.cleanup}`);
  console.log(`report=${result.markdownPath}`);
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    if (error?.reportPath) console.error(`report=${error.reportPath}`);
    process.exit(1);
  });
}

module.exports = {
  DATABASE_PREFIX,
  assertDisposableDatabaseUri,
  buildExactLibraryPath,
  dropAndVerifyDatabase,
  databaseNameFromUri,
  parseArgs,
  runAcceptance
};
