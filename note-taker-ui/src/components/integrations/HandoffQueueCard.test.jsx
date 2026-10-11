import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HandoffQueueCard from './HandoffQueueCard';
import useHandoffs from '../../hooks/useHandoffs';
import { claimAgentHandoff, ensureAgentHandoffThread, listAgentHandoffs, listPersonalAgents } from '../../api/agent';

jest.mock('../../api/agent', () => ({
  cancelAgentHandoff: jest.fn(),
  claimAgentHandoff: jest.fn(),
  completeAgentHandoff: jest.fn(),
  createAgentHandoff: jest.fn(),
  createAutoAgentHandoff: jest.fn(),
  ensureAgentHandoffThread: jest.fn(),
  listAgentHandoffs: jest.fn(),
  listPersonalAgents: jest.fn(),
  rejectAgentHandoff: jest.fn()
}));

const Queue = ({ onOpenThread }) => {
  const handoffsModel = useHandoffs({ enabled: true, personalAgentsOverride: [], initialStatusFilter: 'all', onOpenThread });
  return <HandoffQueueCard handoffsModel={handoffsModel} />;
};

const claimable = { handoffId: 'h1', title: 'Summarise the moats reading', status: 'claimed', events: [] };

describe('HandoffQueueCard', () => {
  beforeEach(() => {
    listPersonalAgents.mockResolvedValue({ agents: [] });
    listAgentHandoffs.mockResolvedValue({ handoffs: [claimable] });
  });

  it('says when an action waits on approval', async () => {
    claimAgentHandoff.mockResolvedValue({ status: 'approval_required', reason: 'Claim waits on your approval.' });
    render(<Queue />);

    fireEvent.click(await screen.findByRole('button', { name: 'Claim' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Claim waits on your approval.');
  });

  it('opens the thread a handoff\'s agent writes in', async () => {
    listPersonalAgents.mockResolvedValue({ agents: [] });
    listAgentHandoffs.mockResolvedValue({ handoffs: [{ handoffId: 'h1', title: 'Summarise the moats reading', status: 'claimed', events: [] }] });
    ensureAgentHandoffThread.mockResolvedValue({ thread: { threadId: 'thread-9' } });
    const onOpenThread = jest.fn();
    render(<Queue onOpenThread={onOpenThread} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open its thread' }));

    await waitFor(() => expect(onOpenThread).toHaveBeenCalledWith('thread-9'));
    expect(ensureAgentHandoffThread).toHaveBeenCalledWith('h1');
  });
});
