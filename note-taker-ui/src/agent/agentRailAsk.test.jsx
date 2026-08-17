import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentRailProvider, useAgentRail } from './AgentRailContext';

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
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing to ask against/i);
  });

  it('reports that it is working while the retrieve runs', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const Register = () => {
      const { setHandlers } = useAgentRail();
      React.useEffect(() => {
        setHandlers({ onAsk: () => pending.then(() => ({ id: 'p1', sentence: 'Something argues against it.' })) });
      }, [setHandlers]);
      return null;
    };

    render(<AgentRailProvider><Register /><Probe /></AgentRailProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByRole('button', { name: 'Looking…' })).toBeDisabled();
    await act(async () => { release(); await pending; });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled());
  });
});
