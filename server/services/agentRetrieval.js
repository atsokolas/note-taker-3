// What the thought partner reads before it answers: the passages in the
// reader's own library that bear on the question, ranked by how well they
// answer it rather than by how recently they were saved.
//
// Eligibility gate: an article passage, a highlight with its margin note, a
// notebook passage, or a concept description that shares the question's
// content words (or, when embeddings are on, sits close to it in meaning).
// Quality bar: a passage must carry every term of a one- or two-term
// question and half the terms of a longer one, and score within reach of
// the best passage. One passage per source, so a long article cannot crowd the rest out.
// Silence fallback: nothing qualifies, nothing is returned. The caller says
// the library is quiet; it does not pad the answer with the newest saves.
const { buildArticlePassages } = require('../ai/articlePassages');

const CANDIDATES_PER_MODEL = 40;
const SNIPPET_LENGTH = 700;
const RELATIVE_FLOOR = 0.35;
const ABOUT_FLOOR = 0.5;
const SEMANTIC_FLOOR = 0.8;
const RRF_K = 60;
const SEMANTIC_TYPES = ['article', 'highlight', 'notebook_entry'];
const BM25_K1 = 1.2;
const BM25_B = 0.75;

// Common words and the words people use to frame a question about their
// library. Neither says what the question is about.
const STOPWORDS = new Set(`
a about above after again against all also am an and any anything are as at be because been before being below
between both but by can could did do does doing down during each else ever every few for from further get had has
have having he her here hers him his how i if in into is it its itself just know like made make many may me might
more most much must my myself no nor not now of off on once one only or other our out over own really same say
says said she should so some something such than that the their them then there these they thing things this
those through to too under until up us very was we well were what when where which while who whom why will with
would yet you your yours
saved save library source sources note notes noted article articles piece pieces reading read written write wrote
find found show tell anything everything argue argues argument according connect connects connection relate
relates related relation bear bears bearing author authors essay essays mention mentions summarize summary
objection objections strongest weakest
`.split(/\s+/).filter(Boolean));

const words = (text = '') => String(text || '')
  .toLowerCase()
  .replace(/<[^>]*>/g, ' ')
  .replace(/[‘’]/g, "'")
  .split(/[^a-z0-9']+/)
  .map(word => word.replace(/^'+|'+$/g, '').replace(/'s$/, ''))
  .filter(Boolean);

// Truncation stemming: long words compare on their first six letters, short
// ones lose a plural s. Crude, but "decisions" finds "decision" and
// "imagining" finds "imagine" without a dependency.
const stem = word => (word.length > 6 ? word.slice(0, 6) : word.replace(/(?<=\w{3})s$/, ''));

const queryTerms = (query = '') => [...new Set(
  words(query).filter(word => word.length >= 3 && !STOPWORDS.has(word))
)].slice(0, 12);

const clip = (text = '', limit = SNIPPET_LENGTH) => {
  const clean = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return `${cut.slice(0, sentenceEnd > limit * 0.5 ? sentenceEnd + 1 : cut.lastIndexOf(' '))}…`;
};

// Imports can open with a "Name: … URL: …" preamble or reading-time chrome.
// Neither is something the author said.
const stripImportChrome = (content = '') => {
  let text = String(content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^Name:\s*.{0,500}?\bURL:\s*https?:\/\/\S+\s*/i, '')
    .replace(/\(\s*attr\(href\)\s*\)/gi, '');
  if (/\bReading Time:\s*\d+\s*minutes?\b/i.test(text.slice(0, 240))) {
    text = text
      .replace(/^[^.!?]{0,180}\|?\s*Reading Time:\s*\d+\s*minutes?\s*/i, '')
      .replace(/^[^.!?]{1,240}[?!]\s*/, '');
  }
  return text;
};

// Every source becomes the passages a reader could quote from it.
const passagesOf = (title, content) => {
  const chunks = buildArticlePassages({ title, content }, { maxPassages: 24 }).map(passage => passage.excerpt);
  const body = clip(content, Infinity);
  return chunks.length ? chunks : (body ? [body] : []);
};

const articleUnits = article => [
  ...passagesOf(article.title, stripImportChrome(article.content)).map((text, index) => ({ key: `p${index}`, text })),
  ...(Array.isArray(article.highlights) ? article.highlights : [])
    .filter(highlight => highlight?.text || highlight?.note)
    .map(highlight => ({
      key: `h${highlight._id}`,
      text: [highlight.text, highlight.note ? `Your note: ${highlight.note}` : ''].filter(Boolean).join(' ')
    }))
].map(unit => ({ ...unit, type: 'article', id: String(article._id), title: article.title || 'Article', updatedAt: article.updatedAt }));

const noteUnits = note => passagesOf(
  note.title,
  [note.content, ...(Array.isArray(note.blocks) ? note.blocks.map(block => block?.text) : [])].filter(Boolean).join('\n')
).map((text, index) => ({
  key: `p${index}`, text, type: 'notebook', id: String(note._id), title: note.title || 'Note', updatedAt: note.updatedAt
}));

const conceptUnits = concept => [{
  key: 'd', text: concept.description || concept.name, type: 'concept', id: String(concept._id), title: concept.name, updatedAt: concept.updatedAt
}];

// Okapi BM25 over the candidate passages. Titles count twice: a passage from
// a source named for the question is more likely about it.
const scoreUnits = (units, terms, corpusUnits = units.length) => {
  const stems = terms.map(stem);
  const docs = units.map(unit => {
    const bodyStems = words(unit.text).map(stem);
    const titleStems = new Set(words(unit.title).map(stem));
    const counts = new Map();
    bodyStems.forEach(token => counts.set(token, (counts.get(token) || 0) + 1));
    return { unit, counts, titleStems, length: bodyStems.length };
  });
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / (docs.length || 1) || 1;
  const df = new Map(stems.map(term => [term, docs.filter(doc => doc.counts.has(term) || doc.titleStems.has(term)).length]));

  return docs.map(({ unit, counts, titleStems, length }) => {
    let score = 0;
    let matched = 0;
    stems.forEach((term) => {
      const tf = (counts.get(term) || 0) + (titleStems.has(term) ? 2 : 0);
      if (!tf) return;
      matched += 1;
      const idf = Math.log(1 + (Math.max(corpusUnits, docs.length) - df.get(term) + 0.5) / (df.get(term) + 0.5));
      score += idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (length / avgLength))));
    });
    return { ...unit, score, matched };
  });
};

// Mongo's text index finds every source that shares a word with the question,
// whatever its age. Without the index (a fresh database), fall back to a
// pattern match on the same words.
const findCandidates = async (Model, { userId, terms, filter = {}, fields }) => {
  const base = { userId, ...filter };
  try {
    return await Model.find({ ...base, $text: { $search: terms.join(' ') } }, { score: { $meta: 'textScore' } })
      .select(fields)
      .sort({ score: { $meta: 'textScore' } })
      .limit(CANDIDATES_PER_MODEL)
      .lean();
  } catch (_error) {
    const pattern = new RegExp(terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    const textFields = fields.split(' ').filter(field => !['_id', 'updatedAt'].includes(field));
    return Model.find({ ...base, $or: textFields.map(field => ({ [field]: pattern })) })
      .select(fields)
      .limit(CANDIDATES_PER_MODEL)
      .lean();
  }
};

// Semantic hits arrive as vector rows; each names the source and, for
// article passages and highlights, which part of it.
const semanticKey = hit => {
  if (hit.type === 'highlight') return `article:${hit.articleId}:h${hit.objectId}`;
  if (hit.type === 'notebook_entry') return `notebook:${hit.objectId}`;
  const passage = String(hit.subId || '').match(/^passage:v1:(\d+)$/);
  return passage ? `article:${hit.objectId}:p${passage[1]}` : `article:${hit.objectId}`;
};

const retrievePassages = async ({
  userId,
  query = '',
  about = '',
  excludeId = '',
  limit = 6,
  articleFilter = null,
  includeNotes = true,
  models: { Article, NotebookEntry, TagMeta },
  semanticSearch = null
}) => {
  // A question that names nothing ("connect this to anything") is about the
  // source in hand, so that source's own words become the search.
  const asked = queryTerms(query).length ? query : about;
  const terms = queryTerms(asked);
  if (!terms.length) return [];

  const semanticHits = semanticSearch
    ? await semanticSearch({ query: asked, userId, limit: 20, types: SEMANTIC_TYPES }).catch(() => [])
    : [];
  const articleScope = { userId, ...(articleFilter || {}) };
  const articleFields = '_id title content highlights updatedAt';
  const noteFields = '_id title content blocks updatedAt';
  const [articles, notes, concepts, corpusSize] = await Promise.all([
    findCandidates(Article, { userId, terms, filter: articleFilter || {}, fields: articleFields }),
    includeNotes ? findCandidates(NotebookEntry, { userId, terms, fields: noteFields }) : [],
    includeNotes ? findCandidates(TagMeta, { userId, terms, fields: '_id name description updatedAt' }) : [],
    Promise.all([
      Article.countDocuments(articleScope),
      includeNotes ? NotebookEntry.countDocuments({ userId }) : 0,
      includeNotes ? TagMeta.countDocuments({ userId }) : 0
    ]).then(counts => counts.reduce((sum, count) => sum + count, 0))
  ]);

  // Sources only the embeddings found join the pool.
  const missing = (type, pool) => [...new Set(semanticHits
    .filter(hit => (type === 'notebook' ? hit.type === 'notebook_entry' : ['article', 'highlight'].includes(hit.type)))
    .map(hit => String(hit.type === 'highlight' ? hit.articleId : hit.objectId))
    .filter(id => id && !pool.some(doc => String(doc._id) === id)))];
  const [semanticArticles, semanticNotes] = await Promise.all([
    missing('article', articles).length
      ? Article.find({ ...articleScope, _id: { $in: missing('article', articles) } }).select(articleFields).lean()
      : [],
    includeNotes && missing('notebook', notes).length
      ? NotebookEntry.find({ userId, _id: { $in: missing('notebook', notes) } }).select(noteFields).lean()
      : []
  ]);

  // The source in hand is already in the conversation; retrieval looks past it.
  const pooled = [...articles, ...semanticArticles, ...notes, ...semanticNotes, ...concepts];
  const candidates = [
    ...[...articles, ...semanticArticles].flatMap(articleUnits),
    ...[...notes, ...semanticNotes].flatMap(noteUnits),
    ...concepts.flatMap(conceptUnits)
  ].filter(unit => unit.id !== String(excludeId || ''));
  // Sources outside the pool share no word with the question; they still
  // count toward how rare each word is.
  const unitsPerSource = candidates.length / (pooled.length || 1);
  const units = scoreUnits(candidates, terms, candidates.length + Math.max(0, corpusSize - pooled.length) * unitsPerSource);

  // Reciprocal rank fusion: a passage ranked well by either signal rises.
  const semanticRank = new Map();
  semanticHits.filter(hit => hit.score >= SEMANTIC_FLOOR).forEach((hit, rank) => {
    const key = semanticKey(hit);
    if (!semanticRank.has(key)) semanticRank.set(key, rank);
  });
  // Searching by the source in hand, two shared terms make a connection, but
  // a long list of its words needs a stricter floor to stay on topic.
  const byAbout = asked === about;
  const required = byAbout ? Math.min(2, terms.length)
    : terms.length <= 2 ? terms.length : Math.ceil(terms.length / 2);
  const floor = byAbout ? ABOUT_FLOOR : RELATIVE_FLOOR;
  const best = Math.max(0, ...units.map(unit => unit.score));
  const ranked = units
    .map((unit) => {
      const exact = semanticRank.get(`${unit.type}:${unit.id}:${unit.key}`);
      const whole = semanticRank.get(`${unit.type}:${unit.id}`);
      return { ...unit, semantic: exact ?? whole };
    })
    .filter(unit => (unit.matched >= required && unit.score >= best * floor) || unit.semantic !== undefined)
    .sort((left, right) => right.score - left.score)
    .map((unit, rank) => ({
      ...unit,
      fused: 1 / (RRF_K + rank) + (unit.semantic === undefined ? 0 : 1 / (RRF_K + unit.semantic))
    }))
    .sort((left, right) => right.fused - left.fused);

  const seen = new Set();
  return ranked
    .filter((unit) => {
      const source = `${unit.type}:${unit.id}`;
      if (seen.has(source)) return false;
      seen.add(source);
      return true;
    })
    .slice(0, limit)
    .map(unit => ({
      type: unit.type,
      id: unit.id,
      title: unit.title,
      snippet: clip(unit.text),
      fullText: unit.text,
      updatedAt: unit.updatedAt,
      score: Number(unit.fused.toFixed(4))
    }));
};

// The passage of one source that best answers the question, or null when the
// question names something no passage mentions.
const bestPassage = ({ title = '', text = '', query = '' } = {}) => {
  const terms = queryTerms(query);
  const passages = passagesOf(title, stripImportChrome(text));
  // A question that names nothing ("connect this") is about the whole source;
  // its opening passage is where the argument is stated.
  if (!terms.length) return passages[0] || null;
  const [best] = scoreUnits(
    passages.map((passage, index) => ({ key: `p${index}`, text: passage, title: '' })),
    terms
  ).filter(unit => unit.matched > 0).sort((left, right) => right.score - left.score);
  return best ? best.text : null;
};

// One source in full, as the reader saved it: an article with its highlights
// and margin notes, or a notebook page. Only the reader's own.
const readSource = async ({ userId, id, models: { Article, NotebookEntry } }) => {
  if (!/^[a-f0-9]{24}$/i.test(String(id || ''))) return null;
  const article = await Article.findOne({ _id: id, userId }).select('_id title content highlights updatedAt').lean();
  if (article) {
    return {
      type: 'article',
      id: String(article._id),
      title: article.title || 'Article',
      fullText: articleUnits(article).map(unit => unit.text).join('\n\n'),
      updatedAt: article.updatedAt
    };
  }
  const note = await NotebookEntry.findOne({ _id: id, userId }).select('_id title content blocks updatedAt').lean();
  return note ? {
    type: 'notebook',
    id: String(note._id),
    title: note.title || 'Note',
    fullText: noteUnits(note).map(unit => unit.text).join('\n\n'),
    updatedAt: note.updatedAt
  } : null;
};

module.exports = { retrievePassages, bestPassage, readSource, __testables: { queryTerms, stem, scoreUnits, semanticKey, stripImportChrome, articleUnits, noteUnits, conceptUnits } };
