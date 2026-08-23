import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { getSystemLoops } from '../api/systemLoops';
import { SystemStatusProvider } from './SystemStatusContext';
import { useSystemStatus } from './useSystemStatus';
import { NoeisLoopProvider, resetNoeisLoopSnapshotForTests } from './NoeisLoopProvider';
import { useNoeisLoops } from './noeisLoopContext';
import { notifyNoeisLoopStatusChanged } from './noeisLoopEvents';
import { NOEIS_LOOP_IDS } from './noeisLoopModel';

jest.mock('../api/systemLoops', () => ({ getSystemLoops: jest.fn() }));

const envelope = (overrides = {}) => ({
  schemaVersion: 1,
  generatedAt: '2026-08-22T12:00:00.000Z',
  loops: Object.fromEntries(NOEIS_LOOP_IDS.map(id => [id, {
    id, status: 'idle', reason: 'Nothing is due.', updatedAt: null, href: '/wiki', receipt: null, metrics: {},
    ...(overrides[id] || {})
  }]))
});

const Harness = ({ children, initialState }) => {
  const status = useSystemStatus(initialState);
  return (
    <SystemStatusProvider value={{ controls: status, snapshot: status }}>
      {children}
      <span data-testid="background">{status.backgroundWork?.label || 'none'}</span>
      <span data-testid="receipt">{status.latestReceipt?.id || 'none'}</span>
      <span data-testid="failure">{status.recoverableFailure?.stage || 'none'}</span>
    </SystemStatusProvider>
  );
};

const Probe = () => {
  const value = useNoeisLoops();
  return <span>{value.loops['loop.wiki-maintenance'].status}</span>;
};

describe('NoeisLoopProvider', () => {
  beforeEach(() => resetNoeisLoopSnapshotForTests());

  it('projects durable running work and the latest durable receipt into SystemStatus', async () => {
    getSystemLoops.mockResolvedValue(envelope({
      'loop.wiki-maintenance': {
        status: 'running',
        reason: 'Wiki maintenance is running.',
        updatedAt: '2026-08-22T12:00:00.000Z',
        receipt: {
          id: 'maintenance-1', source: 'wiki', kind: 'wiki_maintenance', status: 'completed',
          title: 'Wiki maintenance', summary: 'Source reviewed.', completedAt: '2026-08-22T11:59:00.000Z'
        }
      }
    }));
    render(<Harness><NoeisLoopProvider><Probe /></NoeisLoopProvider></Harness>);
    expect(await screen.findByText('running')).toBeInTheDocument();
    expect(screen.getByTestId('background')).toHaveTextContent('Wiki maintenance');
    expect(screen.getByTestId('receipt')).toHaveTextContent('maintenance-1');
  });

  it('refreshes after a loop mutation event without interval polling', async () => {
    getSystemLoops
      .mockResolvedValueOnce(envelope())
      .mockResolvedValueOnce(envelope({
        'loop.weekly-ai': { status: 'needs_review', reason: 'Review the edition.' }
      }));
    render(<Harness><NoeisLoopProvider><Probe /></NoeisLoopProvider></Harness>);
    expect(await screen.findByText('idle')).toBeInTheDocument();
    await act(async () => notifyNoeisLoopStatusChanged('loop.weekly-ai'));
    expect(getSystemLoops).toHaveBeenCalledTimes(2);
  });

  it('shares a fresh snapshot across remounts', async () => {
    getSystemLoops.mockResolvedValue(envelope());
    const first = render(<Harness><NoeisLoopProvider><Probe /></NoeisLoopProvider></Harness>);
    expect(await screen.findByText('idle')).toBeInTheDocument();
    first.unmount();
    render(<Harness><NoeisLoopProvider><Probe /></NoeisLoopProvider></Harness>);
    expect(await screen.findByText('idle')).toBeInTheDocument();
    expect(getSystemLoops).toHaveBeenCalledTimes(1);
  });

  it('fails visibly instead of retaining a checking placeholder when durable status is unavailable', async () => {
    getSystemLoops.mockRejectedValue(new Error('offline'));
    render(<Harness><NoeisLoopProvider><Probe /></NoeisLoopProvider></Harness>);
    expect(await screen.findByText('error')).toBeInTheDocument();
    expect(screen.getByTestId('failure')).toHaveTextContent('Background loops');
  });

  it('does not replace a newer user-action receipt with background-loop history', async () => {
    getSystemLoops.mockResolvedValue(envelope({
      'loop.wiki-maintenance': {
        status: 'ready',
        reason: 'Maintenance completed.',
        receipt: {
          id: 'maintenance-old', source: 'wiki', kind: 'wiki_maintenance', status: 'completed',
          title: 'Wiki maintenance', summary: 'Older durable receipt.', completedAt: '2026-08-22T11:00:00.000Z'
        }
      }
    }));
    render(
      <Harness initialState={{
        latestReceipt: {
          id: 'user-action', title: 'Source attached', summary: 'The current action finished.',
          completedAt: '2026-08-22T12:00:00.000Z'
        }
      }}>
        <NoeisLoopProvider><Probe /></NoeisLoopProvider>
      </Harness>
    );
    expect(await screen.findByText('ready')).toBeInTheDocument();
    expect(screen.getByTestId('receipt')).toHaveTextContent('user-action');
  });
});
