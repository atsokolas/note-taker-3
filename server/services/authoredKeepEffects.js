const { wordBoundaryTrim } = require('../lib/editorialText');

const excerpt = (value, maxLength) => wordBoundaryTrim(String(value || '').replace(/\s+/g, ' ').trim(), { maxLength });

// Keep finishes only after its background work has durable queue records.
// The kept target is the identity: recovery may retry, but it cannot add a
// second creation event or vector job. Existing workers perform the work.
const buildAuthoredKeepEffects = ({ WikiSourceEvent, enqueueNotebookEmbedding, enqueueQuestionEmbedding }) => ({
  onNotebookKept: async (entry) => {
    await enqueueNotebookEmbedding(entry, { requireDurable: true });
    const identity = { _id: entry._id, userId: entry.userId };
    try {
      await WikiSourceEvent.updateOne(identity, { $setOnInsert: {
        userId: entry.userId,
        sourceType: 'notebook',
        sourceObjectId: entry._id,
        provider: 'noeis',
        eventType: 'created',
        title: excerpt(entry.title, 240),
        summary: excerpt([entry.content, ...(entry.blocks || []).map(block => block.text)].filter(Boolean).join(' '), 1200),
        sourceUpdatedAt: entry.updatedAt || entry.createdAt,
        status: 'pending',
        metadata: { route: 'keep-authored-exploration' }
      } }, { upsert: true, setDefaultsOnInsert: true, runValidators: true });
    } catch (error) {
      // Concurrent upserts may race at the unique _id index. Only the same
      // owner's already-persisted event is an acknowledgment of this write.
      if (error?.code !== 11000 || !await WikiSourceEvent.exists(identity)) throw error;
    }
  },
  onQuestionKept: question => enqueueQuestionEmbedding(question, { requireDurable: true })
});

module.exports = { buildAuthoredKeepEffects };
