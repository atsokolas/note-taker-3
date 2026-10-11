import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HandoffQueueCard from './HandoffQueueCard';
import useHandoffs from '../../hooks/useHandoffs';
import { ensureAgentHandoffThread, listAgentHandoffs, listPersonalAgents } from '../../api/agent';

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

describe('HandoffQueueCard', () => {
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
