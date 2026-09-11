const { listRecentExplorations, searchAuthoredWork } = require('../services/authoredWorkDiscovery');
const express = require('express');
const {
  AuthoredExplorationError,
  deleteExploration,
  keepExploration,
  listExplorations,
  putExploration
} = require('../services/authoredExplorationService');

const buildAuthoredExplorationRouter = ({
  authenticateToken,
  AuthoredExploration,
  WikiPage,
  Article,
  NotebookEntry,
  Question,
  createBlockId,
  onNotebookKept = async () => {},
  onQuestionKept = async () => {}
}) => {
  const router = express.Router();
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
      return res.status(200).json({ explorations, userId: String(req.user.id) });
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
      return res.status(exploration.revision === 1 && !exploration.idempotent ? 201 : 200).json({ exploration });
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

  return router;
};

module.exports = { buildAuthoredExplorationRouter };
