const mongoose = require('mongoose');
const { embedText, embedTexts, isEmbeddingConfigured } = require('./embed');
const { searchVectorItems, similarToVectorItem, rawCosineToAtlasScore } = require('./vectorStore');
const { VectorItem, TagMeta, Article } = require('../models');

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
   same title, is the same work), at a raw cosine of 0.62 or better. On a real
   library every match at 0.62 and above was worth the margin, and keyword
   coincidences began just under it; at 0.72 only second copies got through.
   Quality bar: no highlight shorter than MARGIN_MIN_QUOTE_CHARS, no near
   duplicate of the paragraph itself (the same passage saved from a second
   copy), no highlight twice, no paragraph twice, and at most `limit` in all —
   the strongest matches win.
   Silence: no provider, a failed call or nothing over the floor is an empty
   list, and an empty list renders nothing. */
const MARGIN_MIN_WORDS = 12;
const MARGIN_MIN_QUOTE_CHARS = 40;
const MARGIN_FLOOR = rawCosineToAtlasScore(0.62);
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
  models = {}
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
    Number(row.score) >= MARGIN_FLOOR
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
    if (notes.length >= limit) break;
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
      relation: 'close',
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
  return notes.sort((a, b) => a.paragraph - b.paragraph);
};

/* The passage you marked closest to one mark, found from the mark's own
   stored vector (no embedding call) among your highlights only: a passage of
   a book's or a piece's words, not another note, of MARGIN_MIN_QUOTE_CHARS or
   more, at the floor or better, that fits. Silence: no vector yet, nothing
   close enough or a failed lookup is null. */
const PASSAGE_CANDIDATES = 6;

const closestPassage = async ({ userId, mark, floor = MARGIN_FLOOR, fits = () => true, models = {} }) => {
  const rows = await similarToSource({
    userId, objectType: 'highlight', objectId: String(mark?._id || ''), limit: PASSAGE_CANDIDATES, types: ['highlight'], models
  }).catch(() => []);
  const close = rows.filter(row => Number(row.score) >= floor);
  if (!close.length) return null;
  const held = await highlightsById({ Article: models.Article || Article, userId, ids: close.map(row => String(row.objectId)) });
  const found = close.map(row => held.get(String(row.objectId))).find(passage => (
    passage && plain(passage.text).length >= MARGIN_MIN_QUOTE_CHARS && fits(passage)
  ));
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
   passage you marked after asking it, in any book or piece, at the margin's
   floor (raw cosine 0.62). */
const answerTo = ({ userId, question, models = {} } = {}) => closestPassage({
  userId, mark: question, models, fits: passage => timeOf(passage.createdAt) > timeOf(question.createdAt)
});

/* A passage you marked in a book, echoed: nearly the same thought, marked in
   another book or piece at least ECHO_GAP_DAYS before or after. The bar is
   higher than a margin's (raw cosine 0.72), because an echo claims you
   thought it twice. A mark too short to carry a thought, or with no date to
   measure the years by, has no echo. */
const ECHO_FLOOR = rawCosineToAtlasScore(0.72);
const ECHO_GAP_DAYS = 90;

const echoOf = async ({ userId, mark, models = {} } = {}) => (
  plain(mark?.text).length < MARGIN_MIN_QUOTE_CHARS || !timeOf(mark.createdAt) ? null : closestPassage({
    userId,
    mark,
    models,
    floor: ECHO_FLOOR,
    fits: passage => String(passage.articleId) !== String(mark.bookId)
      && timeOf(passage.createdAt) > 0
      && Math.abs(timeOf(passage.createdAt) - timeOf(mark.createdAt)) >= ECHO_GAP_DAYS * 24 * 60 * 60 * 1000
  })
);

module.exports = {
  semanticSearch,
  marginNotes,
  answerTo,
  beforeYouStart,
  echoOf,
  MARGIN_MIN_WORDS,
  relatedHighlights,
  similarToSource,
  DEFAULT_TYPES
};
