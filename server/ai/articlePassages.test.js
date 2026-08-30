const assert = require('assert');
const { contentHashOf } = require('./vectorStore');
const {
  ARTICLE_PASSAGE_PREFIX,
  buildArticlePassages,
  buildArticleSummary,
  buildArticleVectorUnits,
  exactArticlePassage,
  isArticlePassageSubId,
  normalizeSourceText
} = require('./articlePassages');

const article = {
  _id: 'article-1',
  title: 'A saved source',
  content: `<p>${Array.from(
    { length: 36 },
    (_, index) => `Sentence ${index + 1} explains a distinct part of the source with enough detail to remain useful.`
  ).join(' ')}</p>`,
  createdAt: '2026-08-30T12:00:00.000Z',
  updatedAt: '2026-08-30T13:00:00.000Z'
};

const options = { passageLength: 420, passageOverlap: 60, maxPassages: 3 };
const summary = buildArticleSummary(article);
const passages = buildArticlePassages(article, options);

assert.strictEqual(summary.subId, '');
assert.ok(summary.text.startsWith('A saved source\n<p>'), 'the summary retains the durable 4,000-character contract');
assert.strictEqual(passages.length, 3, 'one source cannot monopolize the embedding queue');
passages.forEach((passage, index) => {
  assert.strictEqual(passage.subId, `${ARTICLE_PASSAGE_PREFIX}${index}`);
  assert.ok(passage.excerpt.length >= 240 && passage.excerpt.length <= 420);
  assert.ok(passage.text.startsWith('A saved source\n'));
  assert.strictEqual(passage.metadata.kind, 'article_passage');
  assert.strictEqual(passage.metadata.passageIndex, index);
  assert.ok(!Object.prototype.hasOwnProperty.call(passage.metadata, 'excerpt'), 'source text is not duplicated in vector metadata');
  assert.strictEqual(
    exactArticlePassage(article, {
      subId: passage.subId,
      contentHash: contentHashOf(passage.text),
      metadata: passage.metadata
    }, options),
    passage.excerpt,
    'a current vector resolves back to the exact saved passage'
  );
});

assert.ok(passages[0].excerpt.split(' ').some(word => passages[1].excerpt.includes(word)), 'adjacent passages overlap');
assert.strictEqual(
  exactArticlePassage(article, {
    subId: passages[0].subId,
    contentHash: 'stale',
    metadata: passages[0].metadata
  }, options),
  '',
  'a stale vector cannot quote the source'
);
assert.strictEqual(exactArticlePassage(article, { subId: '', contentHash: contentHashOf(summary.text) }, options), '');
assert.strictEqual(
  exactArticlePassage(article, {
    subId: passages[0].subId,
    contentHash: contentHashOf(passages[0].text)
  }, options),
  '',
  'a passage without its source-body hash fails closed'
);
assert.strictEqual(
  exactArticlePassage({ ...article, content: `${article.content} A later edit.` }, {
    subId: passages[0].subId,
    contentHash: contentHashOf(passages[0].text),
    metadata: passages[0].metadata
  }, options),
  '',
  'an article edit invalidates old passage rows until re-indexing finishes'
);
assert.strictEqual(isArticlePassageSubId(passages[0].subId), true);
assert.strictEqual(isArticlePassageSubId(''), false);
assert.strictEqual(buildArticlePassages({ content: 'Too short.' }).length, 0);
assert.strictEqual(buildArticleVectorUnits(article, options).length, 4);
assert.strictEqual(
  normalizeSourceText('<p>A -10% cost-benefit result.</p>'),
  'A -10% cost-benefit result.',
  'exact evidence preserves meaningful punctuation while removing HTML layout'
);

console.log('articlePassages tests passed');
