import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThoughtPartnerPanel from './ThoughtPartnerPanel';

jest.mock('../../api/agent', () => ({
  acceptAgentProposedChange: jest.fn(),
  applyAgentStructureProposal: jest.fn(),
  approveAgentProtocolApproval: jest.fn(),
  chatWithAgent: jest.fn(),
  dismissAgentArtifactDraft: jest.fn(),
  getAgentHarnessMetrics: jest.fn(),
  listAgentProposedChanges: jest.fn(),
  listAgentStructureProposals: jest.fn(),
  listAgentProtocolApprovals: jest.fn(),
  listAgentRuns: jest.fn(),
  listAgentArtifactDrafts: jest.fn(),
  promoteAgentArtifactDraft: jest.fn(),
  rejectAgentProtocolApproval: jest.fn(),
  rejectAgentProposedChange: jest.fn(),
  rejectAgentStructureProposal: jest.fn(),
  rollbackAgentProposedChange: jest.fn(),
  rollbackAgentStructureProposal: jest.fn(),
  updateAgentStructureProposal: jest.fn(),
  updateAgentProposedChange: jest.fn(),
  updateAgentArtifactDraft: jest.fn()
}));

const {
  acceptAgentProposedChange,
  applyAgentStructureProposal,
  approveAgentProtocolApproval,
  chatWithAgent,
  getAgentHarnessMetrics,
  listAgentArtifactDrafts,
  listAgentProposedChanges,
  listAgentStructureProposals,
  listAgentProtocolApprovals,
  listAgentRuns,
  rejectAgentProtocolApproval,
  rollbackAgentProposedChange,
  rollbackAgentStructureProposal,
  updateAgentStructureProposal
} = require('../../api/agent');

describe('ThoughtPartnerPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listAgentArtifactDrafts.mockResolvedValue({ drafts: [] });
    getAgentHarnessMetrics.mockResolvedValue({ metrics: null });
    listAgentProtocolApprovals.mockResolvedValue({ approvals: [] });
    listAgentRuns.mockResolvedValue({ runs: [] });
    listAgentProposedChanges.mockResolvedValue({ proposedChanges: [] });
    listAgentStructureProposals.mockResolvedValue({ proposals: [] });
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

  it('renders stream thread messages newest first', () => {
    const { container } = render(
      <ThoughtPartnerPanel
        contextType="library"
        contextId="library-root"
        contextTitle="Library"
        variant="stream"
        thread={{
          threadId: 'thread-1',
          title: 'Library cleanup',
          messages: [
            { role: 'user', text: 'Oldest request.', createdAt: '2026-04-18T12:00:00.000Z' },
            { role: 'assistant', text: 'Middle plan.', createdAt: '2026-04-18T12:01:00.000Z' },
            { role: 'user', text: 'Newest execute command.', createdAt: '2026-04-18T12:02:00.000Z' }
          ]
        }}
      />
    );

    const renderedMessages = [...container.querySelectorAll('.agent-thought-partner__message')]
      .map((node) => node.textContent);
    expect(renderedMessages[0]).toContain('Newest execute command.');
    expect(renderedMessages[2]).toContain('Oldest request.');
  });

  it('submits an explicit execution command from a pending proposal bundle', async () => {
    let observedPayload = null;
    chatWithAgent.mockImplementation(async (payload) => {
      observedPayload = payload;
      return {
        reply: 'Resolved this to "Clean up Library" and executed it.',
        thread: {
          threadId: 'thread-1',
          messages: [
            {
              role: 'assistant',
              text: 'I can clean up the library structure.',
              createdAt: '2026-04-18T12:00:00.000Z',
              proposalBundle: {
                bundleId: 'bundle-cleanup',
                title: 'Clean up Library',
                status: 'pending',
                operations: [
                  { opId: 'organize-workspace', title: 'Clean up Library' }
                ]
              }
            },
            {
              role: 'user',
              text: 'Execute Clean up Library',
              createdAt: '2026-04-18T12:01:00.000Z'
            },
            {
              role: 'assistant',
              text: 'Resolved this to "Clean up Library" and executed it.',
              createdAt: '2026-04-18T12:02:00.000Z'
            }
          ]
        }
      };
    });

    render(
      <ThoughtPartnerPanel
        contextType="library"
        contextId="library-root"
        contextTitle="Library"
        variant="stream"
        thread={{
          threadId: 'thread-1',
          title: 'Library cleanup',
          messages: [
            {
              role: 'assistant',
              text: 'I can clean up the library structure.',
              createdAt: '2026-04-18T12:00:00.000Z',
              proposalBundle: {
                bundleId: 'bundle-cleanup',
                title: 'Clean up Library',
                status: 'pending',
                operations: [
                  { opId: 'organize-workspace', title: 'Clean up Library' }
                ]
              }
            }
          ]
        }}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Execute plan' })[0]);

    await waitFor(() => expect(chatWithAgent).toHaveBeenCalledTimes(1));
    expect(observedPayload).toMatchObject({
      message: 'Execute Clean up Library',
      threadId: 'thread-1'
    });
    await screen.findByText('Resolved this to "Clean up Library" and executed it.');
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
    await screen.findByText('Review stage');
    expect(screen.getByText('Sharper concept description')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(acceptAgentProposedChange).toHaveBeenCalledWith('pc-1'));
    await screen.findByText('applied');
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

    await screen.findByText('Applied history');
    expect(screen.getByText('Sharper notebook content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));

    await waitFor(() => expect(rollbackAgentProposedChange).toHaveBeenCalledWith('pc-2'));
    await screen.findByText('rolled back');
  });

  it('renders structure proposals, updates rejected steps, and applies the plan', async () => {
    listAgentStructureProposals.mockResolvedValue({
      proposals: [
        {
          structureProposalId: 'plan-1',
          status: 'pending',
          scope: 'surface',
          scopeRef: 'notebook',
          title: 'Clean up notebook structure',
          summary: 'Move imported notes into stronger folders.',
          rationale: 'Mirror folders are weaker than your notebook hierarchy.',
          operations: [
            {
              opId: 'move-1',
              type: 'move_item',
              status: 'approved',
              targetDomain: 'notebook',
              payload: { itemId: 'note-1', destinationFolderName: 'Research' },
              preview: { itemTitle: 'World Models notes' },
              isActionable: true
            }
          ]
        }
      ]
    });
    updateAgentStructureProposal.mockResolvedValue({
      proposal: {
        structureProposalId: 'plan-1',
        status: 'pending',
        scope: 'surface',
        scopeRef: 'notebook',
        title: 'Clean up notebook structure',
        summary: 'Move imported notes into stronger folders.',
        rationale: 'Mirror folders are weaker than your notebook hierarchy.',
        operations: [
          {
            opId: 'move-1',
            type: 'move_item',
            status: 'rejected',
            targetDomain: 'notebook',
            payload: { itemId: 'note-1', destinationFolderName: 'Research' },
            preview: { itemTitle: 'World Models notes' },
            isActionable: true
          }
        ]
      }
    });
    applyAgentStructureProposal.mockResolvedValue({
      proposal: {
        structureProposalId: 'plan-1',
        status: 'applied',
        scope: 'surface',
        scopeRef: 'notebook',
        title: 'Clean up notebook structure',
        summary: 'Move imported notes into stronger folders.',
        rationale: 'Mirror folders are weaker than your notebook hierarchy.',
        acceptedAt: '2026-04-20T16:00:00.000Z',
        executionResult: {
          appliedCount: 1,
          skippedCount: 0,
          failedCount: 0
        },
        operations: [
          {
            opId: 'move-1',
            type: 'move_item',
            status: 'applied',
            targetDomain: 'notebook',
            payload: { itemId: 'note-1', destinationFolderName: 'Research' },
            preview: { itemTitle: 'World Models notes' },
            isActionable: true
          }
        ]
      }
    });

    render(
      <ThoughtPartnerPanel
        contextType="notebook"
        contextId="notebook-1"
        contextTitle="Research"
        thread={{
          threadId: 'thread-1',
          messages: []
        }}
      />
    );

    await waitFor(() => expect(listAgentStructureProposals).toHaveBeenCalledWith({ threadId: 'thread-1', status: 'all' }));
    await screen.findByText('Clean up notebook structure');

    fireEvent.click(screen.getByRole('button', { name: 'Reject step' }));
    await waitFor(() => expect(updateAgentStructureProposal).toHaveBeenCalledWith('plan-1', {
      operations: [{ opId: 'move-1', status: 'rejected' }]
    }));
    await screen.findByRole('button', { name: 'Restore step' });

    updateAgentStructureProposal.mockResolvedValueOnce({
      proposal: {
        structureProposalId: 'plan-1',
        status: 'pending',
        scope: 'surface',
        scopeRef: 'notebook',
        title: 'Clean up notebook structure',
        summary: 'Move imported notes into stronger folders.',
        rationale: 'Mirror folders are weaker than your notebook hierarchy.',
        operations: [
          {
            opId: 'move-1',
            type: 'move_item',
            status: 'approved',
            targetDomain: 'notebook',
            payload: { itemId: 'note-1', destinationFolderName: 'Research' },
            preview: { itemTitle: 'World Models notes' },
            isActionable: true
          }
        ]
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Restore step' }));
    await waitFor(() => expect(updateAgentStructureProposal).toHaveBeenCalledWith('plan-1', {
      operations: [{ opId: 'move-1', status: 'approved' }]
    }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply approved changes' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Apply approved changes' }));
    await waitFor(() => expect(applyAgentStructureProposal).toHaveBeenCalledWith('plan-1'));
    await screen.findByText('Applied history');
    await screen.findByRole('button', { name: 'Roll back' });
  });

  it('shows applied structure plan history and rolls it back', async () => {
    listAgentStructureProposals.mockResolvedValue({
      proposals: [
        {
          structureProposalId: 'plan-2',
          status: 'applied',
          scope: 'import_session',
          scopeRef: 'readwise',
          title: 'Organize import',
          summary: 'Merged the import mirror into Research.',
          acceptedAt: '2026-04-20T16:00:00.000Z',
          executionResult: {
            appliedCount: 2,
            skippedCount: 0,
            failedCount: 0
          },
          operations: [
            {
              opId: 'merge-1',
              type: 'merge_folder',
              status: 'applied',
              targetDomain: 'notebook',
              payload: { sourceFolderId: 'folder-readwise', destinationFolderName: 'Research' },
              preview: { sourceFolderName: 'Readwise import' },
              isActionable: true
            }
          ]
        }
      ]
    });
    rollbackAgentStructureProposal.mockResolvedValue({
      proposal: {
        structureProposalId: 'plan-2',
        status: 'rolled_back',
        scope: 'import_session',
        scopeRef: 'readwise',
        title: 'Organize import',
        summary: 'Merged the import mirror into Research.',
        acceptedAt: '2026-04-20T16:00:00.000Z',
        rolledBackAt: '2026-04-20T16:05:00.000Z',
        executionResult: {
          appliedCount: 2,
          skippedCount: 0,
          failedCount: 0
        },
        operations: [
          {
            opId: 'merge-1',
            type: 'merge_folder',
            status: 'rolled_back',
            targetDomain: 'notebook',
            payload: { sourceFolderId: 'folder-readwise', destinationFolderName: 'Research' },
            preview: { sourceFolderName: 'Readwise import' },
            isActionable: true
          }
        ]
      }
    });

    render(
      <ThoughtPartnerPanel
        contextType="notebook"
        contextId="notebook-1"
        contextTitle="Research"
        thread={{
          threadId: 'thread-1',
          messages: []
        }}
      />
    );

    await screen.findByText('Organize import');
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));
    await waitFor(() => expect(rollbackAgentStructureProposal).toHaveBeenCalledWith('plan-2'));
    await screen.findByText(/Rolled back/);
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
    await screen.findByText('Runs');
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
    await screen.findByText('Remove weak source requires approval before the run can continue.');
  });

  it('prioritizes stream review state and submits continue prompts through the composer', async () => {
    let observedPayload = null;
    chatWithAgent.mockImplementation(async (payload) => {
      observedPayload = payload;
      return {
        reply: 'The cleanup thread is ready for the next move.',
        thread: {
          threadId: 'thread-1',
          messages: []
        }
      };
    });
    listAgentStructureProposals.mockResolvedValue({
      proposals: [
        {
          structureProposalId: 'plan-stream',
          status: 'pending',
          scope: 'surface',
          scopeRef: 'library',
          title: 'Clean up library structure',
          summary: 'Group adjacent articles before expanding the archive.',
          rationale: 'Start with a small move set before broader cleanup.',
          operations: [
            {
              opId: 'move-1',
              type: 'move_item',
              status: 'approved',
              targetDomain: 'library',
              payload: { itemId: 'article-1', destinationFolderName: 'Company News' },
              preview: { itemTitle: 'Company update' },
              isActionable: true
            }
          ]
        }
      ]
    });
    getAgentHarnessMetrics.mockResolvedValue({
      metrics: {
        proposedChangeStatuses: { pending: 0 },
        structureProposalStatuses: { pending: 1 },
        funnel: { draftFallbacks: 0, executionIntentMatched: 0 },
        runStatuses: { completed: 0 },
        rates: { bundleResolutionSuccessRate: 0, runCompletionRate: 0 }
      }
    });

    render(
      <ThoughtPartnerPanel
        contextType="library"
        contextId="library-root"
        contextTitle="Library"
        variant="stream"
        submitLabel="Continue"
        thread={{
          threadId: 'thread-1',
          title: 'Library cleanup',
          planner: {
            activeWorkerRole: 'editor',
            activeWorkerLabel: 'Editor',
            rationale: 'Tighten the cleanup plan before you run the next move.'
          },
          plan: {
            objective: 'Restructure the library into clearer clusters.',
            steps: [
              { id: 'step-1', title: 'Sort company updates', status: 'in_progress' }
            ]
          },
          checkpoint: {
            nextActions: ['Review the staged organization plan.']
          },
          messages: []
        }}
      />
    );

    await screen.findAllByText('Organization plan');
    expect(screen.queryByText('Runs')).not.toBeInTheDocument();
    expect(screen.queryByText('Run approvals')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Ask your thought partner…'), {
      target: { value: 'Continue with the library cleanup.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(chatWithAgent).toHaveBeenCalledTimes(1));
    expect(observedPayload).toMatchObject({
      message: 'Continue with the library cleanup.',
      threadId: 'thread-1'
    });
    await screen.findByText('The cleanup thread is ready for the next move.');
  });
});
