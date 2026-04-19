const clean = (value) => String(value || '').trim();

const truncate = (value, limit = 280) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 3)).trim()}...`;
};

const clone = (value) => JSON.parse(JSON.stringify(value || null));

const PROPOSED_CHANGE_STATUS_VALUES = new Set(['pending', 'accepted', 'rejected', 'applied', 'rolled_back', 'invalidated']);

const normalizeActor = (input = {}, fallbackType = 'user') => ({
  actorType: clean(input?.actorType).toLowerCase() || fallbackType,
  actorId: clean(input?.actorId)
});

const normalizeSnapshot = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    title: clean(source.title),
    description: clean(source.description),
    content: clean(source.content),
    blocks: Array.isArray(source.blocks) ? source.blocks : []
  };
};

const normalizeProposedChange = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const status = clean(source.status).toLowerCase();
  return {
    proposedChangeId: clean(source.proposedChangeId || source._id),
    targetType: clean(source.targetType).toLowerCase(),
    targetId: clean(source.targetId),
    targetTitle: clean(source.targetTitle),
    status: PROPOSED_CHANGE_STATUS_VALUES.has(status) ? status : 'pending',
    summary: clean(source.summary),
    diffSummary: source.diffSummary && typeof source.diffSummary === 'object' ? source.diffSummary : {},
    sourceThreadId: clean(source.sourceThreadId),
    sourceRunId: clean(source.sourceRunId),
    sourceBundleId: clean(source.sourceBundleId),
    sourceOpId: clean(source.sourceOpId),
    currentSnapshot: normalizeSnapshot(source.currentSnapshot || {}),
    proposedSnapshot: normalizeSnapshot(source.proposedSnapshot || {}),
    createdBy: normalizeActor(source.createdBy || {}, 'user'),
    acceptedBy: source.acceptedBy ? normalizeActor(source.acceptedBy, 'user') : null,
    rejectedBy: source.rejectedBy ? normalizeActor(source.rejectedBy, 'user') : null,
    rolledBackBy: source.rolledBackBy ? normalizeActor(source.rolledBackBy, 'user') : null,
    acceptedAt: source.acceptedAt ? new Date(source.acceptedAt) : null,
    rejectedAt: source.rejectedAt ? new Date(source.rejectedAt) : null,
    rolledBackAt: source.rolledBackAt ? new Date(source.rolledBackAt) : null,
    createdAt: source.createdAt ? new Date(source.createdAt) : null,
    updatedAt: source.updatedAt ? new Date(source.updatedAt) : null
  };
};

const sanitizeAgentProposedChangeDoc = (doc = {}) => {
  const safe = normalizeProposedChange(doc?.toObject ? doc.toObject({ getters: false, virtuals: false }) : doc);
  return {
    ...safe,
    createdAt: safe.createdAt ? new Date(safe.createdAt).toISOString() : null,
    updatedAt: safe.updatedAt ? new Date(safe.updatedAt).toISOString() : null,
    acceptedAt: safe.acceptedAt ? new Date(safe.acceptedAt).toISOString() : null,
    rejectedAt: safe.rejectedAt ? new Date(safe.rejectedAt).toISOString() : null,
    rolledBackAt: safe.rolledBackAt ? new Date(safe.rolledBackAt).toISOString() : null
  };
};

const getProposedChangeDoc = async ({
  AgentProposedChange,
  userId = '',
  proposedChangeId = ''
} = {}) => {
  if (!AgentProposedChange) return null;
  return AgentProposedChange.findOne({
    _id: clean(proposedChangeId),
    userId
  });
};

const buildAssistantProposalText = ({ thread = null, bundleId = '' } = {}) => {
  const safeBundleId = clean(bundleId);
  const messages = Array.isArray(thread?.messages) ? [...thread.messages].reverse() : [];
  const matched = messages.find((message) => clean(message?.proposalBundle?.bundleId) === safeBundleId);
  return clean(matched?.text);
};

const buildConceptSnapshots = ({ concept = null, proposedText = '' } = {}) => ({
  currentSnapshot: {
    title: clean(concept?.name),
    description: clean(concept?.description),
    content: '',
    blocks: []
  },
  proposedSnapshot: {
    title: clean(concept?.name),
    description: clean(proposedText),
    content: '',
    blocks: []
  }
});

const buildNotebookSnapshots = ({ note = null, proposedText = '' } = {}) => ({
  currentSnapshot: {
    title: clean(note?.title),
    description: '',
    content: clean(note?.content),
    blocks: Array.isArray(note?.blocks) ? clone(note.blocks) : []
  },
  proposedSnapshot: {
    title: clean(note?.title),
    description: '',
    content: clean(proposedText),
    blocks: proposedText
      ? [{ id: 'agent-proposed-block-1', type: 'paragraph', text: clean(proposedText) }]
      : []
  }
});

const buildDiffSummary = ({ currentSnapshot = {}, proposedSnapshot = {} } = {}) => {
  const changedFields = [];
  if (clean(currentSnapshot.title) !== clean(proposedSnapshot.title)) changedFields.push('title');
  if (clean(currentSnapshot.description) !== clean(proposedSnapshot.description)) changedFields.push('description');
  if (clean(currentSnapshot.content) !== clean(proposedSnapshot.content)) changedFields.push('content');
  if (JSON.stringify(currentSnapshot.blocks || []) !== JSON.stringify(proposedSnapshot.blocks || [])) {
    changedFields.push('blocks');
  }
  return {
    changedFields,
    currentTextLength: clean(currentSnapshot.description || currentSnapshot.content).length,
    proposedTextLength: clean(proposedSnapshot.description || proposedSnapshot.content).length,
    currentBlockCount: Array.isArray(currentSnapshot.blocks) ? currentSnapshot.blocks.length : 0,
    proposedBlockCount: Array.isArray(proposedSnapshot.blocks) ? proposedSnapshot.blocks.length : 0
  };
};

const resolveTargetDoc = async ({
  TagMeta,
  NotebookEntry,
  userId = '',
  target = {}
} = {}) => {
  const targetType = clean(target?.type).toLowerCase();
  const targetId = clean(target?.id);
  if (!targetType || !targetId) return null;

  if (targetType === 'concept') {
    return TagMeta.findOne({ _id: targetId, userId });
  }
  if (targetType === 'notebook' || targetType === 'note') {
    return NotebookEntry.findOne({ _id: targetId, userId });
  }
  return null;
};

const createProposedChangesForRun = async ({
  AgentProposedChange,
  TagMeta,
  NotebookEntry,
  userId = '',
  thread = null,
  run = {},
  actor = {}
} = {}) => {
  if (!AgentProposedChange) return [];
  const safeRun = run && typeof run === 'object' ? run : {};
  const created = [];
  const proposedText = buildAssistantProposalText({
    thread,
    bundleId: safeRun.sourceBundleId
  });

  const steps = Array.isArray(safeRun.steps) ? safeRun.steps : [];
  for (const step of steps) {
    if (clean(step?.type).toLowerCase() !== 'propose_content_change') continue;
    if (clean(step?.status).toLowerCase() !== 'applied') continue;
    if (step?.metadata?.proposedChangeId) continue;

    const targetType = clean(step?.target?.type).toLowerCase();
    if (!['concept', 'notebook', 'note'].includes(targetType)) continue;

    const targetDoc = await resolveTargetDoc({
      TagMeta,
      NotebookEntry,
      userId,
      target: step.target
    });
    if (!targetDoc) continue;

    const snapshots = targetType === 'concept'
      ? buildConceptSnapshots({ concept: targetDoc, proposedText })
      : buildNotebookSnapshots({ note: targetDoc, proposedText });
    const diffSummary = buildDiffSummary(snapshots);

    const createdChange = await AgentProposedChange.create({
      userId,
      targetType: targetType === 'note' ? 'notebook' : targetType,
      targetId: clean(targetDoc?._id),
      targetTitle: clean(step?.target?.title || targetDoc?.title || targetDoc?.name),
      status: 'pending',
      summary: truncate(step?.title || `Proposed change for ${step?.target?.title || 'target'}`, 220),
      diffSummary,
      sourceThreadId: clean(thread?._id || thread?.threadId),
      sourceRunId: clean(safeRun.runId || safeRun._id),
      sourceBundleId: clean(safeRun.sourceBundleId),
      sourceOpId: clean(step?.opId),
      currentSnapshot: snapshots.currentSnapshot,
      proposedSnapshot: snapshots.proposedSnapshot,
      createdBy: normalizeActor(actor || {}, 'user')
    });

    step.metadata = step.metadata && typeof step.metadata === 'object' ? step.metadata : {};
    step.metadata.proposedChangeId = clean(createdChange?._id);
    created.push(createdChange);
  }

  return created;
};

const updateProposedChangeDraft = async ({
  AgentProposedChange,
  userId = '',
  proposedChangeId = '',
  updates = {}
} = {}) => {
  const doc = await getProposedChangeDoc({ AgentProposedChange, userId, proposedChangeId });
  if (!doc) {
    const error = new Error('Proposed change not found.');
    error.status = 404;
    throw error;
  }
  if (clean(doc.status).toLowerCase() !== 'pending') {
    const error = new Error('Only pending proposed changes can be edited.');
    error.status = 400;
    throw error;
  }

  const nextSnapshot = updates?.proposedSnapshot && typeof updates.proposedSnapshot === 'object'
    ? normalizeSnapshot({
        ...doc.proposedSnapshot,
        ...updates.proposedSnapshot
      })
    : normalizeSnapshot(doc.proposedSnapshot || {});
  const diffSummary = buildDiffSummary({
    currentSnapshot: normalizeSnapshot(doc.currentSnapshot || {}),
    proposedSnapshot: nextSnapshot
  });

  if (typeof doc.save === 'function') {
    doc.proposedSnapshot = nextSnapshot;
    doc.diffSummary = diffSummary;
    await doc.save();
    return doc;
  }

  return AgentProposedChange.findOneAndUpdate(
    { _id: clean(proposedChangeId), userId },
    {
      $set: {
        proposedSnapshot: nextSnapshot,
        diffSummary
      }
    },
    { new: true }
  );
};

const applyProposedSnapshotToTarget = async ({
  TagMeta,
  NotebookEntry,
  userId = '',
  doc = null
} = {}) => applySnapshotToTarget({
  TagMeta,
  NotebookEntry,
  userId,
  doc,
  snapshot: doc?.proposedSnapshot || {}
});

const applySnapshotToTarget = async ({
  TagMeta,
  NotebookEntry,
  userId = '',
  doc = null,
  snapshot = {}
} = {}) => {
  const targetType = clean(doc?.targetType).toLowerCase();
  const targetId = clean(doc?.targetId);
  const nextSnapshot = normalizeSnapshot(snapshot);

  if (targetType === 'concept') {
    const updated = await TagMeta.findOneAndUpdate(
      { _id: targetId, userId },
      {
        $set: {
          name: nextSnapshot.title || clean(doc?.targetTitle),
          description: nextSnapshot.description
        }
      },
      { new: true }
    );
    if (!updated) {
      const error = new Error('Concept target not found.');
      error.status = 404;
      throw error;
    }
    return updated;
  }

  if (targetType === 'notebook') {
    const updated = await NotebookEntry.findOneAndUpdate(
      { _id: targetId, userId },
      {
        $set: {
          title: nextSnapshot.title || clean(doc?.targetTitle),
          content: nextSnapshot.content,
          blocks: Array.isArray(nextSnapshot.blocks) ? nextSnapshot.blocks : []
        }
      },
      { new: true }
    );
    if (!updated) {
      const error = new Error('Notebook target not found.');
      error.status = 404;
      throw error;
    }
    return updated;
  }

  const error = new Error('Unsupported proposed change target.');
  error.status = 400;
  throw error;
};

const acceptProposedChange = async ({
  AgentProposedChange,
  TagMeta,
  NotebookEntry,
  userId = '',
  proposedChangeId = '',
  actor = {}
} = {}) => {
  const doc = await getProposedChangeDoc({ AgentProposedChange, userId, proposedChangeId });
  if (!doc) {
    const error = new Error('Proposed change not found.');
    error.status = 404;
    throw error;
  }
  if (clean(doc.status).toLowerCase() !== 'pending') {
    const error = new Error('Only pending proposed changes can be accepted.');
    error.status = 400;
    throw error;
  }

  await applyProposedSnapshotToTarget({
    TagMeta,
    NotebookEntry,
    userId,
    doc
  });

  const acceptedBy = normalizeActor(actor || {}, 'user');
  if (typeof doc.save === 'function') {
    doc.status = 'applied';
    doc.acceptedBy = acceptedBy;
    doc.acceptedAt = new Date();
    await doc.save();
    return doc;
  }

  return AgentProposedChange.findOneAndUpdate(
    { _id: clean(proposedChangeId), userId },
    {
      $set: {
        status: 'applied',
        acceptedBy,
        acceptedAt: new Date()
      }
    },
    { new: true }
  );
};

const rejectProposedChange = async ({
  AgentProposedChange,
  userId = '',
  proposedChangeId = '',
  actor = {}
} = {}) => {
  const doc = await getProposedChangeDoc({ AgentProposedChange, userId, proposedChangeId });
  if (!doc) {
    const error = new Error('Proposed change not found.');
    error.status = 404;
    throw error;
  }
  if (clean(doc.status).toLowerCase() !== 'pending') {
    const error = new Error('Only pending proposed changes can be rejected.');
    error.status = 400;
    throw error;
  }

  const rejectedBy = normalizeActor(actor || {}, 'user');
  if (typeof doc.save === 'function') {
    doc.status = 'rejected';
    doc.rejectedBy = rejectedBy;
    doc.rejectedAt = new Date();
    await doc.save();
    return doc;
  }

  return AgentProposedChange.findOneAndUpdate(
    { _id: clean(proposedChangeId), userId },
    {
      $set: {
        status: 'rejected',
        rejectedBy,
        rejectedAt: new Date()
      }
    },
    { new: true }
  );
};

const rollbackProposedChange = async ({
  AgentProposedChange,
  TagMeta,
  NotebookEntry,
  userId = '',
  proposedChangeId = '',
  actor = {}
} = {}) => {
  const doc = await getProposedChangeDoc({ AgentProposedChange, userId, proposedChangeId });
  if (!doc) {
    const error = new Error('Proposed change not found.');
    error.status = 404;
    throw error;
  }
  if (clean(doc.status).toLowerCase() !== 'applied') {
    const error = new Error('Only applied proposed changes can be rolled back.');
    error.status = 400;
    throw error;
  }

  await applySnapshotToTarget({
    TagMeta,
    NotebookEntry,
    userId,
    doc,
    snapshot: doc.currentSnapshot || {}
  });

  const rolledBackBy = normalizeActor(actor || {}, 'user');
  if (typeof doc.save === 'function') {
    doc.status = 'rolled_back';
    doc.rolledBackBy = rolledBackBy;
    doc.rolledBackAt = new Date();
    await doc.save();
    return doc;
  }

  return AgentProposedChange.findOneAndUpdate(
    { _id: clean(proposedChangeId), userId },
    {
      $set: {
        status: 'rolled_back',
        rolledBackBy,
        rolledBackAt: new Date()
      }
    },
    { new: true }
  );
};

module.exports = {
  normalizeProposedChange,
  sanitizeAgentProposedChangeDoc,
  createProposedChangesForRun,
  updateProposedChangeDraft,
  acceptProposedChange,
  rejectProposedChange,
  rollbackProposedChange
};
