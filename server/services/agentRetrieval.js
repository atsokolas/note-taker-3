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
const { NOTE_LABEL } = require('./agentGrounding');

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
believe believes belief beliefs currently challenge challenges
keep keeps next look looks
`.split(/\s+/).filter(Boolean));

const words = (text = '') => String(text || '')
  .toLowerCase()
  .replace(/<[^>]*>/g, ' ')
  .replace(/[‘’]/g, "'")
  .split(/[^a-z0-9']+/)
  .map(word => word.replace(/^'+|'+$/g, '').replace(/'s$/, ''))
  .filter(Boolean);

// Truncation stemming: a word loses a plural s, an -ed or -ing ending and the
// silent e of a long root, then compares on its first six letters. Crude, but
// "decisions" finds "decision", "imagining" finds "imagine" and "trusted" finds
// "trust" without a dependency, while "plane" never becomes "plan".
const stem = (word) => {
  const root = word.replace(/(?<=\w{3})s$/, '').replace(/(?<=\w{4})(?:ed|ing)$/, '').replace(/(?<=\w{5})e$/, '');
  return root.length > 6 ? root.slice(0, 6) : root;
};

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

// Every source becomes the passages a reader could quote from it, to the end
// of a long source (about 180,000 characters), not only its opening.
const MAX_PASSAGES = 200;
const passagesOf = (title, content) => {
  const chunks = buildArticlePassages({ title, content }, { maxPassages: MAX_PASSAGES }).map(passage => passage.excerpt);
  const body = clip(content, Infinity);
  return chunks.length ? chunks : (body ? [body] : []);
};

// Who wrote it, when an agent did and the reader has not inked it.
const penOf = record => record?.pencil?.agent || undefined;
const inPencil = record => (penOf(record) ? { pencil: penOf(record), pencilAt: record.pencil.at } : {});

/* Pencil nobody took up fades from recall: after a month it ranks half as
   high, after three it no longer comes up at all. It stays on its shelf for
   the reader; it just stops speaking for them. */
const DAY_MS = 24 * 60 * 60 * 1000;
const FADING = [[90, 0], [30, 0.5]];
const weightOf = ({ pencil, pencilAt }, now = Date.now()) => {
  if (!pencil || !pencilAt) return 1;
  const days = (now - new Date(pencilAt).getTime()) / DAY_MS;
  return (FADING.find(([after]) => days > after) || [0, 1])[1];
};

const articleUnits = article => [
  ...passagesOf(article.title, stripImportChrome(article.content)).map((text, index) => ({ key: `p${index}`, text, ...inPencil(article) })),
  ...(Array.isArray(article.highlights) ? article.highlights : [])
    .filter(highlight => highlight?.text || highlight?.note)
    .map(highlight => ({
      key: `h${highlight._id}`,
      // A note keeps its line breaks but no blank line: a blank line ends the
      // passage. An agent's note is labelled as its own, never the reader's.
      text: [highlight.text, highlight.note ? `${penOf(highlight) ? `${penOf(highlight)}'s note:` : NOTE_LABEL} ${String(highlight.note).replace(/\s*\n\s*\n\s*/g, '\n')}` : ''].filter(Boolean).join(' '),
      ...inPencil(highlight)
    }))
].map(unit => ({ ...unit, type: 'article', id: String(article._id), title: article.title || 'Article', updatedAt: article.updatedAt }));

const noteUnits = note => passagesOf(
  note.title,
  [note.content, ...(Array.isArray(note.blocks) ? note.blocks.map(block => block?.text) : [])].filter(Boolean).join('\n')
).map((text, index) => ({
  key: `p${index}`, text, type: 'notebook', id: String(note._id), title: note.title || 'Note', updatedAt: note.updatedAt, ...inPencil(note)
}));

// A wiki page the reader keeps, passage by passage. Outside agents ask about
// the wiki as often as the library, so recall can search it whole.
const pageUnits = page => passagesOf(page.title, page.plainText).map((text, index) => ({
  key: `p${index}`, text, type: 'wiki_page', id: String(page._id), title: page.title || 'Wiki page', updatedAt: page.updatedAt
}));

// A question the reader is still asking, with what would settle it.
const QUESTION_FIELDS = '_id text settledBy updatedAt';
const OPEN_QUESTION = { status: 'open', archived: { $ne: true } };
const questionUnits = question => [{
  key: 'q', text: [question.text, question.settledBy && `Settled by: ${question.settledBy}`].filter(Boolean).join('\n'), type: 'question', id: String(question._id), title: question.text, updatedAt: question.updatedAt
}];

const conceptUnits = concept => [{
  key: 'd', text: concept.description || concept.name, type: 'concept', id: String(concept._id), title: concept.name, updatedAt: concept.updatedAt
}];

// A view the reader holds, with the reasons they gave and what would change
// their mind. It is searched like any passage so that new reading meets it.
const VIEW_FIELDS = '_id title updatedAt judgment.currentJudgment judgment.status judgment.why judgment.against judgment.falsifiers';
const viewUnits = (page) => {
  const judgment = page.judgment || {};
  const lines = (label, list = []) => list.map(item => item?.text).filter(Boolean).map(text => `${label}: ${text}`);
  return [{
    key: 'v',
    held: judgment.currentJudgment,
    text: [
      `You hold: ${judgment.currentJudgment}`,
      ...lines('Why', judgment.why),
      ...lines('Against', judgment.against),
      ...lines('What would change your mind', (judgment.falsifiers || []).filter(item => item.status !== 'retired'))
    ].join('\n'),
    type: 'wiki_page',
    id: String(page._id),
    title: page.title,
    updatedAt: page.updatedAt
  }];
};

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

// Whether a passage shares a word with the reader's own question: what the
// model searched for may have wandered off it.
const touches = (query, { title = '', fullText = '', snippet = '' } = {}) => {
  const terms = queryTerms(query);
  return terms.length > 0 && scoreUnits([{ title, text: fullText || snippet }], terms)[0].matched > 0;
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

const PASSAGE_LIMIT = 6;
const retrievePassages = async ({
  userId,
  query = '',
  about = '',
  excludeId = '',
  limit = PASSAGE_LIMIT,
  articleFilter = null,
  includeNotes = true,
  includeViews = includeNotes,
  includePages = false,
  // The model's own searches are short and it judges what comes back, so
  // half the words of a query are enough to bring a passage back to it.
  forModel = false,
  models: { Article, NotebookEntry, TagMeta, WikiPage = null, Question = null },
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
  const articleFields = '_id title content highlights pencil updatedAt';
  const noteFields = '_id title content blocks pencil updatedAt';
  const [articles, notes, concepts, questions, views, pages, corpusSize] = await Promise.all([
    findCandidates(Article, { userId, terms, filter: articleFilter || {}, fields: articleFields }),
    includeNotes ? findCandidates(NotebookEntry, { userId, terms, fields: noteFields }) : [],
    includeNotes ? findCandidates(TagMeta, { userId, terms, fields: '_id name description updatedAt' }) : [],
    includeNotes && Question ? findCandidates(Question, { userId, terms, filter: OPEN_QUESTION, fields: QUESTION_FIELDS }) : [],
    // A reader holds dozens of views, not thousands: every one is a candidate.
    includeViews && WikiPage
      ? WikiPage.find({ userId, 'judgment.currentJudgment': { $nin: ['', null] }, 'judgment.status': { $nin: ['closed', 'archived'] }, status: { $ne: 'archived' } })
        .select(VIEW_FIELDS).limit(200).lean()
      : [],
    includePages && WikiPage
      ? findCandidates(WikiPage, { userId, terms, filter: { status: { $ne: 'archived' } }, fields: '_id title plainText updatedAt' })
      : [],
    Promise.all([
      Article.countDocuments(articleScope),
      includeNotes ? NotebookEntry.countDocuments({ userId }) : 0,
      includeNotes ? TagMeta.countDocuments({ userId }) : 0,
      includeNotes && Question ? Question.countDocuments({ userId, ...OPEN_QUESTION }) : 0,
      includePages && WikiPage ? WikiPage.countDocuments({ userId, status: { $ne: 'archived' } }) : 0
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
  const pooled = [...articles, ...semanticArticles, ...notes, ...semanticNotes, ...concepts, ...questions, ...views, ...pages];
  const candidates = [
    ...[...articles, ...semanticArticles].flatMap(articleUnits),
    ...[...notes, ...semanticNotes].flatMap(noteUnits),
    ...concepts.flatMap(conceptUnits),
    ...questions.flatMap(questionUnits),
    ...views.flatMap(viewUnits),
    ...pages.flatMap(pageUnits)
  ].filter(unit => unit.id !== String(excludeId || ''));
  // Sources outside the pool share no word with the question; they still
  // count toward how rare each word is.
  const unitsPerSource = candidates.length / (pooled.length || 1);
  const units = scoreUnits(candidates, terms, candidates.length + Math.max(0, corpusSize + views.length - pooled.length) * unitsPerSource);

  // Reciprocal rank fusion: a passage ranked well by either signal rises.
  const semanticRank = new Map();
  semanticHits.filter(hit => hit.score >= SEMANTIC_FLOOR).forEach((hit, rank) => {
    const key = semanticKey(hit);
    if (!semanticRank.has(key)) semanticRank.set(key, rank);
  });
  // Searching by the source in hand, two shared terms make a connection, but
  // a long list of its words needs a stricter floor to stay on topic.
  const byAbout = asked === about;
  const strictly = byAbout ? Math.min(2, terms.length)
    : terms.length <= 2 ? terms.length : Math.ceil(terms.length / 2);
  const required = forModel && !byAbout ? Math.ceil(terms.length / 2) : strictly;
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
      fused: (1 / (RRF_K + rank) + (unit.semantic === undefined ? 0 : 1 / (RRF_K + unit.semantic))) * weightOf(unit)
    }))
    .filter(unit => unit.fused > 0)
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
      // The passage you marked, when the best answer in a source is one.
      ...(unit.type === 'article' && unit.key.startsWith('h') ? { highlightId: unit.key.slice(1) } : {}),
      ...(unit.held ? { held: unit.held } : {}),
      ...(unit.pencil ? { pencil: unit.pencil } : {}),
      // Whether it clears the bar a reader is served by without the model.
      ...(forModel ? { servable: unit.matched >= strictly || unit.semantic !== undefined } : {}),
      updatedAt: unit.updatedAt,
      score: Number(unit.fused.toFixed(4))
    }));
};

/* "What have I written about hiring, and what in my reading bears on it?"
   is two questions. The reader's own words answer the first; the second is
   answered by searching the reading with those words, so a note about the
   candidate with the best story finds the article on base rates though it
   never says "hiring". The first few of their own hits each pull in the one
   passage that bears on them most. */
const BEARING_FROM = 3;
const sourceOf = hit => `${hit.type}:${hit.id}`;
const retrieveWithBearing = async (scope) => {
  const hits = await retrievePassages(scope);
  const own = hits.filter(hit => (hit.type === 'notebook' || hit.held) && !hit.pencil).slice(0, BEARING_FROM);
  const bearing = (await Promise.all(own.map(hit => retrievePassages({
    ...scope, query: '', about: hit.fullText, excludeId: hit.id, includeNotes: false, includeViews: false, includePages: false, limit: 1
  }).then(found => found.map(passage => ({ ...passage, bearsOn: hit.id })))))).flat();
  const seen = new Set(hits.map(sourceOf));
  const fresh = bearing.filter(hit => !seen.has(sourceOf(hit)) && seen.add(sourceOf(hit)));
  // Each reading sits under the note it bears on, inside the same budget, so
  // what gives way is the weakest of the rest.
  return hits.flatMap(hit => [hit, ...fresh.filter(found => found.bearsOn === hit.id)]).slice(0, scope.limit || PASSAGE_LIMIT);
};

// The passages of one source that best answer a query, strongest first, each
// with its score. A query that names nothing ("connect this") is about the
// whole source; its opening passage is where the argument is stated.
// A caller holding its own passages (a note's sentences) passes them in.
const sourcePassages = (title = '', text = '') => passagesOf(title, stripImportChrome(text));
const topPassages = ({ title = '', text = '', passages = sourcePassages(title, text), query = '', limit = 3 } = {}) => {
  const terms = queryTerms(query);
  if (!terms.length) return passages.slice(0, 1).map(passage => ({ text: passage, score: 0 }));
  return scoreUnits(
    passages.map((passage, index) => ({ key: `p${index}`, text: passage, title: '' })),
    terms
  ).filter(unit => unit.matched > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(unit => ({ text: unit.text, score: unit.score }));
};

const bestPassage = (input = {}) => topPassages({ ...input, limit: 1 })[0]?.text || null;

// One source in full, as the reader saved it: an article with its highlights
// and margin notes, or a notebook page. Only the reader's own.
const readSource = async ({ userId, id, models: { Article, NotebookEntry, WikiPage = null, TagMeta = null, Question = null } }) => {
  if (!/^[a-f0-9]{24}$/i.test(String(id || ''))) return null;
  const article = await Article.findOne({ _id: id, userId }).select('_id title content highlights pencil updatedAt').lean();
  if (article) {
    return {
      type: 'article',
      id: String(article._id),
      title: article.title || 'Article',
      // A mark an agent made on an article the reader saved says so.
      fullText: articleUnits(article)
        .map(unit => unit.pencil && unit.pencil !== penOf(article) ? `(In pencil, by ${unit.pencil}) ${unit.text}` : unit.text)
        .join('\n\n'),
      pencil: penOf(article),
      updatedAt: article.updatedAt
    };
  }
  const note = await NotebookEntry.findOne({ _id: id, userId }).select('_id title content blocks pencil updatedAt').lean();
  if (note) {
    return {
      type: 'notebook',
      id: String(note._id),
      title: note.title || 'Note',
      fullText: noteUnits(note).map(unit => unit.text).join('\n\n'),
      pencil: penOf(note),
      updatedAt: note.updatedAt
    };
  }
  const concept = TagMeta && await TagMeta.findOne({ _id: id, userId }).select('_id name description updatedAt').lean();
  if (concept) {
    return { type: 'concept', id: String(concept._id), title: concept.name, fullText: conceptUnits(concept)[0].text, updatedAt: concept.updatedAt };
  }
  const question = Question && await Question.findOne({ _id: id, userId }).select(QUESTION_FIELDS).lean();
  if (question) {
    return { type: 'question', id: String(question._id), title: question.text, fullText: questionUnits(question)[0].text, updatedAt: question.updatedAt };
  }
  // A view the reader holds is found by search; reading it opens the page it
  // lives on.
  const page = WikiPage && await WikiPage.findOne({ _id: id, userId, status: { $ne: 'archived' } }).select(`${VIEW_FIELDS} plainText`).lean();
  return page ? {
    type: 'wiki_page',
    id: String(page._id),
    title: page.title || 'Wiki page',
    fullText: [page.judgment?.currentJudgment && viewUnits(page)[0].text, page.plainText].filter(Boolean).join('\n\n'),
    updatedAt: page.updatedAt
  } : null;
};

/* What the reader holds and has just saved, carried into the Partner in every
   room. Two small indexed reads and no model call: a handful of held view
   sentences, most recently touched first, and the last few sources saved. */
const STANDING_VIEWS = 5;
const STANDING_SOURCES = 3;
const readStandingContext = async ({ userId, models: { Article, WikiPage = null } }) => {
  const [views, sources] = await Promise.all([
    WikiPage
      ? WikiPage.find({
        userId,
        'judgment.currentJudgment': { $nin: ['', null] },
        'judgment.status': { $nin: ['parked', 'closed', 'archived'] },
        status: { $ne: 'archived' }
      }).sort({ updatedAt: -1 }).limit(STANDING_VIEWS).select('judgment.currentJudgment updatedAt').lean()
      : [],
    Article.find({ userId, hiddenFromHome: { $ne: true }, debugOnly: { $ne: true }, archived: { $ne: true } })
      .sort({ createdAt: -1 }).limit(STANDING_SOURCES).select('title author siteName createdAt').lean()
  ]);
  return {
    views: views.map(page => clip(page.judgment?.currentJudgment, 220)).filter(Boolean),
    sources: sources
      .map(article => [clip(article.title, 140), clip(article.author || article.siteName, 60)].filter(Boolean).join(', '))
      .filter(Boolean)
  };
};

module.exports = { retrievePassages, retrieveWithBearing, touches, bestPassage, topPassages, sourcePassages, readSource, readStandingContext, __testables: { weightOf, queryTerms, stem, scoreUnits, semanticKey, stripImportChrome, articleUnits, noteUnits, conceptUnits, questionUnits, viewUnits, pageUnits } };
