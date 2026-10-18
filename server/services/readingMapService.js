const crypto = require('crypto');
const mongoose = require('mongoose');
const { decodeVector } = require('../ai/vectorStore');
const { queryTokens } = require('../utils/searchSnippet');
const textClient = require('../ai/hfTextClient');
const { normalize, mean, pca, clusterBySilhouette, layout, emptiestPoint } = require('../lib/readingMapGeometry');

/**
 * A reading map: every source as one dot, set near the sources that mean the
 * same thing, gathered into named subjects, with the subjects the reader
 * writes about but barely reads named where the reading is not.
 *
 * Gate      a non-suppressed article with at least one marked passage; when
 *           fewer than MIN_SOURCES carry marks, every saved article.
 * Basis     the stored embeddings (the article's own vector and its passages')
 *           when nearly every source has one; otherwise the words the reader
 *           marked. One basis per map — two spaces never share a page.
 * Silence   fewer than MIN_SOURCES placeable sources draws no map at all.
 * Gaps      only with evidence: a subject written about in at least
 *           GAP_MIN_WRITING places that at most one source on the map holds.
 *           With no such subject, no gap is drawn.
 */

const MIN_SOURCES = 8;
const MAX_SOURCES = 400;
const PCA_DIMENSIONS = 16;
const GAP_MIN_WRITING = 3;
const GAP_MAX_READING = 1;
const MAX_GAPS = 3;
const MAX_VOCABULARY = 600;
const LINE_LENGTH = 180;

const cache = new Map();
const CACHE_LIMIT = 200;

const ACTIVE = { hiddenFromHome: { $ne: true }, debugOnly: { $ne: true }, archived: { $ne: true } };

const plain = (value = '') => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (value = '', limit = LINE_LENGTH) => {
  const text = plain(value);
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
};
const lower = (value = '') => plain(value).toLowerCase();
/* queryTokens drops the articles and pronouns; these are the filler words
   that would otherwise rise to the top of a subject's name. */
const FILLER = new Set('about after also been before being could each even more most much only other over same some such than very will would should just like upon because between through while still'.split(' '));
const words = (value = '') => queryTokens(plain(value)).filter(word => !FILLER.has(word) && !/^\d+$/.test(word));

/* ── what goes on the map ─────────────────────────────────────────────── */

const marksOf = article => (article.highlights || []).filter(h => plain(h?.text));

const eligibleSources = (articles = []) => {
  const marked = articles.filter(article => marksOf(article).length);
  const chosen = marked.length >= MIN_SOURCES ? marked : articles;
  return chosen.slice(0, MAX_SOURCES).map(article => {
    const marks = marksOf(article);
    return {
      id: String(article._id),
      title: plain(article.title) || 'Untitled',
      marks: marks.length,
      line: clip(marks[0]?.text || ''),
      tags: [...new Set(marks.flatMap(h => h.tags || []).map(tag => lower(tag)).filter(Boolean))],
      text: [article.title, ...marks.map(h => `${h.text} ${h.note || ''}`)].join(' '),
      updatedAt: article.updatedAt ? new Date(article.updatedAt).toISOString() : ''
    };
  });
};

/* ── the two bases ────────────────────────────────────────────────────── */

const meaningVectors = (sources, vectorRows = []) => {
  const byArticle = new Map();
  vectorRows.forEach((row) => {
    const id = row.objectType === 'article' ? String(row.objectId) : String(row.metadata?.articleId || '');
    const vector = decodeVector(row.embedding);
    if (!id || !vector.length) return;
    if (!byArticle.has(id)) byArticle.set(id, []);
    byArticle.get(id).push(normalize(vector));
  });
  const width = Math.max(0, ...[...byArticle.values()].flat().map(v => v.length));
  return sources.map(source => {
    const rows = (byArticle.get(source.id) || []).filter(v => v.length === width);
    return rows.length ? normalize(mean(rows)) : null;
  });
};

/* Term frequency × inverse document frequency over what the reader marked.
   Tags count twice: a word the reader chose is a stronger signal than one
   the author did. Terms in a single source or in most of them carry no
   information about where a source belongs, so they leave the vocabulary. */
const termModel = (sources) => {
  const bags = sources.map(source => {
    const bag = new Map();
    const add = (term, weight) => bag.set(term, (bag.get(term) || 0) + weight);
    words(source.text).forEach(word => add(word, 1));
    source.tags.forEach(tag => add(`#${tag}`, 2));
    return bag;
  });
  const df = new Map();
  bags.forEach(bag => bag.forEach((_, term) => df.set(term, (df.get(term) || 0) + 1)));
  const ceiling = Math.max(2, Math.floor(sources.length * 0.6));
  const vocabulary = [...df.entries()]
    .filter(([, count]) => count >= 2 && count <= ceiling)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_VOCABULARY)
    .map(([term]) => term);
  const idf = vocabulary.map(term => Math.log(sources.length / df.get(term)));
  const vectors = bags.map(bag => normalize(vocabulary.map((term, j) => Math.log1p(bag.get(term) || 0) * idf[j])));
  return { vocabulary, vectors };
};

/* ── names ────────────────────────────────────────────────────────────── */

const titleCase = value => value.replace(/(^|\s)(\S)/g, (_, space, letter) => space + letter.toUpperCase()).replace(/ And /g, ' and ');

/* A cluster's name from what it shares and the rest of the library does
   not: a tag most of its sources carry, else its two most distinctive
   words. Every name is distinct; a cluster with nothing distinctive is named
   after its most marked source rather than given a word it does not hold. */
const fallbackNames = (clusters, sources, terms) => {
  const taken = new Set();
  return clusters.map(cluster => {
    const inside = cluster.members;
    const outside = sources.map((_, i) => i).filter(i => !inside.includes(i));
    const avg = (rows, j) => rows.reduce((sum, i) => sum + terms.vectors[i][j], 0) / (rows.length || 1);
    const held = (j) => inside.filter(i => terms.vectors[i][j] > 0).length;
    const ranked = terms.vocabulary
      .map((term, j) => ({ term, score: avg(inside, j) - avg(outside, j), held: held(j) }))
      .filter(row => row.score > 0 && row.held >= Math.max(2, Math.ceil(inside.length * 0.3)))
      .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
    const tag = ranked.find(row => row.term.startsWith('#') && row.held >= inside.length / 2 && !taken.has(row.term.slice(1)));
    const plainWords = ranked.filter(row => !row.term.startsWith('#') && row.term.length >= 4).map(row => row.term);
    const candidates = [
      tag && tag.term.slice(1),
      plainWords.length >= 2 && `${plainWords[0]} and ${plainWords[1]}`,
      plainWords[0]
    ].filter(Boolean).map(titleCase);
    const name = candidates.find(candidate => !taken.has(candidate.toLowerCase()));
    if (name) {
      taken.add(name.toLowerCase());
      return name;
    }
    const lead = inside.reduce((best, i) => (sources[i].marks > sources[best].marks ? i : best), inside[0]);
    return `Around ${sources[lead].title}`;
  });
};

const askForNames = async (clusters, sources, fallback, client) => {
  if (!client?.isTextGenerationConfigured?.()) return null;
  const brief = clusters.map((cluster, index) => ({
    cluster: index + 1,
    titles: cluster.members.slice(0, 8).map(i => sources[i].title),
    passages: cluster.members.slice(0, 3).map(i => sources[i].line).filter(Boolean),
    wordsFound: fallback[index]
  }));
  try {
    const completion = await client.chatComplete({
      route: 'structure_planner',
      maxTokens: 400,
      messages: [
        {
          role: 'system',
          content: 'You name subjects on a map of one person\'s reading. Each name is one to three plain words a librarian would shelve it under. No punctuation, no quotes, no clever phrasing. Return JSON {"names": [...]} with one name per cluster, in order.'
        },
        { role: 'user', content: JSON.stringify(brief) }
      ]
    });
    const parsed = client.parseStructuredText?.(completion?.text || '') || null;
    const names = Array.isArray(parsed?.names) ? parsed.names.map(name => plain(name)) : [];
    const distinct = new Set(names.map(name => name.toLowerCase()));
    const valid = names.length === clusters.length
      && distinct.size === names.length
      && names.every(name => name && name.length <= 40 && name.split(' ').length <= 4);
    return valid ? names : null;
  } catch (_error) {
    return null;
  }
};

/* ── blind spots ──────────────────────────────────────────────────────── */

const mentions = (haystack, subject) => {
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack);
};

/* A subject is a name the reader gave something: a concept, a notebook tag,
   a wiki page. It is a blind spot only when their writing returns to it and
   their reading does not. */
const findGaps = (sources, writing = {}) => {
  const concepts = (writing.concepts || []).map(c => ({ name: lower(c.name), text: lower(`${c.name} ${c.description || ''}`), tags: [] }));
  const notes = (writing.notes || []).map(n => ({ text: lower(`${n.title} ${n.content}`), tags: (n.tags || []).map(lower) }));
  const pages = (writing.pages || []).map(p => ({ name: lower(p.title), text: lower(p.title), tags: [] }));
  const questions = (writing.questions || []).map(q => ({
    text: lower(q.text),
    tags: [q.linkedTagName, q.conceptName].map(lower).filter(Boolean)
  }));
  const documents = [...concepts, ...notes, ...pages, ...questions];
  const subjects = [...new Set([
    ...concepts.map(c => c.name),
    ...notes.flatMap(n => n.tags),
    ...pages.map(p => p.name)
  ])].filter(name => name.length >= 3 && name.length <= 40 && name.split(' ').length <= 4);

  const reading = sources.map(source => ({ text: lower(source.text), tags: source.tags }));
  const held = (doc, subject) => doc.tags.includes(subject) || mentions(doc.text, subject);
  return subjects
    .map(subject => ({
      name: subject,
      writing: documents.filter(doc => held(doc, subject)).length,
      reading: reading.filter(doc => held(doc, subject)).length
    }))
    .filter(gap => gap.writing >= GAP_MIN_WRITING && gap.reading <= GAP_MAX_READING)
    .sort((a, b) => b.writing - a.writing || a.name.localeCompare(b.name))
    .slice(0, MAX_GAPS);
};

/* ── the map ──────────────────────────────────────────────────────────── */

const quiet = (sourceCount) => ({
  status: 'quiet', threshold: MIN_SOURCES, sourceCount, basis: '', sources: [], clusters: [], gaps: []
});

/* Pure: sources, their stored vectors and the reader's writing in; a map
   out. Everything the route does beyond this is loading and caching. */
const composeReadingMap = async ({ sources, vectorRows = [], writing = {}, client = textClient }) => {
  if (sources.length < MIN_SOURCES) return quiet(sources.length);

  const terms = termModel(sources);
  const meaning = meaningVectors(sources, vectorRows);
  const covered = meaning.filter(Boolean).length;
  const basis = covered >= MIN_SOURCES && covered >= sources.length * 0.8 ? 'meaning' : 'words';
  const keep = sources.map((_, i) => (basis === 'meaning' ? Boolean(meaning[i]) : terms.vectors[i].some(Boolean)));
  const placed = sources.filter((_, i) => keep[i]);
  if (placed.length < MIN_SOURCES) return quiet(placed.length);
  const vectors = (basis === 'meaning' ? meaning : terms.vectors).filter((_, i) => keep[i]);
  const placedTerms = { vocabulary: terms.vocabulary, vectors: terms.vectors.filter((_, i) => keep[i]) };

  const scores = pca(vectors, PCA_DIMENSIONS);
  const { assignment, k } = clusterBySilhouette(scores);
  const points = layout(scores.map(row => [row[0] || 0, row[1] || 0]), assignment);

  const clusters = Array.from({ length: k }, (_, id) => ({ id, members: placed.map((_, i) => i).filter(i => assignment[i] === id) }))
    .filter(cluster => cluster.members.length);
  const fallback = fallbackNames(clusters, placed, placedTerms);
  const modelNames = await askForNames(clusters, placed, fallback, client);

  const clusterRows = clusters.map((cluster, index) => {
    const [x, y] = mean(cluster.members.map(i => points[i]));
    const radius = Math.max(...cluster.members.map(i => Math.hypot(points[i][0] - x, points[i][1] - y)));
    return {
      id: `c${index}`,
      name: modelNames ? modelNames[index] : fallback[index],
      namedBy: modelNames ? 'model' : 'words',
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      radius: Math.round(radius * 1000) / 1000,
      size: cluster.members.length
    };
  });
  const clusterOf = new Map(clusters.flatMap((cluster, index) => cluster.members.map(i => [i, `c${index}`])));

  const occupied = [...points, ...clusterRows.map(c => [c.x, c.y])];
  const gaps = findGaps(placed, writing).map(gap => {
    const [x, y] = emptiestPoint(occupied);
    occupied.push([x, y]);
    return { name: titleCase(gap.name), writing: gap.writing, reading: gap.reading, x, y };
  });

  return {
    status: 'ready',
    threshold: MIN_SOURCES,
    sourceCount: placed.length,
    basis,
    sources: placed.map((source, i) => ({
      id: source.id,
      title: source.title,
      line: source.line,
      marks: source.marks,
      cluster: clusterOf.get(i),
      x: points[i][0],
      y: points[i][1]
    })),
    clusters: clusterRows,
    gaps
  };
};

/* ── loading, fingerprinting, caching ─────────────────────────────────── */

const ownerId = userId => new mongoose.Types.ObjectId(String(userId));

const latestOf = rows => rows.reduce((latest, row) => {
  const at = row?.updatedAt ? new Date(row.updatedAt).toISOString() : '';
  return at > latest ? at : latest;
}, '');

const vectorQuery = (userId, ids) => ({
  userId: ownerId(userId),
  $or: [
    { objectType: 'article', objectId: { $in: ids } },
    { objectType: 'highlight', 'metadata.articleId': { $in: ids } }
  ]
});

const buildReadingMap = async ({ userId, models = {}, client = textClient, now = () => new Date() }) => {
  const { Article, VectorItem, TagMeta, NotebookEntry, WikiPage, Question } = models;
  const owner = ownerId(userId);
  const articles = await Article.find({ userId: owner, ...ACTIVE })
    .select('title highlights.text highlights.note highlights.tags updatedAt')
    .sort({ createdAt: -1 })
    .lean();
  const sources = eligibleSources(articles || []);
  const ids = sources.map(source => source.id);

  const find = (Model, query, fields) => (Model?.find
    ? Model.find({ userId: owner, ...query }).select(`${fields} updatedAt`).limit(1000).lean()
    : Promise.resolve([]));
  const [concepts, notes, pages, questions, vectorStamp] = await Promise.all([
    find(TagMeta, ACTIVE, 'name description'),
    find(NotebookEntry, ACTIVE, 'title content tags'),
    find(WikiPage, { status: { $ne: 'archived' } }, 'title'),
    find(Question, ACTIVE, 'text linkedTagName conceptName'),
    VectorItem?.find && ids.length
      ? VectorItem.find(vectorQuery(userId, ids)).select('updatedAt').sort({ updatedAt: -1 }).lean()
      : Promise.resolve([])
  ]);
  const writing = { concepts, notes, pages, questions };

  const fingerprint = crypto.createHash('sha1').update(JSON.stringify([
    sources.map(source => [source.id, source.updatedAt, source.marks]),
    (vectorStamp || []).length,
    latestOf(vectorStamp || []),
    Object.values(writing).map(rows => [(rows || []).length, latestOf(rows || [])])
  ])).digest('hex');

  const key = String(userId);
  const cached = cache.get(key);
  if (cached?.fingerprint === fingerprint) return cached.map;

  const vectorRows = sources.length >= MIN_SOURCES && VectorItem?.find
    ? await VectorItem.find(vectorQuery(userId, ids)).select('objectType objectId metadata.articleId embedding').lean()
    : [];
  const map = {
    ...(await composeReadingMap({ sources, vectorRows, writing, client })),
    generatedAt: now().toISOString()
  };
  cache.delete(key);
  cache.set(key, { fingerprint, map });
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return map;
};

module.exports = {
  ACTIVE,
  MIN_SOURCES,
  buildReadingMap,
  composeReadingMap,
  __testables: { eligibleSources, termModel, fallbackNames, askForNames, findGaps, meaningVectors, cache }
};
