import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConceptShareModal from './ConceptShareModal';
import { conceptSnapshot } from '../thinkShareFixture';

jest.mock('../../../api/concepts', () => ({
  getConceptShare: jest.fn(),
  mintConceptShare: jest.fn(),
  revokeConceptShare: jest.fn(),
  updateConceptShare: jest.fn()
}));

const { getConceptShare, mintConceptShare, revokeConceptShare } = require('../../../api/concepts');

const frozen = conceptSnapshot();

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
    getConceptShare.mockResolvedValueOnce({
      shared: false,
      publishable: true,
      preview: frozen,
      currentHash: 'hash-1'
    });
    render(<ConceptShareModal open conceptName="Strategy" onClose={() => {}} />);
    await waitFor(() => expect(getConceptShare).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Create public link' })).toBeInTheDocument();
  });

  it('mints a share and exposes the URL', async () => {
    getConceptShare.mockResolvedValueOnce({
      shared: false,
      publishable: true,
      preview: frozen,
      currentHash: 'hash-1'
    });
    mintConceptShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen,
      currentHash: 'hash-1'
    });
    render(<ConceptShareModal open conceptName="Strategy" onClose={() => {}} />);
    const cta = await screen.findByRole('button', { name: 'Create public link' });
    await act(async () => {
      fireEvent.click(cta);
    });
    expect(mintConceptShare).toHaveBeenCalledWith('Strategy', { previewHash: 'hash-1' });
    const urlInput = await screen.findByLabelText('Public link');
    expect(urlInput.value).toMatch(/\/share\/concepts\/abc123$/);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('names the frozen snapshot as what a reader will see', async () => {
    getConceptShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      stale: false,
      snapshot: frozen,
      preview: frozen,
      currentHash: 'hash'
    });
    render(<ConceptShareModal open conceptName="Strategy" onClose={() => {}} />);
    expect(await screen.findByTestId('concept-share-preview')).toHaveTextContent('Opportunity Cost');
    expect(screen.queryByText(/Updated just now/)).not.toBeInTheDocument();
  });

  it('revokes a share after confirmation', async () => {
    window.confirm = jest.fn(() => true);
    getConceptShare.mockResolvedValueOnce({
      shared: true,
      slug: 'abc123',
      snapshot: frozen,
      preview: frozen
    });
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
