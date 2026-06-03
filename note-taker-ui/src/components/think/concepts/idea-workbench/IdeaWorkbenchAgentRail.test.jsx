import React from 'react';
import { render, screen } from '@testing-library/react';
import IdeaWorkbenchAgentRail from './IdeaWorkbenchAgentRail';

const buildModel = (overrides = {}) => ({
  agentBusy: false,
  agentModeLabel: 'Ready',
  syncError: '',
  agentError: '',
  eventLog: [],
  state: {
    header: { label: 'Idea', title: 'Investing thesis' },
    cards: [],
    agent: { comments: [], messages: [] }
  },
  actions: {
    acceptAgentComment: jest.fn(),
    dismissAgentComment: jest.fn()
  },
  ...overrides
});

describe('IdeaWorkbenchAgentRail', () => {
  it('renders the shared computation ticker in the concept marginalia rail', () => {
    render(
      <IdeaWorkbenchAgentRail
        model={buildModel({
          eventLog: [{ actor: 'agent', type: 'agent_reasoning_completed', payload: { relatedCount: 2 } }],
          state: {
            header: { label: 'Idea', title: 'Investing thesis' },
            cards: [
              { id: 'support-1', zone: 'supports', title: 'Buffett letters', content: 'Cash-flow discipline', createdAt: '2026-05-01T00:00:00.000Z' },
              { id: 'tension-1', zone: 'contradictions', title: 'Concentration risk', content: 'Tail risk', createdAt: '2026-05-02T00:00:00.000Z' },
              { id: 'question-1', zone: 'questions', title: 'How much concentration?', content: 'Open loop', createdAt: '2026-05-03T00:00:00.000Z' }
            ],
            agent: { comments: [], messages: [] }
          }
        })}
      />
    );

    expect(screen.getByLabelText('Thought partner computation trace')).toBeInTheDocument();
    expect(screen.getAllByText('Reasoning pass returned 2 related suggestions.').length).toBeGreaterThan(0);
    expect(screen.getByText('support staged · Buffett letters')).toBeInTheDocument();
    expect(screen.getByText('1 tension visible')).toBeInTheDocument();
  });

  it('shows working ticker lines when the concept agent is busy', () => {
    render(
      <IdeaWorkbenchAgentRail
        model={buildModel({ agentBusy: true })}
      />
    );

    expect(screen.getByText('scanning concept workspace')).toBeInTheDocument();
    expect(screen.getByText('testing Investing thesis')).toBeInTheDocument();
    expect(screen.getByText('drafting marginalia')).toBeInTheDocument();
  });
});
