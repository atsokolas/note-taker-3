const express = require('express');
const { createWeekendReadingsDraft } = require('../services/weekendReadingsService');
const {
  approveWeekendReadingsRevision,
  findCurrentRevision,
  loadWorkflowContext,
  publishWeekendReadingsRevision,
  requestWeekendReadingsReview
} = require('../services/weekendReadingsWorkflowService');
const { deriveApprovalState, persistLifecycleReceipt } = require('../services/weekendReadingsApprovalService');

const idOf = value => String(value?._id || value?.id || value || '').trim();

const statusForError = (error = {}) => {
  const message = String(error?.message || '');
  if (/not found/i.test(message)) return 404;
  if (/changed after approval|same exact revision|cross .*revision|snapshot is unavailable|reapproval/i.test(message)) return 409;
  if (/confirmation|required|invalid|must |supports at most|needs /i.test(message)) return 400;
  return 500;
};

const sendError = (res, error, fallback) => res.status(statusForError(error)).json({
  error: statusForError(error) === 500 ? fallback : error.message
});

const buildWeekendReadingsHandlers = ({
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  buildUniqueSlug,
  invalidatePublicPageCache = () => {},
  now = () => new Date()
} = {}) => {
  const models = { WikiPage, WikiRevision, NoeisReceipt };

  const createDraft = async (req, res) => {
    try {
      const result = await createWeekendReadingsDraft({
        WikiPage,
        WikiRevision,
        NoeisReceipt,
        userId: req.user.id,
        buildUniqueSlug,
        ...req.body
      });
      return res.status(result.created ? 201 : 200).json({
        created: result.created,
        page: result.page,
        revisionId: idOf(result.revision),
        receipt: result.receipt,
        editionKey: result.draft.editionKey,
        approvalState: deriveApprovalState({ currentRevisionId: idOf(result.revision) })
      });
    } catch (error) {
      return sendError(res, error, 'Failed to create Weekend Readings draft.');
    }
  };

  const getStatus = async (req, res) => {
    try {
      const context = await loadWorkflowContext({ ...models, userId: req.user.id, pageId: req.params.pageId });
      return res.status(200).json({
        pageId: idOf(context.page),
        editionKey: context.candidate.editionKey,
        currentRevisionId: idOf(context.revision),
        approvalState: deriveApprovalState({ currentRevisionId: idOf(context.revision), receipts: context.receipts })
      });
    } catch (error) {
      return sendError(res, error, 'Failed to load Weekend Readings status.');
    }
  };

  const requestReview = async (req, res) => {
    try {
      const result = await requestWeekendReadingsReview({
        models,
        userId: req.user.id,
        pageId: req.params.pageId,
        confirmation: req.body?.confirmation,
        now: now()
      });
      return res.status(200).json({ receipt: result.receipt, approvalState: result.state });
    } catch (error) {
      return sendError(res, error, 'Failed to request Weekend Readings review.');
    }
  };

  const approve = async (req, res) => {
    try {
      const result = await approveWeekendReadingsRevision({
        models,
        userId: req.user.id,
        pageId: req.params.pageId,
        confirmation: req.body?.confirmation,
        now: now()
      });
      return res.status(200).json({ receipt: result.receipt, approvalState: result.state });
    } catch (error) {
      return sendError(res, error, 'Failed to approve Weekend Readings revision.');
    }
  };

  const publish = async (req, res) => {
    let page = null;
    let previousVisibility = '';
    let previousStatus = '';
    try {
      const prepared = await publishWeekendReadingsRevision({
        models,
        userId: req.user.id,
        pageId: req.params.pageId,
        confirmation: req.body?.confirmation,
        now: now(),
        persistReceipt: async ({ receipt }) => receipt
      });
      const latestRevision = await findCurrentRevision({ WikiRevision, userId: req.user.id, pageId: req.params.pageId });
      if (idOf(latestRevision) !== idOf(prepared.revision)) throw new Error('Draft changed after approval; reapproval is required before publication.');

      page = await WikiPage.findOne({ _id: req.params.pageId, userId: req.user.id, status: { $ne: 'archived' } });
      if (!page) throw new Error('Weekend Readings page not found.');
      previousVisibility = page.visibility;
      previousStatus = page.status;
      page.visibility = 'shared';
      page.status = 'published';
      await page.save();

      let storedReceipt;
      try {
        storedReceipt = await persistLifecycleReceipt({ NoeisReceipt, userId: req.user.id, receipt: prepared.receipt });
      } catch (receiptError) {
        page.visibility = previousVisibility;
        page.status = previousStatus;
        await page.save();
        throw receiptError;
      }
      invalidatePublicPageCache(idOf(page), page.slug);
      return res.status(200).json({
        pageId: idOf(page),
        publicUrl: `/share/wiki/${encodeURIComponent(page.slug || idOf(page))}`,
        receipt: storedReceipt || prepared.receipt,
        approvalState: prepared.state,
        publicArtifact: prepared.publicArtifact
      });
    } catch (error) {
      return sendError(res, error, 'Failed to publish Weekend Readings revision.');
    }
  };

  return { approve, createDraft, getStatus, publish, requestReview };
};

const buildWeekendReadingsRouter = ({ authenticateToken, ...dependencies } = {}) => {
  const router = express.Router();
  const handlers = buildWeekendReadingsHandlers(dependencies);
  router.post('/api/wiki/weekend-readings/drafts', authenticateToken, handlers.createDraft);
  router.get('/api/wiki/weekend-readings/:pageId/status', authenticateToken, handlers.getStatus);
  router.post('/api/wiki/weekend-readings/:pageId/review', authenticateToken, handlers.requestReview);
  router.post('/api/wiki/weekend-readings/:pageId/approve', authenticateToken, handlers.approve);
  router.post('/api/wiki/weekend-readings/:pageId/publish', authenticateToken, handlers.publish);
  return router;
};

module.exports = { buildWeekendReadingsHandlers, buildWeekendReadingsRouter, sendError, statusForError };
