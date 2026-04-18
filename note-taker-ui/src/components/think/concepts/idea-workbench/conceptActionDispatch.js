export const CONCEPT_ACTIONS = Object.freeze({
  STRENGTHEN_DRAFT: 'strengthen-draft',
  PULL_SUPPORT: 'pull-support',
  FIND_TENSION: 'find-tension',
  PULL_RELATED_SOURCES: 'pull-related-sources',
  SURFACE_OPEN_QUESTIONS: 'surface-open-questions',
  PREPARE_UPDATE: 'prepare-update',
  CLARIFY_DRAFT: 'clarify-draft',
  CHALLENGE_DRAFT: 'challenge-draft',
  SAVE_VERSION: 'save-version',
  CREATE_NOTEBOOK_DRAFT: 'create-notebook-draft',
  CREATE_AGENT_HANDOFF: 'create-agent-handoff'
});

const ACTION_EXECUTORS = {
  [CONCEPT_ACTIONS.STRENGTHEN_DRAFT]: ({ modelActions }) => modelActions.runQuickAction('strengthen-hypothesis'),
  [CONCEPT_ACTIONS.PULL_SUPPORT]: ({ modelActions }) => modelActions.runQuickAction('find-supports'),
  [CONCEPT_ACTIONS.FIND_TENSION]: ({ modelActions }) => modelActions.runQuickAction('find-contradictions'),
  [CONCEPT_ACTIONS.PULL_RELATED_SOURCES]: ({ modelActions }) => modelActions.runQuickAction('retrieve-related-sources'),
  [CONCEPT_ACTIONS.SURFACE_OPEN_QUESTIONS]: ({ modelActions }) => modelActions.runQuickAction('suggest-open-questions'),
  [CONCEPT_ACTIONS.PREPARE_UPDATE]: ({ modelActions }) => modelActions.runQuickAction('refresh-concept'),
  [CONCEPT_ACTIONS.CLARIFY_DRAFT]: ({ modelActions }) => modelActions.runQuickAction('rewrite-clearly'),
  [CONCEPT_ACTIONS.CHALLENGE_DRAFT]: ({ modelActions }) => modelActions.runQuickAction('challenge-hypothesis'),
  [CONCEPT_ACTIONS.SAVE_VERSION]: ({ modelActions, payload }) => modelActions.snapshotHypothesis(payload?.summary || ''),
  [CONCEPT_ACTIONS.CREATE_NOTEBOOK_DRAFT]: ({ createNotebookDraft, payload }) => createNotebookDraft(payload || {}),
  [CONCEPT_ACTIONS.CREATE_AGENT_HANDOFF]: ({ createConceptHandoff, payload }) => createConceptHandoff(payload || {})
};

export const dispatchConceptAction = ({
  type,
  payload = {},
  modelActions,
  createNotebookDraft,
  createConceptHandoff
}) => {
  const executor = ACTION_EXECUTORS[type];
  if (!executor) {
    throw new Error(`Unsupported concept action: ${type}`);
  }
  if (!modelActions || typeof modelActions !== 'object') {
    throw new Error('dispatchConceptAction requires modelActions.');
  }
  if (type === CONCEPT_ACTIONS.CREATE_NOTEBOOK_DRAFT && typeof createNotebookDraft !== 'function') {
    throw new Error('dispatchConceptAction requires createNotebookDraft for notebook actions.');
  }
  if (type === CONCEPT_ACTIONS.CREATE_AGENT_HANDOFF && typeof createConceptHandoff !== 'function') {
    throw new Error('dispatchConceptAction requires createConceptHandoff for handoff actions.');
  }
  return executor({ payload, modelActions, createNotebookDraft, createConceptHandoff });
};

export default dispatchConceptAction;
