const express = require('express');
const mongoose = require('mongoose');
const { persistResearchLedgerEntry } = require('../services/researchOperatingLedgerService');

const idOf = value => String(value?._id || value?.id || value || '').trim();

const requireHumanOwner = (req, res, next) => {
  if (req.agentToken || req.authInfo?.tokenSource === 'agent-token') {
    return res.status(403).json({ error: 'Only the human owner can record research-ledger entries.' });
  }
  return next();
};

const statusForError = (error = {}) => {
  const message = String(error?.message || '');
  if (/not found/i.test(message)) return 404;
  if (['RESEARCH_LEDGER_IDEMPOTENCY_CONFLICT', 'RESEARCH_LEDGER_RECEIPT_INTEGRITY'].includes(error?.code)
    || /idempotency key already exists|semantic integrity/i.test(message)) return 409;
  if (/invalid|required|must |supported|living thesis|belong to the human owner/i.test(message)) return 400;
  return 500;
};

const findOwnedPage = async ({ WikiPage, userId, pageId }) => {
  if (!pageId || !WikiPage?.findOne) return null;
  const query = WikiPage.findOne({ _id: pageId, userId, status: { $ne: 'archived' } });
  return query && typeof query.lean === 'function' ? query.lean() : query;
};

const validateLedgerTargets = async ({ WikiPage, userId, thesisPageId, evidencePageIds = [] } = {}) => {
  if (!mongoose.Types.ObjectId.isValid(String(thesisPageId || ''))) throw new Error('Invalid living thesis page id.');
  if (evidencePageIds !== undefined && !Array.isArray(evidencePageIds)) throw new Error('evidencePageIds must be an array.');
  const thesis = await findOwnedPage({ WikiPage, userId, pageId: thesisPageId });
  if (!thesis) throw new Error('Living thesis page not found.');
  if (thesis.judgment?.kind !== 'thesis') throw new Error('Research-ledger entries require a living thesis page.');

  const uniqueEvidenceIds = Array.from(new Set(
    (Array.isArray(evidencePageIds) ? evidencePageIds : []).map(idOf).filter(Boolean)
  ));
  if (uniqueEvidenceIds.length > 80) throw new Error('evidencePageIds supports at most 80 pages.');
  for (const evidencePageId of uniqueEvidenceIds) {
    if (!mongoose.Types.ObjectId.isValid(evidencePageId)) throw new Error('Invalid evidence wiki page id.');
    const evidencePage = await findOwnedPage({ WikiPage, userId, pageId: evidencePageId });
    if (!evidencePage) throw new Error('Every evidence page must belong to the human owner and remain active.');
  }
  return { thesis, evidencePageIds: uniqueEvidenceIds };
};

const buildResearchOperatingLedgerHandlers = ({
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  buildUniqueSlug,
  persistEntry = persistResearchLedgerEntry,
  now = () => new Date()
} = {}) => ({
  recordEntry: async (req, res) => {
    try {
      const targets = await validateLedgerTargets({
        WikiPage,
        userId: req.user.id,
        thesisPageId: req.body?.thesisPageId,
        evidencePageIds: req.body?.evidencePageIds
      });
      const result = await persistEntry({
        WikiPage,
        WikiRevision,
        NoeisReceipt,
        buildUniqueSlug,
        userId: req.user.id,
        thesisPageId: idOf(targets.thesis),
        thesisTitle: targets.thesis.title,
        month: req.body?.month,
        phase: req.body?.phase,
        status: req.body?.status,
        summary: req.body?.summary,
        priorOrDecision: req.body?.priorOrDecision,
        unknowns: req.body?.unknowns,
        evidencePageIds: targets.evidencePageIds,
        dispositions: req.body?.dispositions,
        friction: req.body?.friction,
        outputType: req.body?.outputType,
        nextAction: req.body?.nextAction,
        entryKey: req.body?.entryKey,
        recordedAt: now()
      });
      return res.status(result.created ? 201 : 200).json({
        created: result.created,
        idempotent: result.idempotent,
        ledgerPageId: idOf(result.page) || idOf(result.receipt?.provenance?.ledgerPageId),
        revisionId: idOf(result.revision) || idOf(result.receipt?.provenance?.revisionId),
        entry: result.entry,
        receipt: result.receipt
      });
    } catch (error) {
      const status = statusForError(error);
      return res.status(status).json({
        error: status === 500 ? 'Failed to record research-ledger entry.' : error.message
      });
    }
  }
});

const buildResearchOperatingLedgerRouter = ({ authenticateToken, ...dependencies } = {}) => {
  const router = express.Router();
  const handlers = buildResearchOperatingLedgerHandlers(dependencies);
  router.post('/api/wiki/research-ledger/entries', authenticateToken, requireHumanOwner, handlers.recordEntry);
  return router;
};

module.exports = {
  buildResearchOperatingLedgerHandlers,
  buildResearchOperatingLedgerRouter,
  findOwnedPage,
  requireHumanOwner,
  statusForError,
  validateLedgerTargets
};
