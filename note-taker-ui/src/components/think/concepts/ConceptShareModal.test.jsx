import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConceptShareModal from './ConceptShareModal';

jest.mock('../../../api/concepts', () => ({
  getConceptShare: jest.fn(),
  mintConceptShare: jest.fn(),
  revokeConceptShare: jest.fn()
}));

const { getConceptShare, mintConceptShare, revokeConceptShare } = require('../../../api/concepts');

describe('ConceptShareModal', () => {
  beforeEach(() => {
    getConceptShare.mockReset();
    mintConceptShare.mockReset();
    revokeConceptShare.mockReset();
    Object.assign(window, { location: { ...window.location, origin: 'https://example.test' } });
  });

  it('returns null when closed', () => {
    const { container } = render(<ConceptShareModal open={false} conceptName="X" onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the mint CTA when no share exists', async () => {
    getConceptShare.mockResolvedValueOnce({ shared: false });
    render(<ConceptShareModal open conceptName="Strategy" onClose={() => {}} />);
    await waitFor(() => expect(getConceptShare).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Create public link' })).toBeInTheDocument();
    expect(screen.getByText(/Create a public link to share your thinking on/)).toBeInTheDocument();
  });

  it('mints a share and exposes the URL', async () => {
    getConceptShare.mockResolvedValueOnce({ shared: false });
    mintConceptShare.mockResolvedValueOnce({ slug: 'abc123', conceptName: 'Strategy' });
    render(<ConceptShareModal open conceptName="Strategy" onClose={() => {}} />);
    const cta = await screen.findByRole('button', { name: 'Create public link' });
    await act(async () => {
      fireEvent.click(cta);
    });
    expect(mintConceptShare).toHaveBeenCalledWith('Strategy');
    const urlInput = await screen.findByLabelText('Public link');
    expect(urlInput.value).toMatch(/\/share\/concepts\/abc123$/);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('revokes a share after confirmation', async () => {
    window.confirm = jest.fn(() => true);
    getConceptShare.mockResolvedValueOnce({ shared: true, slug: 'abc123', createdAt: '2026-04-25' });
    revokeConceptShare.mockResolvedValueOnce({ revoked: true, conceptName: 'Strategy' });
    render(<ConceptShareModal open conceptName="Strategy" onClose={() => {}} />);
    const revoke = await screen.findByRole('button', { name: 'Revoke' });
    await act(async () => {
      fireEvent.click(revoke);
    });
    expect(revokeConceptShare).toHaveBeenCalledWith('Strategy');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create public link' })).toBeInTheDocument());
  });

  it('renders an error when share state fails to load', async () => {
    getConceptShare.mockRejectedValueOnce({ response: { data: { error: 'Boom' } } });
    render(<ConceptShareModal open conceptName="Strategy" onClose={() => {}} />);
    expect(await screen.findByText('Boom')).toBeInTheDocument();
  });
});
