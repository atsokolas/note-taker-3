const assert = require('assert');
const { serializePublicWikiPage, serializeWikiPage } = require('../wikiRoutes');

/* Shared wiki, private evidence.
   A snippet is the passage you pulled out of something you read: your
   extraction, from someone else's work. A public page names its sources and
   links to them, so a reader can go and check — it does not republish the
   passages. */

const PASSAGE = 'The essence of strategy is choosing what not to do, and that refusal is the part that cannot be benchmarked. '.repeat(12);

const page = {
  _id: '6a5d1c842da7aa36147472ff',
  userId: 'owner-1',
  slug: 'positioning',
  title: 'Positioning beats operations',
  pageType: 'topic',
  status: 'published',
  visibility: 'shared',
  plainText: 'Improvement that anyone can copy is not a position, and a company that only runs the same race faster wins nothing durable over time.',
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Improvement that anyone can copy is not a position.' }] }]
  },
  sourceRefs: [{
    _id: 'source-1',
    objectId: 'article-42',
    type: 'article',
    title: 'What Is Strategy?',
    url: 'https://example.com/what-is-strategy',
    snippet: PASSAGE,
    quote: PASSAGE,
    excerpt: PASSAGE
  }],
  claims: [{ claimId: 'c1', text: 'Positioning beats operations.', support: 'supported', sourceRefIds: ['source-1'] }],
  judgment: { currentJudgment: 'Positioning beats operations.', why: [{ reasonId: 'r1', text: 'Private reasoning.' }] },
  discussions: [{ question: 'private question', answer: 'private answer' }]
};

const run = () => {
  const owner = serializeWikiPage(page);
  assert.ok(owner.sourceRefs[0].snippet.length > 500, 'the owner still sees their own passage');

  const shared = serializePublicWikiPage(page);
  assert.ok(shared, 'the page is shareable');

  // The source is named and reachable, so the claim can still be checked.
  assert.strictEqual(shared.sourceRefs.length, 1);
  assert.strictEqual(shared.sourceRefs[0].title, 'What Is Strategy?');
  assert.strictEqual(shared.sourceRefs[0].url, 'https://example.com/what-is-strategy');

  // The passage does not travel.
  assert.strictEqual(shared.sourceRefs[0].snippet, '', 'a verbatim passage was published');
  const wire = JSON.stringify(shared);
  assert.ok(!wire.includes('cannot be benchmarked'), 'the passage reached the wire by another field');

  // Neither does anything that points back into the owner's library.
  assert.ok(!wire.includes('article-42'), 'a library object id was published');
  assert.ok(!wire.includes('owner-1'), 'the owner id was published');
  assert.ok(!wire.includes('Private reasoning'), 'the judgment was published');
  assert.ok(!wire.includes('private question'), 'a discussion was published');
  assert.strictEqual(shared.judgment, undefined);
  assert.strictEqual(shared.claims, undefined);

  const dossier = serializePublicWikiPage({
    ...page,
    investmentDossier: {
      version: 1,
      company: { ticker: 'COST', name: 'Costco Wholesale Corporation' },
      startingJudgment: 'Private owner thesis.'
    }
  });
  assert.strictEqual(dossier.wikiKind, 'investment');
  assert.strictEqual(dossier.artifactType, 'investment_dossier');
  assert.strictEqual(dossier.investmentDossier, undefined);
  assert.strictEqual(dossier.judgment, undefined);
  assert.ok(!JSON.stringify(dossier).includes('Private owner thesis'));

  console.log('ok - shared wiki keeps the evidence private');
};

run();
