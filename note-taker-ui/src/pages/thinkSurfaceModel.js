const clean = value => String(value || '').trim();

const identity = value => clean(value?._id || value?.id || value?.threadId || value?.handoffId);

const titleFor = (value = {}, fallbacks = []) => {
  const candidates = [
    value?.name,
    value?.title,
    value?.text,
    value?.label,
    value?.summary,
    ...fallbacks
  ];
  return clean(candidates.find(candidate => clean(candidate)));
};

const TYPE_BY_VIEW = Object.freeze({
  concepts: 'concept',
  questions: 'question',
  threads: 'agent_thread',
  handoffs: 'agent_handoff',
  paths: 'learning_path',
  insights: 'insight'
});

/**
 * Describe the exact Think posture without treating a display name as durable
 * identity. A route id may orient the shell while the object loads; a legacy
 * name-only Concept remains deliberately unresolved until its record arrives.
 */
export const buildThinkSurfaceDescriptor = ({
  activeView = 'concepts',
  concept = null,
  question = null,
  thread = null,
  handoff = null,
  requestedConceptId = '',
  requestedQuestionId = '',
  selectedThreadId = '',
  selectedHandoffId = '',
  selectedPathId = '',
  selectedInsightId = '',
  conceptName = '',
  wikiPageId = '',
  revisionId = '',
  claimId = '',
  investigation = false
} = {}) => {
  const view = clean(activeView).toLowerCase() || 'concepts';
  let object = null;
  let objectId = '';

  if (view === 'concepts') {
    object = concept;
    objectId = clean(requestedConceptId) || identity(concept);
  } else if (view === 'questions') {
    object = question;
    objectId = clean(requestedQuestionId) || identity(question);
  } else if (view === 'threads') {
    object = thread;
    objectId = clean(selectedThreadId) || identity(thread);
  } else if (view === 'handoffs') {
    object = handoff;
    objectId = clean(selectedHandoffId) || identity(handoff);
  } else if (view === 'paths') {
    objectId = clean(selectedPathId);
  } else if (view === 'insights') {
    objectId = clean(selectedInsightId);
  }

  const objectType = TYPE_BY_VIEW[view] || `think_${view}`;
  const title = titleFor(object, [
    view === 'concepts' ? conceptName : '',
    objectId ? `${objectType.replace(/_/g, ' ')} workspace` : '',
    'Think'
  ]);

  return {
    room: 'think',
    objectType,
    objectId,
    title,
    projection: view,
    mode: investigation ? 'investigate' : 'develop',
    pageId: clean(wikiPageId),
    revisionId: clean(revisionId),
    claimId: clean(claimId),
    orientation: investigation
      ? 'Work this exact accepted Wiki context without changing what was already settled.'
      : objectId
        ? 'Develop this unfinished thought and keep its evidence attached.'
        : 'Choose an exact thought to develop; unresolved names are not treated as identity.'
  };
};

export default buildThinkSurfaceDescriptor;
