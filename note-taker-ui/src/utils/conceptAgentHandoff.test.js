import { buildConceptAgentHandoffPayload } from './conceptAgentHandoff';

describe('buildConceptAgentHandoffPayload', () => {
  it('builds a byo-agent handoff payload from the active concept workspace', () => {
    const payload = buildConceptAgentHandoffPayload({
      concept: {
        _id: 'concept-1',
        name: 'Template Concept',
        description: 'Make the claim and the archive line up.'
      },
      state: {
        header: {
          title: 'Template Concept',
          prompt: 'How should this concept sharpen?'
        },
        hypothesis: {
          html: '<p>The archive should strengthen the live draft.</p>'
        },
        cards: [
          { id: 'support-1', zone: 'supports', title: 'Support card', content: 'Support body' },
          { id: 'contradiction-1', zone: 'contradictions', title: 'Contradiction card', content: 'Contradiction body' },
          { id: 'question-1', zone: 'questions', title: 'Open question', content: 'Question body' }
        ]
      },
      currentMaturity: 'forming',
      hypothesisVersion: { label: 'v3' },
      requestedActorId: 'agent-1',
      requestedActorName: 'OpenClaw Researcher'
    });

    expect(payload).toEqual(expect.objectContaining({
      title: 'Concept handoff: Template Concept',
      taskType: 'synthesis',
      priority: 'normal',
      requestedActor: { actorType: 'byo_agent', actorId: 'agent-1' },
      context: expect.objectContaining({
        sourceContextType: 'concept',
        sourceContextId: 'concept-1',
        sourceContextTitle: 'Template Concept',
        conceptName: 'Template Concept',
        requestedActorName: 'OpenClaw Researcher',
        currentMaturity: 'forming',
        hypothesisVersion: 'v3'
      }),
      input: expect.objectContaining({
        concept: expect.objectContaining({
          name: 'Template Concept',
          workingClaim: 'The archive should strengthen the live draft.',
          support: ['Support card'],
          contradictions: ['Contradiction card'],
          openQuestions: ['Open question']
        }),
        seedDraft: expect.objectContaining({
          title: 'Template Concept working claim',
          summary: 'The archive should strengthen the live draft.'
        })
      })
    }));
  });
});
