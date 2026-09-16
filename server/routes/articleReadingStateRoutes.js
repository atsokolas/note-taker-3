const express = require('express');

const validReadingPlace = ({ anchor, ratio } = {}) =>
  Boolean(
    anchor &&
      typeof anchor.text === 'string' &&
      anchor.text.trim() &&
      anchor.text.length <= 6000 &&
      typeof anchor.prefix === 'string' &&
      anchor.prefix.length <= 240 &&
      typeof anchor.suffix === 'string' &&
      anchor.suffix.length <= 240 &&
      Number.isSafeInteger(anchor.startOffsetApprox) &&
      anchor.startOffsetApprox >= 0 &&
      typeof ratio === 'number' &&
      Number.isFinite(ratio) &&
      ratio >= 0 &&
      ratio <= 1
  );
const projectReadingPlace = (row) =>
  row
    ? { anchor: row.anchor, ratio: row.ratio, visitedAt: row.visitedAt }
    : null;

const buildArticleReadingStateRouter = ({
  auth,
  humanOnly,
  Article,
  ArticleReadingState
}) => {
  const router = express.Router();
  const owned = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!(await Article.exists({ _id: req.params.id, userId: req.user.id })))
        return res.sendStatus(404);
      next();
    } catch (error) {
      res.sendStatus(error.name === 'CastError' ? 404 : 503);
    }
  };
  const path = '/api/articles/:id/reading-state';
  router.get(path, auth, humanOnly, owned, async (req, res) => {
    try {
      const row = await ArticleReadingState.findOne({
        userId: req.user.id,
        articleId: req.params.id
      }).lean();
      // Do not return a stale private place when deletion wins after `owned`.
      if (
        row &&
        !(await Article.exists({ _id: req.params.id, userId: req.user.id }))
      ) {
        await ArticleReadingState.deleteMany({
          userId: req.user.id,
          articleId: req.params.id
        });
        return res.sendStatus(404);
      }
      res.json({ readingState: projectReadingPlace(row) });
    } catch (_) {
      res
        .status(503)
        .json({ error: 'Reading place is temporarily unavailable.' });
    }
  });
  router.put(path, auth, humanOnly, owned, async (req, res) => {
    if (!validReadingPlace(req.body || {}))
      return res
        .status(400)
        .json({
          error: 'A bounded passage anchor and ratio from 0 to 1 are required.'
        });
    const { text, prefix, suffix, startOffsetApprox } = req.body.anchor;
    const scope = { userId: req.user.id, articleId: req.params.id };
    const update = {
      anchor: { text, prefix, suffix, startOffsetApprox },
      ratio: req.body.ratio,
      visitedAt: new Date()
    };
    try {
      let row;
      try {
        row = await ArticleReadingState.findOneAndUpdate(
          scope,
          { $set: update },
          { upsert: true, new: true, runValidators: true }
        ).lean();
      } catch (error) {
        if (error.code !== 11000) throw error;
        row = await ArticleReadingState.findOneAndUpdate(
          scope,
          { $set: update },
          { new: true, runValidators: true }
        ).lean();
      }
      // A deletion may have won between the ownership check and the upsert.
      if (
        !(await Article.exists({ _id: req.params.id, userId: req.user.id }))
      ) {
        await ArticleReadingState.deleteMany(scope);
        return res.sendStatus(404);
      }
      res.json({ readingState: projectReadingPlace(row) });
    } catch (_) {
      res
        .status(503)
        .json({
          error: 'Reading place did not sync. Reading remains available.'
        });
    }
  });
  return router;
};
module.exports = {
  buildArticleReadingStateRouter,
  validReadingPlace,
  projectReadingPlace
};
