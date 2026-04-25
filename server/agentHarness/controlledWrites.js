const {
  buildServiceDraftForHarnessResult,
  createStructureProposalFromHarness,
  writeWorkingMemoryUpdatesFromHarness
} = require('./serviceAdapters');
const { createMemoryCommitApproval } = require('../services/agentMemoryApprovals');

const clean = (value) => String(value || '').trim();

const WRITE_MODES = Object.freeze({
  DRY_RUN: 'dry_run',
  STAGE: 'stage',
  COMMIT: 'commit'
});

const normalizeWriteMode = (value = '') => {
  const safe = clean(value).toLowerCase().replace(/-/g, '_');
  if (safe === 'dry_run' || safe === 'dryrun' || safe === 'preview') return WRITE_MODES.DRY_RUN;
  if (safe === 'stage' || safe === 'staged') return WRITE_MODES.STAGE;
  if (safe === 'commit' || safe === 'write') return WRITE_MODES.COMMIT;
  return WRITE_MODES.DRY_RUN;
};

const approvalError = () => {
  const error = new Error('Controlled write requires explicit approval.');
  error.status = 403;
  return error;
};

const missingModelError = (modelName = 'model') => {
  const error = new Error(`Controlled write requires ${modelName}.`);
  error.status = 500;
  return error;
};

const executeControlledWriteForHarnessResult = async ({
  result = {},
  models = {},
  options = {},
  writeMode = WRITE_MODES.DRY_RUN,
  approved = false
} = {}) => {
  const mode = normalizeWriteMode(writeMode);
  const draft = buildServiceDraftForHarnessResult(result, options);
  const base = {
    workflowId: clean(result.id),
    type: draft?.type || '',
    mode,
    approved: Boolean(approved),
    written: false,
    skipped: false,
    message: ''
  };

  if (!draft) {
    return {
      ...base,
      skipped: true,
      message: 'No controlled write adapter for workflow.'
    };
  }

  if (mode === WRITE_MODES.DRY_RUN) {
    return {
      ...base,
      draft,
      message: 'Dry-run only; no database writes performed.'
    };
  }

  if (!approved) throw approvalError();

  if (result.id === 'librarian') {
    if (!models.AgentStructureProposal) throw missingModelError('AgentStructureProposal');
    const created = await createStructureProposalFromHarness({
      AgentStructureProposal: models.AgentStructureProposal,
      output: result.output,
      ...options
    });
    return {
      ...base,
      action: 'stage_structure_proposal',
      written: Boolean(created.created),
      draft,
      created: created.created || null,
      payload: created.payload,
      message: 'Created a pending structure proposal; no folder operations were applied.'
    };
  }

  if (result.id === 'memory_steward') {
    if (mode !== WRITE_MODES.COMMIT) {
      if (mode === WRITE_MODES.STAGE && models.AgentProtocolApproval) {
        const staged = await createMemoryCommitApproval({
          AgentProtocolApproval: models.AgentProtocolApproval,
          userId: options.userId,
          threadId: options.threadId,
          workspaceType: options.workspaceType,
          workspaceId: options.workspaceId,
          updates: Array.isArray(result.output?.updates) ? result.output.updates : [],
          sourceIdPrefix: options.sourceIdPrefix || 'agent-harness:memory-steward',
          requestedBy: options.actor || { actorType: 'native_agent', actorId: 'agent-harness' }
        });
        return {
          ...base,
          action: 'stage_memory_approval',
          written: Boolean(staged.approval),
          draft,
          created: staged.approval || null,
          payload: staged.payload,
          message: 'Created a pending memory approval; no working-memory rows were committed.'
        };
      }
      return {
        ...base,
        draft,
        skipped: true,
        message: 'Memory updates require writeMode=commit; stage mode leaves them as drafts.'
      };
    }
    if (!models.WorkingMemoryItem) throw missingModelError('WorkingMemoryItem');
    const created = await writeWorkingMemoryUpdatesFromHarness({
      WorkingMemoryItem: models.WorkingMemoryItem,
      output: result.output,
      ...options,
      dedupe: true
    });
    return {
      ...base,
      action: 'commit_working_memory',
      written: created.created.length > 0,
      draft,
      created: created.created,
      payloads: created.payloads,
      skippedExisting: created.skippedExisting || [],
      message: 'Committed approved memory steward updates to working memory.'
    };
  }

  return {
    ...base,
    draft,
    skipped: true,
    message: 'Workflow is not eligible for controlled writes.'
  };
};

module.exports = {
  WRITE_MODES,
  executeControlledWriteForHarnessResult,
  normalizeWriteMode
};
