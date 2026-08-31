import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublicCasebook from './PublicCasebook';
import { adoptPublicWikiPage, followPublicCasebook, forkPublicCasebook } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  adoptPublicWikiPage: jest.fn(),
  followPublicCasebook: jest.fn(),
  forkPublicCasebook: jest.fn(),
  getWikiPublicPreview: jest.fn()
}));

const folio = {
  kind: 'casebook',
  claim: {
    text: 'Compute stays scarce through 2027.',
    bornAt: '2026-01-15T12:00:00.000Z'
  },
  acceptedThrough: {
    at: '2026-07-15T00:00:00.000Z',
    label: 'DOE capacity report accepted'
  },
  verdicts: [{
    result: 'partly',
    label: 'Partly',
    recordedAt: '2026-08-01T12:00:00.000Z',
    note: 'Capacity eased in two regions.'
  }],
  postmortems: [{
    question: 'Which part survived?',
    answer: 'Training compute stayed scarce.',
    silent: false
  }],
  evidence: [{
    title: 'DOE capacity report',
    url: 'https://example.com/doe-capacity'
  }],
  deltas: [{
    at: '2026-08-02T12:00:00.000Z',
    summary: 'Recorded the partial verdict.'
  }],
  lineage: {
    origin: { title: 'The first compute case', slug: 'first-compute', revoked: false, action: 'fork' },
    branches: [{ title: 'A branched reading', slug: 'branched-reading', action: 'fork', diverged: true, at: '2026-08-20T00:00:00.000Z' }]
  },
  seal: {
    algorithm: 'hmac-sha256',
    hash: 'abc123',
    signature: 'deadbeefcafebabe',
    signedAt: '2026-08-31T12:00:00.000Z'
  }
};

describe('PublicCasebook', () => {
  beforeEach(() => {
    localStorage.clear();
    followPublicCasebook.mockReset();
    forkPublicCasebook.mockReset();
    adoptPublicWikiPage.mockReset();
  });

  it('lets a logged-out visitor read the sealed folio without leaking private chrome', () => {
    render(
      <MemoryRouter>
        <PublicCasebook casebook={folio} idOrSlug="compute-stays-scarce" />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Compute stays scarce through 2027.' })).toBeInTheDocument();
    expect(screen.getByText(/accepted through/i)).toBeInTheDocument();
    expect(screen.getByText('Partly')).toBeInTheDocument();
    expect(screen.getByText('Training compute stayed scarce.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'DOE capacity report' })).toHaveAttribute('href', 'https://example.com/doe-capacity');
    expect(screen.getByText('Since the last accepted edition')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The first compute case' })).toHaveAttribute('href', '/share/wiki/first-compute');
    expect(screen.getByText(/the claim has moved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fork' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adopt' })).toBeInTheDocument();
    expect(screen.queryByText(/followers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/likes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/deadbeef/i)).toBeInTheDocument();
  });

  it('asks a visitor to sign in before forking', () => {
    render(
      <MemoryRouter>
        <PublicCasebook casebook={folio} idOrSlug="compute-stays-scarce" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));
    expect(forkPublicCasebook).not.toHaveBeenCalled();
  });

  it('hides follow, fork, and adopt on an owner preview', () => {
    render(
      <MemoryRouter>
        <PublicCasebook casebook={folio} idOrSlug="compute-stays-scarce" preview />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
    expect(screen.getByText(/private notes never leave the case/i)).toBeInTheDocument();
  });

  it('follows without inventing a vanity count', async () => {
    localStorage.setItem('token', 'reader');
    followPublicCasebook.mockResolvedValue({
      action: 'follow',
      origin: { title: 'Compute', slug: 'compute-stays-scarce', hash: 'abc' }
    });
    render(
      <MemoryRouter>
        <PublicCasebook casebook={folio} idOrSlug="compute-stays-scarce" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    await waitFor(() => expect(followPublicCasebook).toHaveBeenCalledWith('compute-stays-scarce'));
    expect(screen.getByRole('status')).toHaveTextContent(/no list of followers/i);
  });
});
