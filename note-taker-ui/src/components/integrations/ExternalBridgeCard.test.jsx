import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExternalBridgeCard from './ExternalBridgeCard';

const buildBridgeModel = (overrides = {}) => ({
  bridgeActorType: 'byo_agent',
  setBridgeActorType: jest.fn(),
  bridgeActorId: 'agent-1',
  setBridgeActorId: jest.fn(),
  bridgeScope: 'agent_ops',
  setBridgeScope: jest.fn(),
  bridgeTtl: 1800,
  setBridgeTtl: jest.fn(),
  bridgeBusy: false,
  bridgeError: '',
  bridgeToken: 'bridge-token-123',
  bridgeManifestLoading: false,
  bridgeManifestError: '',
  bridgeManifest: null,
  protocolApprovals: [],
  protocolApprovalsLoading: false,
  protocolApprovalsError: '',
  protocolApprovalBusyId: '',
  handleCreateBridgeToken: jest.fn(),
  handleTestBridgeConnection: jest.fn(),
  handleCopyBridgeConfig: jest.fn(),
  handleApproveProtocolApproval: jest.fn(),
  handleRejectProtocolApproval: jest.fn(),
  ...overrides
});

const sortedAgents = [
  {
    _id: 'agent-1',
    name: 'OpenClaw Researcher',
    status: 'active',
    preferredWorkerRoles: ['researcher']
  }
];

describe('ExternalBridgeCard', () => {
  it('shows a bridge quickstart flow with test and copy actions after minting a token', async () => {
    const bridgeModel = buildBridgeModel();

    render(
      <MemoryRouter>
        <ExternalBridgeCard bridgeModel={bridgeModel} sortedAgents={sortedAgents} />
      </MemoryRouter>
    );

    expect(screen.getByText('Bridge quickstart')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test bridge connection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy OpenClaw config' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Test bridge connection' }));
    await waitFor(() => expect(bridgeModel.handleTestBridgeConnection).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Copy OpenClaw config' }));
    await waitFor(() => expect(bridgeModel.handleCopyBridgeConfig).toHaveBeenCalledTimes(1));
  });

  it('renders manifest verification details after a successful test', () => {
    const bridgeModel = buildBridgeModel({
      bridgeManifest: {
        protocol: 'note-taker-agent-bridge-v1',
        scope: 'agent_ops',
        actor: {
          actorType: 'byo_agent',
          actorId: 'agent-1'
        },
        capabilities: {
          sharedSkills: true,
          sharedThreads: true,
          protocolHandoffs: true
        }
      }
    });

    render(
      <MemoryRouter>
        <ExternalBridgeCard bridgeModel={bridgeModel} sortedAgents={sortedAgents} />
      </MemoryRouter>
    );

    expect(screen.getByText('Bridge verified')).toBeInTheDocument();
    expect(screen.getByText(/note-taker-agent-bridge-v1 for/i)).toBeInTheDocument();
    expect(screen.getByText(/shared skills .* shared threads .* protocol handoffs/i)).toBeInTheDocument();
  });

  it('moves long examples into the Reference tab', () => {
    const bridgeModel = buildBridgeModel();

    render(
      <MemoryRouter>
        <ExternalBridgeCard bridgeModel={bridgeModel} sortedAgents={sortedAgents} />
      </MemoryRouter>
    );

    expect(screen.queryByText('Bridge methods')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Reference' }));
    expect(screen.getByText('Bridge methods')).toBeInTheDocument();
    expect(screen.getByText(/threads\/list/i)).toBeInTheDocument();
  });
});
