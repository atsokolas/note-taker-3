const express = require('express');
const {
  buildKnowledgeMovements,
  buildKnowledgeMovementEpisodes,
  buildWeeklyDigest
} = require('../services/knowledgeMovementService');
const { buildFieldReadiness } = require('../services/fieldReadinessService');

const parseSince = value => {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw)) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const parseLimit = value => {
  if (value === undefined || value === null || value === '') return 10;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return Math.min(parsed, 50);
};

const buildKnowledgeMovementRouter = ({
  authenticateToken,
  WikiPage,
  WikiRevision,
  WikiSourceEvent,
  TagMeta,
  NoeisReceipt,
  Article,
  NotebookEntry,
  Question,
  Connection,
  ReferenceEdge
} = {}) => {
  const router = express.Router();
  const models = {
    WikiPage, WikiRevision, WikiSourceEvent, TagMeta, NoeisReceipt,
    Article, NotebookEntry, Question, Connection, ReferenceEdge
  };

  router.get('/api/knowledge/movements', authenticateToken, async (req, res) => {
    const since = parseSince(req.query.since);
    if (since === undefined) {
      return res.status(400).json({ error: 'since must be an ISO-8601 UTC timestamp.' });
    }
    const limit = parseLimit(req.query.limit);
    if (limit === undefined) {
      return res.status(400).json({ error: 'limit must be a positive integer.' });
    }

    try {
      const movements = await buildKnowledgeMovements({
        userId: req.user.id,
        models,
        since,
        limit: 50
      });
      return res.status(200).json({
        movements: buildKnowledgeMovementEpisodes(movements).slice(0, limit),
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error building knowledge movements:', error);
      return res.status(500).json({ error: 'Failed to build knowledge movements.' });
    }
  });

  router.get('/api/knowledge/field/readiness', authenticateToken, async (req, res) => {
    try {
      const readiness = await buildFieldReadiness({ userId: req.user.id, models });
      return res.status(200).json(readiness);
    } catch (error) {
      console.error('Error building Field readiness:', error);
      return res.status(500).json({ error: 'Failed to evaluate Field readiness.' });
    }
  });

  router.get('/api/knowledge/movements/weekly', authenticateToken, async (req, res) => {
    try {
      const digest = await buildWeeklyDigest({ userId: req.user.id, models, asOf: new Date() });
      return res.status(200).json(digest);
    } catch (error) {
      console.error('Error building weekly digest:', error);
      return res.status(500).json({ error: 'Failed to build the weekly digest.' });
    }
  });

  return router;
};

module.exports = {
  buildKnowledgeMovementRouter,
  parseSince,
  parseLimit
};
