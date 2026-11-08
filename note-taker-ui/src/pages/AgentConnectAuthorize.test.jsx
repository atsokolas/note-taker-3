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
        scopes: ['read'],
        requestedApiUrl: 'https://api.noeis.example',
        expiresAt: '2026-09-17T13:00:00.000Z',
        status: 'pending'
      }
    });
    approveAgentConnectSession.mockResolvedValue({
      session: {
        sessionId: 'nac_123',
        runtimeLabel: 'Hermes',
        label: 'Hermes local',
        status: 'approved',
        scopes: ['read']
      },
      token: { label: 'Hermes local' }
    });
  });

  it('approves a local agent connection request', async () => {
    render(
      <BrowserRouter>
        <AgentConnectAuthorize searchOverride="?session=nac_123" />
      </BrowserRouter>
    );

    expect(await screen.findByText('Hermes, as it describes itself')).toBeInTheDocument();
    expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
    expect(screen.getByText('Read and search everything you have saved and written')).toBeInTheDocument();
    expect(screen.getByText('https://api.noeis.example')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(approveAgentConnectSession).toHaveBeenCalledWith('nac_123', { deviceCode: 'ABCD-1234' });
    });
    expect(await screen.findByText('Approved.')).toBeInTheDocument();
  });
});
