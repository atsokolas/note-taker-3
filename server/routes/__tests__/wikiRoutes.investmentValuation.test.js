const assert = require('node:assert/strict');
const express = require('express');
const {
  buildPublicInvestmentValuation,
  buildWikiRouter
} = require('../wikiRoutes');

const clone = value => JSON.parse(JSON.stringify(value));

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  lean() { return Promise.resolve(this.value ? clone(this.value) : null); }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

class FakeRevision {
  static records = [];

  constructor(value = {}) {
    Object.assign(this, value);
    this._id = this._id || `revision-${FakeRevision.records.length + 1}`;
  }

  async save() {
    FakeRevision.records.push(clone(this));
    return this;
  }
}

const run = async () => {
  const page = {
    _id: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439010',
    slug: 'nvidia-investment-dossier',
    title: 'NVIDIA investment dossier',
    pageType: 'entity',
    status: 'draft',
    visibility: 'private',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Research draft.' }] }] },
    plainText: 'Research draft.',
    sourceRefs: [{
      _id: 'filing-source',
      type: 'external',
      title: 'NVIDIA FY2026 10-K',
      url: 'https://www.sec.gov/Archives/example',
      provider: 'sec-edgar',
      metadata: { form: '10-K' }
    }],
    claims: [],
    citations: [],
    judgment: {
      kind: 'thesis',
      currentJudgment: 'PRIVATE OWNER JUDGMENT MUST NOT ENTER THE PUBLIC VALUATION ENVELOPE'
    },
    investmentDossier: {
      version: 2,
      company: { ticker: 'NVDA', cik: '1045810' },
      startingJudgment: 'PRIVATE OWNER JUDGMENT MUST NOT ENTER THE PUBLIC VALUATION ENVELOPE',
      hurdle: { annualReturn: 0.1, horizonYears: 5 },
      valuation: { status: 'awaiting_inputs' },
      clocks: {
        filingAcceptedAt: '2026-05-20T00:00:00.000Z',
        priceRefreshedAt: null
      }
    },
    aiState: {},
    externalWatches: {
      edgar: { status: 'active', ticker: 'NVDA', cik: '1045810' }
    },
    markModified() {},
    toObject() {
      const raw = { ...this };
      delete raw.save;
      delete raw.markModified;
      delete raw.toObject;
      return clone(raw);
    },
    async save() {
      this.savedAt = new Date().toISOString();
      return this;
    }
  };
  const receipts = [];
  const WikiPage = {
    findOne(query = {}) {
      if (String(query._id) !== page._id || String(query.userId) !== page.userId) return Promise.resolve(null);
      return new Query(page);
    }
  };
  const NoeisReceipt = {
    async findOneAndUpdate(_query, update) {
      const stored = {
        ...update.$set,
        _id: `receipt-${receipts.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      receipts.push(stored);
      return stored;
    }
  };

  const app = express();
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: page.userId };
      if (req.headers['x-agent-token']) req.agentToken = { id: 'agent-1' };
      next();
    },
    WikiPage,
    WikiRevision: FakeRevision,
    NoeisReceipt
  }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/wiki/pages/${page._id}/valuation`;
    const payload = {
      asOf: '2026-07-24',
      price: 208.76,
      dilutedShares: 24.2,
      netCashOrDebt: -35,
      unitScale: 'billions',
      operatingMetric: 'free_cash_flow',
      operatingPeriod: 'FY2026 trailing twelve months',
      operatingBase: 96.676,
      operatingDerivation: 'Operating cash flow less purchases of property and equipment.',
      operatingSourceRefId: 'filing-source',
      terminalMultiples: [25, 30, 35, 40],
      marketSourceTitle: 'NASDAQ NVDA historical quote',
      marketSourceUrl: 'https://www.nasdaq.com/market-activity/stocks/nvda/historical'
    };

    const agentResponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-token': 'yes' },
      body: JSON.stringify(payload)
    });
    const agentBody = await agentResponse.text();
    assert.equal(agentResponse.status, 403, agentBody);
    assert.equal(page.sourceRefs.length, 1);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.valuation.status, 'complete');
    assert.equal(body.valuation.unitScale, 'billions');
    assert.equal(body.valuation.scenarios.length, 4);
    assert.equal(page.sourceRefs.length, 2);
    assert.equal(page.investmentDossier.clocks.filingAcceptedAt, '2026-05-20T00:00:00.000Z');
    assert.ok(page.investmentDossier.clocks.priceRefreshedAt);
    assert.equal(FakeRevision.records.length, 1);
    assert.equal(FakeRevision.records[0].reason, 'valuation_refreshed');
    assert.equal(
      FakeRevision.records[0].before.investmentDossier.valuation.status,
      'awaiting_inputs'
    );
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].kind, 'investment_valuation_refreshed');
    assert.equal(receipts[0].provenance.filingAcceptedAt, '2026-05-20T00:00:00.000Z');

    const publicValuation = buildPublicInvestmentValuation(page);
    assert.equal(publicValuation.status, 'complete');
    assert.equal(publicValuation.sources.length, 2);
    assert.equal(publicValuation.scenarios.length, 4);
    assert.ok(!JSON.stringify(publicValuation).includes('PRIVATE OWNER JUDGMENT'));
  } finally {
    await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
  console.log('wikiRoutes investment valuation tests passed');
};

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
