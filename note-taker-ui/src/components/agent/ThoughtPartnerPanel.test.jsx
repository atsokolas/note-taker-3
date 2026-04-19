import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThoughtPartnerPanel from './ThoughtPartnerPanel';

jest.mock('../../api/agent', () => ({
  acceptAgentProposedChange: jest.fn(),
  approveAgentProtocolApproval: jest.fn(),
  chatWithAgent: jest.fn(),
  dismissAgentArtifactDraft: jest.fn(),
  getAgentHarnessMetrics: jest.fn(),
  listAgentProposedChanges: jest.fn(),
  listAgentProtocolApprovals: jest.fn(),
  listAgentRuns: jest.fn(),
  listAgentArtifactDrafts: jest.fn(),
  promoteAgentArtifactDraft: jest.fn(),
  rejectAgentProtocolApproval: jest.fn(),
  rejectAgentProposedChange: jest.fn(),
  rollbackAgentProposedChange: jest.fn(),
  updateAgentProposedChange: jest.fn(),
  updateAgentArtifactDraft: jest.fn()
}));

const {
  acceptAgentProposedChange,
  approveAgentProtocolApproval,
  chatWithAgent,
  getAgentHarnessMetrics,
  listAgentArtifactDrafts,
  listAgentProposedChanges,
  listAgentProtocolApprovals,
  listAgentRuns,
  rejectAgentProtocolApproval,
  rollbackAgentProposedChange
} = require('../../api/agent');

describe('ThoughtPartnerPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listAgentArtifactDrafts.mockResolvedValue({ drafts: [] });
    getAgentHarnessMetrics.mockResolvedValue({ metrics: null });
    listAgentProtocolApprovals.mockResolvedValue({ approvals: [] });
    listAgentRuns.mockResolvedValue({ runs: [] });
    listAgentProposedChanges.mockResolvedValue({ proposedChanges: [] });
    approveAgentProtocolApproval.mockResolvedValue({});
    rejectAgentProtocolApproval.mockResolvedValue({});
  });

  it('does not append a duplicate assistant message when the server thread already includes it', async () => {
    chatWithAgent.mockResolvedValue({
      reply: 'Sharpen the evidence cluster.',
      relatedItems: [],
      thread: {
        threadId: 'thread-1',
        messages: [
          { role: 'user', text: 'Find the strongest support.' },
          { role: 'assistant', text: 'Sharpen the evidence cluster.' }
        ]
      }
    });

    render(
      <ThoughtPartnerPanel
        contextType="article"
        contextId="article-1"
        contextTitle="World Models"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Ask your thought partner…'), {
      target: { value: 'Find the strongest support.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(chatWithAgent).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getAllByText('Sharpen the evidence cluster.')).toHaveLength(1);
    });
  });

  it('renders thread proposed changes and accepts them', async () => {
    listAgentProposedChanges.mockResolvedValue({
      proposedChanges: [
        {
          proposedChangeId: 'pc-1',
          targetType: 'concept',
          targetTitle: 'World Models',
          status: 'pending',
          summary: 'Strengthen World Models',
          proposedSnapshot: {
            description: 'Sharper concept description'
          },
          diffSummary: {
            changedFields: ['description']
          }
        }
      ]
    });
    acceptAgentProposedChange.mockResolvedValue({
      proposedChange: {
        proposedChangeId: 'pc-1',
        targetType: 'concept',
        targetTitle: 'World Models',
        status: 'applied',
        summary: 'Strengthen World Models',
        proposedSnapshot: {
          description: 'Sharper concept description'
        },
        diffSummary: {
          changedFields: ['description']
        }
      }
    });

    render(
      <ThoughtPartnerPanel
        contextType="concept"
        contextId="concept-1"
        contextTitle="World Models"
        thread={{
          threadId: 'thread-1',
          messages: []
        }}
      />
    );

    await waitFor(() => expect(listAgentProposedChanges).toHaveBeenCalledWith({ threadId: 'thread-1', status: 'all' }));
    expect(screen.getByText('Review stage')).toBeInTheDocument();
    expect(screen.getByText('Sharper concept description')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(acceptAgentProposedChange).toHaveBeenCalledWith('pc-1'));
    await waitFor(() => expect(screen.getByText('applied')).toBeInTheDocument());
  });

  it('shows applied change history and rolls back accepted changes', async () => {
    listAgentProposedChanges.mockResolvedValue({
      proposedChanges: [
        {
          proposedChangeId: 'pc-2',
          targetType: 'notebook',
          targetTitle: 'Model drift notes',
          status: 'applied',
          summary: 'Refined notebook synthesis',
          currentSnapshot: {
            content: 'Old notebook content'
          },
          proposedSnapshot: {
            content: 'Sharper notebook content'
          },
          diffSummary: {
            changedFields: ['content']
          },
          acceptedAt: '2026-04-18T12:00:00.000Z'
        }
      ]
    });
    rollbackAgentProposedChange.mockResolvedValue({
      proposedChange: {
        proposedChangeId: 'pc-2',
        targetType: 'notebook',
        targetTitle: 'Model drift notes',
        status: 'rolled_back',
        summary: 'Refined notebook synthesis',
        currentSnapshot: {
          content: 'Old notebook content'
        },
        proposedSnapshot: {
          content: 'Sharper notebook content'
        },
        diffSummary: {
          changedFields: ['content']
        },
        acceptedAt: '2026-04-18T12:00:00.000Z',
        rolledBackAt: '2026-04-18T12:05:00.000Z'
      }
    });

    render(
      <ThoughtPartnerPanel
        contextType="concept"
        contextId="concept-1"
        contextTitle="World Models"
        thread={{
          threadId: 'thread-1',
          messages: []
        }}
      />
    );

    await waitFor(() => expect(screen.getByText('Applied history')).toBeInTheDocument());
    expect(screen.getByText('Sharper notebook content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));

    await waitFor(() => expect(rollbackAgentProposedChange).toHaveBeenCalledWith('pc-2'));
    await waitFor(() => expect(screen.getByText('rolled back')).toBeInTheDocument());
  });

  it('renders run outcomes for the active thread', async () => {
    listAgentRuns.mockResolvedValue({
      runs: [
        {
          runId: 'run-1',
          title: 'Strengthen World Models + 1 more',
          status: 'completed',
          completedStepCount: 2,
          steps: [
            {
              opId: 'attach-material',
              title: 'Pull in 2 related items',
              status: 'applied',
              metadata: {
                result: {
                  type: 'related_material',
                  itemCount: 2
                }
              }
            },
            {
              opId: 'create-handoff',
              title: 'Create a routed handoff',
              status: 'applied',
              metadata: {
                result: {
                  type: 'handoff',
                  handoff: {
                    title: 'World Models: routed handoff'
                  }
                }
              }
            }
          ]
        }
      ]
    });

    render(
      <ThoughtPartnerPanel
        contextType="concept"
        contextId="concept-1"
        contextTitle="World Models"
        thread={{
          threadId: 'thread-1',
          messages: []
        }}
      />
    );

    await waitFor(() => expect(listAgentRuns).toHaveBeenCalledWith({ threadId: 'thread-1', status: 'all' }));
    await waitFor(() => expect(screen.getByText('Runs')).toBeInTheDocument());
    expect(screen.getByText((content) => content.includes('Staged 2 related items.'))).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('Created handoff: World Models: routed handoff.'))).toBeInTheDocument();
  });

  it('shows pending run approvals for the active thread', async () => {
    listAgentProtocolApprovals.mockResolvedValue({
      approvals: [
        {
          approvalId: 'approval-1',
          status: 'pending',
          op: 'runs.resume',
          reason: 'Remove weak source requires approval before the run can continue.',
          preview: {
            title: 'Remove weak source',
            threadId: 'thread-1'
          },
          requestedBy: {
            actorType: 'native_agent'
          }
        }
      ]
    });

    render(
      <ThoughtPartnerPanel
        contextType="concept"
        contextId="concept-1"
        contextTitle="World Models"
        thread={{
          threadId: 'thread-1',
          messages: []
        }}
      />
    );

    await waitFor(() => expect(listAgentProtocolApprovals).toHaveBeenCalledWith({
      status: 'pending',
      limit: 12,
      threadId: 'thread-1',
      handoffId: '',
      op: 'runs.resume'
    }));
    expect(screen.getByText('Run approvals')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Remove weak source requires approval before the run can continue.')).toBeInTheDocument());
  });
});
