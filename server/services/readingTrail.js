const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { semanticSearch } = require('../ai/semanticSearch');
const { retrievePassages } = require('./agentRetrieval');
const { applyDefaultArticleVisibility } = require('../utils/articleVisibility');

/* A trail: what to read next on a subject, five pieces at most, from
   foundations to the frontier, starting from what you already hold.

   Eligibility: saved sources in the default Library (not archived, not
   review-only) whose passages or highlights the thought partner's retrieval
   finds for the subject, by words and, when embeddings are on, by meaning.
   At most five; one passage per source, the one that answers best.
   Quality bar: the model orders only pieces it was handed, by label. A label
   it invents is dropped, and an order that keeps none of your pieces is no
   order at all. A work from outside your library needs a title and an
   author and the gap it fills; it never carries a link, because nothing
   here can search the web, so the page links a search for the title.
   Silence: with no model, your own pieces, oldest first, and no gap and no
   outside works. With nothing on the subject in your Library, one line,
   and outside works only when a model can name them. */

const PATH_LENGTH = 5;
const OUTSIDE_LIMIT = 3;

const clean = (value = '', limit = 280) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const list = value => (Array.isArray(value) ? value : []);
const when = article => new Date(article?.publicationDate || article?.createdAt || 0).getTime() || 0;
const oldestFirst = (left, right) => (Date.parse(left.date) || 0) - (Date.parse(right.date) || 0);

const ownPieces = async ({ userId, subject, models, retrieve, search }) => {
  const found = await retrieve({
    userId,
    query: subject,
    includeNotes: false,
    articleFilter: applyDefaultArticleVisibility({}),
    limit: PATH_LENGTH,
    models,
    semanticSearch: search
  }).catch(() => []);
  const ids = found.filter(hit => hit.type === 'article').map(hit => hit.id);
  if (!ids.length) return [];
  const articles = await models.Article.find({ _id: { $in: ids }, userId })
    .select('_id title author siteName publicationDate createdAt highlights._id highlights.text')
    .lean();
  const byId = new Map(articles.map(article => [String(article._id), article]));
  return found
    .filter(hit => byId.has(hit.id))
    .map((hit) => {
      const article = byId.get(hit.id);
      const marked = hit.highlightId && list(article.highlights).find(item => String(item._id) === hit.highlightId);
      return {
        kind: 'mine',
        articleId: hit.id,
        highlightId: marked ? hit.highlightId : '',
        title: clean(article.title, 300) || 'Untitled',
        author: clean(article.author || article.siteName, 160),
        passage: clean(marked ? marked.text : hit.snippet, 700),
        marked: Boolean(marked),
        date: when(article) ? new Date(when(article)).toISOString() : '',
        why: ''
      };
    });
};

const promptFor = ({ subject, mine }) => [
  `The subject: "${subject}"`,
  '',
  ...(mine.length ? [
    'Pieces the reader has already saved, each with the passage that bears on the subject:',
    ...mine.map((piece, index) => `[m${index + 1}] ${piece.title}${piece.author ? ` — ${piece.author}` : ''}\n    "${piece.passage}"`),
    '',
    `Lay out a reading path of at most ${PATH_LENGTH} pieces, from foundations to the frontier.`,
    'Start from the reader\'s pieces: place the ones that belong, by label. Leave out a piece that is not on the subject.'
  ] : [
    'The reader has saved nothing on this subject yet.',
    '',
    `Lay out a reading path of at most ${PATH_LENGTH} pieces, from foundations to the frontier.`
  ]),
  `Then name in one sentence the gap those pieces leave, and add up to ${OUTSIDE_LIMIT} well-known works from outside the library that fill it, each where it belongs in the path.`,
  'Name only works you are certain exist, by exact title and author. Never give a link or a URL.',
  'If there is no real gap, say nothing for the gap and add no outside works.',
  'For every piece, one short line on why it sits at that point in the path.',
  '',
  'Answer with JSON only:',
  '{"path": [{"mine": "m1", "why": "..."} or {"title": "...", "author": "...", "why": "..."}], "gap": "one sentence, or empty"}'
].join('\n');

/* The model's path, kept to what it was allowed to say. */
const readPath = ({ raw, mine }) => {
  const match = String(raw?.text ?? raw ?? '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (_error) { return null; }
  const gap = clean(parsed?.gap, 280);
  const titles = new Set(mine.map(piece => piece.title.toLowerCase()));
  const used = new Set();
  let outside = 0;
  const steps = list(parsed?.path).flatMap((step) => {
    const why = clean(step?.why, 240);
    const label = clean(step?.mine, 8).toLowerCase();
    if (label) {
      const piece = mine[Number(label.replace(/^m/, '')) - 1];
      if (!/^m\d+$/.test(label) || !piece || used.has(piece)) return [];
      used.add(piece);
      return [{ ...piece, why }];
    }
    const title = clean(step?.title, 200);
    const author = clean(step?.author, 160);
    const named = title && author && !/:\/\/|www\./i.test(`${title} ${author}`);
    if (!gap || !named || titles.has(title.toLowerCase()) || outside >= OUTSIDE_LIMIT) return [];
    outside += 1;
    return [{ kind: 'outside', title, author, why }];
  }).slice(0, PATH_LENGTH);
  if (mine.length && !used.size) return null;
  // A gap is named against something: your pieces, or the works that fill it.
  return { steps, gap: steps.length ? gap : '' };
};

const buildTrail = async ({
  userId,
  subject: asked = '',
  models,
  retrieve = retrievePassages,
  complete = chatComplete,
  configured = isTextGenerationConfigured,
  search = semanticSearch
} = {}) => {
  const subject = clean(asked, 120);
  const mine = await ownPieces({ userId, subject, models, retrieve, search });
  const byDate = { subject, steps: [...mine].sort(oldestFirst), gap: '', ordered: 'date', empty: !mine.length };
  if (!configured()) return byDate;
  const completion = await complete({
    route: 'structure_planner',
    maxTokens: 900,
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'You plan reading for one person from what they have already read. You answer only in JSON and name only works that exist.' },
      { role: 'user', content: promptFor({ subject, mine }) }
    ]
  }).catch(() => null);
  const path = completion && readPath({ raw: completion, mine });
  if (!path) return byDate;
  return { subject, ...path, ordered: 'path', empty: !mine.length };
};

module.exports = { buildTrail, PATH_LENGTH, OUTSIDE_LIMIT, __testables: { readPath, promptFor } };
