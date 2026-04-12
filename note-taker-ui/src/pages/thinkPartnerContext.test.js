import { resolveThoughtPartnerContext } from './thinkPartnerContext';

describe('resolveThoughtPartnerContext', () => {
  it('anchors question surfaces to the active question instead of the linked concept name', () => {
    const context = resolveThoughtPartnerContext({
      activeView: 'questions',
      activeQuestionData: {
        _id: 'question-1',
        text: 'Why do world models drift from reality?',
        linkedTagName: 'World Models'
      }
    });

    expect(context).toEqual({
      contextType: 'question',
      contextId: 'question-1',
      contextTitle: 'Why do world models drift from reality?',
      placeholder: 'Ask through this question and its linked concept.'
    });
  });

  it('keeps concept surfaces anchored to the concept id', () => {
    const context = resolveThoughtPartnerContext({
      activeView: 'concepts',
      concept: {
        _id: 'concept-1',
        name: 'World Models'
      }
    });

    expect(context).toEqual({
      contextType: 'concept',
      contextId: 'concept-1',
      contextTitle: 'World Models',
      placeholder: 'Ask about this concept, or find connected notes.'
    });
  });
});
