const express = require('express');
const { requireAuthenticatedUser } = require('./conceptRouteGuards');
const {
  InstitutionError,
  exportInstitution,
  importInstitution: persistImport,
  readAdapter,
  readAudit,
  readCalibration,
  readMemory
} = require('../services/institutionService');
const { DecisionMemoryError } = require('../services/decisionMemory');
const { PortabilityError } = require('../services/institutionalPortability');

const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || '').trim());
const exportSecret = () => process.env.CASEBOOK_EXPORT_SECRET || process.env.JWT_SECRET || '';

const sendError = (res, error) => {
  if (
    error instanceof InstitutionError
    || error instanceof DecisionMemoryError
    || error instanceof PortabilityError
  ) {
    return res.status(error.status || 400).json({ error: error.message, code: error.code });
  }
  console.error('Error in decision memory:', error);
  return res.status(500).json({ error: 'Failed to read decision memory.' });
};

const buildDecisionMemoryRouter = ({
  authenticateToken,
  readCase = readMemory,
  readCaseAdapter = readAdapter,
  readCaseAudit = readAudit,
  readCaseCalibration = readCalibration,
  exportCases = exportInstitution,
  importCases = persistImport,
  ...models
} = {}) => {
  const router = express.Router();
  const deps = { ...models };

  router.get('/api/decision-memory/v1/cases/:pageId', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const memory = await readCase({
        ...deps,
        userId: req.user.id,
        pageId: req.params.pageId
      });
      return res.status(200).json({ schema: 'decision-memory.v1', memory });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/decision-memory/v1/cases/:pageId/adapter', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    if (!isObjectId(req.params.pageId)) return res.status(400).json({ error: 'pageId must be a valid object id.' });
    try {
      const result = await readCaseAdapter({
        ...deps,
        userId: req.user.id,
        pageId: req.params.pageId
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/decision-memory/v1/audit', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    try {
      const pageId = isObjectId(req.query.pageId) ? req.query.pageId : '';
      const audit = await readCaseAudit({
        ...deps,
        userId: req.user.id,
        pageId
      });
      return res.status(200).json(audit);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/decision-memory/v1/calibration', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    try {
      const calibration = await readCaseCalibration({ ...deps, userId: req.user.id });
      return res.status(200).json({ calibration });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get('/api/decision-memory/v1/export', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    try {
      const bundle = await exportCases({
        ...deps,
        userId: req.user.id,
        secret: exportSecret()
      });
      return res.status(200).json({ bundle });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/api/decision-memory/v1/import', authenticateToken, requireAuthenticatedUser, async (req, res) => {
    try {
      const result = await importCases({
        bundle: req.body?.bundle || req.body,
        secret: exportSecret()
      });
      return res.status(200).json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
};

module.exports = { buildDecisionMemoryRouter };
