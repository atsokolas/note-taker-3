import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConnectionsAgents from './ConnectionsAgents';

const makeTokenModel = () => ({
  sortedTokens: [{
    id: 'token-1',
    label: 'Research companion',
    runtime: 'codex',
    scopes: ['read'],
    status: 'active',
    lastUsedAt: null,
    createdAt: '2026-09-17T10:00:00.000Z'
  }],
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
});

describe('Connections agents', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined)
      }
    });
  });

  it('shows named grants without claiming an unused grant is ready', () => {
    render(
      <MemoryRouter>
        <ConnectionsAgents tokenModel={makeTokenModel()} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Agents you have authorized' })).toBeInTheDocument();
    expect(screen.getByText('Research companion')).toBeInTheDocument();
    expect(screen.getByText('Codex · Read only')).toBeInTheDocument();
    expect(screen.getByText('Approved · waiting for first request')).toBeInTheDocument();
  });

  it('copies a read-only handoff without issuing a credential or starting a task', async () => {
    const tokenModel = makeTokenModel();
    render(
      <MemoryRouter>
        <ConnectionsAgents tokenModel={tokenModel} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Give instructions' }));
    fireEvent.change(screen.getByLabelText('Name this connection'), {
      target: { value: 'Weekend research' }
    });
    fireEvent.change(screen.getByLabelText('Where does your agent run?'), {
      target: { value: 'openclaw' }
    });
    fireEvent.click(screen.getByRole('radio', { name: /Read NOEIS/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy instructions' }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
    const copied = navigator.clipboard.writeText.mock.calls[0][0];
    expect(copied).toContain('noeis connect openclaw --scope read');
    expect(copied).toContain('Do not start the task');
    expect(tokenModel.handleCreateToken).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Instructions copied. Nothing was authorized.');
  });

  it('keeps revoke consequences beside the exact grant', async () => {
    const tokenModel = makeTokenModel();
    render(
      <MemoryRouter>
        <ConnectionsAgents tokenModel={tokenModel} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage Research companion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this access' }));

    expect(screen.getByText(/Future requests using this credential will stop/i)).toBeInTheDocument();
    expect(screen.getByText(/Already imported material and completed work stay/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
    expect(tokenModel.handleRevokeToken).toHaveBeenCalledWith('token-1');
  });
});
