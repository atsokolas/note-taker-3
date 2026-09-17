const express = require('express');
const { stripTags } = require('../services/readableArticle');
const plainTextFrom = (value) => stripTags(value).replace(/\s+/g, ' ').trim();
const { projectReadingPlace } = require('./articleReadingStateRoutes');
const excerpt = (text, query = '') => {
  const value = plainTextFrom(text || '');
  const found = query ? value.toLowerCase().indexOf(query.toLowerCase()) : 0;
  const start = Math.max(0, found - 70);
  return `${start ? '…' : ''}${value.slice(start, start + 280)}${value.length > start + 280 ? '…' : ''}`;
};
const personalTrace = (article) => {
  const highlights = article.highlights || [];
  const note = article.lastNotedHighlight || [...highlights]
    .reverse()
    .find((item) => String(item.note || '').trim());
  if (note)
    return {
      kind: 'thought',
      text: String(note.note).slice(0, 280),
      highlightId: String(note._id),
      anchor: note.anchor
    };
  if (article.readingState)
    return {
      kind: 'continue',
      text: article.readingState.anchor.text.slice(0, 280)
    };
  const marked = article.lastHighlight || highlights[highlights.length - 1];
  return marked
    ? {
        kind: 'passage',
        text: String(marked.text || '').slice(0, 280),
        highlightId: String(marked._id),
        anchor: marked.anchor
      }
    : null;
};

const traceSummariesFor = async (Article, match) => {
  if (typeof Article?.aggregate !== 'function') return [];
  let aggregation = Article.aggregate([
    { $match: match },
    {
      $project: {
        lastHighlight: { $arrayElemAt: ['$highlights', -1] },
        lastNotedHighlight: {
          $arrayElemAt: [
            {
              $filter: {
                input: { $ifNull: ['$highlights', []] },
                as: 'highlight',
                cond: {
                  $regexMatch: {
                    input: { $ifNull: ['$$highlight.note', ''] },
                    regex: /\S/
                  }
                }
              }
            },
            -1
          ]
        }
      }
    }
  ]);
  if (aggregation?.option) aggregation = aggregation.option({ maxTimeMS: 10000 });
  return aggregation;
};
const searchMatch = (article, query) => {
  if (!query) return null;
  const has = (value) =>
    String(value || '')
      .toLowerCase()
      .includes(query.toLowerCase());
  if (has(article.title)) return { kind: 'title', text: article.title };
  const note = (article.highlights || []).find((item) => has(item.note));
  if (note)
    return {
      kind: 'thought',
      text: excerpt(note.note, query),
      highlightId: String(note._id),
      anchor: note.anchor
    };
  const highlight = (article.highlights || []).find((item) => has(item.text));
  if (highlight)
    return {
      kind: 'passage',
      text: excerpt(highlight.text, query),
      highlightId: String(highlight._id),
      anchor: highlight.anchor
    };
  if (has(plainTextFrom(article.content || '')))
    return { kind: 'body', text: excerpt(article.content, query), query };
  const record = [article.author, article.siteName, article.url]
    .filter(Boolean)
    .join(' · ');
  return has(record) ? { kind: 'record', text: record } : null;
};

const buildLibraryCollectionRouter = ({
  auth,
  humanOnly,
  mongoose,
  Article,
  ArticleReadingState
}) => {
  const router = express.Router();
  router.get('/api/library/collection/traces', auth, humanOnly, async (req, res) => {
    const ids = [...new Set(String(req.query.ids || '').split(',').map(value => value.trim()).filter(Boolean))];
    if (!ids.length || ids.length > 100 || ids.some(id => !mongoose.isValidObjectId(id))) {
      return res.sendStatus(400);
    }
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const rows = await traceSummariesFor(Article, {
        userId,
        _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) }
      });
      return res
        .set('Cache-Control', 'no-store')
        .json({
          traces: rows.map(row => ({
            articleId: String(row._id),
            trace: personalTrace(row)
          })).filter(row => row.trace)
        });
    } catch (_) {
      return res.status(503).json({ error: 'Personal traces could not load.' });
    }
  });

  router.get('/api/library/collection', auth, humanOnly, async (req, res) => {
    const {
      scope = 'all',
      folderId = '',
      query = '',
      sort = 'recent',
      offset = '0',
      limit = '40',
      showSuppressed = '0'
    } = req.query;
    if (
      ![
        'all',
        'folder',
        'unfiled',
        'later',
        'set-aside',
        'kept',
        'feed'
      ].includes(scope) ||
      !['recent', 'oldest', 'title'].includes(sort) ||
      typeof query !== 'string' ||
      query.length > 200 ||
      !Number.isSafeInteger(Number(offset)) ||
      Number(offset) < 0 ||
      Number(offset) > 100000 ||
      !Number.isInteger(Number(limit)) ||
      Number(limit) < 1 ||
      Number(limit) > 100 ||
      (['folder', 'feed'].includes(scope) &&
        !mongoose.isValidObjectId(folderId))
    )
      return res.sendStatus(400);
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);
      const match = { userId };
      if (showSuppressed !== '1')
        Object.assign(match, {
          archived: { $ne: true },
          debugOnly: { $ne: true },
          hiddenFromHome: { $ne: true }
        });
      if (['folder', 'feed'].includes(scope))
        match.folder = new mongoose.Types.ObjectId(folderId);
      if (scope === 'unfiled') match.folder = null;
      if (scope === 'later') match.placement = 'later';
      if (scope === 'set-aside') match.placement = 'setAside';
      if (scope === 'kept') match.evergreen = true;
      const needle = query.replace(/\s+/g, ' ').trim();
      const ordering =
        sort === 'title'
          ? { title: 1, _id: 1 }
          : {
              createdAt: sort === 'oldest' ? 1 : -1,
              _id: sort === 'oldest' ? 1 : -1
            };
      const metadataSelection =
        'title url author siteName createdAt folder evergreen placement';
      const searchSelection = `${metadataSelection} content highlights`;
      let total, rows;
      if (needle) {
        // Search the owned corpus, not the loaded page. Streaming keeps the
        // working set bounded and validates matches against visible text,
        // including phrases spanning HTML tags, before counting or paginating.
        total = 0;
        rows = [];
        const cursor = Article.find(match)
          .select(searchSelection)
          .sort(ordering)
          .maxTimeMS(10000)
          .lean()
          .cursor();
        try {
          for await (const row of cursor) {
            if (!searchMatch(row, needle)) continue;
            if (total >= Number(offset) && rows.length < Number(limit))
              rows.push(row);
            total += 1;
          }
        } finally {
          await cursor.close();
        }
      } else {
        [total, rows] = await Promise.all([
          Article.countDocuments(match).maxTimeMS(10000),
          Article.find(match)
            .select(metadataSelection)
            .sort(ordering)
            .skip(Number(offset))
            .limit(Number(limit))
            .maxTimeMS(10000)
            .lean()
        ]);
      }
      await Article.populate(rows, {
        path: 'folder',
        select: 'name asFeed',
        match: { userId }
      });
      const places = await ArticleReadingState.find({
        userId,
        articleId: { $in: rows.map((row) => row._id) }
      }).lean();
      const byId = new Map(
        places.map((row) => [String(row.articleId), projectReadingPlace(row)])
      );
      const items = rows.map((row) => {
        const readingState = byId.get(String(row._id)) || null;
        const withPlace = { ...row, readingState };
        return {
          _id: String(row._id),
          title: row.title,
          url: row.url,
          author: row.author,
          siteName: row.siteName,
          createdAt: row.createdAt,
          folder: row.folder,
          evergreen: Boolean(row.evergreen),
          placement: row.placement || 'stream',
          readingState,
          trace: personalTrace(withPlace),
          match: searchMatch(row, needle)
        };
      });
      res
        .set('Cache-Control', 'no-store')
        .json({
          items,
          total,
          nextOffset:
            Number(offset) + rows.length < total
              ? Number(offset) + rows.length
              : null,
          coverage: 'saved-corpus',
          query: needle
        });
    } catch (_) {
      res
        .status(503)
        .json({ error: 'Your collection could not load. Please retry.' });
    }
  });
  return router;
};
module.exports = { buildLibraryCollectionRouter, personalTrace, searchMatch };
