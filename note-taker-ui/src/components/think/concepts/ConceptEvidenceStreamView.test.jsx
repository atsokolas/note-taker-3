import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConceptEvidenceStreamRail, ConceptPartnerRail } from './ConceptEvidenceStreamView';
import { CONCEPT_ACTIONS } from './idea-workbench/conceptActionDispatch';

jest.mock('./idea-workbench/useIdeaWorkbenchModel', () => ({
  sanitizeAgentReplyText: (value) => value
}));

const buildModel = () => ({
  state: {
    header: {
      title: 'Template Concept'
    },
    cards: [
      {
        id: 'support-1',
        zone: 'supports',
        type: 'highlight',
        title: 'Support card',
        content: 'A supporting passage from the archive.',
        source: 'Article A',
        createdAt: '2026-04-10T00:00:00.000Z'
      },
      {
        id: 'source-1',
        zone: 'workspace',
        type: 'note',
        title: 'Source note',
        content: 'A remembered note worth re-reading.',
        source: 'Notebook',
        createdAt: '2026-04-09T00:00:00.000Z'
      },
      {
        id: 'contradiction-1',
        zone: 'contradictions',
        type: 'highlight',
        title: 'Contradiction card',
        content: 'A source that pushes back on the current claim.',
        source: 'Article B',
        createdAt: '2026-04-08T00:00:00.000Z'
      },
      {
        id: 'question-1',
        zone: 'questions',
        type: 'question',
        title: 'Open question',
        content: 'What evidence is still missing here?',
        source: 'Question',
        createdAt: '2026-04-07T00:00:00.000Z'
      }
    ],
    agent: {
      comments: [
        {
          id: 'comment-1',
          target: 'hypothesis',
          status: 'pending',
          caption: 'Kept separate from your draft until you choose to use it.',
          body: 'Tighten the transition between the claim and the evidence.',
          tone: 'signal',
          suggestedHtml: '<p>Suggested revision</p>'
        },
        {
          id: 'comment-2',
          target: 'hypothesis',
          body: 'Support and tension are now balanced.',
          tone: 'signal'
        }
      ],
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          text: 'Found 2 relevant pieces.',
          suggestedCards: [
            {
              id: 'support-1',
              title: 'Support card'
            }
          ]
        }
      ]
    },
    hypothesis: {
      html: '<p>Draft</p>'
    }
  },
  agentBusy: false,
  freshness: {
    isStale: true,
    unreviewedCount: 2,
    summary: '2 newer sources landed after the last review.',
    preview: ['Fresh source A', 'Fresh source B']
  },
  changeDrafts: [
    {
      id: 'draft-1',
      title: 'Support pull prepared',
      summary: 'Ready to attach 2 supports from your archive.',
      caption: 'Keep the draft quiet until you decide what belongs in the concept.',
      cards: [
        { id: 'draft-card-1', title: 'Support card' }
      ]
    }
  ],
  actions: {
    dispatchConceptAction: jest.fn(),
    sendAgentMessage: jest.fn(),
    acceptAgentComment: jest.fn(),
    dismissAgentComment: jest.fn(),
    applyChangeDraft: jest.fn(),
    dismissChangeDraft: jest.fn(),
    markReviewed: jest.fn(),
    addSuggestedCard: jest.fn(),
    insertCardIntoHypothesis: jest.fn(),
    updateHypothesisHtml: jest.fn()
  }
});

describe('Concept evidence shell surfaces', () => {
  it('renders a calmer collapsed concept map rail', () => {
    const model = buildModel();

    render(
      <ConceptPartnerRail
        concept={{ _id: 'concept-1', name: 'Template Concept' }}
        concepts={[{ _id: 'concept-1', name: 'Template Concept', count: 1 }]}
        selectedConceptName="Template Concept"
        model={model}
        activeSection="assistant"
        onChangeSection={jest.fn()}
        onOpenConcept={jest.fn()}
        collapsed
        onToggleCollapse={jest.fn()}
      />
    );

    expect(screen.getByText('Concept map')).toBeInTheDocument();
    expect(screen.getByText('Quiet context')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand partner rail' })).toBeInTheDocument();
    expect(screen.queryByText('New inquiry')).not.toBeInTheDocument();
  });

  it('keeps one primary prompt block and quick retrieval actions in the context margin', () => {
    const model = buildModel();

    render(
      <ConceptEvidenceStreamRail
        concept={{ _id: 'concept-1', name: 'Template Concept' }}
        model={model}
        activeSection="assistant"
      />
    );

    expect(screen.getByText('Ask for support, contradiction, a cleaner draft, or the piece of prior reading you know is somewhere in the archive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pull support' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find tension' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Related sources' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open questions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clarify draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review freshness' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open notebook draft' })).toBeInTheDocument();
    expect(screen.getByText('Fresh pulls')).toBeInTheDocument();
    expect(screen.getByText('Fresh material waiting')).toBeInTheDocument();
    expect(screen.getByText('Support pull prepared')).toBeInTheDocument();
    expect(screen.getByText('Pending revision')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark current' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply revision' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pull support' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark current' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply revision' }));

    expect(model.actions.dispatchConceptAction).toHaveBeenCalledWith(CONCEPT_ACTIONS.PULL_SUPPORT);
    expect(model.actions.markReviewed).toHaveBeenCalled();
    expect(model.actions.applyChangeDraft).toHaveBeenCalledWith('draft-1');
    expect(model.actions.acceptAgentComment).toHaveBeenCalledWith('comment-1');
  });
});
