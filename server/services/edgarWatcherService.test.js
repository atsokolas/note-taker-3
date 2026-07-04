const assert = require('assert');
const {
  armEdgarWatchForPage,
  buildFilingUrl,
  drainDueEdgarWatches,
  dueEdgarWatchQuery,
  latestTrackedFilings,
  normalizeRecentFilings
} = require('./edgarWatcherService');

const makeFetch = () => async (url) => {
  if (String(url).includes('company_tickers.json')) {
    return {
      ok: true,
      json: async () => ({
        0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' }
      })
    };
  }
  if (String(url).includes('/submissions/CIK0000320193.json')) {
    return {
      ok: true,
      json: async () => ({
        cik: '0000320193',
        name: 'Apple Inc.',
        filings: {
          recent: {
            accessionNumber: ['0000320193-26-000100', '0000320193-26-000090', '0000320193-26-000080'],
            filingDate: ['2026-07-03', '2026-06-20', '2026-06-01'],
            reportDate: ['2026-06-30', '2026-06-15', '2026-05-30'],
            acceptanceDateTime: ['20260703120000', '20260620120000', '20260601120000'],
            form: ['10-Q', '4', '8-K'],
            primaryDocument: ['aapl-20260630.htm', 'ownership.xml', 'aapl-8k.htm'],
            primaryDocDescription: ['Quarterly report', 'Ownership filing', 'Current report'],
            items: ['', '', 'Item 2.02'],
            size: [123, 50, 75]
          }
        }
      })
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

class FakeWikiSourceEvent {
  constructor(payload = {}) {
    Object.assign(this, payload);
    this._id = `event-${FakeWikiSourceEvent.rows.length + 1}`;
    this.status = this.status || 'pending';
  }

  async save() {
    FakeWikiSourceEvent.rows.push(this);
    return this;
  }

  static reset() {
    FakeWikiSourceEvent.rows = [];
  }

  static findOne(query = {}) {
    const row = FakeWikiSourceEvent.rows.find(event => (
      String(event.userId) === String(query.userId)
      && event.provider === query.provider
      && event.externalId === query.externalId
    ));
    return {
      select: () => ({
        lean: async () => (row ? { _id: row._id } : null)
      })
    };
  }
}
FakeWikiSourceEvent.rows = [];

const makePage = () => ({
  _id: '507f1f77bcf86cd799439011',
  userId: 'user-1',
  title: 'Apple dossier',
  status: 'draft',
  externalWatches: {},
  markModified(field) {
    this.marked = field;
  },
  async save() {
    this.saved = true;
    return this;
  }
});

class FakeWikiPage {
  static page = makePage();
  static pages = [];

  static findOne() {
    return Promise.resolve(FakeWikiPage.page);
  }

  static find(query = {}) {
    FakeWikiPage.lastQuery = query;
    return {
      sort: () => ({
        limit: async (limit) => FakeWikiPage.pages.slice(0, limit)
      })
    };
  }
}

const run = async () => {
  const filings = normalizeRecentFilings({
    filings: {
      recent: {
        accessionNumber: ['a1', 'a2'],
        form: ['10-K', '4'],
        filingDate: ['2026-01-01', '2026-01-02'],
        primaryDocument: ['doc.htm', 'owner.xml']
      }
    }
  });
  assert.strictEqual(filings.length, 2);
  assert.strictEqual(latestTrackedFilings({ submissions: { filings: { recent: { accessionNumber: ['a1', 'a2'], form: ['10-K', '4'] } } }, forms: ['10-K'] }).length, 1);
  assert.strictEqual(
    buildFilingUrl({ cik: '0000320193', accessionNumber: '0000320193-26-000100', primaryDocument: 'aapl-20260630.htm' }),
    'https://www.sec.gov/Archives/edgar/data/320193/000032019326000100/aapl-20260630.htm'
  );

  FakeWikiSourceEvent.reset();
  FakeWikiPage.page = makePage();
  const result = await armEdgarWatchForPage({
    WikiPage: FakeWikiPage,
    WikiSourceEvent: FakeWikiSourceEvent,
    userId: 'user-1',
    pageId: '507f1f77bcf86cd799439011',
    ticker: 'aapl',
    forms: ['10-Q', '8-K'],
    fetchImpl: makeFetch(),
    now: () => new Date('2026-07-04T00:00:00.000Z')
  });
  assert.strictEqual(result.events.length, 2);
  assert.strictEqual(FakeWikiSourceEvent.rows.length, 2);
  assert.strictEqual(FakeWikiPage.page.externalWatches.edgar.ticker, 'AAPL');
  assert.strictEqual(FakeWikiPage.page.externalWatches.edgar.cik, '0000320193');
  assert.strictEqual(FakeWikiPage.page.externalWatches.edgar.companyName, 'Apple Inc.');
  assert.strictEqual(FakeWikiPage.page.externalWatches.edgar.status, 'active');
  assert.strictEqual(FakeWikiSourceEvent.rows[0].provider, 'sec-edgar');
  assert.strictEqual(FakeWikiSourceEvent.rows[0].affectedPageIds[0], '507f1f77bcf86cd799439011');
  assert.match(FakeWikiSourceEvent.rows[0].summary, /Apple Inc\. filed 10-Q/);

  const second = await armEdgarWatchForPage({
    WikiPage: FakeWikiPage,
    WikiSourceEvent: FakeWikiSourceEvent,
    userId: 'user-1',
    pageId: '507f1f77bcf86cd799439011',
    ticker: 'AAPL',
    forms: ['10-Q', '8-K'],
    fetchImpl: makeFetch(),
    now: () => new Date('2026-07-04T00:00:00.000Z')
  });
  assert.strictEqual(second.events.length, 0);
  assert.strictEqual(FakeWikiSourceEvent.rows.length, 2);

  const dueQuery = dueEdgarWatchQuery({ cutoff: new Date('2026-07-04T00:00:00.000Z') });
  assert.strictEqual(dueQuery['externalWatches.edgar.status'], 'active');
  assert.deepStrictEqual(dueQuery.status, { $ne: 'archived' });

  const duePage = makePage();
  duePage.externalWatches = {
    edgar: {
      ticker: 'AAPL',
      cik: '0000320193',
      status: 'active',
      lastCheckedAt: new Date('2026-07-03T00:00:00.000Z')
    }
  };
  FakeWikiPage.pages = [duePage];
  const drained = await drainDueEdgarWatches({
    models: { WikiPage: FakeWikiPage, WikiSourceEvent: FakeWikiSourceEvent },
    limit: 1,
    maxAgeMs: 60 * 60 * 1000,
    now: new Date('2026-07-04T00:00:00.000Z'),
    checkEdgarWatchForPageFn: async ({ page }) => ({
      page,
      filings: [{ accessionNumber: 'filing-1' }],
      events: [{ _id: 'event-1' }]
    })
  });
  assert.strictEqual(drained.processed, 1);
  assert.strictEqual(drained.failed, 0);
  assert.strictEqual(drained.results[0].sourceEvents, 1);
  assert.strictEqual(FakeWikiPage.lastQuery['externalWatches.edgar.status'], 'active');
};

run()
  .then(() => {
    console.log('edgarWatcherService tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
