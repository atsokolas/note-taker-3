import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WikiAgentPresence from './WikiAgentPresence';

const basePage = (overrides = {}) => ({
  _id: 'wiki-1',
  title: 'Compounding interest',
  aiState: {
    draftStatus: 'idle',
    health: {
      newItems: [],
      unsupportedClaims: [],
      missingCitations: [],
      staleSections: [],
      contradictions: [],
      relatedPages: []
    }
  },
  ...overrides
});

describe('WikiAgentPresence', () => {
  it('renders the never-run state when the agent has not touched the page', () => {
    render(<WikiAgentPresence page={basePage()} onMaintain={() => {}} />);
    expect(screen.getByText(/agent hasn’t read this page yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maintain page' })).toBeEnabled();
    const row = screen.getByRole('status', { name: 'Agent status' });
    expect(row.getAttribute('data-status')).toBe('never_run');
  });

  it('shows the maintaining state with disabled action while the parent is working', () => {
    render(<WikiAgentPresence page={basePage()} isMaintaining={true} onMaintain={() => {}} />);
    expect(screen.getByText(/Reading your library/i)).toBeInTheDocument();
    const row = screen.getByRole('status');
    expect(row.getAttribute('data-status')).toBe('maintaining');
    expect(screen.getByRole('button', { name: 'Maintaining…' })).toBeDisabled();
  });

  it('renders the review state when evidence health signals are pending', () => {
    const page = basePage({
      aiState: {
        draftStatus: 'ready',
        lastDraftedAt: new Date(Date.now() - 60_000).toISOString(),
        health: {
          newItems: [{ text: 'New article relates to this page.' }],
          unsupportedClaims: [{ text: 'Claim needs source.' }],
          missingCitations: [],
          staleSections: [],
          contradictions: [],
          relatedPages: []
        }
      }
    });
    render(<WikiAgentPresence page={page} onMaintain={() => {}} />);
    expect(screen.getByText(/Needs review/)).toBeInTheDocument();
    expect(screen.getByText(/weak claims or citation gaps/)).toBeInTheDocument();
    const row = screen.getByRole('status');
    expect(row.getAttribute('data-status')).toBe('ready');
    expect(screen.getByRole('button', { name: 'Run again' })).toBeEnabled();
  });

  it('renders Drifting for useful pages with source signals only', () => {
    const page = basePage({
      claims: [{ claimId: 'claim-1', support: 'supported' }],
      sourceRefs: [{ _id: 'source-1' }],
      aiState: {
        draftStatus: 'ready',
        lastDraftedAt: new Date(Date.now() - 60_000).toISOString(),
        health: {
          ...basePage().aiState.health,
          newItems: [{ text: 'New article relates to this page.' }],
          staleSections: [{ text: 'Evidence section may need refresh.' }]
        }
      }
    });
    render(<WikiAgentPresence page={page} onMaintain={() => {}} />);
    expect(screen.getByText('Drifting')).toBeInTheDocument();
    expect(screen.getByText(/2 signals waiting to be incorporated/)).toBeInTheDocument();
  });

  it('renders the idle state with a relative timestamp when no signals are pending', () => {
    const page = basePage({
      aiState: {
        draftStatus: 'ready',
        lastDraftedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        health: {
          newItems: [],
          unsupportedClaims: [],
          missingCitations: [],
          staleSections: [],
          contradictions: [],
          relatedPages: []
        }
      }
    });
    render(<WikiAgentPresence page={page} onMaintain={() => {}} />);
    expect(screen.getByText(/Up to date/)).toBeInTheDocument();
    expect(screen.getByText(/5m ago/)).toBeInTheDocument();
    const row = screen.getByRole('status');
    expect(row.getAttribute('data-status')).toBe('idle');
  });

  it('renders the error state with the underlying error message and a Retry action', () => {
    const page = basePage({
      aiState: {
        draftStatus: 'error',
        lastError: 'HF model timed out after 30s.',
        health: basePage().aiState.health
      }
    });
    render(<WikiAgentPresence page={page} onMaintain={() => {}} />);
    expect(screen.getByText(/Maintenance failed/)).toBeInTheDocument();
    expect(screen.getByText(/HF model timed out/)).toBeInTheDocument();
    const row = screen.getByRole('status');
    expect(row.getAttribute('data-status')).toBe('error');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('calls onMaintain when the action is clicked', () => {
    const onMaintain = jest.fn();
    render(<WikiAgentPresence page={basePage()} onMaintain={onMaintain} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maintain page' }));
    expect(onMaintain).toHaveBeenCalledTimes(1);
  });

  it('singularizes "1 signal" correctly', () => {
    const page = basePage({
      aiState: {
        draftStatus: 'ready',
        lastDraftedAt: new Date().toISOString(),
        health: {
          ...basePage().aiState.health,
          newItems: [{ text: 'Just one' }]
        }
      }
    });
    render(<WikiAgentPresence page={page} onMaintain={() => {}} />);
    expect(screen.getByText(/1 signal waiting to be incorporated/)).toBeInTheDocument();
  });
});
