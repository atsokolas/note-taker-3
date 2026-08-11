import React from 'react';
import { render, screen } from '@testing-library/react';
import AgentContextShell from './AgentContextShell';

describe('AgentContextShell', () => {
  it('provides a presentation-only identity and orientation frame', () => {
    render(
      <AgentContextShell surface="Library" orientation="Source provenance is available.">
        <button type="button">Reference source</button>
      </AgentContextShell>
    );

    const shell = screen.getByRole('region', { name: 'Thought partner context' });
    expect(shell).toHaveAttribute('data-agent-context-surface', 'library');
    expect(shell).toHaveTextContent('Source provenance is available.');
    expect(screen.getByRole('button', { name: 'Reference source' })).toBeInTheDocument();
  });

  it('communicates loading and failure without owning the child action', () => {
    render(
      <AgentContextShell
        title="Context"
        loading
        loadingMessage="Retrieving linked evidence…"
        error="Context is unavailable. Try again."
      >
        <button type="button">Retry</button>
      </AgentContextShell>
    );

    expect(screen.getByRole('status', { name: 'Thought partner status' })).toHaveAttribute('data-status', 'error');
    expect(screen.getByRole('status', { name: 'Thought partner status' })).toHaveTextContent('Context');
    expect(screen.getByText('Retrieving linked evidence…')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Context is unavailable. Try again.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('can preserve a child-owned presence while retaining shared orientation', () => {
    render(
      <AgentContextShell showPresence={false} orientation="Exact source identity retained.">
        <div aria-label="Existing agent presence">Existing presence</div>
      </AgentContextShell>
    );

    expect(screen.queryByRole('status', { name: 'Thought partner status' })).not.toBeInTheDocument();
    expect(screen.getByText('Exact source identity retained.')).toBeInTheDocument();
  });
});
