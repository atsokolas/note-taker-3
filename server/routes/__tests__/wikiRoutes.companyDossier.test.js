const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { buildWikiRouter } = require('../wikiRoutes');
const { buildInvestmentDossierProfile } = require('../../services/companyDossierService');

const clone = value => JSON.parse(JSON.stringify(value));
const valueAtPath = (value, path) => String(path).split('.').reduce(
  (current, part) => (current == null ? undefined : current[part]),
  value
);
const matches = (record, query = {}) => Object.entries(query).every(([key, expected]) => {
  const actual = valueAtPath(record, key);
  if (expected && typeof expected === 'object' && expected.$ne !== undefined) {
    return String(actual) !== String(expected.$ne);
  }
  return String(actual || '') === String(expected || '');
});

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  lean() { return Promise.resolve(this.value ? clone(this.value) : null); }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const createWikiPageModel = (seed = []) => {
  const records = seed.map(clone);
  function WikiPage(value = {}) {
    Object.assign(this, clone(value));
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.sourceRefs = Array.isArray(this.sourceRefs) ? this.sourceRefs : [];
    this.claims = Array.isArray(this.claims) ? this.claims : [];
    this.citations = Array.isArray(this.citations) ? this.citations : [];
    this.aiState = this.aiState || {};
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
  }
  WikiPage.records = records;
  WikiPage.findOne = (query = {}) => {
    const found = records.find(record => matches(record, query));
    return new Query(found ? new WikiPage(found) : null);
  };
  WikiPage.prototype.markModified = function markModified() {};
  WikiPage.prototype.toObject = function toObject() {
    const raw = { ...this };
    return clone(raw);
  };
  WikiPage.prototype.save = async function save() {
    this.updatedAt = new Date();
    const stored = this.toObject();
    const index = records.findIndex(record => String(record._id) === String(this._id));
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    return this;
  };
  return WikiPage;
};

class FakeRevision {
  static records = [];

  constructor(value = {}) {
    Object.assign(this, value);
    this._id = this._id || new mongoose.Types.ObjectId().toString();
  }

  async save() {
    FakeRevision.records.push(clone(this));
    return this;
  }
}

const request = async (base, path, body, headers = {}) => {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  return { response, body: await response.json() };
};

const run = async () => {
  const ownerId = new mongoose.Types.ObjectId().toString();
  const existingId = new mongoose.Types.ObjectId().toString();
  const input = {
    ticker: 'AMD',
    startingJudgment: 'AMD can gain durable share if its accelerator roadmap and software improve.',
    requiredReturn: 0.1,
    horizonYears: 5
  };
  const company = { ticker: 'AMD', cik: '0000002488', companyName: 'ADVANCED MICRO DEVICES INC' };
  const WikiPage = createWikiPageModel([{
    _id: existingId,
    userId: ownerId,
    title: 'AMD investment dossier',
    slug: 'amd-investment-dossier',
    pageType: 'entity',
    status: 'draft',
    visibility: 'private',
    archived: false,
    body: { type: 'doc', content: [{ type: 'paragraph' }] },
    plainText: '',
    sourceRefs: [],
    claims: [],
    citations: [],
    investmentDossier: buildInvestmentDossierProfile({
      ...input,
      companyName: company.companyName,
      cik: company.cik
    }),
    externalWatches: { edgar: { ...company, status: 'active' } }
  }]);
  let resolveCalls = 0;
  let filer = {
    supported: true,
    ticker: company.ticker,
    cik: company.cik,
    domesticForms: ['10-K', '10-Q'],
    foreignForms: [],
    primaryForeignForm: '',
    reason: 'domestic_filer'
  };
  const app = express();
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: ownerId };
      if (req.headers['x-agent-token']) req.agentToken = { id: 'agent-1' };
      next();
    },
    WikiPage,
    WikiRevision: FakeRevision,
    resolveEdgarCompanyIdentifier: async () => {
      resolveCalls += 1;
      return company;
    },
    inspectCompanyDossierFiler: async () => filer,
    checkEdgarWatchForPage: async () => {
      const event = {
        _id: new mongoose.Types.ObjectId().toString(),
        title: 'AMD FY2025 10-K',
        text: 'AMD annual filing evidence.',
        url: 'https://www.sec.gov/Archives/amd-10-k',
        metadata: {
          form: '10-K',
          filingDate: '2026-02-04',
          accessionNumber: '0000002488-26-000001'
        },
        async save() {}
      };
      return { filings: [{ form: '10-K' }], events: [event] };
    }
  }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const agent = await request(base, '/api/wiki/pages/from-company', input, { 'x-agent-token': 'yes' });
    assert.equal(agent.response.status, 403);
    assert.equal(resolveCalls, 0);

    filer = {
      supported: false,
      ticker: 'ASML',
      cik: '0000937966',
      domesticForms: [],
      foreignForms: ['20-F', '6-K'],
      primaryForeignForm: '20-F',
      reason: 'foreign_private_issuer'
    };
    const foreign = await request(base, '/api/wiki/pages/from-company', {
      ...input,
      ticker: 'ASML'
    });
    assert.equal(foreign.response.status, 422);
    assert.equal(foreign.body.code, 'DOSSIER_FOREIGN_FILER_UNSUPPORTED');
    assert.match(foreign.body.error, /foreign private issuer \(20-F\)/);
    assert.equal(WikiPage.records.length, 1);

    filer = {
      supported: true,
      ticker: company.ticker,
      cik: company.cik,
      domesticForms: ['10-K', '10-Q'],
      foreignForms: [],
      primaryForeignForm: '',
      reason: 'domestic_filer'
    };
    const existing = await request(base, '/api/wiki/pages/from-company', input);
    assert.equal(existing.response.status, 200, JSON.stringify(existing.body));
    assert.equal(existing.body.action, 'existing');
    assert.equal(existing.body.receipt.kind, 'company_dossier_existing');
    assert.equal(WikiPage.records.length, 1);

    const conflict = await request(base, '/api/wiki/pages/from-company', {
      ...input,
      requiredReturn: 0.12
    });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.code, 'DOSSIER_INPUT_CONFLICT');
    assert.equal(WikiPage.records.length, 1);

    WikiPage.records[0].status = 'archived';
    WikiPage.records[0].archived = true;
    const recreated = await request(base, '/api/wiki/pages/from-company', input);
    assert.equal(recreated.response.status, 201, JSON.stringify(recreated.body));
    assert.equal(recreated.body.action, 'created');
    assert.equal(recreated.body.receipt.metrics.cik, company.cik);
    assert.equal(recreated.body.receipt.provenance.firstHeadState, 'draft_pending_review');
    assert.equal(recreated.body.receipt.provenance.filings[0].accessionNumber, '0000002488-26-000001');
    assert.equal(WikiPage.records.length, 2);
    assert.equal(WikiPage.records.filter(page => page.status !== 'archived').length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
  console.log('wikiRoutes company dossier tests passed');
};

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
