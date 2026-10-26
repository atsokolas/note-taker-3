const { workOperationIndex } = require('../models/knowledgeContext');

// Work cannot acknowledge a write until retries are unique and Continue can transact.
// Build only the required index; never reconcile or drop existing indexes.
function createWorkNoteReadiness({ NotebookEntry }) {
  let ready = false;
  const settled = (async () => {
    try {
      await NotebookEntry.db.asPromise();
      await NotebookEntry.collection.createIndex(workOperationIndex.keys, workOperationIndex.options);
      const session = await NotebookEntry.db.startSession();
      try {
        await session.withTransaction(async () => {
          await NotebookEntry.collection.findOne({ _id: null }, { session });
        });
      } finally { await session.endSession(); }
      ready = true;
    } catch (_) {
      // Fail closed without exposing database credentials or raw driver diagnostics.
      ready = false;
    }
    return ready;
  })();
  return { isReady: () => ready && NotebookEntry.db.readyState === 1, settled };
}
module.exports = { createWorkNoteReadiness };
