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
  bridgeHealth: null,
  bridgeAccessCheckLoading: false,
  bridgeAccessCheckError: '',
  protocolApprovals: [],
  protocolApprovalsLoading: false,
  protocolApprovalsError: '',
  protocolApprovalBusyId: '',
  handleCreateBridgeToken: jest.fn(),
  handleTestBridgeConnection: jest.fn(),
  handleRunBridgeAccessCheck: jest.fn(),
  handleForgetBridgeHealth: jest.fn(),
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
  it('shows a guided OpenClaw connection flow with test and copy actions after minting a token', async () => {
    const bridgeModel = buildBridgeModel();

    render(
      <MemoryRouter>
        <ExternalBridgeCard bridgeModel={bridgeModel} sortedAgents={sortedAgents} />
      </MemoryRouter>
    );

    expect(screen.getByText('Connect OpenClaw or Hermes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Best for delegated research/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /MCP-first runtime/i })).toBeInTheDocument();
    expect(screen.getByText('Bridge quickstart')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test bridge connection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run project access check' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy OpenClaw config' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Test bridge connection' }));
    await waitFor(() => expect(bridgeModel.handleTestBridgeConnection).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Run project access check' }));
    await waitFor(() => expect(bridgeModel.handleRunBridgeAccessCheck).toHaveBeenCalledWith('openclaw'));

    fireEvent.click(screen.getByRole('button', { name: 'Copy OpenClaw config' }));
    await waitFor(() => expect(bridgeModel.handleCopyBridgeConfig).toHaveBeenCalledWith('OpenClaw Researcher', 'openclaw'));
  });

  it('switches to Hermes config and copy action', async () => {
    const bridgeModel = buildBridgeModel();

    render(
      <MemoryRouter>
        <ExternalBridgeCard bridgeModel={bridgeModel} sortedAgents={sortedAgents} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /MCP-first runtime/i }));
    expect(screen.getByText('Hermes MCP config')).toBeInTheDocument();
    expect(screen.getByText(/"transport": "http"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy Hermes config' }));
    await waitFor(() => expect(bridgeModel.handleCopyBridgeConfig).toHaveBeenCalledWith('OpenClaw Researcher', 'hermes'));
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
          protocolHandoffs: true,
          projectSearch: true,
          projectRead: true,
          controlledProjectWrites: true
        },
        access: {
          project: {
            read: true,
            retrieve: true,
            search: true,
            edit: true
          }
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
    expect(screen.getByText('Shared skills')).toBeInTheDocument();
    expect(screen.getByText('Shared threads')).toBeInTheDocument();
    expect(screen.getByText('Protocol handoffs')).toBeInTheDocument();
    expect(screen.getByText('Project search')).toBeInTheDocument();
    expect(screen.getByText('Edit drafts')).toBeInTheDocument();
  });

  it('renders persisted bridge health and access samples', () => {
    const bridgeModel = buildBridgeModel({
      bridgeHealth: {
        status: 'access_verified',
        runtime: 'hermes',
        lastVerifiedAt: '2026-06-05T20:00:00.000Z',
        expiresAt: '2026-06-05T21:00:00.000Z',
        checks: {
          projectSearch: true,
          projectWriteBoundary: true,
          protocolApprovals: true
        },
        sampleResults: [
          { type: 'concept', id: 'concept-1', title: 'Portfolio concentration' }
        ]
      }
    });

    render(
      <MemoryRouter>
        <ExternalBridgeCard bridgeModel={bridgeModel} sortedAgents={sortedAgents} />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Project access verified').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Write boundary')).toBeInTheDocument();
    expect(screen.getByText('concept: Portfolio concentration')).toBeInTheDocument();
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
    expect(screen.getAllByText(/threads\/list/i).length).toBeGreaterThanOrEqual(1);
  });
});
