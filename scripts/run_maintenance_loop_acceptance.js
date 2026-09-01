#!/usr/bin/env node
require('dotenv').config();

const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const {
  Article,
  Connection,
  NoeisReceipt,
  NotebookEntry,
  Question,
  TagMeta,
  WikiBriefingCache,
  WikiMaintenanceRun,
  WikiPage,
  WikiProposal,
  WikiRevision,
  WikiSourceEvent
} = require('../server/models');
const embeddingJobs = require('../server/ai/embeddingJobs');
const { buildWikiRouter } = require('../server/routes/wikiRoutes');
const { processWikiSourceEvent } = require('../server/services/wikiMaintenanceOrchestrator');
const { matchesTrustedRevisionHead } = require('../server/services/wikiRevisionService');

/* Acceptance proves maintenance, not semantic indexing. Prevent schema
   post-save hooks from spending tokens or recreating collections after drop. */
embeddingJobs.enqueueJudgmentEmbedding = () => {};
embeddingJobs.enqueueWikiClaimEmbeddings = () => {};

const DATABASE_PREFIX = 'noeis_bet3_accept_';
const OUTPUT_DIR = 'output/bet3-maintenance-loop-acceptance-2026-08-31';
const OWNER_TOKEN = 'bet3-owner';
const AGENT_TOKEN = 'bet3-agent';

const clean = value => String(value || '').trim();

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

const parseArgs = (argv = []) => {
  const args = {
    mongoUri: process.env.BET3_MAINTENANCE_ACCEPTANCE_MONGODB_URI || '',
    outputDir: process.env.BET3_MAINTENANCE_ACCEPTANCE_OUTPUT_DIR || OUTPUT_DIR
  };
  argv.forEach(arg => {
    if (arg.startsWith('--mongo-uri=')) args.mongoUri = arg.slice('--mongo-uri='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = arg.slice('--output-dir='.length);
  });
  return args;
};

const listen = app => new Promise(resolve => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({
    server,
    url: `http://127.0.0.1:${server.address().port}`
  }));
});

const close = server => new Promise((resolve, reject) => {
  server.close(error => (error ? reject(error) : resolve()));
});

const dropAndVerifyDatabase = async mongoUri => {
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

const authenticateToken = (req, res, next) => {
  const token = clean(req.headers.authorization).replace(/^Bearer\s+/i, '');
  if (token === OWNER_TOKEN) req.user = { id: clean(req.app.locals.ownerId) };
  else if (token === AGENT_TOKEN) {
    req.user = { id: clean(req.app.locals.ownerId) };
    req.agentToken = { id: 'acceptance-agent' };
  } else return res.status(401).json({ error: 'Unauthorized' });
  return next();
};

const buildApp = ownerId => {
  const app = express();
  app.locals.ownerId = ownerId;
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken,
    WikiPage,
    WikiProposal,
    WikiRevision,
    WikiSourceEvent,
    WikiMaintenanceRun,
    WikiBriefingCache,
    Connection,
    NoeisReceipt,
    Article,
    NotebookEntry,
    TagMeta,
    Question,
    evaluateWikiArticleQuality: () => ({ ok: true, status: 'pass', failures: [] })
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
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
};

const maintainFromSource = async ({ page }) => {
  page.body = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'The accepted filing narrows the utilization claim.' }]
    }]
  };
  page.plainText = 'The accepted filing narrows the utilization claim.';
  page.claims = [{
    claimId: 'utilization',
    text: 'Utilization improved, but the accepted evidence does not yet prove durable pricing power.',
    section: 'Economics',
    support: 'partial',
    confidence: 0.72,
    epistemicStatus: 'supported_interpretation',
    materiality: 'critical'
  }];
  page.aiState = {
    ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
    quality: { ok: true, status: 'pass', score: 0.92, failures: [] },
    maintenanceSummary: 'Narrowed the utilization claim after the new filing.'
  };
  return page;
};

const writeReport = ({ outputDir, report }) => {
  const absolute = path.resolve(outputDir);
  fs.mkdirSync(absolute, { recursive: true });
  fs.writeFileSync(path.join(absolute, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(absolute, 'REPORT.md'), [
    '# Bet 3 maintenance loop — persisted acceptance',
    '',
    `- Status: **${report.status.toUpperCase()}**`,
    `- Database: ${report.databaseName}`,
    `- Model calls: ${report.modelCalls}`,
    `- Cleanup: ${report.cleanup}`,
    ...(report.error ? [`- Failure: ${report.error}`] : []),
    '',
    '## Checks',
    '',
    ...report.checks.map(check => `- ${check}`),
    '',
    'This is disposable local persisted acceptance. It is not merge, deploy, production, or real-account proof.',
    ''
  ].join('\n'));
};

const runAcceptance = async ({ mongoUri, outputDir = OUTPUT_DIR } = {}) => {
  const databaseName = assertDisposableDatabaseUri(mongoUri);
  const ownerId = new mongoose.Types.ObjectId();
  const checks = [];
  let server;
  let failure = null;

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    await mongoose.connection.db.dropDatabase();
    const page = await WikiPage.create({
      userId: ownerId,
      title: 'Acceptance company dossier',
      slug: `acceptance-company-${Date.now()}`,
      pageType: 'entity',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'selected_sources',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Trusted head.' }] }] },
      plainText: 'Trusted head.',
      claims: [{
        claimId: 'utilization',
        text: 'Utilization proves durable pricing power.',
        section: 'Economics',
        support: 'supported',
        confidence: 0.8,
        epistemicStatus: 'supported_interpretation',
        materiality: 'critical'
      }],
      judgment: {
        kind: 'thesis',
        governingQuestion: 'Can this company compound owner value?',
        currentJudgment: 'The company can compound if utilization becomes durable.',
        status: 'monitoring'
      },
      investmentDossier: {
        version: 2,
        company: { ticker: 'ACPT', cik: '0000000001' },
        firstHead: { status: 'accepted', acceptedAt: new Date() }
      },
      aiState: { draftStatus: 'ready', candidateStatus: 'idle' }
    });
    const ordinary = await WikiPage.create({
      userId: ownerId,
      title: 'Parenting with patience',
      slug: `parenting-patience-${Date.now()}`,
      pageType: 'topic',
      plainText: 'A general-purpose personal Wiki article.',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A general-purpose personal Wiki article.' }] }] }
    });
    const ordinaryBefore = ordinary.toObject();
    const sourceEvent = await WikiSourceEvent.create({
      userId: ownerId,
      sourceType: 'external',
      provider: 'sec-edgar',
      externalId: 'acceptance-filing-1',
      eventType: 'updated',
      title: 'Acceptance company quarterly filing',
      summary: 'The filing reports higher utilization while pricing remains unproven.',
      text: 'Utilization increased. Contract pricing and customer concentration remain material unknowns.',
      url: 'https://www.sec.gov/Archives/acceptance-fixture',
      sourceUpdatedAt: new Date(),
      status: 'pending',
      affectedPageIds: [page._id],
      metadata: { allowPageCreation: false }
    });

    const processed = await processWikiSourceEvent({
      sourceEventId: sourceEvent._id,
      userId: ownerId,
      maintainWikiPageFn: maintainFromSource,
      models: {
        WikiSourceEvent,
        WikiPage,
        WikiRevision,
        WikiMaintenanceRun,
        WikiProposal,
        Connection,
        Article,
        NotebookEntry,
        TagMeta,
        Question,
        NoeisReceipt,
        WikiBriefingCache
      }
    });
    assert.equal(processed.event.status, 'processed');
    assert.equal(processed.reviewCount, 1);
    assert.equal(processed.run.status, 'needs_review');
    checks.push('A real persisted source event produced exactly one dossier maintenance candidate awaiting owner acceptance.');

    const listening = await listen(buildApp(ownerId));
    server = listening.server;
    const candidatePage = await WikiPage.findById(page._id).lean();
    assert.equal(candidatePage.aiState.candidateStatus, 'awaiting_maintenance_acceptance');
    const candidateRevisionId = clean(candidatePage.aiState.maintenanceCandidateRevisionId);
    assert.ok(candidateRevisionId);
    const candidateRevision = await WikiRevision.findById(candidateRevisionId).lean();
    assert(matchesTrustedRevisionHead({ current: candidatePage, revision: candidateRevision }));

    const deniedAcceptance = await requestJson(
      listening.url,
      `/api/wiki/pages/${page._id}/research-candidate/accept`,
      { method: 'POST', token: AGENT_TOKEN }
    );
    assert.equal(deniedAcceptance.status, 403);
    const accepted = await requestJson(
      listening.url,
      `/api/wiki/pages/${page._id}/research-candidate/accept`,
      { method: 'POST' }
    );
    assert.equal(accepted.status, 200, JSON.stringify(accepted.payload));
    assert.equal(accepted.payload.receipt.kind, 'company_dossier_maintenance_accepted');
    assert.equal(accepted.payload.receipt.provenance.sourceEventId, clean(sourceEvent._id));
    assert.equal(accepted.payload.receipt.provenance.candidateRevisionId, candidateRevisionId);
    assert.ok(accepted.payload.receipt.provenance.acceptanceRevisionId);
    assert.equal(accepted.payload.judgmentReview.status, 'awaiting_review');
    checks.push('The agent was denied; the human owner accepted the exact candidate and persisted source, candidate, and acceptance revision bindings.');

    const deniedResolution = await requestJson(
      listening.url,
      `/api/wiki/pages/${page._id}/judgment-research-review/kept`,
      {
        method: 'POST',
        token: AGENT_TOKEN,
        body: { receiptId: accepted.payload.judgmentReview.id }
      }
    );
    assert.equal(deniedResolution.status, 403);
    const resolved = await requestJson(
      listening.url,
      `/api/wiki/pages/${page._id}/judgment-research-review/kept`,
      { method: 'POST', body: { receiptId: accepted.payload.judgmentReview.id } }
    );
    assert.equal(resolved.status, 200, JSON.stringify(resolved.payload));
    assert.equal(resolved.payload.receipt.status, 'completed');
    assert.equal(resolved.payload.receipt.provenance.resolution, 'kept');
    checks.push('The agent was denied again; the owner kept the judgment and the completed review receipt became the durable decision.');

    const weekly = await requestJson(listening.url, '/api/wiki/briefing?windowDays=7');
    assert.equal(weekly.status, 200, JSON.stringify(weekly.payload));
    assert.deepEqual(weekly.payload.consequentialReturn, {
      id: accepted.payload.judgmentReview.id,
      pageId: clean(page._id),
      title: page.title,
      summary: 'Reviewed the accepted research and kept the current judgment.',
      label: 'Judgment reviewed',
      linkLabel: 'See the decision →',
      href: `/judgment/${page._id}`,
      completedAt: resolved.payload.receipt.completedAt,
      priority: 2
    });
    checks.push('The seven-day return selected the completed Judgment consequence and exposed an exact door back to the case.');

    const unchangedOrdinary = await WikiPage.findById(ordinary._id).lean();
    assert.equal(unchangedOrdinary.plainText, ordinaryBefore.plainText);
    assert.equal(unchangedOrdinary.investmentDossier, null);
    assert.equal(unchangedOrdinary.judgment, null);
    checks.push('The unrelated ordinary Wiki stayed article-first and was not coerced into dossier or Judgment structure.');

    const receipts = await NoeisReceipt.find({ userId: ownerId }).lean();
    assert.equal(receipts.filter(row => row.kind === 'company_dossier_maintenance_accepted').length, 1);
    assert.equal(receipts.filter(row => row.kind === 'company_dossier_judgment_review' && row.status === 'completed').length, 1);
    assert.equal(await WikiSourceEvent.countDocuments({ userId: ownerId, status: 'processed' }), 1);
    checks.push('Replay-safe persisted state contains one processed source event, one acceptance receipt, and one completed decision receipt.');
  } catch (error) {
    failure = error;
  } finally {
    if (server) await close(server).catch(() => {});
  }

  const remainingCollections = await dropAndVerifyDatabase(mongoUri).catch(error => {
    failure ||= error;
    return -1;
  });
  const report = {
    status: failure ? 'fail' : 'pass',
    databaseName,
    modelCalls: 0,
    cleanup: remainingCollections === 0 ? 'zero collections remain' : `${remainingCollections} collections remain`,
    checks,
    error: failure?.stack || failure?.message || ''
  };
  writeReport({ outputDir, report });
  if (failure) throw failure;
  assert.equal(remainingCollections, 0);
  return report;
};

if (require.main === module) {
  runAcceptance(parseArgs(process.argv.slice(2)))
    .then(report => console.log(`Bet 3 maintenance loop acceptance: ${report.status.toUpperCase()} (${report.checks.length} checks)`))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  DATABASE_PREFIX,
  assertDisposableDatabaseUri,
  databaseNameFromUri,
  runAcceptance
};
