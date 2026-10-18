const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeVector } = require('../ai/vectorStore');
const { MIN_SOURCES, buildReadingMap, composeReadingMap, __testables } = require('./readingMapService');

const { eligibleSources, termModel, fallbackNames, findGaps, cache } = __testables;

const USER = '64f100000000000000000001';
const id = n => `64f1000000000000000${String(1000 + n).padStart(5, '0')}`;

const SUBJECTS = [
  { tag: 'inflation', words: 'central bank inflation interest rates monetary tightening' },
  { tag: 'proteins', words: 'protein folding amino chains enzyme structure' },
  { tag: 'chess', words: 'chess opening gambit endgame pawn tempo' }
];

const library = (count = 12) => Array.from({ length: count }, (_, n) => {
  const subject = SUBJECTS[n % 3];
  return {
    _id: id(n),
    title: `${subject.tag} essay ${n}`,
    updatedAt: '2026-10-01T00:00:00.000Z',
    highlights: Array.from({ length: 1 + (n % 4) }, (_, h) => ({
      text: `${subject.words} passage ${h}`,
      tags: h === 0 ? [subject.tag] : []
    }))
  };
});

const noModel = { isTextGenerationConfigured: () => false };

test('fewer than enough sources draws no map at all', async () => {
  const sources = eligibleSources(library(MIN_SOURCES - 1));
  const map = await composeReadingMap({ sources, client: noModel });
  assert.equal(map.status, 'quiet');
  assert.equal(map.sourceCount, MIN_SOURCES - 1);
  assert.deepEqual([map.sources, map.clusters, map.gaps], [[], [], []]);
});

test('unmarked sources join only when too few carry marks', () => {
  const marked = library(MIN_SOURCES);
  const bare = [{ _id: id(90), title: 'Saved, never marked', highlights: [] }];
  assert.equal(eligibleSources([...marked, ...bare]).length, MIN_SOURCES);
  assert.equal(eligibleSources([...marked.slice(0, 3), ...bare]).length, 4);
});

test('words basis: subjects cluster and are named from what they share', async () => {
  const sources = eligibleSources(library());
  const map = await composeReadingMap({ sources, client: noModel });
  assert.equal(map.status, 'ready');
  assert.equal(map.basis, 'words');
  assert.equal(map.clusters.length, 3);
  assert.deepEqual(map.clusters.map(c => c.name).sort(), ['Chess', 'Inflation', 'Proteins']);
  map.clusters.forEach(cluster => assert.equal(cluster.namedBy, 'words'));
  const clusterOf = Object.fromEntries(map.sources.map(s => [s.id, s.cluster]));
  sources.forEach((source, n) => sources.forEach((other, m) => {
    assert.equal(clusterOf[source.id] === clusterOf[other.id], n % 3 === m % 3);
  }));
  assert.equal(map.sources[0].line, `${SUBJECTS[0].words} passage 0`);
  assert.deepEqual(map.gaps, []);
  assert.deepEqual(await composeReadingMap({ sources, client: noModel }), map);
});

test('meaning basis is used when the stored vectors cover the library', async () => {
  const sources = eligibleSources(library());
  const axis = n => Array.from({ length: 6 }, (_, j) => (j === n % 3 ? 1 : 0.05 * ((n + j) % 3)));
  const vectorRows = sources.map((source, n) => ({
    objectType: 'article', objectId: source.id, embedding: encodeVector(axis(n))
  }));
  const map = await composeReadingMap({ sources, vectorRows, client: noModel });
  assert.equal(map.basis, 'meaning');
  assert.equal(map.clusters.length, 3);
});

test('a model name is used only when it answers the whole brief', async () => {
  const sources = eligibleSources(library());
  const client = names => ({
    isTextGenerationConfigured: () => true,
    chatComplete: async () => ({ text: JSON.stringify({ names }) }),
    parseStructuredText: text => JSON.parse(text)
  });
  const named = await composeReadingMap({ sources, client: client(['Money', 'Biology', 'Games']) });
  assert.deepEqual(named.clusters.map(c => c.namedBy), ['model', 'model', 'model']);
  const short = await composeReadingMap({ sources, client: client(['Money']) });
  assert.deepEqual(short.clusters.map(c => c.namedBy), ['words', 'words', 'words']);
  const failing = await composeReadingMap({
    sources,
    client: { isTextGenerationConfigured: () => true, chatComplete: async () => { throw new Error('down'); } }
  });
  assert.deepEqual(failing.clusters.map(c => c.namedBy), ['words', 'words', 'words']);
});

test('a cluster with nothing distinctive is named after its most marked source', () => {
  const sources = eligibleSources(library()).map(s => ({ ...s, tags: [], text: 'same words everywhere' }));
  const terms = termModel(sources);
  const [name] = fallbackNames([{ members: [0, 1, 2, 3] }], sources, terms);
  assert.equal(name, `Around ${sources[3].title}`);
});

test('a blind spot needs writing that returns to it and reading that does not', () => {
  const sources = eligibleSources(library());
  const writing = {
    concepts: [{ name: 'Urban planning', description: 'How cities decide.' }],
    notes: [
      { title: 'Zoning', content: 'Urban planning and housing supply.', tags: [] },
      { title: 'Transit', content: 'Notes on urban planning.', tags: ['urban planning'] },
      { title: 'Rates', content: 'Inflation again.', tags: ['inflation'] }
    ],
    questions: [{ text: 'Why does chess feel like urban planning?' }]
  };
  const gaps = findGaps(sources, writing);
  assert.deepEqual(gaps, [{ name: 'urban planning', writing: 4, reading: 0 }]);
  assert.deepEqual(findGaps(sources, { notes: writing.notes.slice(0, 1) }), []);
});

test('the route loader caches until the library changes', async () => {
  cache.clear();
  let articles = library();
  let finds = 0;
  const query = rows => {
    const q = { select: () => q, sort: () => q, limit: () => q, lean: async () => rows };
    return q;
  };
  const models = {
    Article: { find: () => { finds += 1; return query(articles); } },
    VectorItem: { find: () => query([]) },
    NotebookEntry: { find: () => query([]) }
  };
  let calls = 0;
  const client = { isTextGenerationConfigured: () => { calls += 1; return false; } };
  const first = await buildReadingMap({ userId: USER, models, client });
  const second = await buildReadingMap({ userId: USER, models, client });
  assert.equal(first, second);
  assert.equal(calls, 1);
  articles = [...articles, { ...articles[0], _id: id(50), title: 'One more' }];
  const third = await buildReadingMap({ userId: USER, models, client });
  assert.equal(calls, 2);
  assert.equal(third.sourceCount, 13);
  assert.equal(finds, 3);
});
