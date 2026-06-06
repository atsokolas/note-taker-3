import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Integrations from './Integrations';

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

describe('Integrations MCP setup', () => {
  it('leads with one-command connect and keeps manual MCP config available', () => {
    render(
      <MemoryRouter>
        <Integrations />
      </MemoryRouter>
    );

    expect(screen.getByText('One-command agent connect')).toBeInTheDocument();
    expect(screen.getByText('Agent launch links')).toBeInTheDocument();
    expect(screen.getByText(/feeds a specific task to OpenClaw/i)).toBeInTheDocument();
    expect(screen.getByText('@noeis/wiki-mcp · @noeis/cli')).toBeInTheDocument();
    expect(screen.getByText('Recommended setup')).toBeInTheDocument();
    expect(screen.getByText(/npm i -g @noeis\/cli/)).toBeInTheDocument();
    expect(screen.getByText(/noeis connect hermes/)).toBeInTheDocument();
    expect(screen.getByText(/noeis connect openclaw/)).toBeInTheDocument();
    expect(screen.getByText('Manual setup')).toBeInTheDocument();
    expect(screen.getAllByText('Claude Code').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Codex').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('OpenCode').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Hermes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Connect OpenClaw or Hermes')).toBeInTheDocument();
    expect(screen.getAllByText(/NOEIS_TOKEN/).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/NOEIS_API_URL/)).toBeInTheDocument();
  });
});
