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

class FakeWikiSourceEvent {
  static records = [];

  constructor(value = {}) {
    Object.assign(this, clone(value));
    this._id = this._id || new mongoose.Types.ObjectId().toString();
    this.affectedPageIds = Array.isArray(this.affectedPageIds) ? this.affectedPageIds : [];
    this.metadata = this.metadata || {};
  }

  static findOne(query = {}) {
    const found = FakeWikiSourceEvent.records.find(record => matches(record, query));
    return new Query(found ? new FakeWikiSourceEvent(found) : null);
  }

  markModified() {}

  toObject() {
    return clone({ ...this });
  }

  async save() {
    const stored = this.toObject();
    const index = FakeWikiSourceEvent.records.findIndex(
      record => String(record._id) === String(this._id)
    );
    if (index >= 0) FakeWikiSourceEvent.records[index] = stored;
    else FakeWikiSourceEvent.records.push(stored);
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
  let watchOptions = null;
  let maintainCalls = 0;
  let companyFactsCalls = 0;
  let officialProductCalls = 0;
  let officialProductFailuresRemaining = 1;
  let competitorPrimaryCalls = 0;
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: ownerId };
      if (req.headers['x-agent-token']) req.agentToken = { id: 'agent-1' };
      next();
    },
    WikiPage,
    WikiRevision: FakeRevision,
    WikiSourceEvent: FakeWikiSourceEvent,
    resolveEdgarCompanyIdentifier: async () => {
      resolveCalls += 1;
      return company;
    },
    inspectCompanyDossierFiler: async () => filer,
    checkEdgarWatchForPage: async (options) => {
      watchOptions = options;
      const event = new FakeWikiSourceEvent({
        title: 'AMD FY2025 10-K',
        text: `Competition. Our principal competitors include NVIDIA Corporation. ${'AMD annual filing evidence. '.repeat(120)}`,
        url: 'https://www.sec.gov/Archives/amd-10-k',
        sourceType: 'external',
        provider: 'sec-edgar',
        userId: ownerId,
        externalId: 'amd-10-k',
        metadata: {
          form: '10-K',
          filingDate: '2026-02-04',
          accessionNumber: '0000002488-26-000001'
        }
      });
      await event.save();
      return { filings: [{ form: '10-K' }], events: [event] };
    },
    fetchCompanyFacts: async () => {
      companyFactsCalls += 1;
      const annual = (tag, values) => ({
        label: tag,
        units: {
          USD: values.map(({ fy, val }) => ({
            fy,
            fp: 'FY',
            form: '10-K',
            end: `${fy}-12-31`,
            filed: `${fy + 1}-02-01`,
            accn: `${tag}-${fy}`,
            val
          }))
        }
      });
      return {
        cik: Number(company.cik),
        entityName: company.companyName,
        facts: {
          'us-gaap': {
            RevenueFromContractWithCustomerExcludingAssessedTax: annual('Revenue', [
              { fy: 2023, val: 100 },
              { fy: 2024, val: 120 },
              { fy: 2025, val: 140 }
            ]),
            OperatingIncomeLoss: annual('Operating income', [
              { fy: 2023, val: 10 },
              { fy: 2024, val: 12 },
              { fy: 2025, val: 14 }
            ])
          }
        }
      };
    },
    acquireOfficialProductSources: async ({ ticker }) => {
      officialProductCalls += 1;
      if (officialProductFailuresRemaining > 0) {
        officialProductFailuresRemaining -= 1;
        const error = new Error('Reader temporarily unavailable.');
        error.statusCode = 503;
        throw error;
      }
      return {
        sourceRefs: [
          {
            type: 'external',
            title: `${ticker} products`,
            snippet: 'Official product and technology evidence.',
            url: 'https://www.amd.com/en/products',
            provider: 'official-company-site',
            metadata: {
              evidenceArchetype: 'company_product',
              acquisitionMethod: 'wikidata_jina_reader'
            }
          }
        ],
        stop: null,
        discovery: {
          website: 'https://www.amd.com/',
          itemUrl: 'https://www.wikidata.org/entity/Q128896'
        }
      };
    },
    acquireCompetitorPrimarySource: async ({ issuer, issuerFiling }) => {
      competitorPrimaryCalls += 1;
      assert.equal(issuer.ticker, company.ticker);
      assert.match(issuerFiling.text, /NVIDIA Corporation/);
      return {
        evidence: {
          sourceType: 'external',
          provider: 'sec-edgar',
          externalId: 'sec-edgar-competitor:0001045810:nvda-2025-10-k',
          eventType: 'updated',
          title: 'NVIDIA CORP 10-K competitor primary evidence',
          summary: 'NVIDIA primary filing excerpt.',
          text: `NVIDIA primary annual filing. ${'Product, platform, software, and competition evidence. '.repeat(80)}`,
          url: 'https://www.sec.gov/Archives/nvda-10-k',
          sourceUpdatedAt: '2026-02-25',
          status: 'ignored',
          metadata: {
            evidenceArchetype: 'competitor_primary',
            sourceClass: 'competitor_primary',
            role: 'named_competitor',
            competitor: true,
            namedByIssuer: {
              issuerCik: company.cik,
              disclosureSentence: 'Our principal competitors include NVIDIA Corporation.'
            },
            competitorIssuer: {
              cik: '0001045810',
              ticker: 'NVDA',
              companyName: 'NVIDIA CORP',
              form: '10-K'
            }
          }
        },
        stop: null
      };
    },
    maintainWikiPage: async () => {
      maintainCalls += 1;
      throw new Error('The evidence preflight should prevent model drafting.');
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
    assert.equal(watchOptions.limit, 8);
    assert.equal(watchOptions.selectionMode, 'company_dossier_bootstrap');
    assert.deepEqual(
      WikiPage.records.at(-1).externalWatches.edgar.forms,
      ['10-K', '10-Q', 'DEF 14A', '8-K']
    );
    assert.equal(WikiPage.records.at(-1).sourceRefs[0].metadata.evidenceArchetype, 'filing');
    assert.equal(
      WikiPage.records.at(-1).sourceRefs[0].metadata.sourceEventId,
      WikiPage.records.at(-1).sourceRefs[0].objectId
    );
    assert.equal(WikiPage.records.at(-1).sourceRefs[1].provider, 'sec-companyfacts');
    assert.equal(WikiPage.records.at(-1).sourceRefs[1].metadata.evidenceArchetype, 'operating_benchmark');
    assert.equal(WikiPage.records.at(-1).sourceRefs[2].provider, 'official-company-site');
    assert.equal(WikiPage.records.at(-1).sourceRefs[2].metadata.evidenceArchetype, 'company_product');
    assert.equal(WikiPage.records.at(-1).sourceRefs[3].provider, 'sec-edgar');
    assert.equal(WikiPage.records.at(-1).sourceRefs[3].metadata.evidenceArchetype, 'competitor_primary');
    assert.equal(
      WikiPage.records.at(-1).sourceRefs[3].metadata.sourceEventId,
      WikiPage.records.at(-1).sourceRefs[3].objectId
    );
    assert.equal(recreated.body.receipt.metrics.filingsAttached, 1);
    assert.equal(recreated.body.receipt.metrics.totalSourcesAttached, 4);
    assert.equal(recreated.body.receipt.metrics.operatingBenchmarkAttached, true);
    assert.equal(recreated.body.receipt.metrics.officialProductSourcesAttached, 1);
    assert.equal(recreated.body.receipt.metrics.competitorPrimaryAttached, true);
    assert.equal(companyFactsCalls, 1);
    assert.equal(officialProductCalls, 2);
    assert.equal(competitorPrimaryCalls, 1);
    assert.equal(
      FakeWikiSourceEvent.records.filter(
        event => event.metadata?.evidenceArchetype === 'competitor_primary'
      ).length,
      1
    );
    assert.equal(WikiPage.records.length, 2);
    assert.equal(WikiPage.records.filter(page => page.status !== 'archived').length, 1);

    WikiPage.records.at(-1).sourceRefs = WikiPage.records.at(-1).sourceRefs
      .filter(sourceRef => (
        !['sec-companyfacts', 'official-company-site'].includes(sourceRef.provider)
        && sourceRef.metadata?.evidenceArchetype !== 'competitor_primary'
      ));
    delete WikiPage.records.at(-1).investmentDossier.acquisition;
    WikiPage.records.at(-1).aiState.lastCandidateSummary = 'Stale candidate quality from an older run.';
    const streamResponse = await fetch(
      `${base}/api/wiki/pages/${recreated.body.page._id}/ai/draft/stream`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      }
    );
    const streamBody = await streamResponse.text();
    assert.equal(streamResponse.status, 200);
    assert.match(streamBody, /WIKI_DOSSIER_EVIDENCE_INCOMPLETE/);
    assert.match(streamBody, /operating_benchmark_attached/);
    assert.match(streamBody, /official_product_evidence_attached/);
    assert.match(streamBody, /competitor_primary_evidence_attached/);
    assert.doesNotMatch(streamBody, /a primary source from a named competitor/);
    assert.match(streamBody, /independent regulator/);
    assert.match(streamBody, /dated market price/);
    assert.equal(maintainCalls, 0);
    assert.equal(companyFactsCalls, 2);
    assert.equal(officialProductCalls, 3);
    assert.equal(competitorPrimaryCalls, 2);
    assert.deepEqual(
      WikiPage.records.at(-1).investmentDossier.researchPlan.evidenceArchetypes,
      ['filing', 'operating_benchmark', 'company_product', 'competitor_primary']
    );
    assert.deepEqual(
      WikiPage.records.at(-1).investmentDossier.researchPlan.missingEvidenceArchetypes,
      ['independent_domain', 'market_snapshot']
    );
    assert.equal(WikiPage.records.at(-1).aiState.lastCandidateSummary, '');
    assert.equal(
      WikiPage.records.at(-1).sourceRefs.filter(sourceRef => sourceRef.provider === 'sec-companyfacts').length,
      1
    );
    assert.equal(
      WikiPage.records.at(-1).sourceRefs.filter(sourceRef => sourceRef.provider === 'official-company-site').length,
      1
    );
    assert.equal(
      WikiPage.records.at(-1).sourceRefs.filter(
        sourceRef => sourceRef.metadata?.evidenceArchetype === 'competitor_primary'
      ).length,
      1
    );
    assert.equal(
      FakeWikiSourceEvent.records.filter(
        event => event.metadata?.evidenceArchetype === 'competitor_primary'
      ).length,
      1
    );
    const repeatedStream = await fetch(
      `${base}/api/wiki/pages/${recreated.body.page._id}/ai/draft/stream`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      }
    );
    assert.match(await repeatedStream.text(), /WIKI_DOSSIER_EVIDENCE_INCOMPLETE/);
    assert.equal(companyFactsCalls, 2);
    assert.equal(officialProductCalls, 3);
    assert.equal(competitorPrimaryCalls, 2);
    assert.equal(
      WikiPage.records.at(-1).sourceRefs.filter(sourceRef => sourceRef.provider === 'sec-companyfacts').length,
      1
    );
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
