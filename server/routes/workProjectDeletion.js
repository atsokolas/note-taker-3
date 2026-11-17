const { createHash } = require('node:crypto');
const { inWork } = require('../models/knowledgeContext');
const RETENTION_DAYS = 14;
const CONSENT_VERSION = 1;
const fail = (status, message) => Object.assign(new Error(message), { status });
const deleted = project => Boolean(project?.deleted && !project.deleted.restoredAt);

// Every membership-changing write takes the same project lock as deletion. A transaction
// alone cannot detect a new matching note inserted after its membership snapshot.
function workProjectDeletion({ NotebookEntry, NotebookFolder }) {
  const transaction = async run => {
    const session = await NotebookEntry.db.startSession(); let result;
    try { await session.withTransaction(async () => { result = await run(session); }); return result; }
    finally { await session.endSession(); }
  };
  const projectFor = async (userId, id, session) => {
    const project = await inWork(NotebookFolder.findOne({ _id: id, userId, kind: 'project' })).session(session || null);
    if (!project) throw fail(404, 'Work project not found.');
    return project;
  };
  const fenceEntries = async (userId, entries, session) => {
    const ids = new Map();
    for (const entry of entries.filter(Boolean)) {
      if (entry.erasedAt || entry.deletionBatchId) throw fail(409, 'Restore the deleted project before changing its writing.');
      if (entry.project) ids.set(String(entry.project), false);
      if (entry.workItem?.noteId) {
        const note = await inWork(NotebookEntry.findOne({ _id: entry.workItem.noteId, userId, workItem: { $exists: false } })).session(session);
        if (!note) throw fail(400, 'Link one of your Work notes.');
        if (note.erasedAt && !(entries.length > 1 && entries[0]._id && String(entries[0].workItem?.noteId) === String(note._id) && entry.project && String(entry.project) !== String(note.project))) throw fail(409, 'This source note was erased.');
        if (note.project) { const id = String(note.project); const excluded = Boolean(entry._id && entry.project && String(entry.project) !== id); ids.set(id, ids.has(id) ? ids.get(id) && excluded : excluded); }
      }
    }
    for (const [id, allowDeleted] of [...ids].sort(([a], [b]) => a.localeCompare(b))) {
      const project = await inWork(NotebookFolder.findOneAndUpdate({ _id: id, userId, kind: 'project', ...(allowDeleted ? {} : { $or: [{ deleted: null }, { 'deleted.restoredAt': { $ne: null } }] }) }, { $inc: { mutationFence: 1 } }, { session, new: true, timestamps: false }));
      if (!project) throw fail(409, 'This project is deleted. Restore it before changing its writing.');
    }
  };
  const preview = async (userId, project, session) => {
    const id = String(project._id);
    const notes = await inWork(NotebookEntry.find({ userId, project: project._id, workItem: { $exists: false } })).session(session || null).lean();
    const noteIds = notes.map(note => String(note._id));
    const candidates = await inWork(NotebookEntry.find({ userId, 'workItem.kind': { $exists: true, $ne: 'week' }, $or: [{ project: project._id }, { 'workItem.noteId': { $in: noteIds } }] })).session(session || null).lean();
    const excluded = candidates.filter(item => item.project && String(item.project) !== id);
    const members = [...notes, ...candidates.filter(item => !item.project || String(item.project) === id)];
    const eligible = members.filter(entry => !entry.trashedAt);
    const fingerprint = [...members, ...excluded].map(entry => [String(entry._id), entry.revision, entry.trashedAt || null, entry.project || null, entry.workItem?.noteId || null]).sort((a, b) => a[0].localeCompare(b[0]));
    return { projectId: id, revision: project.revision || 0, reviewToken: createHash('sha256').update(JSON.stringify([id, project.revision || 0, fingerprint])).digest('hex'), entryIds: eligible.map(entry => String(entry._id)).sort(), counts: { notes: eligible.filter(entry => !entry.workItem).length, tasks: eligible.filter(entry => entry.workItem).length, alreadyDeleted: members.length - eligible.length, excludedTasks: excluded.length }, retentionDays: RETENTION_DAYS, consentVersion: CONSENT_VERSION };
  };
  const receipt = project => ({ ...project.deleted.toObject?.() || project.deleted, retentionDays: RETENTION_DAYS });
  const response = async (userId, project, session) => ({ project, entries: await inWork(NotebookEntry.find({ userId, _id: { $in: project.deleted.entryIds } })).session(session || null), receipt: receipt(project) });
  const remove = (userId, id, input) => transaction(async session => {
    if (input.autoErase !== undefined && typeof input.autoErase !== 'boolean') throw fail(400, 'autoErase must be true or false.');
    const project = await projectFor(userId, id, session);
    if (project.deleted?.erasedAt) throw fail(410, 'This project was permanently erased.');
    if (project.deleted?.batchId === input.operationId) return response(userId, project, session);
    if (deleted(project)) throw fail(409, 'This project is already deleted.');
    // Force a write conflict with all creates, edits, moves and source-linked tasks.
    await inWork(NotebookFolder.updateOne({ _id: id, userId }, { $inc: { mutationFence: 1 } }, { session, timestamps: false }));
    const reviewed = await preview(userId, project, session);
    if (input.expectedRevision !== reviewed.revision || input.reviewToken !== reviewed.reviewToken) throw fail(409, 'The project contents changed. Review the deletion again.');
    const deletedAt = new Date(), expiresAt = new Date(deletedAt.getTime() + RETENTION_DAYS * 86400000);
    await inWork(NotebookEntry.updateMany({ userId, _id: { $in: reviewed.entryIds }, trashedAt: null }, { $set: { trashedAt: deletedAt, deletionBatchId: input.operationId }, $inc: { revision: 1 } }, { session }));
    project.deleted = { batchId: input.operationId, deletedAt, expiresAt, autoErase: input.autoErase === true, ...(input.autoErase === true ? { consentVersion: CONSENT_VERSION, consentedAt: deletedAt } : {}), restoredAt: null, entryIds: reviewed.entryIds, counts: reviewed.counts };
    project.revision += 1; await project.save({ session });
    return response(userId, project, session);
  });
  const restore = (userId, id, batchId) => transaction(async session => {
    const project = await projectFor(userId, id, session);
    if (project.deleted?.erasedAt) throw fail(410, 'This project was permanently erased.');
    if (!project.deleted || project.deleted.batchId !== batchId) throw fail(409, 'Review the current deleted project before restoring.');
    if (project.deleted.restoredAt) return response(userId, project, session);
    // Restoration remains possible until an opted-in erasure transaction commits.
    await inWork(NotebookEntry.updateMany({ userId, _id: { $in: project.deleted.entryIds }, deletionBatchId: batchId }, { $set: { trashedAt: null, deletionBatchId: null }, $inc: { revision: 1 } }, { session }));
    project.deleted.restoredAt = new Date(); project.revision += 1; await project.save({ session });
    return response(userId, project, session);
  });
  // Content-free identity receipts prevent retries and references from recreating erased data.
  // Copies in other notes are independent writing, not members of this deletion consent.
  const erase = (userId, id, batchId, now) => transaction(async session => {
    const project = await projectFor(userId, id, session), batch = project.deleted;
    if (!batch || batch.batchId !== batchId || batch.restoredAt || batch.erasedAt || !batch.autoErase || batch.consentVersion !== CONSENT_VERSION || !batch.consentedAt || +batch.consentedAt !== +batch.deletedAt || !batch.expiresAt || !batch.deletedAt || now < batch.expiresAt || now - batch.deletedAt < RETENTION_DAYS * 86400000 || batch.expiresAt - batch.deletedAt < RETENTION_DAYS * 86400000) return 'skipped';
    await inWork(NotebookFolder.updateOne({ _id: id, userId }, { $inc: { mutationFence: 1 } }, { session, timestamps: false }));
    const members = await inWork(NotebookEntry.find({ userId, _id: { $in: batch.entryIds }, deletionBatchId: batchId, trashedAt: { $ne: null }, erasedAt: null })).session(session).lean();
    const sourceIds = new Set((await inWork(NotebookEntry.find({ userId, project: project._id, workItem: { $exists: false } })).select('_id').session(session).lean()).map(note => String(note._id)));
    if (members.some(entry => entry.workItem ? (entry.project ? String(entry.project) !== String(project._id) : !sourceIds.has(entry.workItem.noteId)) : String(entry.project) !== String(project._id)) || members.length !== batch.entryIds.length || new Set(batch.entryIds.map(String)).size !== batch.entryIds.length) {
      project.deleted.erasureBlocked = 'membership_changed'; await project.save({ session }); return 'blocked';
    }
    for (const entry of members) {
      // Raw replacement intentionally removes ALL prose, mixed fields and hidden snapshots.
      // Keep planner kind for existing weekly taskIds and project identity for source-link fences.
      const tombstone = { _id: entry._id, userId: entry.userId, knowledgeContext: 'work', revision: (entry.revision || 0) + 1, trashedAt: entry.trashedAt, deletionBatchId: batchId, erasedAt: now, project: project._id, ...(entry.operationId ? { operationId: entry.operationId, operationSource: entry.operationSource } : {}), ...(entry.workItem ? { workItem: { kind: entry.workItem.kind } } : {}) };
      const result = await NotebookEntry.collection.replaceOne({ _id: entry._id, userId: entry.userId, knowledgeContext: 'work', deletionBatchId: batchId, trashedAt: entry.trashedAt, revision: entry.revision }, tombstone, { session });
      if (result.matchedCount !== 1) throw fail(409, 'Deletion membership changed.');
    }
    // Pre-existing Trash was excluded from consent: keep it recoverable without the erased project.
    await inWork(NotebookEntry.updateMany({ userId, project: project._id, _id: { $nin: batch.entryIds }, deletionBatchId: null }, { $set: { project: null }, $inc: { revision: 1 } }, { session }));
    const history = NotebookEntry.db.models.EntryRevision;
    if (history) await history.deleteMany({ userId, kind: 'note', entryId: { $in: batch.entryIds } }).session(session);
    const tombstone = { _id: project._id, userId: project.userId, knowledgeContext: 'work', kind: 'project', name: 'Erased project', revision: project.revision + 1, operationId: project.operationId, deleted: { ...batch.toObject(), erasedAt: now, erasureBlocked: undefined } };
    await NotebookFolder.collection.replaceOne({ _id: project._id, userId: project.userId, knowledgeContext: 'work', 'deleted.batchId': batchId }, tombstone, { session });
    return 'erased';
  });
  const eraseDue = async ({ now = new Date(), limit = 100 } = {}) => {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Choose a valid erasure time and batch limit.');
    const projects = await inWork(NotebookFolder.find({ kind: 'project', 'deleted.autoErase': true, 'deleted.consentVersion': CONSENT_VERSION, 'deleted.consentedAt': { $ne: null }, 'deleted.restoredAt': null, 'deleted.erasedAt': null, 'deleted.erasureBlocked': null, 'deleted.expiresAt': { $lte: now } })).sort({ 'deleted.erasureAttemptedAt': 1, 'deleted.expiresAt': 1, _id: 1 }).limit(limit);
    const result = { examined: projects.length, erased: 0, skipped: 0, blocked: 0, failed: 0 };
    for (const project of projects) {
      try { result[await erase(project.userId, project._id, project.deleted.batchId, now)] += 1; }
      catch { result.failed += 1; }
      // Rotate failed/invalid due rows behind untouched work; a poison batch cannot starve the queue.
      await inWork(NotebookFolder.updateOne({ _id: project._id, userId: project.userId, 'deleted.batchId': project.deleted.batchId, 'deleted.erasedAt': null, 'deleted.restoredAt': null }, { $set: { 'deleted.erasureAttemptedAt': now } }, { timestamps: false }));
    }
    return result;
  };
  return { transaction, fenceEntries, projectFor, preview, remove, restore, eraseDue };
}
module.exports = { workProjectDeletion, deleted };
