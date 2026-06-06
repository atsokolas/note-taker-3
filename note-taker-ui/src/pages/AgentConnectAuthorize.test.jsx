import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AgentConnectAuthorize from './AgentConnectAuthorize';
import { approveAgentConnectSession, getAgentConnectApprovalSession } from '../api/agent';

jest.mock('../api/agent', () => ({
  getAgentConnectApprovalSession: jest.fn(),
  approveAgentConnectSession: jest.fn()
}));

describe('AgentConnectAuthorize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAgentConnectApprovalSession.mockResolvedValue({
      session: {
        sessionId: 'nac_123',
        deviceCode: 'ABCD-1234',
        runtimeLabel: 'Hermes',
        label: 'Hermes local',
        scopes: ['read', 'agent-write'],
        status: 'pending'
      }
    });
    approveAgentConnectSession.mockResolvedValue({
      session: {
        sessionId: 'nac_123',
        runtimeLabel: 'Hermes',
        label: 'Hermes local',
        status: 'approved',
        scopes: ['read', 'agent-write']
      },
      token: { label: 'Hermes local' }
    });
  });

  it('approves a local agent connection request', async () => {
    render(
      <BrowserRouter>
        <AgentConnectAuthorize searchOverride="?session=nac_123&secret=poll_secret" />
      </BrowserRouter>
    );

    expect(await screen.findByText('Hermes')).toBeInTheDocument();
    expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
    expect(screen.getByText('Read, search, and retrieve your Noeis workspace')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve agent' }));

    await waitFor(() => {
      expect(approveAgentConnectSession).toHaveBeenCalledWith('nac_123', { pollSecret: 'poll_secret' });
    });
    expect(await screen.findByText('Agent connected.')).toBeInTheDocument();
  });
});
