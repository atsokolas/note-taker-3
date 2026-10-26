const { createWorkNoteReadiness } = require('../services/workNoteReadiness');
const express = require('express');
const mongoose = require('mongoose');
const { inWork, workOperationIndex } = require('../models/knowledgeContext');
const { captureFields, workItemFields, replayedActions, applyWorkActions, validDay: date } = require('../services/workPlanner');
const { sanitizeNotebookBlocks } = require('../utils/notebookIdentity');
const { sanitizeNotebookWorkbench, LIMITS } = require('../utils/notebookWorkbench');
const fail = (status, message, current) => Object.assign(new Error(message), { status, current });
const revision = value => Number.isInteger(value) && value >= 0;
const folderRevision = value => value === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: value };
const forbidden = new Set(['linkedArticleId', 'linkedHighlightIds', 'claimId', 'articleId', 'highlightId', 'conceptId', 'questionId', 'sourceId', 'materials', 'trials', 'looseThoughts', 'importMeta', 'continuationBridge', 'continuesFromEntryId', 'continuationFence', 'knowledgeContext']);
function validateReferences(value, inBlocks = false) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'sourcePath' && child && value.type !== 'code') throw fail(400, 'Work notes cannot contain source references.');
    if (forbidden.has(key) && child != null && child !== '' && !(Array.isArray(child) && !child.length)) throw fail(400, 'Work notes cannot contain source references.');
    if (inBlocks && key === 'type' && typeof child === 'string' && !['paragraph', 'heading', 'bullet', 'quote', 'code', 'divider'].includes(child)) throw fail(400, 'Unsupported Work block.');
    validateReferences(child, inBlocks || key === 'blocks');
  }
}
function buildWorkNoteRouter({ authenticateToken, NotebookEntry, NotebookFolder, readiness = createWorkNoteReadiness({ NotebookEntry }) }) {
  const router = express.Router();
  router.use('/api/work-notes', authenticateToken, (req, res, next) => {
    res.set('Cache-Control', 'no-store, private');
    if (req.agentToken || req.personalAgent || req.authInfo?.tokenSource === 'agent-token') return res.status(403).json({ error: 'Only the human owner can do this.' });
    if (!readiness.isReady()) return res.status(503).json({ code: 'work_unavailable', error: 'Work notes are not ready. Please retry shortly.' });
    next();
  });
  const handle = fn => async (req, res) => {
    try { await fn(req, res); } catch (error) {
      res.status(error.status || (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500)).json({ error: error.status ? error.message : 'Unable to save or load this Work note.', ...(error.current ? { current: error.current } : {}) });
    }
  };
  const find = (req, extra = {}) => inWork(NotebookEntry.findOne({ _id: req.params.id, userId: req.user.id, ...extra }));
  async function fields(req, current) {
    const body = req.body || {}; validateReferences(body);
    const result = {};
    if (current && ['capturedAt', 'takenOn', 'timeZone'].some(key => body[key] !== undefined)) throw fail(400, 'The written day and capture timezone are kept with the original note.');
    if (!current) Object.assign(result, captureFields(body));
    if (body.workItem !== undefined) {
      if (current && !current.workItem) throw fail(400, 'A note cannot become a planner item.');
      result.workItem = await workItemFields(body.workItem, current?.workItem, id => mongoose.isValidObjectId(id) && inWork(NotebookEntry.findOne({ _id: id, userId: req.user.id, workItem: { $exists: false } })));
    }
    if (body.workActions?.length) result.workItem = applyWorkActions(result.workItem || current?.workItem, body.workActions);
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
      if (body.folder && (!mongoose.isValidObjectId(body.folder) || !await inWork(NotebookFolder.exists({ _id: body.folder, userId: req.user.id, ...((current?.folder && String(current.folder) === body.folder) ? {} : { archivedAt: null }) })))) throw fail(400, 'Choose one of your Work notebooks.');
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
      inWork(NotebookFolder.find({ userId: req.user.id })).sort({ sortOrder: 1, name: 1 })
    ]); res.json({ entries: entries.filter(entry => !entry.workItem), items: entries.filter(entry => entry.workItem), folders });
  }));
  let folderIndex;
  const ensureFolderIndex = () => folderIndex ||= NotebookFolder.collection.createIndex(workOperationIndex.keys, workOperationIndex.options).catch(() => { folderIndex = null; throw fail(503, 'Folder saving is not ready. Retry shortly.'); });
  router.post('/api/work-notes/folders', handle(async (req, res) => {
    if (typeof req.body?.name !== 'string' || !req.body.name.trim()) throw fail(400, 'Notebook name is required.');
    const operationId = req.body.operationId;
    if (operationId !== undefined && (typeof operationId !== 'string' || !operationId.trim() || operationId.length > 160)) throw fail(400, 'A stable folder request is required.');
    await ensureFolderIndex();
    let folder = operationId && await inWork(NotebookFolder.findOne({ userId: req.user.id, operationId }));
    if (!folder) {
      try { folder = await NotebookFolder.create({ name: req.body.name, userId: req.user.id, knowledgeContext: 'work', ...(operationId ? { operationId } : {}) }); }
      catch (error) { if (error.code !== 11000 || !operationId) throw error; folder = await inWork(NotebookFolder.findOne({ userId: req.user.id, operationId })); }
    }
    res.status(201).json(folder);
  }));
  router.put('/api/work-notes/folders/:id', handle(async (req, res) => {
    if (!revision(req.body.expectedRevision)) throw fail(400, 'Confirm the folder revision.');
    const current = await inWork(NotebookFolder.findOne({ _id: req.params.id, userId: req.user.id }));
    if (!current) throw fail(404, 'Work folder not found.');
    if (req.body.operationId && current.lastMutationId === req.body.operationId) {
      if ((req.body.name !== undefined && req.body.name !== current.name) || (req.body.archived !== undefined && req.body.archived !== Boolean(current.archivedAt))) throw fail(409, 'This request was used for a different folder change.', current);
      return res.json(current);
    }
    const values = {};
    if (req.body.name !== undefined) { if (typeof req.body.name !== 'string' || !req.body.name.trim()) throw fail(400, 'Folder name is required.'); values.name = req.body.name; }
    if (req.body.archived !== undefined) { if (typeof req.body.archived !== 'boolean') throw fail(400, 'Choose archive or restore.'); values.archivedAt = req.body.archived ? new Date() : null; }
    if (req.body.operationId) values.lastMutationId = req.body.operationId;
    const folder = await inWork(NotebookFolder.findOneAndUpdate({ _id: current._id, userId: req.user.id, ...folderRevision(req.body.expectedRevision) }, { $set: values, $inc: { revision: 1 } }, { new: true, runValidators: true }));
    if (!folder) throw fail(409, 'This folder changed. Reload it before trying again.', current);
    res.json(folder);
  }));
  router.post('/api/work-notes/folders/order', handle(async (req, res) => {
    const operationId = operation(req), order = req.body.order;
    if (!Array.isArray(order) || !order.length || new Set(order.map(row => row.id)).size !== order.length || order.some(row => !mongoose.isValidObjectId(row.id) || !revision(row.revision))) throw fail(400, 'Confirm the folders and their revisions.');
    const session = await NotebookFolder.db.startSession(); let folders;
    try { await session.withTransaction(async () => {
      const current = await inWork(NotebookFolder.find({ userId: req.user.id, archivedAt: null })).session(session);
      if (current.length !== order.length || current.some(folder => !order.some(row => row.id === String(folder._id)))) throw fail(409, 'The active folders changed. Reload before reordering.');
      if (current.every(folder => folder.lastMutationId === operationId)) { folders = current.sort((a, b) => a.sortOrder - b.sortOrder); if (folders.some((folder, index) => String(folder._id) !== order[index].id)) throw fail(409, 'This request was used for a different order.'); return; }
      folders = [];
      for (const [index, row] of order.entries()) {
        const folder = await inWork(NotebookFolder.findOneAndUpdate({ _id: row.id, userId: req.user.id, ...folderRevision(row.revision) }, { $set: { sortOrder: index, lastMutationId: operationId }, $inc: { revision: 1 } }, { session, new: true }));
        if (!folder) throw fail(409, 'This folder changed. Reload before reordering.'); folders.push(folder);
      }
    }); } finally { await session.endSession(); }
    res.json({ folders });
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
    const current = await find(req); if (!current) throw fail(404, 'Work note not found.');
    if (replayedActions(current.workItem, req.body.workActions)) return res.json({ ...current.toObject(), _actionReplay: true });
    if (current.revision !== expected) throw fail(409, 'This note changed elsewhere.', current);
    let values;
    try { values = await fields(req, current); } catch (error) { if (error.status === 409) error.current = current; throw error; }
    if (req.body.workingState !== undefined) {
      const text = req.body.workingState?.nextTimeLine?.text ?? '';
      if (typeof text !== 'string' || text.length > LIMITS.nextLine) throw fail(400, `The return line must be text of at most ${LIMITS.nextLine} characters. Your note was not saved.`);
      values.workingState = sanitizeNotebookWorkbench(req.body.workingState, { revision: expected + 1 });
      // Personal workbench normalization trims text; Work preserves the accepted words exactly.
      values.workingState.nextTimeLine.text = text;
    }
    const entry = await inWork(NotebookEntry.findOneAndUpdate({ _id: req.params.id, userId: req.user.id, revision: expected }, { $set: values, $inc: { revision: 1 } }, { new: true, runValidators: true }));
    if (!entry) { const current = await find(req); if (current && replayedActions(current.workItem, req.body.workActions)) return res.json({ ...current.toObject(), _actionReplay: true }); throw fail(current ? 409 : 404, current ? 'This note changed elsewhere.' : 'Work note not found.', current); }
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
        // A real internal write holds the source lock through commit without changing its writing, revisions, or timestamps.
        const source = await inWork(NotebookEntry.findOneAndUpdate({ _id: req.params.id, userId: req.user.id, revision: expectedRevision, ...(expectedWorkbenchRevision === undefined ? {} : { 'workingState.revision': expectedWorkbenchRevision }) }, { $inc: { continuationFence: 1 } }, { new: true, timestamps: false, session }));
        if (!source) { const current = await find(req).session(session); throw fail(current ? 409 : 404, 'The source changed. Review it before continuing.', current); }
        if (source.workItem) throw fail(400, 'Continue an authored note, not a planner item.');
        const line = source.workingState?.nextTimeLine;
        const continuationBridge = line?.text?.trim() ? { entryId: String(source._id), title: source.title, occurredOn: source.occurredOn, text: line.text, target: line.target?.toObject ? line.target.toObject() : line.target, revision: source.revision, workbenchRevision: source.workingState.revision } : null;
        [entry] = await NotebookEntry.create([{ ...captureFields(req.body), userId: req.user.id, knowledgeContext: 'work', operationId, operationSource: sourceKey, occurredOn, folder: source.folder, continuesFromEntryId: source._id, continuationBridge }], { session });
      });
    } catch (error) { if (error.code !== 11000) throw error; entry = await duplicate(req, operationId, sourceKey); }
    finally { await session.endSession(); }
    res.status(201).json(entry);
  }));
  return router;
}
module.exports = { buildWorkNoteRouter };
