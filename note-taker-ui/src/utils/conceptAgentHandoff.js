const clean = (value = '') => String(value || '').trim();

const stripHtml = (value = '') => clean(
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
);

const summarizeCards = (cards = [], zone = '', limit = 4) => (
  (Array.isArray(cards) ? cards : [])
    .filter((card) => clean(card?.zone) === zone)
    .slice(0, limit)
    .map((card) => clean(card?.title || card?.content))
    .filter(Boolean)
);

export const buildConceptAgentHandoffPayload = ({
  concept,
  state,
  currentMaturity = '',
  hypothesisVersion = {},
  requestedActorId = '',
  requestedActorName = ''
}) => {
  const conceptId = clean(concept?._id);
  const conceptName = clean(concept?.name) || clean(state?.header?.title) || 'Untitled concept';
  const framing = clean(concept?.description) || clean(state?.header?.prompt) || 'Review the active concept and move it forward.';
  const workingClaim = stripHtml(state?.hypothesis?.html || '');
  const cards = Array.isArray(state?.cards) ? state.cards : [];
  const support = summarizeCards(cards, 'supports', 4);
  const contradictions = summarizeCards(cards, 'contradictions', 3);
  const openQuestions = summarizeCards(cards, 'questions', 3);

  return {
    title: `Concept handoff: ${conceptName}`,
    objective: `Review ${conceptName}, pressure-test the current claim, and propose the next pass back in Think.`,
    taskType: 'synthesis',
    priority: 'normal',
    requestedActor: {
      actorType: 'byo_agent',
      actorId: clean(requestedActorId)
    },
    context: {
      sourceContextType: 'concept',
      sourceContextId: conceptId || conceptName,
      sourceContextTitle: conceptName,
      conceptId,
      conceptName,
      requestedActorName: clean(requestedActorName),
      currentMaturity: clean(currentMaturity),
      hypothesisVersion: clean(hypothesisVersion?.label),
      launchedFrom: 'concept-editorial-rail'
    },
    input: {
      concept: {
        name: conceptName,
        framing,
        workingClaim,
        support,
        contradictions,
        openQuestions
      },
      seedDraft: {
        title: `${conceptName} working claim`,
        summary: workingClaim || framing,
        body: workingClaim || framing,
        outputType: 'concept_brief'
      }
    }
  };
};

export default buildConceptAgentHandoffPayload;
