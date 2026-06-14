import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Integrations from './Integrations';

jest.mock('./DataIntegrations', () => function MockDataIntegrations() {
  return <div data-testid="connections-sources">Sources panel</div>;
});

jest.mock('../api/agent', () => ({
  createAgentTaskLink: jest.fn()
}));

jest.mock('../hooks/integrations/usePersonalAgents', () => () => ({
  sortedAgents: [],
  agentsLoading: false,
  agentsError: '',
  agentName: '',
  setAgentName: jest.fn(),
  agentWorkerRoles: [],
  setAgentWorkerRoles: jest.fn(),
  creatingAgent: false,
  newAgentKey: '',
  handleCreateAgent: jest.fn()
}));

jest.mock('../hooks/integrations/useAgentEntitlements', () => () => ({
  entitlements: {},
  entitlementsLoading: false
}));

jest.mock('../hooks/integrations/useAgentProtocolPolicy', () => () => ({
  policy: {},
  loading: false
}));

jest.mock('../hooks/integrations/useAgentBridge', () => () => ({
  bridgeActorType: 'byo_agent',
  setBridgeActorType: jest.fn(),
  bridgeActorId: '',
  setBridgeActorId: jest.fn(),
  bridgeScope: 'agent_ops',
  setBridgeScope: jest.fn(),
  bridgeTtl: 1800,
  setBridgeTtl: jest.fn(),
  bridgeBusy: false,
  bridgeError: '',
  bridgeToken: '',
  bridgeManifestLoading: false,
  bridgeManifestError: '',
  bridgeManifest: null,
  bridgeHealth: null,
  bridgeAccessCheckLoading: false,
  bridgeAccessCheckError: '',
  bridgeCopyStatus: '',
  bridgeMeta: { scope: 'agent_ops', expiresInSec: 1800 },
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
  handleRejectProtocolApproval: jest.fn()
}));

jest.mock('../hooks/useHandoffs', () => () => ({
  handoffs: [],
  loading: false,
  sortedPersonalAgents: []
}));

describe('Connections center', () => {
  it('embeds sources, agents, and advanced sections in one model', () => {
    render(
      <MemoryRouter>
        <Integrations />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Connect sources and agents' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bring in your reading layer' })).toBeInTheDocument();
    expect(screen.getByTestId('connections-sources')).toBeInTheDocument();
    expect(screen.getByText(/Readwise browser OAuth is the primary path/)).toBeInTheDocument();
    expect(screen.getByText('Connect an agent to Noeis')).toBeInTheDocument();
    expect(screen.getByText(/Read https:\/\/www\.noeis\.io\/skill\.md/)).toBeInTheDocument();
    expect(screen.getByText(/npm install -g @noeis\/noeis-cli/)).toBeInTheDocument();
    expect(screen.getByText(/noeis connect openclaw/)).toBeInTheDocument();
    expect(screen.getByText('Create an agent task link')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Advanced source import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Connect Readwise in the browser/i })).not.toBeInTheDocument();
  });
});
