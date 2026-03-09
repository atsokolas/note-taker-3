import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HandoffQueueControls from './HandoffQueueControls';

describe('HandoffQueueControls', () => {
  it('handles think-mode status/actor changes and refresh', () => {
    const onStatusFilterChange = jest.fn();
    const onQueueActorTypeChange = jest.fn();
    const onQueueActorIdChange = jest.fn();
    const onRefresh = jest.fn();

    const view = render(
      <MemoryRouter>
        <HandoffQueueControls
          mode="think"
          statusFilter="all"
          onStatusFilterChange={onStatusFilterChange}
          loading={false}
          queueActorType="user"
          onQueueActorTypeChange={onQueueActorTypeChange}
          queueActorId=""
          onQueueActorIdChange={onQueueActorIdChange}
          sortedAgents={[{ _id: 'a-1', name: 'Agent One', status: 'active' }]}
          onRefresh={onRefresh}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByDisplayValue('All'), { target: { value: 'claimed' } });
    fireEvent.change(screen.getByDisplayValue('User'), { target: { value: 'byo_agent' } });

    expect(onStatusFilterChange).toHaveBeenCalledWith('claimed');
    expect(onQueueActorTypeChange).toHaveBeenCalledWith('byo_agent');

    view.rerender(
      <MemoryRouter>
        <HandoffQueueControls
          mode="think"
          statusFilter="all"
          onStatusFilterChange={onStatusFilterChange}
          loading={false}
          queueActorType="byo_agent"
          onQueueActorTypeChange={onQueueActorTypeChange}
          queueActorId=""
          onQueueActorIdChange={onQueueActorIdChange}
          sortedAgents={[{ _id: 'a-1', name: 'Agent One', status: 'active' }]}
          onRefresh={onRefresh}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByDisplayValue('Select personal agent'), { target: { value: 'a-1' } });
    fireEvent.click(screen.getByText('Refresh queue'));

    expect(onQueueActorIdChange).toHaveBeenCalledWith('a-1');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders integrations mode refresh as disabled while loading', () => {
    render(
      <MemoryRouter>
        <HandoffQueueControls
          mode="integrations"
          statusFilter="all"
          onStatusFilterChange={() => {}}
          loading
          queueActorType="user"
          onQueueActorTypeChange={() => {}}
          queueActorId=""
          onQueueActorIdChange={() => {}}
          sortedAgents={[]}
          onRefresh={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Refresh queue')).toBeDisabled();
  });
});
