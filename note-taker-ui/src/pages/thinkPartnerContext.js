export const resolveThoughtPartnerContext = ({
  activeView = '',
  concept = null,
  activeNotebookEntry = null,
  activeQuestionData = null,
  activeHandoffData = null
} = {}) => {
  if (activeView === 'concepts' && concept?._id) {
    return {
      contextType: 'concept',
      contextId: concept._id,
      contextTitle: concept.name || 'Concept',
      placeholder: 'Ask about this concept, or find connected notes.'
    };
  }

  if (activeView === 'notebook' && activeNotebookEntry?._id) {
    return {
      contextType: 'notebook',
      contextId: activeNotebookEntry._id,
      contextTitle: activeNotebookEntry.title || 'Notebook note',
      placeholder: 'Ask about this notebook entry, or find related material.'
    };
  }

  if (activeView === 'questions' && activeQuestionData?._id) {
    return {
      contextType: 'question',
      contextId: activeQuestionData._id,
      contextTitle: activeQuestionData.text || 'Question',
      placeholder: 'Ask through this question and its linked concept.'
    };
  }

  if (activeView === 'handoffs' && activeHandoffData?.handoffId) {
    return {
      contextType: 'handoff',
      contextId: activeHandoffData.handoffId,
      contextTitle: activeHandoffData.title || 'Agent handoff',
      placeholder: 'Ask how to refine, route, or unblock this handoff.'
    };
  }

  return null;
};

export default resolveThoughtPartnerContext;
