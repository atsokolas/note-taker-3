import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import Landing from './Landing';
import { getPublicProofRegistry } from '../api/wiki';
import { trackMarketingCta } from '../utils/marketingAnalytics';
import HOME from '../seo/homeCopy.json';

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

  const open = () => render(
    <MemoryRouter initialEntries={['/']}>
      <Landing />
    </MemoryRouter>
  );

  it('says what Noeis helps a newcomer do', async () => {
    open();
    expect(screen.getByRole('heading', { name: HOME.headline })).toBeInTheDocument();
    expect(screen.getByText(HOME.lede)).toBeInTheDocument();
    expect(screen.getByText('Keep the source.')).toBeInTheDocument();
    expect(screen.getByText('Work with the idea.')).toBeInTheDocument();
    expect(screen.getByText('Pick it up again.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '#how-it-works');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/Nothing is written until you accept it/)).not.toBeInTheDocument();
    expect(screen.queryByText(/An agent brings evidence overnight/)).not.toBeInTheDocument();
    await screen.findByRole('button', { name: 'Open a living dossier' });
  });

  it('links the living dossier as a supporting action, not a hero CTA', async () => {
    open();
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
