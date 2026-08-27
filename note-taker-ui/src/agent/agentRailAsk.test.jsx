import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentRailProvider, useAgentRail, useContextualAgentSurface } from './AgentRailContext';
import { streamChatWithAgent } from '../api/agent';

jest.mock('../api/agent', () => ({
  getAgentThread: jest.fn(),
  streamChatWithAgent: jest.fn()
}));

/* Silence is the one answer an agent door must never give. `ask` used to
   return early when the surface had registered no handler: no request, no
   error, nothing on screen — indistinguishable from a broken button. */
const Probe = () => {
  const { ask, busy, error } = useAgentRail();
  return (
    <>
      <button type="button" onClick={() => ask('Anything?')} disabled={busy}>
        {busy ? 'Looking…' : 'Ask'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
};

describe('asking from a column door', () => {
  it('says so when the page has nothing to ask against', async () => {
    render(<AgentRailProvider><Probe /></AgentRailProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/open a knowledge room/i);
  });

  it('reports that it is working while the retrieve runs', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    streamChatWithAgent.mockImplementationOnce(() => pending.then(() => ({ reply: 'Something argues against it.' })));
    const Register = () => {
      useContextualAgentSurface('agent-surface.judgment', {
        objectType: 'judgment_claim',
        objectId: 'claim-1',
        subject: 'A live claim.'
      }, {});
      return null;
    };

    render(<AgentRailProvider><Register /><Probe /></AgentRailProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByRole('button', { name: 'Looking…' })).toBeDisabled();
    await act(async () => { release(); await pending; });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled());
  });
});
