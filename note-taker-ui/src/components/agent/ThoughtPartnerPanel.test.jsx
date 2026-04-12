import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThoughtPartnerPanel from './ThoughtPartnerPanel';

jest.mock('../../api/agent', () => ({
  chatWithAgent: jest.fn(),
  dismissAgentArtifactDraft: jest.fn(),
  listAgentArtifactDrafts: jest.fn(),
  promoteAgentArtifactDraft: jest.fn(),
  updateAgentArtifactDraft: jest.fn()
}));

const {
  chatWithAgent,
  listAgentArtifactDrafts
} = require('../../api/agent');

describe('ThoughtPartnerPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listAgentArtifactDrafts.mockResolvedValue({ drafts: [] });
  });

  it('does not append a duplicate assistant message when the server thread already includes it', async () => {
    chatWithAgent.mockResolvedValue({
      reply: 'Sharpen the evidence cluster.',
      relatedItems: [],
      thread: {
        threadId: 'thread-1',
        messages: [
          { role: 'user', text: 'Find the strongest support.' },
          { role: 'assistant', text: 'Sharpen the evidence cluster.' }
        ]
      }
    });

    render(
      <ThoughtPartnerPanel
        contextType="article"
        contextId="article-1"
        contextTitle="World Models"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Ask your thought partner…'), {
      target: { value: 'Find the strongest support.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(chatWithAgent).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getAllByText('Sharpen the evidence cluster.')).toHaveLength(1);
    });
  });
});
