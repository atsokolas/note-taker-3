const express = require('express');
const mongoose = require('mongoose');
const { inWork } = require('../models/knowledgeContext');
const { sanitizeNotebookBlocks } = require('../utils/notebookIdentity');
const { sanitizeNotebookWorkbench } = require('../utils/notebookWorkbench');
const fail = (status, message, current) => Object.assign(new Error(message), { status, current });
const revision = value => Number.isInteger(value) && value >= 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const forbidden = new Set(['linkedArticleId', 'linkedHighlightIds', 'claimId', 'articleId', 'highlightId', 'conceptId', 'questionId', 'sourceId', 'materials', 'trials', 'looseThoughts', 'importMeta', 'continuationBridge', 'continuesFromEntryId', 'knowledgeContext']);
function validateReferences(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'sourcePath' && child && value.type !== 'code') throw fail(400, 'Work notes cannot contain source references.');
    if (forbidden.has(key) && child != null && child !== '' && !(Array.isArray(child) && !child.length)) throw fail(400, 'Work notes cannot contain source references.');
    if (key === 'type' && typeof child === 'string' && !['paragraph', 'heading', 'bullet', 'quote', 'code', 'divider'].includes(child)) throw fail(400, 'Unsupported Work block.');
    validateReferences(child);
  }
}
function buildWorkNoteRouter({ authenticateToken, NotebookEntry, NotebookFolder }) {
  const router = express.Router();
  router.use('/api/work-notes', authenticateToken, (req, res, next) => {
    res.set('Cache-Control', 'no-store, private');
    if (req.agentToken || req.personalAgent || req.authInfo?.tokenSource === 'agent-token') return res.status(403).json({ error: 'Only the human owner can do this.' });
    next();
  });
  const handle = fn => async (req, res) => {
    try { await fn(req, res); } catch (error) {
      res.status(error.status || (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500)).json({ error: error.status ? error.message : 'Unable to save or load this Work note.', ...(error.current ? { current: error.current } : {}) });
    }
  };
  const find = (req, extra = {}) => inWork(NotebookEntry.findOne({ _id: req.params.id, userId: req.user.id, ...extra }));
  async function fields(req) {
    const body = req.body || {}; validateReferences(body);
    const result = {};
    for (const key of ['title', 'content', 'withText']) if (body[key] !== undefined) {
      if (typeof body[key] !== 'string') throw fail(400, `${key} must be text.`);
      result[key] = body[key];
    }
    if (body.blocks !== undefined) {
      if (!Array.isArray(body.blocks)) throw fail(400, 'blocks must be a list.');
      result.blocks = sanitizeNotebookBlocks(body.blocks);
    }
    if (body.occurredOn !== undefined) {
      if (!date(body.occurredOn)) throw fail(400, 'occurredOn must be a calendar date.');
      result.occurredOn = body.occurredOn;
    }
    if (body.folder !== undefined) {
      if (body.folder && (!mongoose.isValidObjectId(body.folder) || !await inWork(NotebookFolder.exists({ _id: body.folder, userId: req.user.id })))) throw fail(400, 'Choose one of your Work notebooks.');
      result.folder = body.folder || null;
    }
    return result;
  }
  function operation(req) {
    const id = req.body?.operationId;
    if (typeof id !== 'string' || !id.trim() || id.length > 160) throw fail(400, 'A stable operationId is required.');
    return id;
  }
  async function duplicate(req, operationId, source) {
    const existing = await inWork(NotebookEntry.findOne({ userId: req.user.id, operationId }));
    if (existing && existing.operationSource !== source) throw fail(409, 'This operationId was used for another action.');
    return existing;
  }
  router.get('/api/work-notes', handle(async (req, res) => {
    const [entries, folders] = await Promise.all([
      inWork(NotebookEntry.find({ userId: req.user.id })).sort({ updatedAt: -1 }),
      inWork(NotebookFolder.find({ userId: req.user.id })).sort({ name: 1 })
    ]); res.json({ entries, folders });
  }));
  router.post('/api/work-notes/folders', handle(async (req, res) => {
    if (typeof req.body?.name !== 'string' || !req.body.name.trim()) throw fail(400, 'Notebook name is required.');
    res.status(201).json(await NotebookFolder.create({ name: req.body.name, userId: req.user.id, knowledgeContext: 'work' }));
  }));
  router.post('/api/work-notes', handle(async (req, res) => {
    const operationId = operation(req);
    let entry = await duplicate(req, operationId, 'create');
    if (!entry) {
      const values = await fields(req);
      try { entry = await NotebookEntry.create({ ...values, occurredOn: values.occurredOn || new Date().toISOString().slice(0, 10), userId: req.user.id, knowledgeContext: 'work', operationId, operationSource: 'create' }); }
      catch (error) { if (error.code !== 11000) throw error; entry = await duplicate(req, operationId, 'create'); }
    }
    res.status(201).json(entry);
  }));
  router.get('/api/work-notes/:id', handle(async (req, res) => {
    const entry = await find(req); if (!entry) throw fail(404, 'Work note not found.'); res.json(entry);
  }));
  router.put('/api/work-notes/:id', handle(async (req, res) => {
    const expected = req.body?.expectedRevision;
    if (!revision(expected)) throw fail(400, 'expectedRevision is required.');
    const values = await fields(req);
    if (req.body.workingState !== undefined) values.workingState = sanitizeNotebookWorkbench(req.body.workingState, { revision: expected + 1 });
    const entry = await inWork(NotebookEntry.findOneAndUpdate({ _id: req.params.id, userId: req.user.id, revision: expected }, { $set: values, $inc: { revision: 1 } }, { new: true, runValidators: true }));
    if (!entry) { const current = await find(req); throw fail(current ? 409 : 404, current ? 'This note changed elsewhere.' : 'Work note not found.', current); }
    res.json(entry);
  }));
  router.post('/api/work-notes/:id/continue', handle(async (req, res) => {
    const operationId = operation(req), sourceKey = String(req.params.id);
    let entry = await duplicate(req, operationId, sourceKey);
    if (entry) return res.status(201).json(entry);
    const { expectedRevision, expectedWorkbenchRevision, occurredOn } = req.body;
    if (!revision(expectedRevision) || !date(occurredOn) || (expectedWorkbenchRevision !== undefined && !revision(expectedWorkbenchRevision))) throw fail(400, 'Confirm the source revision and next date.');
    const session = await NotebookEntry.db.startSession();
    try {
      await session.withTransaction(async () => {
        // A conditional no-op write locks the source against concurrent edits, while preserving every source field.
        const source = await inWork(NotebookEntry.findOneAndUpdate({ _id: req.params.id, userId: req.user.id, revision: expectedRevision, ...(expectedWorkbenchRevision === undefined ? {} : { 'workingState.revision': expectedWorkbenchRevision }) }, { $set: { revision: expectedRevision } }, { new: true, timestamps: false, session }));
        if (!source) { const current = await find(req).session(session); throw fail(current ? 409 : 404, 'The source changed. Review it before continuing.', current); }
        const line = source.workingState?.nextTimeLine;
        const continuationBridge = line?.text?.trim() ? { entryId: String(source._id), title: source.title, occurredOn: source.occurredOn, text: line.text, target: line.target?.toObject ? line.target.toObject() : line.target, revision: source.revision, workbenchRevision: source.workingState.revision } : null;
        [entry] = await NotebookEntry.create([{ userId: req.user.id, knowledgeContext: 'work', operationId, operationSource: sourceKey, occurredOn, folder: source.folder, continuesFromEntryId: source._id, continuationBridge }], { session });
      });
    } catch (error) { if (error.code !== 11000) throw error; entry = await duplicate(req, operationId, sourceKey); }
    finally { await session.endSession(); }
    res.status(201).json(entry);
  }));
  return router;
}
module.exports = { buildWorkNoteRouter };
