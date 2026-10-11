const test = require('node:test');
const assert = require('assert');
const { takeSourcesIntoLibrary } = require('./takeSourcesIntoLibrary');

const fakeArticles = (records = []) => {
  const find = ({ userId, url }) => records.filter(record => record.userId === userId && url.$in.some(pattern => pattern.test(record.url)));
  return {
    records,
    find: query => ({ select: () => ({ lean: async () => find(query) }) }),
    findOneAndUpdate: async ({ userId, url }, { $setOnInsert }) => {
      let found = records.find(record => record.userId === userId && record.url === url);
      if (!found) {
        found = { _id: `article-${records.length + 1}`, ...$setOnInsert };
        records.push(found);
      }
      return found;
    },
    updateOne: async ({ userId, url }, { $set }) => {
      const found = records.find(record => record.userId === userId && record.url === url && !record.content);
      if (found) Object.assign(found, $set);
    }
  };
};

test('sources a reader already holds are used as they stand and counted', async () => {
  const Article = fakeArticles([
    /* Saved with www. and a trailing slash: the same place by the Library's reckoning. */
    { _id: 'mine', userId: 'u1', url: 'https://www.example.com/moats/', title: 'My own title', content: '<p>Mine.</p>' }
  ]);
  const pages = [
    { sourceRefs: [
      { type: 'external', title: 'Moats', url: 'https://example.com/moats' },
      { type: 'external', title: 'Mr. Market', url: 'https://example.com/market' }
    ] },
    { sourceRefs: [{ type: 'external', title: 'Mr. Market again', url: 'https://example.com/market' }] }
  ];
  const fetched = [];
  const receipt = await takeSourcesIntoLibrary({
    Article,
    userId: 'u1',
    pages,
    label: 'Value Investing',
    fetchBody: async (url) => { fetched.push(url); return '<p>Read.</p>'; }
  });

  assert.deepStrictEqual(receipt, { sources: 2, alreadyHad: 1 });
  assert.strictEqual(Article.records.length, 2);
  assert.strictEqual(Article.records[0].title, 'My own title');
  assert.strictEqual(Article.records[0].content, '<p>Mine.</p>');
  const market = Article.records[1];
  assert.strictEqual(market.title, 'Mr. Market');
  assert.strictEqual(market.importMeta.sourceLabel, 'Value Investing');
  assert.deepStrictEqual(pages[0].sourceRefs.map(source => [source.type, source.objectId]), [['article', 'mine'], ['article', market._id]]);
  assert.deepStrictEqual(pages[1].sourceRefs.map(source => [source.type, source.objectId]), [['article', market._id]]);

  await new Promise(resolve => setImmediate(resolve));
  assert.deepStrictEqual(fetched, ['https://example.com/market']);
  assert.strictEqual(market.content, '<p>Read.</p>');
});

test('only public web links become articles; the rest stay as they were', async () => {
  const Article = fakeArticles();
  const pages = [{ sourceRefs: [
    { type: 'external', title: 'A file', url: 'file:///etc/passwd' },
    { type: 'external', title: 'No link', url: '' }
  ] }];
  const receipt = await takeSourcesIntoLibrary({ Article, userId: 'u1', pages });
  assert.deepStrictEqual(receipt, { sources: 0, alreadyHad: 0 });
  assert.strictEqual(Article.records.length, 0);
  assert.deepStrictEqual(pages[0].sourceRefs.map(source => source.type), ['external', 'external']);
});

test('without a Library to write to, nothing is taken and pages are untouched', async () => {
  const pages = [{ sourceRefs: [{ type: 'external', url: 'https://example.com/a' }] }];
  assert.strictEqual(await takeSourcesIntoLibrary({ Article: null, userId: 'u1', pages }), null);
  assert.strictEqual(pages[0].sourceRefs[0].type, 'external');
});
