import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentLaunchLinkCard from './AgentLaunchLinkCard';
import { createAgentTaskLink } from '../../api/agent';

jest.mock('../../api/agent', () => ({
  createAgentTaskLink: jest.fn()
}));

describe('AgentLaunchLinkCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createAgentTaskLink.mockResolvedValue({
      runUrl: 'https://www.noeis.io/a/run/at_123',
      task: { taskId: 'at_123' }
    });
  });

  it('creates an agent launch link for OpenClaw', async () => {
    render(<AgentLaunchLinkCard />);

    fireEvent.change(screen.getByLabelText('Target title'), { target: { value: 'Portfolio concentration' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create launch link' }));

    await waitFor(() => {
      expect(createAgentTaskLink).toHaveBeenCalledWith(expect.objectContaining({
        runtime: 'openclaw',
        taskType: 'qa',
        title: 'Review this Noeis surface',
        target: expect.objectContaining({
          title: 'Portfolio concentration'
        })
      }));
    });
    expect(await screen.findByText('Launch link ready')).toBeInTheDocument();
    expect(screen.getByText('https://www.noeis.io/a/run/at_123')).toBeInTheDocument();
  });
});
