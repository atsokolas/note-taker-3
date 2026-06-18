import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConceptEvidenceStreamView, { ConceptEvidenceStreamRail, ConceptPartnerRail } from './ConceptEvidenceStreamView';
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
  hypothesisVersion: {
    label: 'v1'
  },
  freshness: {
    isStale: true,
    unreviewedCount: 2,
    summary: '2 newer sources landed after the last review.',
    preview: ['Fresh source A', 'Fresh source B']
  },
  changeDrafts: [
    {
      id: 'draft-1',
      kind: 'support',
      title: 'Support pull prepared',
      summary: 'Ready to attach 2 supports from your archive.',
      caption: 'Keep the draft quiet until you decide what belongs in the concept.',
      cards: [
        { id: 'draft-card-1', title: 'Support card', zone: 'supports', source: 'Article A' }
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

  it('keeps one primary prompt block and quick retrieval actions in the context margin', async () => {
    const model = buildModel();

    render(
      <ConceptEvidenceStreamRail
        concept={{ _id: 'concept-1', name: 'Template Concept' }}
        model={model}
        activeSection="assistant"
        personalAgents={[{ _id: 'agent-1', name: 'OpenClaw Researcher', status: 'active', preferredWorkerRoles: ['researcher'] }]}
        referencePullInSlot={<div aria-label="Reference pull-in">Reference control</div>}
      />
    );

    expect(screen.getByText('Ask for support, contradiction, a cleaner draft, or the piece of prior reading you know is somewhere in the archive.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Thought partner computation trace')).toHaveTextContent('1 tension visible'));
    fireEvent.click(screen.getByRole('button', { name: /Expand .* trace history lines/ }));
    expect(screen.getByLabelText('Thought partner computation trace')).toHaveTextContent('Found 2 good leads.');
    expect(screen.getByLabelText('Thought partner computation trace')).toHaveTextContent('1 support signal staged');
    expect(screen.getByLabelText('Thought partner computation trace')).toHaveTextContent('1 tension visible');
    expect(screen.getByLabelText('Reference pull-in')).toHaveTextContent('Reference control');
    expect(screen.getByRole('button', { name: 'Pull support' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find tension' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Related sources' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open questions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clarify draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review freshness' })).toBeInTheDocument();
    expect(screen.getByText('Notebook handoff')).toBeInTheDocument();
    expect(screen.getByText('Agent handoff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Essay draft Open the idea into a longer argument with room for counterpoints.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Memo Turn the concept into a decision-ready brief with risks in view.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Research notes Carry evidence, contradictions, and open questions into a lighter note.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OpenClaw Researcher researcher' })).toBeInTheDocument();
    expect(screen.getByText('Pulled material')).toBeInTheDocument();
    expect(screen.getByText('Fresh material waiting')).toBeInTheDocument();
    expect(screen.getByText('Support pull prepared')).toBeInTheDocument();
    expect(screen.getByText('Concept support')).toBeInTheDocument();
    expect(screen.getByText('Pending revision')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark current' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply revision' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add support' })).toBeInTheDocument();
    expect(screen.getByText('Source note')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pull support' }));
    fireEvent.click(screen.getByRole('button', { name: 'Essay draft Open the idea into a longer argument with room for counterpoints.' }));
    fireEvent.click(screen.getByRole('button', { name: 'OpenClaw Researcher researcher' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark current' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add support' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply revision' }));

    expect(model.actions.dispatchConceptAction).toHaveBeenCalledWith(CONCEPT_ACTIONS.PULL_SUPPORT);
    expect(model.actions.dispatchConceptAction).toHaveBeenCalledWith(
      CONCEPT_ACTIONS.CREATE_NOTEBOOK_DRAFT,
      { template: 'essay' }
    );
    expect(model.actions.dispatchConceptAction).toHaveBeenCalledWith(
      CONCEPT_ACTIONS.CREATE_AGENT_HANDOFF,
      { requestedActorId: 'agent-1', requestedActorName: 'OpenClaw Researcher' }
    );
    expect(model.actions.markReviewed).toHaveBeenCalled();
    expect(model.actions.applyChangeDraft).toHaveBeenCalledWith('draft-1');
    expect(model.actions.acceptAgentComment).toHaveBeenCalledWith('comment-1');
  });

  it('keeps provenance, pulled material, and handoff sections collapsed by default', () => {
    const model = buildModel();

    render(
      <ConceptEvidenceStreamRail
        concept={{ _id: 'concept-1', name: 'Template Concept' }}
        model={model}
        activeSection="assistant"
        referencePullInSlot={<div aria-label="Reference pull-in">Reference control</div>}
      />
    );

    expect(screen.getByTestId('concept-rail-provenance')).not.toHaveAttribute('open');
    expect(screen.getByTestId('concept-rail-pulled-material')).not.toHaveAttribute('open');
    expect(screen.getByTestId('concept-rail-handoff')).not.toHaveAttribute('open');
    expect(screen.getByText('Conversation')).toBeVisible();
  });

  it('removes pulled workspace material from the rail after integrating it into the draft', () => {
    const model = buildModel();

    render(
      <ConceptEvidenceStreamRail
        concept={{ _id: 'concept-1', name: 'Template Concept' }}
        model={model}
        activeSection="assistant"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Integrate' }));

    expect(model.actions.insertCardIntoHypothesis).toHaveBeenCalledWith('source-1', { removeCard: true });
  });

  it('keeps the top contradiction visible in the manuscript', () => {
    const model = buildModel();

    render(
      <ConceptEvidenceStreamView
        concept={{ _id: 'concept-1', name: 'Template Concept' }}
        model={model}
      />
    );

    expect(screen.getByTestId('concept-inline-contradiction')).toBeInTheDocument();
    expect(screen.getByText('Pressure point')).toBeInTheDocument();
    expect(screen.getByText('A source that pushes back on the current claim.')).toBeInTheDocument();
    expect(screen.getByText('Article B')).toBeInTheDocument();
  });

  it('lights the draft drop zone when an evidence card is being dragged', () => {
    const model = buildModel();

    render(
      <ConceptEvidenceStreamView
        concept={{ _id: 'concept-1', name: 'Template Concept' }}
        model={model}
      />
    );

    const dropzone = screen.getByTestId('concept-evidence-dropzone');
    expect(dropzone.className).not.toMatch(/is-active/);
    expect(dropzone.className).not.toMatch(/is-hovering/);

    const types = ['application/x-noeis-card-id', 'text/plain'];
    act(() => {
      const dragstart = new Event('dragstart', { bubbles: true });
      Object.defineProperty(dragstart, 'dataTransfer', {
        value: { types, getData: () => 'support-1' }
      });
      document.dispatchEvent(dragstart);
    });

    expect(dropzone.className).toMatch(/is-active/);

    fireEvent.dragOver(dropzone, {
      dataTransfer: { types, getData: () => 'support-1' }
    });
    expect(dropzone.className).toMatch(/is-hovering/);
    expect(screen.getByText('Drop to integrate')).toBeInTheDocument();

    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).not.toMatch(/is-hovering/);

    act(() => {
      const dragend = new Event('dragend', { bubbles: true });
      document.dispatchEvent(dragend);
    });
    expect(dropzone.className).not.toMatch(/is-active/);
  });

  it('integrates a dropped evidence card via onDropCard', () => {
    const model = buildModel();
    const onDropCard = jest.fn();

    render(
      <ConceptEvidenceStreamView
        concept={{ _id: 'concept-1', name: 'Template Concept' }}
        model={model}
        onDropCard={onDropCard}
      />
    );

    const dropzone = screen.getByTestId('concept-evidence-dropzone');
    const types = ['application/x-noeis-card-id'];
    act(() => {
      const dragstart = new Event('dragstart', { bubbles: true });
      Object.defineProperty(dragstart, 'dataTransfer', {
        value: { types, getData: () => 'support-1' }
      });
      document.dispatchEvent(dragstart);
    });

    fireEvent.drop(dropzone, {
      dataTransfer: { types, getData: () => 'support-1' }
    });

    expect(onDropCard).toHaveBeenCalledTimes(1);
    const [card, position, editor] = onDropCard.mock.calls[0];
    expect(card.id).toBe('support-1');
    expect(position).toBeNull();
    expect(editor).toBeNull();
  });
});
