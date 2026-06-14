import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AgentPresence from './AgentPresence';

describe('AgentPresence', () => {
  it('defaults to the shared agent identity when a surface omits title copy', () => {
    render(<AgentPresence />);

    const status = screen.getByRole('status', { name: 'Thought partner status' });
    expect(status).toHaveTextContent('Thought partner');
  });

  it('keeps title and subtitle as separate lines of copy', () => {
    render(
      <AgentPresence
        title="Thought partner"
        subtitle="Library context visible"
      />
    );

    const status = screen.getByRole('status', { name: 'Thought partner status' });
    expect(status).toHaveTextContent('Thought partner');
    expect(status).toHaveTextContent('Library context visible');
    expect(screen.getByText('Thought partner')).toHaveClass('agent-presence__text');
    expect(screen.getByText('Library context visible')).toHaveClass('agent-presence__sub');
  });

  it('renders the shared agent status shell with action wiring', () => {
    const onAction = jest.fn();
    render(
      <AgentPresence
        status="working"
        title="Thought partner is linking sources."
        subtitle="reading 3 sources"
        actionLabel="Inspect"
        onAction={onAction}
      />
    );

    const status = screen.getByRole('status', { name: 'Thought partner status' });
    expect(status).toHaveAttribute('data-status', 'working');
    expect(status).toHaveTextContent('Thought partner is linking sources.');
    expect(status).toHaveTextContent('reading 3 sources');

    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
