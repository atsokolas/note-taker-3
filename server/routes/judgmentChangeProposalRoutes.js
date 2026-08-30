const express = require('express');
const {
  JudgmentChangeProposalError,
  buildJudgmentChangeProposal,
  planJudgmentChangeDisposition
} = require('../services/judgmentChangeProposalService');
const { normalizeJudgment } = require('../services/wikiJudgmentService');
const { createWikiRevision, snapshotPage } = require('../services/wikiRevisionService');
const { persistNoeisReceipt, serializeStoredReceipt } = require('../services/noeisReceiptService');

const serializeId = value => String(value?._id || value?.id || value || '');

const sendError = (res, error, fallback) => res.status(error.statusCode || 500).json({
  code: error.code || 'JUDGMENT_CHANGE_PROPOSAL_FAILED',
  error: error.message || fallback
});

const buildJudgmentChangeProposalRouter = ({
  authenticateToken,
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  findOwnedPage,
  serializePage,
  onPageChanged = async () => {}
}) => {
  const router = express.Router();

  router.get('/api/wiki/pages/:id/judgment-change-proposal', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req).select('_id judgment.currentJudgment').lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      if (!NoeisReceipt?.findOne) return res.status(200).json({ proposal: null });
      let query = NoeisReceipt.findOne({
        userId: req.user.id,
        kind: 'judgment_change_proposal',
        'provenance.pageId': serializeId(page._id)
      });
      query = query.sort?.({ createdAt: -1 }) || query;
      return res.status(200).json({ proposal: serializeStoredReceipt(await query) });
    } catch (error) {
      console.error('Error loading judgment change proposal:', error);
      return res.status(500).json({ error: 'Failed to load the judgment change proposal.' });
    }
  });

  router.post('/api/wiki/pages/:id/judgment-change-proposals', authenticateToken, async (req, res) => {
    try {
      if (req.agentToken) {
        return res.status(403).json({ error: 'Only the human owner can propose changing what they hold.' });
      }
      if (!NoeisReceipt) return res.status(503).json({ error: 'Judgment receipts are unavailable.' });
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const proposal = buildJudgmentChangeProposal({
        page,
        proposedJudgment: req.body?.proposedJudgment
      });
      const existing = NoeisReceipt.findOne
        ? serializeStoredReceipt(await NoeisReceipt.findOne({ userId: req.user.id, receiptId: proposal.id }))
        : null;
      if (existing) return res.status(200).json({ proposal: existing });
      const stored = await persistNoeisReceipt({ NoeisReceipt, userId: req.user.id, receipt: proposal });
      return res.status(201).json({ proposal: stored || proposal });
    } catch (error) {
      if (!(error instanceof JudgmentChangeProposalError)) {
        console.error('Error proposing judgment change:', error);
      }
      return sendError(res, error, 'Failed to propose the judgment change.');
    }
  });

  router.post('/api/wiki/pages/:id/judgment-change-proposals/:action', authenticateToken, async (req, res) => {
    let session = null;
    try {
      if (req.agentToken) {
        return res.status(403).json({ error: 'Only the human owner can resolve a judgment change.' });
      }
      if (!NoeisReceipt) return res.status(503).json({ error: 'Judgment receipts are unavailable.' });

      const resolve = async (activeSession = null) => {
        let pageQuery = WikiPage.findOne({ _id: req.params.id, userId: req.user.id });
        if (activeSession && pageQuery.session) pageQuery = pageQuery.session(activeSession);
        const page = await pageQuery;
        if (!page) throw new JudgmentChangeProposalError('Wiki page not found.', 404);

        let receiptQuery = NoeisReceipt.findOne({
          userId: req.user.id,
          receiptId: String(req.body?.receiptId || '').trim()
        });
        if (activeSession && receiptQuery.session) receiptQuery = receiptQuery.session(activeSession);
        const planned = planJudgmentChangeDisposition({
          receipt: await receiptQuery,
          page,
          action: req.params.action,
          deferUntil: req.body?.deferUntil
        });
        if (planned.replay) return { page, receipt: planned.receipt, revision: null, changed: false };

        let revision = null;
        if (planned.judgment) {
          const before = snapshotPage(page);
          page.judgment = normalizeJudgment({
            input: planned.judgment,
            existing: page.judgment,
            actorType: 'user',
            pageId: serializeId(page._id)
          });
          page.markModified?.('judgment');
          await page.save(activeSession ? { session: activeSession } : undefined);
          revision = await createWikiRevision({
            WikiRevision,
            userId: req.user.id,
            page,
            before,
            reason: 'user_edit',
            actorType: 'user',
            summary: 'Accepted a reviewed change to the held judgment.',
            session: activeSession
          });
        }
        const receipt = await persistNoeisReceipt({
          NoeisReceipt,
          userId: req.user.id,
          receipt: planned.receipt,
          session: activeSession
        });
        return {
          page,
          receipt: receipt || serializeStoredReceipt(planned.receipt),
          revision,
          changed: Boolean(planned.judgment)
        };
      };

      let result;
      if (typeof WikiPage?.db?.startSession === 'function') {
        session = await WikiPage.db.startSession();
        await session.withTransaction(async () => { result = await resolve(session); });
      } else {
        result = await resolve();
      }
      if (result.changed) await onPageChanged(result.page, req.user.id);
      return res.status(200).json({
        page: serializePage(result.page),
        proposal: result.receipt,
        revisionId: serializeId(result.revision?._id)
      });
    } catch (error) {
      if (!(error instanceof JudgmentChangeProposalError) && !error.statusCode) {
        console.error('Error resolving judgment change proposal:', error);
      }
      return sendError(res, error, 'Failed to resolve the judgment change.');
    } finally {
      if (session) await session.endSession().catch(() => null);
    }
  });

  return router;
};

module.exports = { buildJudgmentChangeProposalRouter };
