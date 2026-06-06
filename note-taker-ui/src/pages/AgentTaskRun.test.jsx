import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AgentTaskRun from './AgentTaskRun';
import { dispatchAgentTaskLink, getAgentTaskLink } from '../api/agent';

jest.mock('../api/agent', () => ({
  getAgentTaskLink: jest.fn(),
  dispatchAgentTaskLink: jest.fn()
}));

describe('AgentTaskRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAgentTaskLink.mockResolvedValue({
      task: {
        taskId: 'at_123',
        runtime: 'openclaw',
        runtimeLabel: 'OpenClaw',
        title: 'Review wiki page',
        objective: 'Find gaps and draft changes.',
        taskType: 'qa',
        priority: 'normal',
        target: { type: 'wiki_page', id: 'page-1', title: 'Portfolio concentration' },
        status: 'pending'
      }
    });
    dispatchAgentTaskLink.mockRejectedValue({
      response: {
        status: 409,
        data: {
          status: 'connection_required',
          runtime: 'openclaw',
          runtimeLabel: 'OpenClaw',
          connectCommand: 'noeis connect openclaw',
          connectPath: '/integrations?connect=openclaw',
          task: {
            taskId: 'at_123',
            runtime: 'openclaw',
            runtimeLabel: 'OpenClaw',
            title: 'Review wiki page',
            objective: 'Find gaps and draft changes.',
            taskType: 'qa',
            priority: 'normal',
            target: { type: 'wiki_page', id: 'page-1', title: 'Portfolio concentration' },
            status: 'pending'
          }
        }
      }
    });
  });

  it('shows the connect command when the runtime is not connected', async () => {
    render(
      <BrowserRouter>
        <AgentTaskRun taskIdOverride="at_123" />
      </BrowserRouter>
    );

    expect(await screen.findByText('Review wiki page')).toBeInTheDocument();
    expect(screen.getByText('Portfolio concentration')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run with OpenClaw' }));

    await waitFor(() => {
      expect(dispatchAgentTaskLink).toHaveBeenCalledWith('at_123');
    });
    expect(await screen.findByText('Connect OpenClaw first.')).toBeInTheDocument();
    expect(screen.getByText('noeis connect openclaw')).toBeInTheDocument();
  });
});
