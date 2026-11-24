import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PersonalAgentsCard from './PersonalAgentsCard';

const renderCard = (agent, handleUpdateAgent = jest.fn()) => {
  render(
    <PersonalAgentsCard
      agentModel={{ sortedAgents: [agent], agentBusyId: '', handleUpdateAgent, handleRotateKey: jest.fn(), handleDisableAgent: jest.fn() }}
      entitlementsModel={{ entitlements: {}, handleSetEntitlementsDev: jest.fn() }}
    />
  );
  return handleUpdateAgent;
};

describe('PersonalAgentsCard', () => {
  it('gives an agent the Munger mind', () => {
    const handleUpdateAgent = renderCard({ _id: 'a1', name: 'Charlie', status: 'active', persona: '' });
    const picker = screen.getByLabelText(/Reads with the mind of/);
    expect(picker).toHaveValue('');
    fireEvent.change(picker, { target: { value: 'munger' } });
    expect(handleUpdateAgent).toHaveBeenCalledWith('a1', { persona: 'munger' });
  });

  it('shows the mind an agent already has', () => {
    renderCard({ _id: 'a1', name: 'Charlie', status: 'active', persona: 'munger' });
    expect(screen.getByLabelText(/Reads with the mind of/)).toHaveValue('munger');
  });
});
