const { createHash } = require('node:crypto');
const { inWork } = require('../models/knowledgeContext');
const RETENTION_DAYS = 14;
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
      if (entry.deletionBatchId) throw fail(409, 'Restore the deleted project before changing its writing.');
      if (entry.project) ids.set(String(entry.project), false);
      if (entry.workItem?.noteId) {
        const note = await inWork(NotebookEntry.findOne({ _id: entry.workItem.noteId, userId, workItem: { $exists: false } })).session(session);
        if (!note) throw fail(400, 'Link one of your Work notes.');
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
    return { projectId: id, revision: project.revision || 0, reviewToken: createHash('sha256').update(JSON.stringify([id, project.revision || 0, fingerprint])).digest('hex'), entryIds: eligible.map(entry => String(entry._id)).sort(), counts: { notes: eligible.filter(entry => !entry.workItem).length, tasks: eligible.filter(entry => entry.workItem).length, alreadyDeleted: members.length - eligible.length, excludedTasks: excluded.length }, retentionDays: RETENTION_DAYS };
  };
  const receipt = project => ({ ...project.deleted.toObject?.() || project.deleted, retentionDays: RETENTION_DAYS });
  const response = async (userId, project, session) => ({ project, entries: await inWork(NotebookEntry.find({ userId, _id: { $in: project.deleted.entryIds } })).session(session || null), receipt: receipt(project) });
  const remove = (userId, id, input) => transaction(async session => {
    const project = await projectFor(userId, id, session);
    if (project.deleted?.batchId === input.operationId) return response(userId, project, session);
    if (deleted(project)) throw fail(409, 'This project is already deleted.');
    // Force a write conflict with all creates, edits, moves and source-linked tasks.
    await inWork(NotebookFolder.updateOne({ _id: id, userId }, { $inc: { mutationFence: 1 } }, { session, timestamps: false }));
    const reviewed = await preview(userId, project, session);
    if (input.expectedRevision !== reviewed.revision || input.reviewToken !== reviewed.reviewToken) throw fail(409, 'The project contents changed. Review the deletion again.');
    const deletedAt = new Date(), expiresAt = new Date(deletedAt.getTime() + RETENTION_DAYS * 86400000);
    await inWork(NotebookEntry.updateMany({ userId, _id: { $in: reviewed.entryIds }, trashedAt: null }, { $set: { trashedAt: deletedAt, deletionBatchId: input.operationId }, $inc: { revision: 1 } }, { session }));
    project.deleted = { batchId: input.operationId, deletedAt, expiresAt, restoredAt: null, entryIds: reviewed.entryIds, counts: reviewed.counts };
    project.revision += 1; await project.save({ session });
    return response(userId, project, session);
  });
  const restore = (userId, id, batchId) => transaction(async session => {
    const project = await projectFor(userId, id, session);
    if (!project.deleted || project.deleted.batchId !== batchId) throw fail(409, 'Review the current deleted project before restoring.');
    if (project.deleted.restoredAt) return response(userId, project, session);
    // Expiry is a review deadline, never permission to destroy the data.
    await inWork(NotebookEntry.updateMany({ userId, _id: { $in: project.deleted.entryIds }, deletionBatchId: batchId }, { $set: { trashedAt: null, deletionBatchId: null }, $inc: { revision: 1 } }, { session }));
    project.deleted.restoredAt = new Date(); project.revision += 1; await project.save({ session });
    return response(userId, project, session);
  });
  return { transaction, fenceEntries, projectFor, preview, remove, restore };
}
module.exports = { workProjectDeletion, deleted };
