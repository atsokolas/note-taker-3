const mongoose = require('mongoose');
const { AuthoredExplorationError, serializeExploration } = require('./authoredExplorationService');

// Authored words belong to their owner even when the source disappears. This
// returns the owner's recorded copy, never a newly inaccessible source body.
const ownedWork = async ({ AuthoredExploration, userId, workId }) => {
  if (!mongoose.isValidObjectId(workId)) throw new AuthoredExplorationError('Writing not found.', 404);
  const row = await AuthoredExploration.findOne({ _id: workId, userId }).select('+savedVersions').lean();
  if (!row) throw new AuthoredExplorationError('Writing not found.', 404);
  return row;
};

const saveVersion = async (options) => {
  const row = await ownedWork(options);
  const revision = Number(options.expectedRevision);
  if (!Number.isInteger(revision) || revision !== row.revision) {
    throw new AuthoredExplorationError('The work changed. Reopen it before saving a version.', 409, 'stale_revision', { current: serializeExploration(row) });
  }
  if (row.savedVersions?.some(version => version.revision === revision)) return row.savedVersions;
  const saved = await options.AuthoredExploration.findOneAndUpdate(
    { _id: row._id, userId: options.userId, revision, 'savedVersions.revision': { $ne: revision } },
    { $push: { savedVersions: { $each: [{ revision, savedAt: new Date(), origin: row.origin, draft: row.draft }], $slice: -12 } } },
    { new: true, runValidators: true, timestamps: false }
  ).select('+savedVersions').lean();
  if (saved) return saved.savedVersions;
  const current = await ownedWork(options);
  if (current.revision === revision && current.savedVersions?.some(version => version.revision === revision)) return current.savedVersions;
  throw new AuthoredExplorationError('The work changed before the version was saved.', 409, 'stale_revision', { current: serializeExploration(current) });
};

module.exports = { ownedWork, saveVersion };
