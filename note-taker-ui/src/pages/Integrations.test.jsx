import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Integrations from './Integrations';

jest.mock('./DataIntegrations', () => function MockDataIntegrations() {
  return <div data-testid="connections-sources">Sources panel</div>;
});

jest.mock('../components/integrations/ConnectionsActivity', () => function MockConnectionsActivity() {
  return <div data-testid="connections-activity">Activity panel</div>;
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

jest.mock('../hooks/integrations/useAgentTokens', () => () => ({
  sortedTokens: [],
  tokensLoading: false,
  tokensError: '',
  tokenLabel: '',
  setTokenLabel: jest.fn(),
  tokenScopes: ['read'],
  handleScopeChange: jest.fn(),
  tokenDailyQuota: '',
  setTokenDailyQuota: jest.fn(),
  tokenExpiresAt: '',
  setTokenExpiresAt: jest.fn(),
  creatingToken: false,
  tokenBusyId: '',
  issuedToken: null,
  issuedSecret: '',
  expandedTokenId: '',
  tokenActionsById: {},
  tokenActionsLoadingId: '',
  tokenActionUndoId: '',
  tokenActionsError: '',
  handleCreateToken: jest.fn(),
  handleRevokeToken: jest.fn(),
  handleDeleteToken: jest.fn(),
  handleToggleTokenActivity: jest.fn(),
  handleUndoTokenAction: jest.fn()
}));

describe('Connections center', () => {
  it('moves between Sources, Agents, and Activity without duplicating the global shell', () => {
    render(
      <MemoryRouter>
        <Integrations />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Connections' })).toBeInTheDocument();
    expect(screen.getByText('Bring your reading in. Choose who can work with it.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sources/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('connections-sources')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Agents/ }));
    expect(screen.getByRole('heading', { name: 'Agents you have authorized' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Give instructions' })).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Activity/ }));
    expect(screen.getByTestId('connections-activity')).toBeInTheDocument();
  });
});
