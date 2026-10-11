const mongoose = require('mongoose');

/* A Think entry's history: what it said after each stretch of editing.

   Saves arrive every second or so while someone writes, and a history of
   keystrokes is no history. So a save within ten minutes of the stretch it
   belongs to rewrites that stretch's revision instead of adding one; the next
   save after a pause begins a new one. A restore always stands on its own, so
   it can be undone. The first save an entry ever records also keeps what the
   entry said before it, so the oldest words are never lost to the history
   that began after them. Only the newest few dozen are kept.

   The sentences that describe a revision are written by the reader's own
   client from two snapshots (entryHistory.js in the UI); this side only
   keeps the snapshots honest. */

const STRETCH_MS = 10 * 60 * 1000;
const KEPT = 30;
const KINDS = ['note', 'concept', 'question'];

const plainBlocks = (blocks) => JSON.parse(JSON.stringify(Array.isArray(blocks) ? blocks : []))
  .map(({ _id, challenge, ...block }) => block);

const snapshotOf = (kind, record = {}) => (kind === 'concept'
  ? { title: String(record.name || ''), html: String(record.ideaWorkbench?.hypothesis?.html || '') }
  : { title: String((kind === 'question' ? record.text : record.title) || ''), blocks: plainBlocks(record.blocks) });

const isBlank = (snapshot) => !snapshot.title.trim()
  && !snapshot.blocks?.some(block => String(block.text || '').trim() || block.highlightId)
  && !String(snapshot.html || '').replace(/<\/?p>|<br\s*\/?>/g, '').trim();

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const recordRevision = async ({ EntryRevision, userId, kind, entryId, before, beforeAt, after, restoredFrom, now = new Date() }) => {
  if (!EntryRevision || !KINDS.includes(kind) || !after) return null;
  try {
    const scope = { userId, kind, entryId };
    const stamped = (fields, at = now) => new EntryRevision({ ...scope, ...fields, createdAt: at, updatedAt: at }).save({ timestamps: false });
    const latest = await EntryRevision.findOne(scope).sort({ createdAt: -1 });
    if (latest ? same(latest.snapshot, after) : !before || same(before, after)) return latest;
    if (!latest && !isBlank(before)) await stamped({ reason: 'before', snapshot: before }, beforeAt ? new Date(beforeAt) : now);
    const restored = mongoose.isValidObjectId(restoredFrom)
      ? await EntryRevision.findOne({ ...scope, _id: restoredFrom }).select('updatedAt')
      : null;
    if (!restored && latest?.reason === 'edit' && now - latest.createdAt < STRETCH_MS) {
      latest.set({ snapshot: after, updatedAt: now });
      latest.markModified('snapshot');
      return await latest.save({ timestamps: false });
    }
    const revision = await stamped({ reason: restored ? 'restore' : 'edit', restoredFromAt: restored?.updatedAt || null, snapshot: after });
    const stale = await EntryRevision.find(scope).sort({ createdAt: -1 }).skip(KEPT).select('_id');
    if (stale.length) await EntryRevision.deleteMany({ _id: { $in: stale.map(row => row._id) } });
    return revision;
  } catch (error) {
    // History is a courtesy to the writing; it never costs a save.
    console.error('Entry revision was not kept:', error);
    return null;
  }
};

const listRevisions = async ({ EntryRevision, userId, kind, entryId }) => {
  const rows = await EntryRevision.find({ userId, kind, entryId }).sort({ createdAt: -1 }).limit(KEPT).lean();
  return rows.map(row => ({
    id: String(row._id),
    reason: row.reason,
    at: row.updatedAt,
    restoredFromAt: row.restoredFromAt,
    snapshot: row.snapshot
  }));
};

module.exports = { KINDS, KEPT, STRETCH_MS, listRevisions, recordRevision, snapshotOf };
