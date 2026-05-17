import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Integrations from './Integrations';

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
  bridgeState: {},
  loading: false
}));

jest.mock('../hooks/useHandoffs', () => () => ({
  handoffs: [],
  loading: false,
  sortedPersonalAgents: []
}));

describe('Integrations MCP setup', () => {
  it('shows copy-paste MCP config for the supported agent CLIs', () => {
    render(
      <MemoryRouter>
        <Integrations />
      </MemoryRouter>
    );

    expect(screen.getByText('Noeis wiki MCP + CLI')).toBeInTheDocument();
    expect(screen.getByText('@noeis/wiki-mcp · @noeis/cli')).toBeInTheDocument();
    expect(screen.getByText('Noeis CLI')).toBeInTheDocument();
    expect(screen.getByText(/npm i -g @noeis\/cli/)).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Codex')).toBeInTheDocument();
    expect(screen.getByText('OpenCode')).toBeInTheDocument();
    expect(screen.getByText('Hermes')).toBeInTheDocument();
    expect(screen.getAllByText(/NOEIS_TOKEN/).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/NOEIS_API_URL/)).toBeInTheDocument();
  });
});
