const express = require('express');
const {
  EditionShapeError,
  emptySections,
  normalizeEdition,
  resolveEditionProfile
} = require('../services/editionShape');

/**
 * The newsstand.
 *
 * An agent the reader already has writes the paper; this is where it lands,
 * where they read it, and where a source they liked crosses over into their
 * own library.
 *
 * No review ceremony. A bespoke paper only its reader sees does not need a
 * committee — it needs to be honest about being agent-written, which the
 * masthead does. Approval belongs to publishing something publicly, and
 * nothing here is public.
 */

const serializeItem = (item = {}) => ({
  itemId: item.itemId,
  title: item.title,
  url: item.url,
  sourceLabel: item.sourceLabel || '',
  sourceDate: item.sourceDate || '',
  section: item.section || '',
  finding: item.finding,
  boundary: item.boundary,
  note: item.note || '',
  savedArticleId: item.savedArticleId ? String(item.savedArticleId) : null
});

const serializeEdition = (edition = {}, { withItems = true } = {}) => {
  const profile = resolveEditionProfile(edition.profile);
  const items = (edition.items || []).map(serializeItem);
  return {
    _id: String(edition._id),
    profile: edition.profile,
    profileLabel: profile?.titleLabel || edition.profile,
    issueLabel: profile?.issueLabel || 'Edition',
    sections: profile?.sections || [],
    title: edition.title,
    number: edition.number ?? null,
    windowStart: edition.windowStart,
    windowEnd: edition.windowEnd,
    standfirst: edition.standfirst || '',
    throughLine: edition.throughLine || '',
    watchNext: edition.watchNext || [],
    writtenBy: edition.writtenBy?.label || '',
    /* Said on every edition, on the stand and on the page: the sections this
       week never filled, and how many of its sources the reader has taken. */
    unfilled: emptySections({ profile: edition.profile, items }).map(section => section.label),
    itemCount: items.length,
    savedCount: items.filter(item => item.savedArticleId).length,
    createdAt: edition.createdAt,
    updatedAt: edition.updatedAt,
    ...(withItems ? { items } : {})
  };
};

const buildEditionRouter = ({
  auth,
  humanOnly = (_req, _res, next) => next(),
  Edition,
  Article,
  onArticleSaved = () => {}
} = {}) => {
  const router = express.Router();

  const refuse = (res, error, fallback) => {
    if (error instanceof EditionShapeError) {
      return res.status(400).json({ error: error.message, field: error.field || '' });
    }
    console.error(`❌ ${fallback}`, error);
    return res.status(500).json({ error: fallback });
  };

  /**
   * An agent hands over a week.
   *
   * Asked twice for the same window, it replaces its own edition rather than
   * printing Tuesday twice — a maintained paper is a thing an agent keeps
   * current, not a pile of drafts. Saves the reader already made survive the
   * rewrite, because those are the reader's, not the agent's.
   */
  router.post('/api/editions', auth, async (req, res) => {
    try {
      const built = normalizeEdition(req.body);
      const userId = req.user.id;
      const existing = await Edition.findOne({
        userId,
        profile: built.profile,
        windowStart: built.windowStart,
        windowEnd: built.windowEnd
      });

      const keptSaves = new Map(
        (existing?.items || [])
          .filter(item => item.savedArticleId)
          .map(item => [item.url, item.savedArticleId])
      );
      const items = built.items.map(item => ({
        ...item,
        savedArticleId: keptSaves.get(item.url) || null
      }));

      const writtenBy = {
        label: String(req.body?.writtenBy || req.agentToken?.name || '').trim().slice(0, 200),
        agentTokenId: req.agentToken?.id || null
      };

      const saved = existing
        ? await Edition.findOneAndUpdate(
          { _id: existing._id, userId },
          { ...built, items, writtenBy },
          { new: true }
        )
        : await Edition.create({ ...built, items, writtenBy, userId });

      return res.status(existing ? 200 : 201).json(serializeEdition(saved));
    } catch (error) {
      return refuse(res, error, 'Failed to file the edition.');
    }
  });

  /* The stand. Newest window first, and each row carries the two sentences
     that matter: what the week left empty, and how much of it you took. */
  router.get('/api/editions', auth, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const profile = resolveEditionProfile(req.query?.profile);
      if (profile) query.profile = profile.key;
      const editions = await Edition.find(query)
        .sort({ windowEnd: -1, createdAt: -1 })
        .limit(Math.min(Number(req.query?.limit) || 40, 100))
        .lean();
      return res.status(200).json({ editions: editions.map(edition => serializeEdition(edition, { withItems: false })) });
    } catch (error) {
      return refuse(res, error, 'Failed to open the newsstand.');
    }
  });

  router.get('/api/editions/:id', auth, async (req, res) => {
    try {
      const edition = await Edition.findOne({ _id: req.params.id, userId: req.user.id }).lean();
      if (!edition) return res.status(404).json({ error: 'No such edition.' });
      return res.status(200).json(serializeEdition(edition));
    } catch (error) {
      return refuse(res, error, 'Failed to open the edition.');
    }
  });

  /**
   * The save door.
   *
   * Every other surface in this product reads library to wiki: a page cites
   * what you already own. An edition runs the other way — it cites what an
   * agent found and you have not taken. This is the one crossing, and it is
   * what makes the paper an intake surface rather than something you read and
   * close.
   *
   * The row it makes is the same row the extension makes, keyed on the URL,
   * so saving a source you already own adopts your copy instead of forking it.
   */
  router.post('/api/editions/:id/items/:itemId/save', auth, humanOnly, async (req, res) => {
    try {
      const userId = req.user.id;
      const edition = await Edition.findOne({ _id: req.params.id, userId });
      if (!edition) return res.status(404).json({ error: 'No such edition.' });
      const item = (edition.items || []).find(entry => entry.itemId === req.params.itemId);
      if (!item) return res.status(404).json({ error: 'No such item in this edition.' });

      const article = await Article.findOneAndUpdate(
        { url: item.url, userId },
        {
          $setOnInsert: {
            url: item.url,
            userId,
            title: item.title,
            content: '',
            siteName: item.sourceLabel || '',
            publicationDate: item.sourceDate || '',
            highlights: []
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      item.savedArticleId = article._id;
      await edition.save();
      onArticleSaved(article, { userId });

      return res.status(200).json({
        articleId: String(article._id),
        edition: serializeEdition(edition)
      });
    } catch (error) {
      return refuse(res, error, 'Failed to save that source.');
    }
  });

  /* A paper you did not want. Human only: an agent that could delete its own
     back issues could quietly rewrite what it told you last week. */
  router.delete('/api/editions/:id', auth, humanOnly, async (req, res) => {
    try {
      const removed = await Edition.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
      if (!removed) return res.status(404).json({ error: 'No such edition.' });
      return res.status(200).json({ removed: true });
    } catch (error) {
      return refuse(res, error, 'Failed to remove the edition.');
    }
  });

  return router;
};

module.exports = { buildEditionRouter, serializeEdition, serializeItem };
