const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildWeekendReadingsDraft,
  canonicalizeReadingUrl,
  createWeekendReadingsDraft,
  normalizeWeekendReadingItems
} = require('./weekendReadingsService');

const baseItems = () => ([
  {
    title: 'Primary filing',
    url: 'https://EXAMPLE.com/report/?utm_source=email&b=2&a=1#section',
    whyItMatters: 'It tests the demand premise with primary evidence.',
    readingRole: 'thesis_evidence',
    sourceQuality: 'primary',
    sourceDateLabel: '2026-07-18',
    publicRelationship: 'The durability of service and integration economics.',
    affectedQuestion: 'Does utilization support durable service economics?',
    affectedClaimIds: ['claim-1']
  },
  {
    title: 'Critical countercase',
    url: 'https://example.org/countercase?gclid=tracking',
    whyItMatters: 'It argues that qualification advantages decay after standards mature.',
    readingRole: 'counterevidence',
    sourceQuality: 'high_quality_secondary',
    sourceDateLabel: '2026-07-17',
    publicRelationship: 'Whether qualification cycles create durable switching costs.'
  }
]);

test('canonicalizeReadingUrl strips tracking, fragments, and normalizes ordering', () => {
  assert.equal(
    canonicalizeReadingUrl('https://EXAMPLE.com/report/?utm_source=email&b=2&a=1#section'),
    'https://example.com/report?a=1&b=2'
  );
  assert.throws(() => canonicalizeReadingUrl('javascript:alert(1)'), /must use https/);
  assert.throws(() => canonicalizeReadingUrl('http://example.com/report'), /must use https/);
  assert.equal(canonicalizeReadingUrl('http://example.com/report', { allowHttp: true }), 'http://example.com/report');
  assert.throws(() => canonicalizeReadingUrl('https://reader:secret@example.com/report'), /embedded credentials/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?api_key=public-secret'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?token=public-secret'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?x-amz-signature=public-secret'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?client_secret=public-secret'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?refresh-token=public-secret'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?token%20=public-secret'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?token[]=public-secret'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?accessToken=SECRET'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?clientSecret=SECRET'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?auth[token]=SECRET'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?token.value=SECRET'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?session_id=SECRET'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://example.com/report?oauth_code=SECRET'), /sensitive query parameter/);
  assert.throws(() => canonicalizeReadingUrl('https://drive.google.com/file/d/1?resourcekey=SECRET'), /sensitive query parameter/);
  assert.equal(canonicalizeReadingUrl('https://example.com/report?sort_key=published_at'), 'https://example.com/report?sort_key=published_at');
  assert.equal(canonicalizeReadingUrl('https://example.com/report?token_count=42'), 'https://example.com/report?token_count=42');
});

test('normalizeWeekendReadingItems validates editorial fields and rejects canonical duplicates visibly', () => {
  const items = normalizeWeekendReadingItems(baseItems());
  assert.equal(items.length, 2);
  assert.equal(items[0].canonicalUrl, 'https://example.com/report?a=1&b=2');
  assert.throws(() => normalizeWeekendReadingItems([
    ...baseItems(),
    {
      ...baseItems()[0],
      title: 'Duplicate tracking variant',
      url: 'https://example.com/report?b=2&a=1&utm_campaign=again'
    }
  ]), /Duplicate Weekend Readings URL/);
  assert.throws(
    () => normalizeWeekendReadingItems([{ title: 'Incomplete', url: 'https://example.com', readingRole: 'context' }]),
    /needs whyItMatters/
  );
  assert.throws(
    () => normalizeWeekendReadingItems([{ title: 'Bad role', url: 'https://example.com', whyItMatters: 'x', readingRole: 'promotion' }]),
    /invalid readingRole/
  );
});

test('buildWeekendReadingsDraft creates a private canonical log with durable item metadata', () => {
  const result = buildWeekendReadingsDraft({
    ownerId: 'user-1',
    editionNumber: 1,
    windowStart: '2026-07-06',
    windowEnd: '2026-07-19',
    editorialNote: 'The strongest pressure this period concerns qualification durability.',
    activeThesisPageId: 'thesis-001',
    items: baseItems()
  });
  assert.equal(result.editionKey, 'weekend-readings:user-1:2026-07-06:2026-07-19');
  assert.equal(result.page.status, 'draft');
  assert.equal(result.page.visibility, 'private');
  assert.equal(result.page.pageType, 'log');
  assert.equal(result.page.sourceRefs.length, 2);
  assert.equal(result.page.sourceRefs[0].metadata.weekendReadings.readingRole, 'thesis_evidence');
  assert.equal(result.page.sourceRefs[0].metadata.weekendReadings.thesisConnectionDisposition, 'unreviewed');
  assert.match(JSON.stringify(result.body), /Athan Tsokolas — researched and maintained with Noeis/);
  assert.match(JSON.stringify(result.body), /Counterevidence/);
  assert.match(JSON.stringify(result.body), /May affect: The durability of service and integration economics/);
  assert.doesNotMatch(JSON.stringify(result.body), /Does utilization support durable service economics/);
  assert.match(JSON.stringify(result.body), /Editorial note/);
  assert.ok(!result.body.content.some(node => node.type === 'heading' && node.attrs?.level === 1));
  const firstItemHeading = result.body.content.find(node => node.type === 'heading' && node.attrs?.level === 3);
  assert.equal(firstItemHeading.content[0].marks[0].type, 'link');
  assert.equal(firstItemHeading.content[0].marks[0].attrs.href, 'https://example.com/report?a=1&b=2');
  assert.doesNotMatch(JSON.stringify(result.page), /visibility":"shared/);
});

test('blank public relationship and source date render honest explicit defaults', () => {
  const result = buildWeekendReadingsDraft({
    windowStart: '2026-07-06',
    windowEnd: '2026-07-19',
    editorialNote: 'This edition tests explicit empty-state copy.',
    items: [{
      title: 'Unassigned source',
      url: 'https://example.com/unassigned',
      whyItMatters: 'It may matter, but no public-safe thesis relationship is approved yet.',
      readingRole: 'intellectual_broadening',
      sourceQuality: 'unknown',
      publicRelationship: '   ',
      sourceDateLabel: '   '
    }]
  });
  assert.match(JSON.stringify(result.body), /May affect: Unassigned/);
  assert.match(JSON.stringify(result.body), /example.com · Not recorded/);
});

test('blank editorial note is rejected', () => {
  assert.throws(() => buildWeekendReadingsDraft({
    windowStart: '2026-07-06',
    windowEnd: '2026-07-19',
    editorialNote: '   ',
    items: baseItems()
  }), /requires an editorialNote/);
});

test('context items require an explicit evidence boundary', () => {
  assert.throws(() => buildWeekendReadingsDraft({
    windowStart: '2026-07-06',
    windowEnd: '2026-07-19',
    editorialNote: 'Context still needs a clear evidentiary boundary.',
    items: [{
      title: 'Industry overview',
      url: 'https://example.com/overview',
      whyItMatters: 'It supplies useful market framing.',
      readingRole: 'context',
      sourceQuality: 'secondary'
    }]
  }), /needs a boundary statement/);
});

test('createWeekendReadingsDraft persists one page, one revision, and one idempotent draft receipt', async () => {
  const createdPages = [];
  const receipts = [];
  const WikiPage = {
    findOne: () => ({ lean: async () => null }),
    create: async input => {
      const page = { _id: 'page-1', ...input };
      createdPages.push(page);
      return page;
    }
  };
  const createWikiRevision = async input => ({ _id: 'revision-1', ...input });
  const persistNoeisReceipt = async input => {
    receipts.push(input);
    return input.receipt;
  };
  const result = await createWeekendReadingsDraft({
    WikiPage,
    WikiRevision: {},
    NoeisReceipt: {},
    userId: 'user-1',
    buildUniqueSlug: async () => 'weekend-readings-2026-07-19',
    createWikiRevision,
    persistNoeisReceipt,
    windowStart: '2026-07-06',
    windowEnd: '2026-07-19',
    editorialNote: 'Qualification durability is the central pressure in this edition.',
    activeThesisPageId: 'thesis-001',
    items: baseItems()
  });
  assert.equal(result.created, true);
  assert.equal(createdPages.length, 1);
  assert.equal(result.page.visibility, 'private');
  assert.equal(result.revision._id, 'revision-1');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].receipt.id, 'weekend-readings:user-1:2026-07-06:2026-07-19:draft');
  assert.equal(receipts[0].receipt.status, 'draft');
  assert.deepEqual(receipts[0].receipt.provenance.canonicalUrls, [
    'https://example.com/report?a=1&b=2',
    'https://example.org/countercase'
  ]);
  assert.equal(receipts[0].receipt.nextAction.type, 'review_required');
});

test('createWeekendReadingsDraft returns the existing edition instead of duplicating it', async () => {
  let createCalls = 0;
  const existing = { _id: 'existing-page', title: 'Existing edition', visibility: 'private' };
  const WikiPage = {
    findOne: () => ({ lean: async () => existing }),
    create: async () => { createCalls += 1; }
  };
  const result = await createWeekendReadingsDraft({
    WikiPage,
    userId: 'user-1',
    windowStart: '2026-07-06',
    windowEnd: '2026-07-19',
    editorialNote: 'Qualification durability is the central pressure in this edition.',
    items: baseItems()
  });
  assert.equal(result.created, false);
  assert.equal(result.page._id, 'existing-page');
  assert.equal(createCalls, 0);
});
