import React from 'react';
import { render, screen } from '@testing-library/react';
import ProtocolActivityTimeline from './ProtocolActivityTimeline';

describe('ProtocolActivityTimeline', () => {
  it('renders memory approval audit details', () => {
    render(
      <ProtocolActivityTimeline
        thread={{ threadId: 'thread-1', messages: [] }}
        approvalsModel={{
          protocolApprovals: [
            {
              approvalId: 'approval-1',
              op: 'memory.commit',
              status: 'rejected',
              reason: 'Memory steward updates require approval.',
              decisionNote: 'Too broad for the current concept.',
              requestedBy: { actorType: 'native_agent' },
              rejectedBy: { actorType: 'user' },
              rejectedAt: '2026-04-25T12:00:00.000Z',
              preview: {
                threadId: 'thread-1',
                itemCount: 2,
                snippets: [
                  'Current focus: improve the approval flow.',
                  'Next move: keep memory updates reviewable.'
                ]
              }
            }
          ],
          protocolApprovalsLoading: false,
          protocolApprovalsError: ''
        }}
        hookRunsModel={{ hookRuns: [], hookRunsLoading: false, hookRunsError: '' }}
        draftsModel={{ artifactDrafts: [], artifactDraftsLoading: false, artifactDraftsError: '' }}
        formatDateTime={() => 'Apr 25, 2026'}
      />
    );

    expect(screen.getByText('Memory Commit rejected')).toBeInTheDocument();
    expect(screen.getByText(/Decision note: Too broad for the current concept./)).toBeInTheDocument();
    expect(screen.getByText('2 proposed items')).toBeInTheDocument();
    expect(screen.getByText('rejected by user')).toBeInTheDocument();
  });
});
