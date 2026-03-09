import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HandoffCreateForm from './HandoffCreateForm';

describe('HandoffCreateForm', () => {
  it('shows setup-agent callout when personal-agent routing is selected with no active agents', () => {
    render(
      <MemoryRouter>
        <HandoffCreateForm
          mode="integrations"
          sortedAgents={[]}
          title="Queue cleanup"
          onTitleChange={() => {}}
          objective=""
          onObjectiveChange={() => {}}
          taskType="research"
          onTaskTypeChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          dueAt=""
          onDueAtChange={() => {}}
          autoRoute={false}
          onAutoRouteChange={() => {}}
          requestedActorType="byo_agent"
          onRequestedActorTypeChange={() => {}}
          requestedActorId=""
          onRequestedActorIdChange={() => {}}
          setupAgentsHref="/integrations#personal-agents"
          creating={false}
          onCreate={() => {}}
          error=""
          info=""
        />
      </MemoryRouter>
    );

    expect(screen.getByText('No active personal agents yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up an agent' })).toHaveAttribute('href', '/integrations#personal-agents');
  });
});
