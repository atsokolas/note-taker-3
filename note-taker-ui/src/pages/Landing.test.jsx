import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import Landing from './Landing';
import { getPublicProofRegistry } from '../api/wiki';
import { trackMarketingCta } from '../utils/marketingAnalytics';

jest.mock('../api/wiki', () => ({
  getPublicProofRegistry: jest.fn()
}));

jest.mock('../utils/marketingAnalytics', () => ({
  trackMarketingCta: jest.fn()
}));

describe('Landing', () => {
  let navigate;

  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    navigate = jest.fn();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    getPublicProofRegistry.mockResolvedValue({
      homepageCta: {
        href: '/share/wiki/alphabet-berkshire-2-0',
        title: 'Alphabet is Berkshire Hathaway 2.0'
      },
      items: [{
        publicUrl: '/share/wiki/alphabet-berkshire-2-0',
        page: { title: 'Alphabet is Berkshire Hathaway 2.0' },
        proofGrade: {
          grade: 'proven',
          acceptedAt: '2026-07-16T00:00:00.000Z',
          criteria: {
            explicitlyAccepted: true,
            acceptedVersion: true,
            materialEvent: true,
            sourceGrounded: true,
            acceptanceBound: true
          }
        }
      }]
    });
  });

  it('links the living dossier CTA directly to the configured Alphabet public page', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Landing />
      </MemoryRouter>
    );

    // Waiting on the call only proves the request went out. The href arrives a
    // microtask later, and clicking in between sent the reader to the fallback
    // - which is what made this test fail about one run in four.
    const cta = await screen.findByRole('button', { name: 'Open a living dossier' });
    await waitFor(() => expect(cta).toHaveAttribute('data-target', '/share/wiki/alphabet-berkshire-2-0'));

    fireEvent.click(cta);

    expect(trackMarketingCta).toHaveBeenCalledWith(expect.objectContaining({
      page: 'home',
      cta: 'living-dossier',
      target: '/share/wiki/alphabet-berkshire-2-0'
    }));
    expect(navigate).toHaveBeenCalledWith('/share/wiki/alphabet-berkshire-2-0');
  });
});
