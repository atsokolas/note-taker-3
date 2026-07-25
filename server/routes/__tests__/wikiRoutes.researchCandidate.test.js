const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { buildWikiRouter } = require('../wikiRoutes');
const { snapshotContentHash, snapshotPage } = require('../../services/wikiRevisionService');

const clone = value => JSON.parse(JSON.stringify(value));
const valueAtPath = (value, path) => String(path).split('.').reduce(
  (current, part) => (current == null ? undefined : current[part]),
  value
);
const matches = (record, query = {}) => Object.entries(query).every(([key, expected]) => (
  String(valueAtPath(record, key) || '') === String(expected || '')
));

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  lean() { return Promise.resolve(this.value ? clone(this.value) : null); }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const createWikiPageModel = (seed) => {
  const records = seed.map(clone);
  function WikiPage(value = {}) {
    Object.assign(this, clone(value));
    this.markModified = () => {};
  }
  WikiPage.records = records;
  WikiPage.findOne = query => new Query(
    records.find(record => matches(record, query))
      ? new WikiPage(records.find(record => matches(record, query)))
      : null
  );
  WikiPage.prototype.toObject = function toObject() { return clone({ ...this, markModified: undefined }); };
  WikiPage.prototype.save = async function save() {
    const index = records.findIndex(record => String(record._id) === String(this._id));
    const stored = this.toObject();
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };
  return WikiPage;
};

const createRevisionModel = (seed) => {
  const records = seed.map(clone);
  function WikiRevision(value = {}) {
    Object.assign(this, clone(value));
    this._id = this._id || new mongoose.Types.ObjectId().toString();
  }
  WikiRevision.records = records;
  WikiRevision.findOne = query => new Query(
    records.find(record => matches(record, query))
      ? new WikiRevision(records.find(record => matches(record, query)))
      : null
  );
  WikiRevision.prototype.save = async function save() {
    const stored = clone(this);
    const index = records.findIndex(record => String(record._id) === String(this._id));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };
  return WikiRevision;
};

const run = async () => {
  const ownerId = new mongoose.Types.ObjectId().toString();
  const pageId = new mongoose.Types.ObjectId().toString();
  const candidateId = new mongoose.Types.ObjectId().toString();
  const base = {
    _id: pageId,
    userId: ownerId,
    title: 'FAST investment dossier',
    slug: 'fast-investment-dossier',
    pageType: 'entity',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'selected_sources',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Private scaffold.' }] }] },
    plainText: 'Private scaffold.',
    sourceRefs: [{ _id: new mongoose.Types.ObjectId().toString(), title: 'FAST 10-K' }],
    claims: [],
    citations: [],
    judgment: { kind: 'thesis', governingQuestion: 'Can FAST compound?', currentJudgment: 'FAST can compound.' },
    investmentDossier: {
      version: 2,
      company: { ticker: 'FAST', cik: '0000815556' },
      firstHead: { status: 'pending' }
    },
    freshness: { status: 'needs_review' },
    aiState: {
      draftStatus: 'error',
      lastError: 'An earlier QA build failed.',
      errorCode: 'WIKI_DRAFT_QUALITY_FAILED',
      lastCandidateQuality: { ok: false, status: 'fail' },
      lastCandidateSummary: 'The earlier candidate failed the quality gate.',
      candidateStatus: 'awaiting_first_head_acceptance',
      firstHeadCandidateRevisionId: candidateId,
      firstHeadCandidateSummary: { wordCount: 500, claimCount: 1, sourceCount: 1 }
    },
    externalWatches: { edgar: { ticker: 'FAST', cik: '0000815556' } }
  };
  const candidate = {
    ...clone(base),
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Accepted research candidate.' }] }] },
    plainText: 'Accepted research candidate.',
    claims: [{ claimId: 'fast-moat', text: 'Onsite density deepens workflow integration.', section: 'Product and Technical Moat' }],
    aiState: { draftStatus: 'ready', quality: { ok: true, status: 'pass' } }
  };
  const trustedHash = snapshotContentHash(snapshotPage(base));
  const WikiPage = createWikiPageModel([base]);
  const WikiRevision = createRevisionModel([{
    _id: candidateId,
    userId: ownerId,
    pageId,
    promotionStatus: 'candidate',
    reason: 'agent_candidate',
    before: snapshotPage(base),
    after: snapshotPage(candidate),
    sourceVersion: { provider: 'sec-edgar', trustedHeadHash: trustedHash }
  }]);
  const receipts = [];
  const NoeisReceipt = {
    findOneAndUpdate: async (_query, update) => {
      const stored = clone(update.$set);
      receipts.push(stored);
      return stored;
    }
  };
  const app = express();
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: ownerId };
      if (req.headers['x-agent-token']) req.agentToken = { id: 'agent' };
      next();
    },
    WikiPage,
    WikiRevision,
    NoeisReceipt
  }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const request = async (path, { method = 'GET', headers = {} } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(method === 'POST' ? { body: '{}' } : {})
    });
    return { response, body: await response.json() };
  };
  try {
    const preview = await request(`/api/wiki/pages/${pageId}/research-candidate`);
    assert.equal(preview.response.status, 200);
    assert.equal(preview.body.candidate.plainText, 'Accepted research candidate.');

    const agent = await request(`/api/wiki/pages/${pageId}/research-candidate/accept`, {
      method: 'POST',
      headers: { 'x-agent-token': 'yes' }
    });
    assert.equal(agent.response.status, 403);

    WikiPage.records[0].judgment.currentJudgment = 'Edited after generation.';
    const stale = await request(`/api/wiki/pages/${pageId}/research-candidate/accept`, { method: 'POST' });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.code, 'WIKI_RESEARCH_CANDIDATE_STALE');
    WikiPage.records[0].judgment.currentJudgment = 'FAST can compound.';

    const accepted = await request(`/api/wiki/pages/${pageId}/research-candidate/accept`, { method: 'POST' });
    assert.equal(accepted.response.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.page.plainText, 'Accepted research candidate.');
    assert.equal(accepted.body.page.investmentDossier.firstHead.status, 'accepted');
    assert.equal(accepted.body.page.aiState.draftStatus, 'ready');
    assert.equal(accepted.body.page.aiState.lastError, '');
    assert.equal(accepted.body.page.aiState.errorCode, '');
    assert.deepEqual(accepted.body.page.aiState.lastCandidateQuality, {});
    assert.equal(accepted.body.page.aiState.lastCandidateSummary, '');
    assert.equal(WikiRevision.records.find(row => String(row._id) === candidateId).promotionStatus, 'promoted');
    assert.equal(receipts.at(-1).kind, 'company_dossier_first_head_accepted');

    const repeated = await request(`/api/wiki/pages/${pageId}/research-candidate/accept`, { method: 'POST' });
    assert.equal(repeated.response.status, 409);
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
  console.log('wikiRoutes research candidate tests passed');
};

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
