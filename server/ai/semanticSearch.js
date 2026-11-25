const crypto = require('crypto');
const mongoose = require('mongoose');
const { embedText, embedTexts, isEmbeddingConfigured } = require('./embed');
const { isEmbeddableWikiClaim } = require('./embeddingJobs');
const { searchVectorItems, similarToVectorItem, rawCosineToAtlasScore, decodeVector } = require('./vectorStore');
const { VectorItem, TagMeta, Article, Question, WikiPage, ConnectionJudgment } = require('../models');
const { judged, holds } = require('../services/judged');
const { relations } = require('../services/disagreements');

/**
 * Semantic search over the Atlas vector index.
 *
 * Previously this fanned out across four Qdrant collections and merged the
 * results by score. One collection with an `objectType` filter does the same
 * job in a single query, and — unlike the fan-out — respects `limit` honestly
 * rather than taking the top five of each type regardless of relevance.
 */

const DEFAULT_TYPES = ['highlight', 'article', 'notebook_entry', 'question'];

const toResult = (row = {}) => ({
  type: row.objectType,
  objectId: row.objectId,
  subId: row.subId || '',
  title: row.metadata?.title || '',
  snippet: row.metadata?.articleTitle || row.metadata?.title || '',
  articleId: row.metadata?.articleId || '',
  score: row.score
});

const semanticSearch = async ({ query, limit = 12, userId, types = DEFAULT_TYPES, models = {} } = {}) => {
  if (!userId) return [];
  const vector = await embedText(query);
  const rows = await searchVectorItems({
    VectorItem: models.VectorItem || VectorItem,
    userId,
    vector,
    limit,
    objectTypes: types
  });
  return rows.map(toResult);
};

const relatedHighlights = async ({ text, excludeId, limit = 5, userId, models = {} } = {}) => {
  if (!userId) return [];
  const vector = await embedText(text);
  const rows = await searchVectorItems({
    VectorItem: models.VectorItem || VectorItem,
    userId,
    vector,
    limit: limit + 1,
    objectTypes: ['highlight']
  });
  return rows
    .filter(row => String(row.objectId) !== String(excludeId))
    .slice(0, limit)
    .map(row => ({
      objectId: row.objectId,
      title: row.metadata?.title || '',
      articleTitle: row.metadata?.articleTitle || '',
      articleId: row.metadata?.articleId || '',
      score: row.score
    }));
};

/* "More like this" for one source. A stored item reuses its vector, so the
   lookup costs no embedding call; a note is stored whole, as its
   notebook_entry, whichever block asked. A concept has no vector of its own,
   so its name and description are the question. */
const similarToSource = async ({ userId, objectType, objectId, subId = '', limit = 10, types = [], models = {} } = {}) => {
  const vectors = models.VectorItem || VectorItem;
  if (objectType === 'concept') {
    const concept = mongoose.Types.ObjectId.isValid(objectId)
      ? await (models.TagMeta || TagMeta).findOne({ _id: objectId, userId }).select('name description').lean()
      : null;
    const text = [concept?.name, concept?.description].map(part => String(part || '').trim()).filter(Boolean).join('. ');
    if (!text) return [];
    return searchVectorItems({ VectorItem: vectors, userId, vector: await embedText(text), limit, objectTypes: types });
  }
  const note = objectType === 'notebook_block';
  return similarToVectorItem({
    VectorItem: vectors,
    userId,
    objectType: note ? 'notebook_entry' : objectType,
    objectId,
    subId: note ? '' : subId,
    limit,
    objectTypes: types
  });
};

/* Your library in the margins: for each paragraph worth asking about, the
   closest thing you marked somewhere else.

   Eligibility: a paragraph of MARGIN_MIN_WORDS words or more, other than a
   short line of dialogue, matched against your own highlights only, from a
   work other than the one being read (another saved copy of it, under the
   same title, is the same work), at CLOSE_FLOOR or better.
   Quality bar: no highlight shorter than MARGIN_MIN_QUOTE_CHARS, no near
   duplicate of the paragraph itself (the same passage saved from a second
   copy), no highlight twice, no paragraph twice; the strongest twice `limit`
   are read by the model, and at most `limit` it says bear on their paragraph
   or argue with it are kept.
   Silence: no provider, a failed call or nothing the model kept is an empty
   list, and an empty list renders nothing. */
const MARGIN_MIN_WORDS = 12;
const MARGIN_MIN_QUOTE_CHARS = 40;
/* Close enough for the model to read: the one floor for what is judged. On
   the connections eval the right answers scored 0.31 to 0.57 raw and a
   source on nothing held stayed under 0.15, so the vectors only rank, and
   the model (services/judged.js) decides. */
const CLOSE_FLOOR = rawCosineToAtlasScore(0.30);
const MARGIN_SAME_PASSAGE = rawCosineToAtlasScore(0.97);
const MARGIN_MAX_PARAGRAPHS = 60;
const MARGIN_CANDIDATES = 6;
const MARGIN_DIALOGUE_WORDS = 30;

const plain = value => String(value || '').replace(/\s+/g, ' ').trim();
const wordCount = value => (plain(value).match(/\S+/g) || []).length;
const sameWords = value => plain(value).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '');
// A quoted line someone says matches on its topic, never on its thought.
const isDialogue = value => /^["“]/.test(value) && wordCount(value) < MARGIN_DIALOGUE_WORDS;
// "Going Founder Mode On Cancer (Full Article)" is "Going Founder Mode On Cancer".
const workOf = title => sameWords(String(title || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ''));
// A line with no id of its own is named by its words.
const digestOf = text => crypto.createHash('sha1').update(plain(text)).digest('hex').slice(0, 16);
const judgingModels = models => ({ ConnectionJudgment: models.ConnectionJudgment || ConnectionJudgment });

const highlightsById = async ({ Article: articles, userId, ids }) => {
  const owner = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(String(userId)) : null;
  const wanted = ids.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
  if (!owner || !wanted.length) return new Map();
  const rows = await articles.aggregate([
    { $match: { userId: owner, 'highlights._id': { $in: wanted } } },
    { $unwind: '$highlights' },
    { $match: { 'highlights._id': { $in: wanted } } },
    { $project: {
      _id: '$highlights._id',
      text: '$highlights.text',
      note: '$highlights.note',
      tags: '$highlights.tags',
      createdAt: '$highlights.createdAt',
      articleId: '$_id',
      articleTitle: '$title'
    } }
  ]);
  return new Map(rows.map(row => [String(row._id), row]));
};

const marginNotes = async ({
  userId,
  paragraphs = [],
  articleId = '',
  excludeHighlightIds = [],
  limit = 5,
  models = {},
  judge = relations
} = {}) => {
  if (!userId || !isEmbeddingConfigured()) return [];
  const asked = (Array.isArray(paragraphs) ? paragraphs : [])
    .slice(0, MARGIN_MAX_PARAGRAPHS)
    .map((text, index) => ({ index, text: plain(text) }))
    .filter(item => wordCount(item.text) >= MARGIN_MIN_WORDS && !isDialogue(item.text));
  if (!asked.length) return [];

  const source = String(articleId || '');
  const excluded = new Set((excludeHighlightIds || []).map(String));
  const vectors = await embedTexts(asked.map(item => item.text));
  const found = await Promise.all(asked.map((item, at) => searchVectorItems({
    VectorItem: models.VectorItem || VectorItem,
    userId,
    vector: vectors[at],
    limit: MARGIN_CANDIDATES,
    objectTypes: ['highlight']
  }).then(rows => rows.map(row => ({ ...row, paragraph: item.index, paragraphText: item.text })))));
  const candidates = found.flat().filter(row => (
    Number(row.score) >= CLOSE_FLOOR
    && Number(row.score) < MARGIN_SAME_PASSAGE
    && !excluded.has(String(row.objectId))
    && (!source || String(row.metadata?.articleId || '') !== source)
  ));
  if (!candidates.length) return [];

  // The index can lag a deletion or an edit; the words quoted are the words held now.
  const articles = models.Article || Article;
  const [held, reading] = await Promise.all([
    highlightsById({ Article: articles, userId, ids: [...new Set(candidates.map(row => String(row.objectId)))] }),
    mongoose.Types.ObjectId.isValid(source) ? articles.findOne({ _id: source, userId }).select('title').lean() : null
  ]);
  const work = workOf(reading?.title);
  const sameWork = highlight => String(highlight.articleId) === source || Boolean(work && workOf(highlight.articleTitle) === work);
  const usedParagraphs = new Set();
  const usedQuotes = new Set();
  const notes = [];
  candidates.sort((a, b) => Number(b.score) - Number(a.score));
  for (const row of candidates) {
    if (notes.length >= limit * 2) break;
    const highlight = held.get(String(row.objectId));
    const text = plain(highlight?.text);
    const quote = sameWords(text);
    if (!highlight || text.length < MARGIN_MIN_QUOTE_CHARS) continue;
    if (sameWork(highlight)) continue;
    if (usedParagraphs.has(row.paragraph) || usedQuotes.has(quote)) continue;
    const paragraph = sameWords(row.paragraphText);
    if (paragraph.includes(quote) || quote.includes(paragraph)) continue;
    usedParagraphs.add(row.paragraph);
    usedQuotes.add(quote);
    notes.push({
      paragraph: row.paragraph,
      about: `${source}#${digestOf(row.paragraphText)}>highlight:${highlight._id}`,
      says: row.paragraphText,
      highlight: {
        _id: String(highlight._id),
        text,
        tags: highlight.tags || [],
        createdAt: highlight.createdAt || null,
        articleId: String(highlight.articleId),
        articleTitle: highlight.articleTitle || ''
      }
    });
  }
  const read = await judged({
    userId,
    models: judgingModels(models),
    judge,
    pairs: notes.map(note => ({ about: note.about, a: { who: reading?.title || 'what is being read', says: note.says }, b: { who: note.highlight.articleTitle || 'a passage the reader marked', says: note.highlight.text } }))
  });
  return notes
    .filter(note => holds(read.get(note.about)))
    .slice(0, limit)
    .map(({ about, says, ...note }) => ({ ...note, relation: read.get(about).relation }))
    .sort((a, b) => a.paragraph - b.paragraph);
};

/* The passage you marked closest to one mark, found from the mark's own
   stored vector (no embedding call), or to a line just typed (one embedding),
   among your highlights only: a passage of a book's or a piece's words, not
   another note, of MARGIN_MIN_QUOTE_CHARS or more, at the floor or better,
   that fits, and that the model says bears on it or argues with it (the
   strongest such). Silence: no vector yet, no provider, nothing close enough,
   nothing the model kept or a failed lookup is null. */
const PASSAGE_CANDIDATES = 6;

const candidatesFor = async ({ userId, mark, text, models }) => {
  if (!text) {
    return similarToSource({ userId, objectType: 'highlight', objectId: String(mark?._id || ''), limit: PASSAGE_CANDIDATES, types: ['highlight'], models });
  }
  if (!isEmbeddingConfigured()) return [];
  return searchVectorItems({
    VectorItem: models.VectorItem || VectorItem, userId, vector: await embedText(plain(text)), limit: PASSAGE_CANDIDATES, objectTypes: ['highlight']
  });
};

const closestPassage = async ({ userId, mark = null, text = '', who, floor = CLOSE_FLOOR, fits = passage => Boolean(passage), models = {}, judge = relations }) => {
  const rows = await candidatesFor({ userId, mark, text, models }).catch(() => []);
  const close = rows.filter(row => Number(row.score) >= floor);
  if (!close.length) return null;
  const held = await highlightsById({ Article: models.Article || Article, userId, ids: close.map(row => String(row.objectId)) });
  const fitting = close.map(row => held.get(String(row.objectId))).filter(passage => (
    passage && plain(passage.text).length >= MARGIN_MIN_QUOTE_CHARS && fits(passage)
  ));
  const from = mark?._id ? `highlight:${mark._id}` : `line#${digestOf(text)}`;
  const aboutOf = passage => `${from}>highlight:${passage._id}`;
  const read = await judged({
    userId,
    models: judgingModels(models),
    judge,
    pairs: fitting.map(passage => ({ about: aboutOf(passage), a: { who, says: plain(text || mark?.text || mark?.note) }, b: { who: passage.articleTitle || 'a passage the reader marked', says: plain(passage.text) } }))
  });
  const found = fitting.find(passage => holds(read.get(aboutOf(passage))));
  return found ? passageOf(found) : null;
};

const passageOf = found => ({
  _id: String(found._id),
  text: plain(found.text),
  createdAt: found.createdAt || null,
  articleId: String(found.articleId),
  articleTitle: found.articleTitle || ''
});

/* Before you start a book: the passages you already marked elsewhere that
   touch it, found by its title and author, from your highlights only, in
   another work, at BEFORE_FLOOR or better, at most BEFORE_PASSAGES. A title
   is a thinner question than a paragraph, so its floor sits lower than the
   margin's (raw cosine 0.55, untuned). Silence: no provider, a failed call
   or nothing close enough is an empty list. */
const BEFORE_FLOOR = rawCosineToAtlasScore(0.55);
const BEFORE_PASSAGES = 3;

const beforeYouStart = async ({ userId, book, models = {} } = {}) => {
  const query = [book?.title, book?.author].map(plain).filter(Boolean).join(', by ');
  if (!userId || !plain(book?.title) || !isEmbeddingConfigured()) return [];
  const rows = await searchVectorItems({
    VectorItem: models.VectorItem || VectorItem,
    userId,
    vector: await embedText(query),
    limit: BEFORE_PASSAGES * 3,
    objectTypes: ['highlight']
  });
  const close = rows.filter(row => Number(row.score) >= BEFORE_FLOOR);
  if (!close.length) return [];
  const held = await highlightsById({ Article: models.Article || Article, userId, ids: close.map(row => String(row.objectId)) });
  const work = workOf(book.title);
  return close
    .map(row => held.get(String(row.objectId)))
    .filter(passage => (
      passage
      && plain(passage.text).length >= MARGIN_MIN_QUOTE_CHARS
      && String(passage.articleId) !== String(book._id)
      && workOf(passage.articleTitle) !== work
    ))
    .filter((passage, at, all) => all.findIndex(other => sameWords(other.text) === sameWords(passage.text)) === at)
    .slice(0, BEFORE_PASSAGES)
    .map(passageOf);
};

const timeOf = value => new Date(value).getTime() || 0;

/* A question you typed beside a book, come back answered: the closest
   passage you marked after asking it, in any book or piece, that the model
   says answers it. */
const answerTo = ({ userId, question, models = {}, judge = relations }) => closestPassage({
  userId, mark: question, who: 'a question the reader asked', models, judge, fits: passage => timeOf(passage.createdAt) > timeOf(question.createdAt)
});

/* A passage you marked in a book, echoed: nearly the same thought, marked in
   another book or piece at least ECHO_GAP_DAYS before or after. Nearly the
   same is a bar of its own (raw cosine 0.72), not a guess at quality,
   because an echo claims you thought it twice; the model still reads the
   pair. A mark too short to carry a thought, or with no date to
   measure the years by, has no echo. */
const ECHO_FLOOR = rawCosineToAtlasScore(0.72);
const ECHO_GAP_DAYS = 90;

const echoOf = async ({ userId, mark, models = {}, judge = relations }) => (
  plain(mark?.text).length < MARGIN_MIN_QUOTE_CHARS || !timeOf(mark.createdAt) ? null : closestPassage({
    userId,
    mark,
    who: 'a passage the reader marked',
    models,
    judge,
    floor: ECHO_FLOOR,
    fits: passage => String(passage.articleId) !== String(mark.bookId)
      && timeOf(passage.createdAt) > 0
      && Math.abs(timeOf(passage.createdAt) - timeOf(mark.createdAt)) >= ECHO_GAP_DAYS * 24 * 60 * 60 * 1000
  })
);

/* Heard before, for a line just typed at a book's desk: the closest passage
   from another work that the model says it bears on, for "/who". With `echo`,
   only what you marked a year or more ago and nearly the same (the echo's
   floor), so an old mark of yours can turn up in faded ink beside the new
   one. */
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const heardBefore = ({ userId, text, bookId, echo = false, now = Date.now(), models = {}, judge = relations }) => (
  plain(text).length < MARGIN_MIN_QUOTE_CHARS ? null : closestPassage({
    userId,
    text,
    who: 'a line the reader just typed',
    models,
    judge,
    floor: echo ? ECHO_FLOOR : CLOSE_FLOOR,
    fits: passage => String(passage.articleId) !== String(bookId)
      && (!echo || (timeOf(passage.createdAt) > 0 && now - timeOf(passage.createdAt) >= YEAR_MS))
  })
);

/* What a source may have added to what you already hold: for each passage
   of it you marked (or, with none marked, its own text), the closest of your
   own. A passage you marked in another work is an echo; a question of yours,
   open in Think or typed beside a book, is one it answers; a wiki page
   holding a sentence close to it is where it belongs. At CLOSE_FLOOR, since
   the model reads each pair before it is offered (services/whatItAdded.js).
   The strongest ADDED_ASKED of each kind. Found
   from vectors already stored, so it costs no embedding call. Silence:
   nothing indexed or nothing close is an empty list. */
const ADDED_FROM = 12;
const ADDED_ASKED = 6;
const ADDED_TYPES = ['highlight', 'question', 'wiki_claim'];
// One quote inside the other, word for word.
const sameQuote = (a, b) => {
  const [x, y] = [sameWords(a), sameWords(b)];
  return Boolean(x && y) && (x.includes(y) || y.includes(x));
};
const isQuestionLine = mark => !mark.text && /\?\s*$/.test(mark.note || '');
const targetOf = row => (row.objectType === 'wiki_claim' ? `wiki_page:${row.metadata?.pageId}` : `${row.objectType}:${row.objectId}`);

/** @param {{ userId: any, articleId: any, models?: Record<string, any> }} asked */
const addedBy = async ({ userId, articleId, models = {} }) => {
  const vectors = models.VectorItem || VectorItem;
  const articles = models.Article || Article;
  const id = String(articleId || '');
  if (!userId || !mongoose.Types.ObjectId.isValid(id)) return [];
  const source = await articles.findOne({ _id: id, userId }).select('title').lean();
  if (!source) return [];
  const vectorsOf = filter => vectors.find({ userId, ...filter }).select('embedding').limit(ADDED_FROM).lean();
  const marked = await vectorsOf({ objectType: 'highlight', 'metadata.articleId': id });
  const own = marked.length ? marked : await vectorsOf({ objectType: 'article', objectId: id });
  // The source's own marks are each other's nearest, so they are asked past before the six count.
  const limit = MARGIN_CANDIDATES + await vectors.countDocuments({ userId, objectType: 'highlight', 'metadata.articleId': id });
  const rows = (await Promise.all(own.map(item => searchVectorItems({
    VectorItem: vectors, userId, vector: decodeVector(item.embedding), limit, objectTypes: ADDED_TYPES
  })))).flat().filter(row => (
    Number(row.score) >= CLOSE_FLOOR
    && Number(row.score) < MARGIN_SAME_PASSAGE
    && String(row.metadata?.articleId || '') !== id
  ));
  const ids = type => [...new Set(rows.filter(row => row.objectType === type).map(row => String(row.objectId)))];
  const pageIds = [...new Set(rows.filter(row => row.objectType === 'wiki_claim').map(row => String(row.metadata?.pageId)))];
  const [marks, questions, pages] = await Promise.all([
    highlightsById({ Article: articles, userId, ids: ids('highlight') }),
    (models.Question || Question).find({ _id: { $in: ids('question').filter(mongoose.Types.ObjectId.isValid) }, userId, status: 'open', archived: { $ne: true } }).select('text').lean(),
    (models.WikiPage || WikiPage).find({ _id: { $in: pageIds.filter(mongoose.Types.ObjectId.isValid) }, userId, status: { $ne: 'archived' } }).select('title claims').lean()
  ]);
  const work = workOf(source.title);
  const questionsById = new Map(questions.map(question => [String(question._id), question]));
  const pagesById = new Map(pages.map(page => [String(page._id), page]));
  const connectionOf = row => {
    if (row.objectType === 'question') {
      const question = questionsById.get(String(row.objectId));
      return question && { kind: 'answers', to: { type: 'question', id: String(question._id), title: question.text } };
    }
    if (row.objectType === 'wiki_claim') {
      const page = pagesById.get(String(row.metadata?.pageId));
      const claim = page?.claims?.find(item => String(item.claimId) === String(row.metadata?.claimId));
      // A claim retired since it was indexed keeps its vector, but no longer says where anything belongs.
      return isEmbeddableWikiClaim(claim) && { kind: 'belongs', to: { type: 'wiki_page', id: String(page._id), title: page.title, quote: plain(claim.text) } };
    }
    const mark = marks.get(String(row.objectId));
    if (!mark || (work && workOf(mark.articleTitle) === work)) return null;
    const to = { type: 'highlight', id: String(mark._id), articleId: String(mark.articleId), title: mark.articleTitle || '', at: mark.createdAt || null };
    if (isQuestionLine(mark)) return { kind: 'answers', to: { ...to, quote: plain(mark.note) } };
    return plain(mark.text).length >= MARGIN_MIN_QUOTE_CHARS && { kind: 'echo', to: { ...to, quote: plain(mark.text) } };
  };
  // Strongest first; each thing it reaches once, by its best match, and the same words
  // (a line quoted in two places) once; ADDED_ASKED of each kind.
  const found = rows
    .sort((a, b) => Number(b.score) - Number(a.score))
    .map(row => ({ ...connectionOf(row), key: targetOf(row), score: Number(row.score) }))
    .filter(connection => connection.kind)
    .reduce((kept, connection) => (kept.some(other => other.key === connection.key || sameQuote(other.to.quote, connection.to.quote)) ? kept : [...kept, connection]), []);
  return found.filter((connection, at) => found.slice(0, at).filter(other => other.kind === connection.kind).length < ADDED_ASKED);
};

module.exports = {
  semanticSearch,
  heardBefore,
  marginNotes,
  addedBy,
  answerTo,
  beforeYouStart,
  echoOf,
  MARGIN_MIN_WORDS,
  relatedHighlights,
  similarToSource,
  DEFAULT_TYPES
};
