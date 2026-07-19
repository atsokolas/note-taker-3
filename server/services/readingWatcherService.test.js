const assert = require('assert');
const {
  validateFeedUrl,
  parseFeedItems,
  armReadingWatchForPage,
  checkReadingWatchForPage
} = require('./readingWatcherService');

const feed = `<?xml version="1.0"?><rss><channel><title>Example</title>
  <item><guid>post-2</guid><title>New &amp; useful</title><link>https://example.com/post-2?utm_source=x</link><pubDate>2026-07-19T12:00:00Z</pubDate><description><![CDATA[<p>Hello <b>world</b>.</p><script>bad()</script>]]></description></item>
  <item><guid>post-1</guid><title>Prior</title><link>https://example.com/post-1</link><pubDate>2026-07-18T12:00:00Z</pubDate><description>Prior body</description></item>
</channel></rss>`;

const headers = (values = {}) => ({ get: key => values[String(key).toLowerCase()] || null });
const response = (xml = feed) => ({ ok: true, status: 200, headers: headers({ 'content-type': 'application/rss+xml' }), text: async () => xml });
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

class FakeEvent {
  static rows = [];
  constructor(payload) { Object.assign(this, payload); this._id = `event-${FakeEvent.rows.length + 1}`; }
  async save() { FakeEvent.rows.push(this); return this; }
  static findOne(query) {
    const found = FakeEvent.rows.find(row => row.externalId === query.externalId && String(row.affectedPageIds?.[0]) === String(query.affectedPageIds));
    return { select: () => ({ lean: async () => found || null }) };
  }
}

const page = () => ({
  _id: '507f1f77bcf86cd799439011',
  userId: '507f1f77bcf86cd799439012',
  externalWatches: { reading: {} },
  async save() { return this; }
});

(async () => {
  await assert.rejects(
    () => validateFeedUrl('http://127.0.0.1/feed.xml', { lookup: publicLookup }),
    /public IP/
  );
  await assert.rejects(
    () => validateFeedUrl('https://example.com:8443/feed.xml', { lookup: publicLookup }),
    /standard HTTP/
  );

  const items = parseFeedItems({ xml: feed, feedUrl: 'https://example.com/feed.xml' });
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].title, 'New & useful');
  assert.strictEqual(items[0].url, 'https://example.com/post-2');
  assert.strictEqual(items[0].summary, 'Hello world.');

  FakeEvent.rows = [];
  const watchedPage = page();
  const armed = await armReadingWatchForPage({
    WikiSourceEvent: FakeEvent,
    page: watchedPage,
    feedUrl: 'https://example.com/feed.xml',
    label: 'Example feed',
    lookup: publicLookup,
    fetchImpl: async (_url, options) => {
      assert.match(options.headers['User-Agent'], /Noeis reading watcher/);
      return response();
    }
  });
  assert.strictEqual(armed.events.length, 1);
  assert.strictEqual(FakeEvent.rows[0].provider, 'reading-feed');
  assert.deepStrictEqual(FakeEvent.rows[0].affectedPageIds, [watchedPage._id]);
  assert.strictEqual(watchedPage.externalWatches.reading.status, 'active');
  assert.strictEqual(watchedPage.externalWatches.reading.lastItemId, 'post-2');

  const repeated = await checkReadingWatchForPage({
    WikiSourceEvent: FakeEvent,
    page: watchedPage,
    lookup: publicLookup,
    fetchImpl: async () => response()
  });
  assert.strictEqual(repeated.events.length, 0);
  assert.strictEqual(FakeEvent.rows.length, 1);

  const switched = await armReadingWatchForPage({
    WikiSourceEvent: FakeEvent,
    page: watchedPage,
    feedUrl: 'https://example.com/feed-two.xml',
    label: 'Replacement feed',
    lookup: publicLookup,
    fetchImpl: async () => response()
  });
  assert.strictEqual(switched.events.length, 1);
  assert.strictEqual(FakeEvent.rows.length, 2);
  assert.strictEqual(watchedPage.externalWatches.reading.lastItemId, 'post-2');

  console.log('readingWatcherService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
