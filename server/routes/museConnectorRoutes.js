const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const { librarySearchArticleMatch } = require('../utils/articleVisibility');
const { snippetAroundQuery } = require('../utils/searchSnippet');
const { sanitizeNotebookBlocks } = require('../utils/notebookIdentity');
const { buildMuseOpenApiSpec, DEFAULT_API_URL, DEFAULT_APP_URL } = require('../openapi/museV1');

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const TYPE_ALIASES = Object.freeze({
  notebook: 'notebook',
  notebooks: 'notebook',
  note: 'notebook',
  notes: 'notebook',
  notebook_entry: 'notebook',
  library: 'library',
  article: 'library',
  articles: 'library',
  reading: 'library',
  readings: 'library',
  concept: 'concept',
  concepts: 'concept',
  think: 'concept',
  judgment: 'judgment',
  judgements: 'judgment',
  judgments: 'judgment',
  wiki: 'judgment'
});
const ALL_TYPES = Object.freeze(['notebook', 'library', 'concept', 'judgment']);
const CONTENT_LIMIT = 12000;
const CAPTURE_LIMIT = 20000;
const DOCS_PATH = path.join(__dirname, '..', '..', 'docs', 'muse-connector.md');

const trimSlash = (value = '') => String(value || '').replace(/\/+$/g, '');
const asId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
};
const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectId = (value) => OBJECT_ID_RE.test(String(value || '').trim());
const createBlockId = () => (
  crypto.randomUUID ? crypto.randomUUID() : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`
);

const parseTypes = (value) => {
  const raw = String(value || '')
    .split(',')
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  if (raw.length === 0) return [...ALL_TYPES];
  const mapped = raw
    .map((item) => TYPE_ALIASES[item])
    .filter(Boolean);
  const unique = Array.from(new Set(mapped));
  return unique.length > 0 ? unique : [...ALL_TYPES];
};

const parseLimit = (value, fallback, max = 50) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), max);
};

const cleanText = (value = '') => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const notebookPlain = (entry = {}) => {
  const blocks = Array.isArray(entry.blocks)
    ? entry.blocks.map((block) => block?.text || '').filter(Boolean).join('\n')
    : '';
  return cleanText([entry.content, blocks].filter(Boolean).join('\n'));
};

const normalizeTags = (input) => {
  const raw = Array.isArray(input) ? input : (input ? [input] : []);
  const seen = new Set();
  const tags = [];
  raw.forEach((tag) => {
    const value = String(tag || '').trim().slice(0, 48);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    tags.push(value);
  });
  return tags.slice(0, 12);
};

const judgmentHeldClause = () => ({
  $or: [
    { 'judgment.currentJudgment': { $exists: true, $nin: [null, ''] } },
    { 'judgment.kind': { $exists: true, $nin: [null, ''] } }
  ]
});

const isHeldJudgment = (page = {}) => {
  const judgment = page?.judgment;
  if (!judgment || typeof judgment !== 'object') return false;
  return Boolean(
    String(judgment.currentJudgment || '').trim()
    || String(judgment.kind || '').trim()
    || String(judgment.governingQuestion || '').trim()
  );
};

const awaitQuery = async (query) => {
  if (query == null) return query;
  if (typeof query.lean === 'function') return query.lean();
  if (typeof query.then === 'function') return query;
  return query;
};

const runFind = async (model, filter, { sort, limit, select } = {}) => {
  if (!model?.find) return [];
  let query = model.find(filter);
  if (query && typeof query.select === 'function' && select) query = query.select(select);
  if (query && typeof query.sort === 'function' && sort) query = query.sort(sort);
  if (query && typeof query.limit === 'function' && limit) query = query.limit(limit);
  const rows = await awaitQuery(query);
  return Array.isArray(rows) ? rows : [];
};

const runFindOne = async (model, filter, { select } = {}) => {
  if (!model?.findOne) return null;
  let query = model.findOne(filter);
  if (query && typeof query.select === 'function' && select) query = query.select(select);
  const row = await awaitQuery(query);
  return row || null;
};

const readDocsMarkdown = () => {
  try {
    return fs.readFileSync(DOCS_PATH, 'utf8');
  } catch (_error) {
    return '# Noeis Muse connector\n\nDocs file was not packaged with this build. Use GET /api/v1/openapi.json.\n';
  }
};

const renderDocsHtml = (markdown) => {
  const escaped = String(markdown || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Noeis Muse connector</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      background: #f7f4ee;
      color: #1c1917;
      font: 16px/1.55 Georgia, "Iowan Old Style", serif;
    }
    main {
      max-width: 44rem;
      margin: 0 auto;
      padding: 2.5rem 1.25rem 4rem;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
  </style>
</head>
<body>
  <main>
    <pre>${escaped}</pre>
  </main>
</body>
</html>`;
};

const buildMuseConnectorRouter = ({
  authenticateToken,
  mongoose,
  User = null,
  NotebookEntry,
  Article,
  TagMeta,
  WikiPage,
  enqueueNotebookEmbedding = null,
  trackEvent = null,
  EVENT_NAMES = {},
  apiUrl = process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || DEFAULT_API_URL,
  appUrl = process.env.PUBLIC_APP_URL || DEFAULT_APP_URL
} = {}) => {
  if (typeof authenticateToken !== 'function') {
    throw new Error('authenticateToken is required.');
  }
  const router = express.Router();
  const siteUrl = trimSlash(appUrl || DEFAULT_APP_URL);
  const spec = buildMuseOpenApiSpec({ apiUrl, appUrl: siteUrl });

  const hrefFor = (type, item = {}) => {
    const id = asId(item);
    const name = String(item.name || item.title || '').trim();
    if (type === 'notebook') return `/think?tab=notebook&entryId=${encodeURIComponent(id)}`;
    if (type === 'library') return `/library?articleId=${encodeURIComponent(id)}`;
    if (type === 'concept') {
      const params = new URLSearchParams({ tab: 'concepts' });
      if (name) params.set('concept', name);
      if (id) params.set('conceptId', id);
      return `/think?${params.toString()}`;
    }
    if (type === 'judgment') return `/judgment/${encodeURIComponent(id)}`;
    return '';
  };

  const openUrlFor = (href) => (href ? `${siteUrl}${href}` : '');

  const toHit = (type, item, query = '') => {
    const id = asId(item);
    const title = String(item.title || item.name || item.judgment?.currentJudgment || 'Untitled').trim() || 'Untitled';
    const haystack = [
      item.title,
      item.name,
      item.description,
      item.snippet,
      notebookPlain(item),
      item.content,
      item.judgment?.currentJudgment,
      item.judgment?.governingQuestion
    ].filter(Boolean).join('\n');
    return {
      type,
      id,
      title,
      snippet: snippetAroundQuery(haystack, query),
      href: hrefFor(type, { ...item, _id: id }),
      openUrl: openUrlFor(hrefFor(type, { ...item, _id: id })),
      updatedAt: item.updatedAt || item.createdAt || null
    };
  };

  const userFilter = (userId) => {
    if (mongoose?.Types?.ObjectId?.isValid?.(userId) && isObjectId(userId)) {
      try {
        return new mongoose.Types.ObjectId(userId);
      } catch (_error) {
        return userId;
      }
    }
    return userId;
  };

  const searchNotebook = async (userId, query, limit) => {
    const regex = new RegExp(escapeRegExp(query), 'i');
    return runFind(NotebookEntry, {
      userId,
      $or: [
        { title: regex },
        { content: regex },
        { 'blocks.text': regex },
        { tags: regex }
      ]
    }, {
      sort: { updatedAt: -1, _id: -1 },
      limit,
      select: 'title content blocks.text tags updatedAt createdAt'
    });
  };

  const searchLibrary = async (userId, query, limit) => {
    const regex = new RegExp(escapeRegExp(query), 'i');
    const match = librarySearchArticleMatch(userId, {
      $or: [
        { title: regex },
        { url: regex },
        { siteName: regex },
        { author: regex }
      ]
    });
    return runFind(Article, match, {
      sort: { updatedAt: -1, _id: -1 },
      limit,
      select: 'title url siteName author publicationDate updatedAt createdAt'
    });
  };

  const searchConcepts = async (userId, query, limit) => {
    const regex = new RegExp(escapeRegExp(query), 'i');
    return runFind(TagMeta, {
      userId,
      archived: { $ne: true },
      $or: [
        { name: regex },
        { description: regex }
      ]
    }, {
      sort: { updatedAt: -1, _id: -1 },
      limit,
      select: 'name description updatedAt createdAt'
    });
  };

  const searchJudgments = async (userId, query, limit) => {
    const regex = new RegExp(escapeRegExp(query), 'i');
    return runFind(WikiPage, {
      userId,
      status: { $ne: 'archived' },
      $and: [
        judgmentHeldClause(),
        {
          $or: [
            { title: regex },
            { 'judgment.currentJudgment': regex },
            { 'judgment.governingQuestion': regex },
            { plainText: regex }
          ]
        }
      ]
    }, {
      sort: { updatedAt: -1, _id: -1 },
      limit,
      select: 'title judgment.currentJudgment judgment.governingQuestion judgment.kind updatedAt createdAt'
    });
  };

  const recentNotebook = (userId, limit) => runFind(NotebookEntry, { userId }, {
    sort: { updatedAt: -1, _id: -1 },
    limit,
    select: 'title content blocks.text tags updatedAt createdAt'
  });

  const recentLibrary = (userId, limit) => runFind(Article, librarySearchArticleMatch(userId), {
    sort: { createdAt: -1, _id: -1 },
    limit,
    select: 'title url siteName author publicationDate updatedAt createdAt'
  });

  const recentConcepts = (userId, limit) => runFind(TagMeta, { userId, archived: { $ne: true } }, {
    sort: { updatedAt: -1, _id: -1 },
    limit,
    select: 'name description updatedAt createdAt'
  });

  const recentJudgments = (userId, limit) => runFind(WikiPage, {
    userId,
    status: { $ne: 'archived' },
    ...judgmentHeldClause()
  }, {
    sort: { updatedAt: -1, _id: -1 },
    limit,
    select: 'title judgment.currentJudgment judgment.governingQuestion judgment.kind updatedAt createdAt'
  });

  router.get('/api/v1/openapi.json', (_req, res) => {
    res.status(200).json(spec);
  });

  router.get(['/api/v1/docs', '/api/v1/docs.md'], (req, res) => {
    const markdown = readDocsMarkdown();
    if (req.path.endsWith('.md')) {
      res.set('Content-Type', 'text/markdown; charset=utf-8');
      return res.status(200).send(markdown);
    }
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(renderDocsHtml(markdown));
  });

  router.get('/api/v1/me', authenticateToken, async (req, res) => {
    try {
      const scopes = Array.isArray(req.agentToken?.scopes) && req.agentToken.scopes.length
        ? req.agentToken.scopes
        : (req.agentToken ? ['read'] : ['read', 'agent-write']);
      let username = '';
      if (User?.findOne) {
        const user = await runFindOne(User, { _id: req.user.id }, { select: 'username' });
        username = String(user?.username || '').trim();
      } else if (typeof User?.findById === 'function') {
        let query = User.findById(req.user.id);
        if (query && typeof query.select === 'function') query = query.select('username');
        const user = await awaitQuery(query);
        username = String(user?.username || '').trim();
      }
      return res.status(200).json({
        format: 'noeis.muse-connector',
        version: 1,
        workspace: {
          id: String(req.user?.id || ''),
          label: username ? `${username}’s Noeis workspace` : 'Noeis workspace',
          username
        },
        grant: {
          id: req.agentToken ? String(req.agentToken.id || req.agentToken._id || '') : null,
          label: req.agentToken?.label || (req.agentToken ? 'Agent connection' : 'Signed-in session'),
          scopes,
          status: req.agentToken?.status || 'active'
        },
        capabilities: {
          read: scopes.includes('read') || scopes.includes('agent-write'),
          agentWrite: scopes.includes('agent-write')
        },
        contentRead: false,
        contentWritten: false
      });
    } catch (error) {
      console.error('Muse connector whoami failed:', error);
      return res.status(500).json({ error: 'Failed to verify credential.' });
    }
  });

  router.get('/api/v1/search', authenticateToken, async (req, res) => {
    try {
      const query = String(req.query.q || req.query.query || '').trim();
      if (!query) {
        return res.status(400).json({ error: 'q is required. Use GET /api/v1/recent when there is no search query.' });
      }
      const types = parseTypes(req.query.types || req.query.type);
      const limit = parseLimit(req.query.limit, 10);
      const userId = userFilter(req.user.id);
      const perType = Math.max(3, Math.ceil(limit / Math.max(types.length, 1)));
      const collected = [];
      if (types.includes('notebook')) {
        const rows = await searchNotebook(userId, query, perType);
        rows.forEach((row) => collected.push(toHit('notebook', row, query)));
      }
      if (types.includes('library')) {
        const rows = await searchLibrary(userId, query, perType);
        rows.forEach((row) => collected.push(toHit('library', row, query)));
      }
      if (types.includes('concept')) {
        const rows = await searchConcepts(userId, query, perType);
        rows.forEach((row) => collected.push(toHit('concept', { ...row, title: row.name }, query)));
      }
      if (types.includes('judgment')) {
        const rows = await searchJudgments(userId, query, perType);
        rows.forEach((row) => collected.push(toHit('judgment', {
          ...row,
          title: row.title || row.judgment?.currentJudgment
        }, query)));
      }
      collected.sort((left, right) => (
        new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
      ));
      return res.status(200).json({
        query,
        types,
        hits: collected.slice(0, limit)
      });
    } catch (error) {
      console.error('Muse connector search failed:', error);
      return res.status(500).json({ error: 'Failed to search workspace.' });
    }
  });

  router.get('/api/v1/recent', authenticateToken, async (req, res) => {
    try {
      const types = parseTypes(req.query.types || req.query.type);
      const limit = parseLimit(req.query.limit, 20);
      const userId = userFilter(req.user.id);
      const perType = Math.max(3, Math.ceil(limit / Math.max(types.length, 1)));
      const items = [];
      if (types.includes('notebook')) {
        (await recentNotebook(userId, perType)).forEach((row) => items.push(toHit('notebook', row)));
      }
      if (types.includes('library')) {
        (await recentLibrary(userId, perType)).forEach((row) => items.push(toHit('library', row)));
      }
      if (types.includes('concept')) {
        (await recentConcepts(userId, perType)).forEach((row) => items.push(toHit('concept', { ...row, title: row.name })));
      }
      if (types.includes('judgment')) {
        (await recentJudgments(userId, perType)).forEach((row) => items.push(toHit('judgment', {
          ...row,
          title: row.title || row.judgment?.currentJudgment
        })));
      }
      items.sort((left, right) => (
        new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
      ));
      return res.status(200).json({ types, items: items.slice(0, limit) });
    } catch (error) {
      console.error('Muse connector recent failed:', error);
      return res.status(500).json({ error: 'Failed to list recent items.' });
    }
  });

  router.get('/api/v1/notebook/:id', authenticateToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid notebook id.' });
      const entry = await runFindOne(NotebookEntry, { _id: id, userId: userFilter(req.user.id) });
      if (!entry) return res.status(404).json({ error: 'Notebook note not found.' });
      const content = notebookPlain(entry);
      return res.status(200).json({
        type: 'notebook',
        id: asId(entry),
        title: String(entry.title || '').trim() || 'Untitled',
        content,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        href: hrefFor('notebook', entry),
        openUrl: openUrlFor(hrefFor('notebook', entry)),
        createdAt: entry.createdAt || null,
        updatedAt: entry.updatedAt || null
      });
    } catch (error) {
      console.error('Muse connector notebook get failed:', error);
      return res.status(500).json({ error: 'Failed to load notebook note.' });
    }
  });

  router.get('/api/v1/library/:id', authenticateToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid library id.' });
      const article = await runFindOne(
        Article,
        librarySearchArticleMatch(userFilter(req.user.id), { _id: id }),
        { select: 'title url siteName author publicationDate content createdAt updatedAt' }
      );
      if (!article) return res.status(404).json({ error: 'Library article not found.' });
      const raw = String(article.content || '');
      const truncated = raw.length > CONTENT_LIMIT;
      return res.status(200).json({
        type: 'library',
        id: asId(article),
        title: String(article.title || '').trim() || 'Untitled article',
        url: article.url || '',
        siteName: article.siteName || '',
        author: article.author || '',
        publicationDate: article.publicationDate || '',
        content: truncated ? raw.slice(0, CONTENT_LIMIT) : raw,
        truncated,
        href: hrefFor('library', article),
        openUrl: openUrlFor(hrefFor('library', article)),
        createdAt: article.createdAt || null,
        updatedAt: article.updatedAt || null
      });
    } catch (error) {
      console.error('Muse connector library get failed:', error);
      return res.status(500).json({ error: 'Failed to load library article.' });
    }
  });

  router.get('/api/v1/concepts/:idOrName', authenticateToken, async (req, res) => {
    try {
      const raw = String(req.params.idOrName || '').trim();
      if (!raw) return res.status(400).json({ error: 'Concept id or name is required.' });
      const userId = userFilter(req.user.id);
      const concept = isObjectId(raw)
        ? await runFindOne(TagMeta, { _id: raw, userId })
        : await runFindOne(TagMeta, {
          userId,
          name: new RegExp(`^${escapeRegExp(raw)}$`, 'i')
        });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      const href = hrefFor('concept', concept);
      return res.status(200).json({
        type: 'concept',
        id: asId(concept),
        name: concept.name || raw,
        title: concept.name || raw,
        description: concept.description || '',
        pinnedHighlightIds: (Array.isArray(concept.pinnedHighlightIds) ? concept.pinnedHighlightIds : []).map(String),
        pinnedArticleIds: (Array.isArray(concept.pinnedArticleIds) ? concept.pinnedArticleIds : []).map(String),
        pinnedNoteIds: (Array.isArray(concept.pinnedNoteIds) ? concept.pinnedNoteIds : []).map(String),
        href,
        openUrl: openUrlFor(href),
        createdAt: concept.createdAt || null,
        updatedAt: concept.updatedAt || null
      });
    } catch (error) {
      console.error('Muse connector concept get failed:', error);
      return res.status(500).json({ error: 'Failed to load concept.' });
    }
  });

  router.get('/api/v1/judgments/:id', authenticateToken, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!isObjectId(id)) return res.status(400).json({ error: 'Invalid judgment id.' });
      const page = await runFindOne(WikiPage, {
        _id: id,
        userId: userFilter(req.user.id)
      }, {
        select: 'title slug judgment createdAt updatedAt'
      });
      if (!page || !isHeldJudgment(page)) {
        return res.status(404).json({ error: 'Judgment not found.' });
      }
      const judgment = page.judgment || {};
      const href = hrefFor('judgment', page);
      return res.status(200).json({
        type: 'judgment',
        id: asId(page),
        title: page.title || '',
        currentJudgment: judgment.currentJudgment || '',
        governingQuestion: judgment.governingQuestion || '',
        kind: judgment.kind || null,
        why: Array.isArray(judgment.why) ? judgment.why.map((row) => ({
          text: row?.text || '',
          sourceLabel: row?.sourceLabel || ''
        })) : [],
        against: Array.isArray(judgment.against) ? judgment.against.map((row) => ({
          text: row?.text || '',
          sourceLabel: row?.sourceLabel || ''
        })) : [],
        href,
        openUrl: openUrlFor(href),
        createdAt: page.createdAt || null,
        updatedAt: page.updatedAt || null
      });
    } catch (error) {
      console.error('Muse connector judgment get failed:', error);
      return res.status(500).json({ error: 'Failed to load judgment.' });
    }
  });

  router.post('/api/v1/captures', authenticateToken, async (req, res) => {
    try {
      const title = String(req.body?.title || '').trim().slice(0, 200);
      const content = String(
        req.body?.content
        || req.body?.text
        || req.body?.note
        || req.body?.body
        || ''
      ).trim().slice(0, CAPTURE_LIMIT);
      if (!title && !content) {
        return res.status(400).json({ error: 'title or content is required.' });
      }
      const tags = normalizeTags(req.body?.tags);
      const payload = {
        title: title || content.slice(0, 80),
        content,
        blocks: sanitizeNotebookBlocks(content ? [{ id: createBlockId(), type: 'paragraph', text: content }] : []),
        type: 'note',
        tags,
        userId: req.user.id
      };
      const created = typeof NotebookEntry.create === 'function'
        ? await NotebookEntry.create(payload)
        : await new NotebookEntry(payload).save();
      if (typeof enqueueNotebookEmbedding === 'function') {
        try {
          enqueueNotebookEmbedding(created);
        } catch (_error) {
          // Capture succeeded; embedding is best-effort.
        }
      }
      if (typeof trackEvent === 'function' && EVENT_NAMES.CAPTURE_COMPLETED) {
        trackEvent({
          event: EVENT_NAMES.CAPTURE_COMPLETED,
          userId: req.user.id,
          requestId: req.requestId,
          properties: {
            source: 'muse',
            entryId: asId(created),
            importedNotes: 1
          }
        });
      }
      const href = hrefFor('notebook', created);
      return res.status(201).json({
        type: 'notebook',
        id: asId(created),
        title: created.title || payload.title,
        content: notebookPlain(created) || content,
        tags,
        href,
        openUrl: openUrlFor(href),
        createdAt: created.createdAt || new Date().toISOString(),
        updatedAt: created.updatedAt || created.createdAt || new Date().toISOString()
      });
    } catch (error) {
      console.error('Muse connector capture failed:', error);
      return res.status(500).json({ error: 'Failed to create capture.' });
    }
  });

  return router;
};

module.exports = {
  buildMuseConnectorRouter
};
