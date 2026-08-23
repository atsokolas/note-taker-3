import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  /* The ticker types its active line out one character at a time, so in a test
     the newest line is empty unless we say the reader prefers reduced motion.
     We are asserting what the ticker says, not how it animates. */
  beforeEach(() => {
    window.matchMedia = query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {}
    });
  });

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

    /* The ticker types one line and folds the rest behind its history control,
       so only the newest is on screen. These tests were written when every
       line rendered at once. Assert what the ticker actually promises: the
       last line is showing, and the earlier ones are one click away. */
    expect(screen.getByText('1 tension visible')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Expand 2 trace history lines/i }));
    const history = screen.getByLabelText('Trace history');
    expect(within(history).getByText('Reasoning pass returned 2 related suggestions.')).toBeInTheDocument();
    expect(within(history).getByText('support staged · Buffett letters')).toBeInTheDocument();
  });

  it('shows working ticker lines when the concept agent is busy', () => {
    render(
      <IdeaWorkbenchAgentRail
        model={buildModel({ agentBusy: true })}
      />
    );

    expect(screen.getByText('drafting marginalia')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Expand 2 trace history lines/i }));
    const history = screen.getByLabelText('Trace history');
    expect(within(history).getByText('scanning concept workspace')).toBeInTheDocument();
    expect(within(history).getByText('testing Investing thesis')).toBeInTheDocument();
  });
});
