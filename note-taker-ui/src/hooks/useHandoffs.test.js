import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import useHandoffs from './useHandoffs';
import {
  createAgentHandoff,
  createAutoAgentHandoff,
  listAgentHandoffs,
  listPersonalAgents
} from '../api/agent';

jest.mock('../api/agent', () => ({
  cancelAgentHandoff: jest.fn(),
  claimAgentHandoff: jest.fn(),
  completeAgentHandoff: jest.fn(),
  createAgentHandoff: jest.fn(),
  createAutoAgentHandoff: jest.fn(),
  listAgentHandoffs: jest.fn(),
  listPersonalAgents: jest.fn(),
  rejectAgentHandoff: jest.fn()
}));

const HookProbe = ({ overrideAgents = [], initialStatusFilter = 'all' }) => {
  const model = useHandoffs({
    enabled: true,
    personalAgentsOverride: overrideAgents,
    initialStatusFilter
  });

  return (
    <div>
      <span data-testid="actor">{model.formatActor({ actorType: 'byo_agent', actorId: 'agent-1' })}</span>
      <span data-testid="create-info">{model.handoffCreateInfo}</span>
      <input
        aria-label="handoff-title"
        value={model.newHandoffTitle}
        onChange={(event) => model.setNewHandoffTitle(event.target.value)}
      />
      <button type="button" onClick={model.handleCreateHandoff}>
        create
      </button>
    </div>
  );
};

describe('useHandoffs', () => {
  beforeEach(() => {
    listPersonalAgents.mockReset();
    listAgentHandoffs.mockReset();
    createAutoAgentHandoff.mockReset();
    createAgentHandoff.mockReset();

    listAgentHandoffs.mockResolvedValue({ handoffs: [] });
    listPersonalAgents.mockResolvedValue([]);
    createAutoAgentHandoff.mockResolvedValue({
      handoff: { handoffId: 'h-1' },
      planner: { routeSource: 'balanced' }
    });
    createAgentHandoff.mockResolvedValue({ handoff: { handoffId: 'h-2' } });
  });

  it('uses override agents and skips loading personal agents', async () => {
    render(
      <HookProbe
        initialStatusFilter="all"
        overrideAgents={[{ _id: 'agent-1', name: 'Agent One', status: 'active', updatedAt: '2025-01-01T00:00:00Z' }]}
      />
    );

    await waitFor(() => {
      expect(listAgentHandoffs).toHaveBeenCalledWith({ status: 'all', limit: 80 });
    });
    expect(listPersonalAgents).not.toHaveBeenCalled();
    expect(screen.getByTestId('actor')).toHaveTextContent('Agent One');
  });

  it('creates auto-routed handoff and refreshes queue', async () => {
    render(<HookProbe overrideAgents={[]} />);

    fireEvent.change(screen.getByLabelText('handoff-title'), { target: { value: 'Investigate source mismatch' } });
    fireEvent.click(screen.getByText('create'));

    await waitFor(() => {
      expect(createAutoAgentHandoff).toHaveBeenCalledTimes(1);
    });
    expect(createAgentHandoff).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-info')).toHaveTextContent('Auto-routed via balanced.');
    expect(listAgentHandoffs.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
