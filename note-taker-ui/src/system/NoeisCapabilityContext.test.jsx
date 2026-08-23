import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { listImportConnections } from '../api/imports';
import { NoeisCapabilityProvider, resetNoeisCapabilitySnapshotForTests } from './NoeisCapabilityProvider';
import { useNoeisCapabilities } from './noeisCapabilityContext';

jest.mock('../api/imports', () => ({ listImportConnections: jest.fn() }));

const Probe = () => {
  const model = useNoeisCapabilities();
  return (
    <div>
      <span>{model.connectors['connector.readwise'].status}</span>
      <span>{model.commands.find(command => command.id === 'connection-readwise')?.label}</span>
      <button type="button" onClick={model.refresh}>Refresh</button>
    </div>
  );
};

describe('NoeisCapabilityProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    resetNoeisCapabilitySnapshotForTests();
  });

  it('loads one workspace connection snapshot and refreshes it', async () => {
    listImportConnections
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'rw-1', provider: 'readwise', status: 'connected' }]);
    render(<NoeisCapabilityProvider><Probe /></NoeisCapabilityProvider>);
    expect(await screen.findByText('needs_setup')).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: 'Refresh' }).click());
    expect(await screen.findByText('connected')).toBeInTheDocument();
    expect(screen.getByText('Open Readwise')).toBeInTheDocument();
  });

  it('reports unknown readiness instead of pretending disconnected on API failure', async () => {
    listImportConnections.mockRejectedValueOnce(new Error('offline'));
    render(<NoeisCapabilityProvider><Probe /></NoeisCapabilityProvider>);
    expect(await screen.findByText('error')).toBeInTheDocument();
  });

  it('shares the recent snapshot across provider remounts', async () => {
    localStorage.setItem('token', 'same-account');
    listImportConnections.mockResolvedValue([{ id: 'rw-1', provider: 'readwise', status: 'connected' }]);
    const first = render(<NoeisCapabilityProvider><Probe /></NoeisCapabilityProvider>);
    expect(await screen.findByText('connected')).toBeInTheDocument();
    first.unmount();
    render(<NoeisCapabilityProvider><Probe /></NoeisCapabilityProvider>);
    expect(await screen.findByText('connected')).toBeInTheDocument();
    expect(listImportConnections).toHaveBeenCalledTimes(1);
  });

  it('never reuses connector readiness after the signed-in account changes', async () => {
    localStorage.setItem('token', 'account-a');
    listImportConnections.mockResolvedValueOnce([{ id: 'rw-a', provider: 'readwise', status: 'connected' }]);
    const first = render(<NoeisCapabilityProvider><Probe /></NoeisCapabilityProvider>);
    expect(await screen.findByText('connected')).toBeInTheDocument();
    first.unmount();

    localStorage.setItem('token', 'account-b');
    listImportConnections.mockResolvedValueOnce([]);
    render(<NoeisCapabilityProvider><Probe /></NoeisCapabilityProvider>);

    expect(await screen.findByText('needs_setup')).toBeInTheDocument();
    expect(listImportConnections).toHaveBeenCalledTimes(2);
  });
});
