const { listRecentExplorations, searchAuthoredWork } = require('../services/authoredWorkDiscovery');
const express = require('express');
const { ownedWork, saveVersion } = require('../services/authoredWorkRecovery');
const {
  AuthoredExplorationError,
  deleteExploration,
  keepExploration,
  listExplorations,
  putExploration,
  serializeExploration
} = require('../services/authoredExplorationService');
const {
  AuthoredSourceCorrectionError,
  attachAuthoredSourceCorrection,
  disposeAuthoredSourceCorrection
} = require('../services/authoredSourceCorrection');

const buildAuthoredExplorationRouter = ({
  authenticateToken,
  AuthoredExploration,
  WikiPage,
  Article,
  NotebookEntry,
  Question,
  createBlockId,
  WikiSourceEvent = null,
  NoeisReceipt = null,
  onNotebookKept = async () => {},
  onQuestionKept = async () => {}
}) => {
  const router = express.Router();
  const correctionModels = () => ({ WikiSourceEvent, NoeisReceipt });
  const withCorrection = async (userId, exploration) => attachAuthoredSourceCorrection({
    models: correctionModels(),
    userId,
    objectType: 'exploration',
    object: exploration
  });
  const humanOnly = (req, res, next) => {
    if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
      return res.status(403).json({ error: 'Only the human owner can access private authored work.' });
    }
    return next();
  };
  const sendError = (res, error) => {
    if (error instanceof AuthoredExplorationError) {
      return res.status(error.status).json({ code: error.code, error: error.message, ...error.details });
    }
    console.error('Error handling authored exploration:', error);
    return res.status(500).json({ error: 'Private authored work is temporarily unavailable.' });
  };

  router.get('/api/authored-explorations/:workId', authenticateToken, humanOnly, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const row = await ownedWork({ AuthoredExploration, userId: req.user.id, workId: req.params.workId });
      return res.json({
        exploration: await withCorrection(req.user.id, serializeExploration(row)),
        versions: row.savedVersions || [],
        userId: String(req.user.id)
      });
    } catch (error) { return sendError(res, error); }
  });

  router.post('/api/authored-explorations/:workId/versions', authenticateToken, humanOnly, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const versions = await saveVersion({ AuthoredExploration, userId: req.user.id, workId: req.params.workId, expectedRevision: req.body?.expectedRevision });
      return res.json({ versions });
    } catch (error) { return sendError(res, error); }
  });

  router.get('/api/authored-work/search', authenticateToken, humanOnly, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      if (typeof req.query.q !== 'string') return res.status(400).json({ error: 'Enter a phrase to find your writing.' });
      const result = await searchAuthoredWork({ NotebookEntry, AuthoredExploration, WikiPage, Article, userId: req.user.id, query: req.query.q });
      return res.status(200).json(result);
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message });
      return sendError(res, error);
    }
  });

  router.get('/api/authored-explorations', authenticateToken, humanOnly, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const explorations = await listRecentExplorations({ AuthoredExploration, WikiPage, Article, userId: req.user.id });
      return res.status(200).json({ explorations });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get(['/api/wiki/pages/:pageId/explorations', '/api/library/articles/:articleId/explorations'], authenticateToken, humanOnly, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const explorations = await listExplorations({
        AuthoredExploration,
        WikiPage,
        Article,
        userId: req.user.id,
        pageId: req.params.pageId,
        articleId: req.params.articleId,
        highlightId: req.params.highlightId,
        claimId: req.query.claimId
      });
      return res.status(200).json({
        explorations: await Promise.all(explorations.map((exploration) => withCorrection(req.user.id, exploration))),
        userId: String(req.user.id)
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.put(['/api/wiki/pages/:pageId/claims/:claimId/exploration', '/api/library/articles/:articleId/highlights/:highlightId/exploration'], authenticateToken, humanOnly, async (req, res) => {
    try {
      const exploration = await putExploration({
        AuthoredExploration,
        WikiPage,
        Article,
        userId: req.user.id,
        pageId: req.params.pageId,
        articleId: req.params.articleId,
        highlightId: req.params.highlightId,
        claimId: req.params.claimId,
        expectedRevision: req.body?.expectedRevision,
        mutationId: req.body?.mutationId,
        draft: req.body?.draft
      });
      return res.status(exploration.revision === 1 && !exploration.idempotent ? 201 : 200).json({
        exploration: await withCorrection(req.user.id, exploration)
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.delete(['/api/wiki/pages/:pageId/claims/:claimId/exploration', '/api/library/articles/:articleId/highlights/:highlightId/exploration'], authenticateToken, humanOnly, async (req, res) => {
    try {
      await deleteExploration({
        AuthoredExploration,
        WikiPage,
        userId: req.user.id,
        pageId: req.params.pageId,
        articleId: req.params.articleId,
        highlightId: req.params.highlightId,
        claimId: req.params.claimId,
        expectedRevision: req.body?.expectedRevision ?? req.headers['if-match']
      });
      return res.status(204).end();
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post(['/api/wiki/pages/:pageId/claims/:claimId/exploration/keep', '/api/library/articles/:articleId/highlights/:highlightId/exploration/keep'], authenticateToken, humanOnly, async (req, res) => {
    try {
      const result = await keepExploration({
        AuthoredExploration,
        WikiPage,
        Article,
        NotebookEntry,
        Question,
        userId: req.user.id,
        pageId: req.params.pageId,
        articleId: req.params.articleId,
        highlightId: req.params.highlightId,
        claimId: req.params.claimId,
        expectedRevision: req.body?.expectedRevision,
        mutationId: req.body?.mutationId,
        destination: req.body?.destination,
        createBlockId,
        onNotebookKept,
        onQuestionKept
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  const settleExplorationCorrection = async (req, res, row) => {
    if (!row) return sendError(res, new AuthoredExplorationError('Private work not found.', 404, 'exploration_not_found'));
    try {
      const result = await disposeAuthoredSourceCorrection({
        models: correctionModels(),
        userId: req.user.id,
        objectType: 'exploration',
        object: row,
        eventId: req.body?.eventId,
        action: req.body?.action
      });
      return res.status(200).json({
        sourceCorrection: result.preview,
        receipt: result.receipt,
        replay: Boolean(result.replay),
        exploration: await withCorrection(req.user.id, serializeExploration(row))
      });
    } catch (error) {
      if (error instanceof AuthoredSourceCorrectionError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      return sendError(res, error);
    }
  };

  router.post('/api/authored-explorations/:workId/source-correction', authenticateToken, humanOnly, async (req, res) => {
    try {
      const row = await ownedWork({ AuthoredExploration, userId: req.user.id, workId: req.params.workId });
      return settleExplorationCorrection(req, res, row);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post([
    '/api/wiki/pages/:pageId/claims/:claimId/exploration/source-correction',
    '/api/library/articles/:articleId/highlights/:highlightId/exploration/source-correction'
  ], authenticateToken, humanOnly, async (req, res) => {
    try {
      const filter = req.params.articleId
        ? { userId: req.user.id, articleId: req.params.articleId, highlightId: req.params.highlightId }
        : { userId: req.user.id, pageId: req.params.pageId, claimId: req.params.claimId };
      const row = await AuthoredExploration.findOne(filter);
      return settleExplorationCorrection(req, res, row);
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
};

module.exports = { buildAuthoredExplorationRouter };
