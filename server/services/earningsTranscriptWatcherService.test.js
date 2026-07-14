const assert = require('assert');
const {
  armTranscriptWatchForPage,
  buildTranscriptEventPayload,
  drainDueTranscriptWatches,
  dueTranscriptWatchQuery,
  normalizeTranscriptMeta,
  transcriptKey
} = require('./earningsTranscriptWatcherService');

const makeFetch = () => async (url) => {
  const value = String(url);
  assert.match(value, /apikey=test-key/);
  if (value.includes('earning-call-transcript-latest')) {
    return {
      ok: true,
      json: async () => ([{
        symbol: 'MSFT',
        year: 2026,
        quarter: 2,
        date: '2026-07-01'
      }])
    };
  }
  if (value.includes('earning-call-transcript?')) {
    return {
      ok: true,
      json: async () => ([{
        symbol: 'MSFT',
        year: 2026,
        quarter: 2,
        date: '2026-07-01',
        transcript: 'Operator: Welcome. CEO: Cloud demand remained durable while AI infrastructure investment accelerated.'
      }])
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
      && (!query.affectedPageIds || (event.affectedPageIds || []).some(pageId => String(pageId) === String(query.affectedPageIds)))
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
  _id: '507f1f77bcf86cd799439021',
  userId: 'user-1',
  title: 'Microsoft dossier',
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
  assert.deepStrictEqual(
    normalizeTranscriptMeta({ symbol: ' msft ', year: '2026', quarter: '2' }),
    {
      symbol: 'MSFT',
      year: 2026,
      quarter: 2,
      date: '',
      title: 'MSFT Q2 2026 earnings call transcript',
      transcript: ''
    }
  );
  assert.strictEqual(transcriptKey({ symbol: 'msft', year: 2026, quarter: 2, date: '2026-07-01' }), 'MSFT:2026:2:2026-07-01');
  assert.match(
    buildTranscriptEventPayload({
      userId: 'user-1',
      page: makePage(),
      transcript: {
        symbol: 'MSFT',
        year: 2026,
        quarter: 2,
        date: '2026-07-01',
        transcript: 'CEO: Durable demand.'
      }
    }).summary,
    /MSFT Q2 2026 earnings call transcript/
  );

  FakeWikiSourceEvent.reset();
  FakeWikiPage.page = makePage();
  const result = await armTranscriptWatchForPage({
    WikiPage: FakeWikiPage,
    WikiSourceEvent: FakeWikiSourceEvent,
    userId: 'user-1',
    pageId: '507f1f77bcf86cd799439021',
    ticker: 'msft',
    fetchImpl: makeFetch(),
    apiKey: 'test-key',
    now: () => new Date('2026-07-04T00:00:00.000Z')
  });
  assert.strictEqual(result.events.length, 1);
  assert.strictEqual(FakeWikiSourceEvent.rows.length, 1);
  assert.strictEqual(FakeWikiPage.page.externalWatches.transcripts.ticker, 'MSFT');
  assert.strictEqual(FakeWikiPage.page.externalWatches.transcripts.status, 'active');
  assert.strictEqual(FakeWikiPage.page.externalWatches.transcripts.lastTranscriptKey, 'MSFT:2026:2:2026-07-01');
  assert.strictEqual(FakeWikiSourceEvent.rows[0].provider, 'fmp-transcripts');
  assert.match(FakeWikiSourceEvent.rows[0].text, /Cloud demand remained durable/);

  const second = await armTranscriptWatchForPage({
    WikiPage: FakeWikiPage,
    WikiSourceEvent: FakeWikiSourceEvent,
    userId: 'user-1',
    pageId: '507f1f77bcf86cd799439021',
    ticker: 'MSFT',
    fetchImpl: makeFetch(),
    apiKey: 'test-key',
    now: () => new Date('2026-07-04T00:00:00.000Z')
  });
  assert.strictEqual(second.events.length, 0);
  assert.strictEqual(FakeWikiSourceEvent.rows.length, 1);

  FakeWikiPage.page = { ...makePage(), _id: '507f1f77bcf86cd799439022' };
  const secondPage = await armTranscriptWatchForPage({
    WikiPage: FakeWikiPage,
    WikiSourceEvent: FakeWikiSourceEvent,
    userId: 'user-1',
    pageId: '507f1f77bcf86cd799439022',
    ticker: 'MSFT',
    fetchImpl: makeFetch(),
    apiKey: 'test-key'
  });
  assert.strictEqual(secondPage.events.length, 1);
  assert.strictEqual(FakeWikiSourceEvent.rows.length, 2);
  assert.strictEqual(FakeWikiSourceEvent.rows[1].affectedPageIds[0], '507f1f77bcf86cd799439022');

  FakeWikiPage.page = { ...makePage(), _id: '507f1f77bcf86cd799439023' };
  const blocked = await armTranscriptWatchForPage({
    WikiPage: FakeWikiPage,
    WikiSourceEvent: FakeWikiSourceEvent,
    userId: 'user-1',
    pageId: '507f1f77bcf86cd799439023',
    ticker: 'MSFT',
    apiKey: '',
    checkNow: false,
    now: () => new Date('2026-07-04T01:00:00.000Z')
  });
  assert.match(blocked.configurationError, /FMP_API_KEY/);
  assert.strictEqual(FakeWikiPage.page.externalWatches.transcripts.status, 'error');
  assert.strictEqual(FakeWikiPage.page.externalWatches.transcripts.lastCheckedAt.toISOString(), '2026-07-04T01:00:00.000Z');
  assert.match(FakeWikiPage.page.externalWatches.transcripts.errorMessage, /FMP_API_KEY/);

  FakeWikiPage.page = { ...makePage(), _id: '507f1f77bcf86cd799439024' };
  await assert.rejects(
    armTranscriptWatchForPage({
      WikiPage: FakeWikiPage,
      WikiSourceEvent: FakeWikiSourceEvent,
      userId: 'user-1',
      pageId: '507f1f77bcf86cd799439024',
      ticker: 'MSFT',
      apiKey: ''
    }),
    error => error.statusCode === 503 && /FMP_API_KEY/.test(error.message)
  );
  assert.strictEqual(FakeWikiPage.page.externalWatches.transcripts.status, 'error');

  FakeWikiPage.page = makePage();

  const dueQuery = dueTranscriptWatchQuery({ cutoff: new Date('2026-07-04T00:00:00.000Z') });
  assert.strictEqual(dueQuery['externalWatches.transcripts.status'], 'active');
  assert.deepStrictEqual(dueQuery.status, { $ne: 'archived' });

  const duePage = makePage();
  duePage.externalWatches = {
    transcripts: {
      ticker: 'MSFT',
      status: 'active',
      lastCheckedAt: new Date('2026-07-03T00:00:00.000Z')
    }
  };
  FakeWikiPage.pages = [duePage];
  const drained = await drainDueTranscriptWatches({
    models: { WikiPage: FakeWikiPage, WikiSourceEvent: FakeWikiSourceEvent },
    limit: 1,
    maxAgeMs: 60 * 60 * 1000,
    apiKey: 'test-key',
    now: new Date('2026-07-04T00:00:00.000Z'),
    checkTranscriptWatchForPageFn: async ({ page }) => ({
      page,
      transcript: { symbol: 'MSFT', year: 2026, quarter: 2 },
      events: [{ _id: 'event-1' }]
    })
  });
  assert.strictEqual(drained.processed, 1);
  assert.strictEqual(drained.failed, 0);
  assert.strictEqual(drained.results[0].sourceEvents, 1);
  assert.strictEqual(FakeWikiPage.lastQuery['externalWatches.transcripts.status'], 'active');

  const skipped = await drainDueTranscriptWatches({
    models: { WikiPage: FakeWikiPage, WikiSourceEvent: FakeWikiSourceEvent },
    apiKey: ''
  });
  assert.strictEqual(skipped.skipped, true);
  assert.strictEqual(skipped.reason, 'missing_fmp_api_key');
};

run()
  .then(() => {
    console.log('earningsTranscriptWatcherService tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
