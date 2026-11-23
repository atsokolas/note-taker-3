#!/usr/bin/env node
// Scores what each new source says it added (echoes, answers, where it
// belongs) against the connections eval's known answers: precision is how
// much of what it offered was right, recall how much of what was there it
// found. Embeds with the configured model; with none it lists the sources
// and exits 0, because a library with no embeddings connects nothing.
//
//   npm run connections:eval [-- --verbose]
//
// --verbose prints, under each source, the nearest things held and their
// raw cosine to its marks (+ expected), which is what a floor is tuned on.
require('dotenv').config();
const { id, HELD, QUESTIONS, BOOK_QUESTIONS, PAGES, SOURCES } = require('../server/agentEval/connections');
const { embedTexts, isEmbeddingConfigured } = require('../server/ai/embed');
const { encodeVector, decodeVector, rawCosineToAtlasScore } = require('../server/ai/vectorStore');
const { addedBy } = require('../server/ai/semanticSearch');

const userId = id(99999);
const KINDS = ['echo', 'answers', 'belongs'];
const VERBOSE = process.argv.includes('--verbose');
const NEAREST = 6;

const cosine = (a, b) => {
  const dot = a.reduce((sum, value, at) => sum + value * b[at], 0);
  const norm = v => Math.sqrt(v.reduce((sum, value) => sum + value * value, 0));
  return dot / (norm(a) * norm(b));
};

/* The library as the models addedBy reads, with the vector index done by
   exact cosine on the Atlas scale. */
const libraryOf = (vectors, articles, questions, pages) => {
  const lean = rows => ({ select: () => ({ limit: () => ({ lean: async () => rows }), lean: async () => rows }) });
  const matches = filter => item => Object.entries(filter).every(([key, value]) => (
    key === 'userId' || (key.startsWith('metadata.') ? item.metadata[key.slice(9)] === value : item[key] === value)
  ));
  const owned = ({ _id }) => ({ $in }) => $in.map(String).includes(String(_id));
  return {
    VectorItem: {
      find: filter => lean(vectors.filter(matches(filter))),
      countDocuments: async filter => vectors.filter(matches(filter)).length,
      aggregate: async ([{ $vectorSearch: { queryVector, limit, filter } }]) => {
        const asked = decodeVector(queryVector);
        return vectors
          .filter(item => filter.objectType.$in.includes(item.objectType))
          .map(item => ({ ...item, score: rawCosineToAtlasScore(cosine(asked, decodeVector(item.embedding))) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      }
    },
    Article: {
      findOne: ({ _id }) => lean(articles.find(article => article._id === String(_id))),
      aggregate: async ([{ $match }]) => {
        const wanted = $match['highlights._id'].$in.map(String);
        return articles.flatMap(article => article.highlights
          .filter(mark => wanted.includes(mark._id))
          .map(mark => ({ ...mark, articleId: article._id, articleTitle: article.title })));
      }
    },
    Question: { find: ({ _id }) => lean(questions.filter(question => owned(question)(_id))) },
    WikiPage: { find: ({ _id }) => lean(pages.filter(page => owned(page)(_id))) }
  };
};

const main = async () => {
  if (!isEmbeddingConfigured()) {
    SOURCES.forEach(source => console.log(`${source.id.padEnd(22)} skipped (no embedding model)`));
    console.log(`\n0/${SOURCES.length} run: nothing connects without embeddings.`);
    return;
  }
  const works = [...new Set([...HELD, ...BOOK_QUESTIONS].map(mark => mark.work))];
  const workId = work => id(1000 + works.indexOf(work));
  const marks = [
    ...HELD.map(mark => ({ ...mark, _id: id(mark.n), text: mark.text, note: '' })),
    ...BOOK_QUESTIONS.map(mark => ({ ...mark, _id: id(mark.n), text: '', note: mark.note }))
  ];
  const incoming = SOURCES.map((source, at) => ({ ...source, _id: id(2000 + at), markIds: source.marks.map((_, m) => id(3000 + at * 10 + m)) }));
  const articles = [
    ...works.map(work => ({ _id: workId(work), title: work, highlights: marks.filter(mark => mark.work === work).map(({ _id, text, note }) => ({ _id, text, note, createdAt: '2025-06-01T00:00:00Z' })) })),
    ...incoming.map(source => ({ _id: source._id, title: source.title, highlights: source.marks.map((text, m) => ({ _id: source.markIds[m], text, note: '' })) }))
  ];
  const questions = QUESTIONS.map(question => ({ _id: id(question.n), text: question.text }));
  const pages = PAGES.map(page => ({ _id: id(page.n), title: page.title, claims: page.claims.map((text, c) => ({ claimId: `c${c}`, text, sourceRefIds: ['s1', 's2'] })) }));

  const items = [
    ...marks.map(mark => ({ objectType: 'highlight', objectId: mark._id, metadata: { articleId: workId(mark.work) }, text: [mark.text, mark.note].filter(Boolean).join('\n') })),
    ...incoming.flatMap(source => source.marks.map((text, m) => ({ objectType: 'highlight', objectId: source.markIds[m], metadata: { articleId: source._id }, text }))),
    ...questions.map(question => ({ objectType: 'question', objectId: question._id, metadata: {}, text: question.text })),
    ...pages.flatMap(page => page.claims.map(claim => ({ objectType: 'wiki_claim', objectId: `${page._id}:${claim.claimId}`, metadata: { pageId: page._id, claimId: claim.claimId }, text: `${page.title}\n${claim.text}` })))
  ];
  const embedded = await embedTexts(items.map(item => item.text));
  const vectors = items.map((item, at) => ({ ...item, embedding: encodeVector(embedded[at]) }));
  const models = libraryOf(vectors, articles, questions, pages);
  const names = new Map([...HELD, ...BOOK_QUESTIONS, ...QUESTIONS, ...PAGES].map(item => [id(item.n), (item.title || item.note || item.work || item.text).slice(0, 40)]));
  const nameOf = key => `${key.split(':')[0]} ${names.get(key.split(':')[1])}`;

  const arriving = new Set(incoming.flatMap(source => source.markIds));
  const totals = Object.fromEntries(KINDS.map(kind => [kind, { right: 0, offered: 0, expected: 0 }]));
  for (const source of incoming) {
    const added = await addedBy({ userId, articleId: source._id, models });
    const got = KINDS.flatMap(kind => added.filter(connection => connection.kind === kind).map(connection => `${kind}:${connection.to.id}`));
    const wanted = KINDS.flatMap(kind => (source.expects[kind] || []).map(n => `${kind}:${id(n)}`));
    KINDS.forEach((kind) => {
      const mine = list => list.filter(key => key.startsWith(`${kind}:`));
      totals[kind].offered += mine(got).length;
      totals[kind].expected += mine(wanted).length;
      totals[kind].right += mine(got).filter(key => wanted.includes(key)).length;
    });
    const missed = wanted.filter(key => !got.includes(key));
    const wrong = got.filter(key => !wanted.includes(key));
    console.log(`${source.id.padEnd(22)} ${missed.length || wrong.length ? 'miss' : 'pass'}${missed.length ? `  missed: ${missed.map(nameOf).join('; ')}` : ''}${wrong.length ? `  wrong: ${wrong.map(nameOf).join('; ')}` : ''}`);
    if (VERBOSE) {
      const asked = vectors.filter(item => source.markIds.includes(item.objectId)).map(item => decodeVector(item.embedding));
      const expected = new Set(wanted.map(key => key.split(':')[1]));
      vectors
        .filter(item => !arriving.has(item.objectId))
        .map(item => ({ held: item.objectType === 'wiki_claim' ? item.metadata.pageId : item.objectId, type: item.objectType, raw: Math.max(...asked.map(vector => cosine(vector, decodeVector(item.embedding)))) }))
        .sort((a, b) => b.raw - a.raw)
        .slice(0, NEAREST)
        .forEach(({ held, type, raw }) => console.log(`    ${raw.toFixed(3)} ${expected.has(held) ? '+' : ' '} ${type} ${names.get(held) || held}`));
    }
  }
  console.log('');
  KINDS.forEach((kind) => {
    const { right, offered, expected } = totals[kind];
    const rate = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
    console.log(`${kind.padEnd(8)} precision ${rate(right, offered).padStart(4)}  recall ${rate(right, expected).padStart(4)}  (${right} right of ${offered} offered, ${expected} expected)`);
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
