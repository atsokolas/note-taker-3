const assert = require('assert');
const {
  serializePublicWikiPage,
  wikiCollectionSearchClause,
  WIKI_COLLECTION_SEARCH_FIELDS,
  WIKI_PAGE_SUMMARY_FIELDS
} = require('../wikiRoutes');

assert.deepStrictEqual(
  [...WIKI_COLLECTION_SEARCH_FIELDS],
  ['title', 'plainText'],
  'collection search may only read the current title and accepted body'
);

const clause = wikiCollectionSearchClause('UNIQUE_CANDIDATE_PHRASE');
assert.ok(clause.$or.every(entry => Object.keys(entry).every(field => (
  WIKI_COLLECTION_SEARCH_FIELDS.includes(field)
))), 'search must not match candidate, quality-review, or private-note fields');
assert.strictEqual(wikiCollectionSearchClause(''), null);

const summary = new Set(WIKI_PAGE_SUMMARY_FIELDS);
assert.ok(!summary.has('aiState.firstHeadCandidateSummary'));
assert.ok(!summary.has('aiState.lastCandidateSummary'));
assert.ok(!summary.has('qualityReview'));
assert.ok(![...summary].some(field => field.startsWith('private')));

const publicPage = serializePublicWikiPage({
  _id: '6a5d1c842da7aa36147472ff',
  slug: 'strategy',
  title: 'Strategy is a set of choices',
  pageType: 'topic',
  status: 'published',
  visibility: 'shared',
  plainText: 'A strategy is only real when it closes off alternatives.',
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A strategy is only real when it closes off alternatives.' }] }]
  },
  sourceRefs: [{ title: 'What Is Strategy?', url: 'https://example.com/strategy', snippet: '' }],
  aiState: {
    candidateStatus: 'awaiting_maintenance_acceptance',
    firstHeadCandidateSummary: { wordCount: 12 },
    lastCandidateSummary: 'UNIQUE_CANDIDATE_PHRASE about an experiment.'
  },
  qualityReview: { reasons: [{ message: 'PRIVATE_REVIEW_REASON' }] },
  privateReason: 'UNIQUE_PRIVATE_REASON',
  thought: 'A private thought',
  lastViewedAt: '2026-09-16T00:00:00.000Z'
});

const wire = JSON.stringify(publicPage);
assert.ok(!wire.includes('UNIQUE_CANDIDATE_PHRASE'), 'candidate copy reached the public page');
assert.ok(!wire.includes('PRIVATE_REVIEW_REASON'), 'review reasons reached the public page');
assert.ok(!wire.includes('UNIQUE_PRIVATE_REASON'), 'a private acceptance reason reached the public page');
assert.ok(!wire.includes('A private thought'), 'a private thought reached the public page');
assert.ok(!wire.includes('2026-09-16T00:00:00.000Z'), 'a viewing acknowledgment reached the public page');
assert.strictEqual(publicPage.aiState, undefined);
assert.strictEqual(publicPage.privateReason, undefined);
assert.strictEqual(publicPage.qualityReview, undefined);
assert.ok(!wire.includes('"Accepted"'), 'public pages must not invent an Accepted label');

console.log('ok - wiki collection search and public serializers stay on the current page');
