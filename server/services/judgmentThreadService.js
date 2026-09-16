const clean = (value = '', limit = 4000) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const id = value => clean(value?._id || value?.id || value, 240);
const list = value => Array.isArray(value) ? value : [];
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const resolveQuery = query => query?.then ? query : Promise.resolve(query);

const RESPONSES = new Set(['', 'keep', 'narrow', 'different', 'uncertain']);
const ACTIONS = new Set(['', 'unchanged', 'change', 'not_reconsidered']);

class JudgmentThreadError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'JudgmentThreadError';
    this.status = status;
    this.code = code;
  }
}

const requireModels = ({ WikiPage, NoeisReceipt, JudgmentResponseDraft }) => {
  if (!WikiPage?.findOne || !NoeisReceipt?.findOne || !JudgmentResponseDraft?.findOne) {
    throw new JudgmentThreadError('Judgment continuity is unavailable.', 503, 'unavailable');
  }
};

const criterionAt = (page, observedAt) => {
  const at = new Date(observedAt || 0).getTime();
  const history = list(page?.judgment?.resolutionHistory)
    .filter(entry => {
      const setAt = new Date(entry?.setAt || 0).getTime();
      return Number.isFinite(setAt) && (!at || setAt <= at);
    })
    .sort((a, b) => new Date(a.setAt || 0) - new Date(b.setAt || 0));
  const exact = history.at(-1);
  if (exact) {
    return {
      text: clean(exact.criteria, 2000),
      horizonAt: exact.horizonAt || null,
      setAt: exact.setAt || null,
      receiptId: clean(exact.receiptId, 240),
      claimHash: clean(exact.claimHash, 128)
    };
  }
  return { text: '', horizonAt: null, setAt: null, receiptId: '', claimHash: '' };
};

const currentCriterion = page => {
  const latest = [...list(page?.judgment?.resolutionHistory)]
    .sort((left, right) => new Date(left?.setAt || 0) - new Date(right?.setAt || 0))
    .at(-1);
  return latest ? {
    text: clean(latest.criteria, 2000),
    horizonAt: latest.horizonAt || null,
    setAt: latest.setAt || null,
    receiptId: clean(latest.receiptId, 240),
    claimHash: clean(latest.claimHash, 128)
  } : {
    text: clean(page?.judgment?.resolutionCriteria, 2000),
    horizonAt: page?.judgment?.resolutionHorizonAt || null,
    setAt: page?.judgment?.resolutionSetAt || null,
    receiptId: '',
    claimHash: ''
  };
};

const loadContext = async ({ WikiPage, NoeisReceipt, userId, pageId, observationId }) => {
  const [page, receipt] = await Promise.all([
    resolveQuery(WikiPage.findOne({ _id: pageId, userId, status: { $ne: 'archived' } })),
    resolveQuery(NoeisReceipt.findOne({
      userId,
      receiptId: observationId,
      kind: 'company_dossier_judgment_review',
      'provenance.pageId': String(pageId)
    }))
  ]);
  if (!page) throw new JudgmentThreadError('Judgment not found.', 404, 'not_found');
  if (!receipt) throw new JudgmentThreadError('The observation was not found.', 404, 'observation_not_found');
  const stored = plain(receipt);
  const storedCriterion = plain(stored?.provenance?.conditionAtAcceptance);
  return {
    page,
    receipt: stored,
    baseClaim: clean(stored?.provenance?.judgmentAtAcceptance, 8000),
    criterionSnapshot: clean(storedCriterion?.text, 2000)
      ? storedCriterion
      : criterionAt(page, stored?.provenance?.acceptedAt || stored?.createdAt)
  };
};

const serializeDraft = value => {
  const draft = plain(value);
  if (!draft) return null;
  return {
    id: id(draft._id),
    observationId: clean(draft.observationId, 240),
    baseClaim: clean(draft.baseClaim, 8000),
    criterionSnapshot: plain(draft.criterionSnapshot) || {},
    response: clean(draft.response, 32),
    proposedView: clean(draft.proposedView, 8000),
    reason: clean(draft.reason, 4000),
    action: clean(draft.action, 32),
    proposedAction: clean(draft.proposedAction, 4000),
    returnQuestion: clean(draft.returnQuestion, 600),
    activeField: clean(draft.activeField, 80),
    caretOffset: Math.max(0, Number(draft.caretOffset) || 0),
    version: Math.max(1, Number(draft.version) || 1),
    updatedAt: draft.updatedAt || null
  };
};

const readJudgmentThread = async ({
  WikiPage, NoeisReceipt, JudgmentResponseDraft, userId, pageId, observationId
} = {}) => {
  requireModels({ WikiPage, NoeisReceipt, JudgmentResponseDraft });
  const context = await loadContext({ WikiPage, NoeisReceipt, userId, pageId, observationId });
  const draft = await resolveQuery(JudgmentResponseDraft.findOne({ userId, pageId, observationId, status: 'active' }));
  return {
    draft: serializeDraft(draft),
    observation: {
      id: observationId,
      status: clean(context.receipt.status, 40),
      baseClaim: context.baseClaim,
      criterionSnapshot: context.criterionSnapshot,
      currentCriterion: currentCriterion(context.page),
      sourceEventId: id(context.receipt.provenance?.sourceEventId),
      sourceLabel: clean(context.receipt.sourceLabel, 240),
      acceptedAt: context.receipt.provenance?.acceptedAt || null,
      recordedAt: context.receipt.createdAt || null
    }
  };
};

const saveJudgmentThread = async ({
  WikiPage, NoeisReceipt, JudgmentResponseDraft, userId, pageId, observationId,
  expectedVersion = 0, response = '', proposedView = '', reason = '', action = '',
  proposedAction = '', returnQuestion = '', activeField = '', caretOffset = 0
} = {}) => {
  requireModels({ WikiPage, NoeisReceipt, JudgmentResponseDraft });
  const safeResponse = clean(response, 32).toLowerCase();
  const safeAction = clean(action, 32).toLowerCase();
  if (!RESPONSES.has(safeResponse) || !ACTIONS.has(safeAction)) {
    throw new JudgmentThreadError('The response draft contains an unknown choice.');
  }
  const context = await loadContext({ WikiPage, NoeisReceipt, userId, pageId, observationId });
  if (clean(context.receipt.status, 40) !== 'awaiting_review') {
    throw new JudgmentThreadError('This observation is no longer awaiting a response.', 409, 'observation_resolved');
  }
  const version = Math.max(0, Number(expectedVersion) || 0);
  const update = {
    userId,
    pageId,
    observationId,
    baseClaim: context.baseClaim,
    criterionSnapshot: context.criterionSnapshot,
    response: safeResponse,
    proposedView: clean(proposedView, 8000),
    reason: clean(reason, 4000),
    action: safeAction,
    proposedAction: clean(proposedAction, 4000),
    returnQuestion: clean(returnQuestion, 600),
    activeField: clean(activeField, 80),
    caretOffset: Math.max(0, Math.min(Number(caretOffset) || 0, 100000)),
    version: version + 1
  };
  let saved;
  if (!version) {
    try {
      saved = await JudgmentResponseDraft.create(update);
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  } else {
    saved = await resolveQuery(JudgmentResponseDraft.findOneAndUpdate(
      { userId, pageId, observationId, version, status: 'active' },
      { $set: update },
      { new: true }
    ));
  }
  if (!saved) {
    const latest = await resolveQuery(JudgmentResponseDraft.findOne({ userId, pageId, observationId, status: 'active' }));
    const error = new JudgmentThreadError(
      'This response changed elsewhere. Reopen it before writing again.',
      409,
      'stale_draft'
    );
    error.latest = serializeDraft(latest);
    throw error;
  }
  return {
    draft: serializeDraft(saved),
    observation: {
      baseClaim: context.baseClaim,
      criterionSnapshot: context.criterionSnapshot,
      currentCriterion: currentCriterion(context.page)
    }
  };
};

module.exports = {
  JudgmentThreadError,
  criterionAt,
  currentCriterion,
  readJudgmentThread,
  saveJudgmentThread,
  serializeDraft
};
