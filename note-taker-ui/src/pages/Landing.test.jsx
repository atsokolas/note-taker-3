import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
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
      items: []
    });
  });

  it('links the living dossier CTA directly to the configured Alphabet public page', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Landing />
      </MemoryRouter>
    );

    await waitFor(() => expect(getPublicProofRegistry).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open a living dossier' }));

    expect(trackMarketingCta).toHaveBeenCalledWith(expect.objectContaining({
      page: 'home',
      cta: 'living-dossier',
      target: '/share/wiki/alphabet-berkshire-2-0'
    }));
    expect(navigate).toHaveBeenCalledWith('/share/wiki/alphabet-berkshire-2-0');
  });
});
