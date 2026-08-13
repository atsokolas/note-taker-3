import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import ForkableWikis from './ForkableWikis';
import { adoptWikiStarterPack, listWikiStarterPacks } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  adoptWikiStarterPack: jest.fn(),
  listWikiStarterPacks: jest.fn()
}));

const navigate = jest.fn();

const PACKS = [{
  id: 'mental-models',
  name: 'Mental Models',
  tagline: 'The Munger latticework for better judgment.',
  pageCount: 7,
  pages: [
    { id: 'p1', title: 'Loss Aversion' },
    { id: 'p2', title: 'Opportunity Cost' },
    { id: 'p3', title: 'Base Rates' },
    { id: 'p4', title: 'Second Order Effects' },
    { id: 'p5', title: 'Inversion' },
    { id: 'p6', title: 'Margin of Safety' }
  ]
}];

const renderForkable = () => render(
  <MemoryRouter>
    <ForkableWikis />
  </MemoryRouter>
);

describe('ForkableWikis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    listWikiStarterPacks.mockResolvedValue(PACKS);
  });

  it('renders nothing when there is nothing to fork', async () => {
    listWikiStarterPacks.mockResolvedValue([]);
    const { container } = renderForkable();
    await waitFor(() => expect(listWikiStarterPacks).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows what a fork would create before asking for anything', async () => {
    renderForkable();

    expect(await screen.findByText('Mental Models')).toBeInTheDocument();
    expect(screen.getByText('Loss Aversion')).toBeInTheDocument();
    // Long packs are truncated honestly rather than silently.
    expect(screen.getByText('and 1 more')).toBeInTheDocument();
  });

  it('sends a logged-out reader to sign up, remembering where they were', async () => {
    renderForkable();

    fireEvent.click(await screen.findByRole('button', { name: 'Make this mine' }));

    expect(adoptWikiStarterPack).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('auth_return_to')).toBe('/proof#fork-mental-models');
    expect(navigate).toHaveBeenCalledWith('/register');
  });

  it('forks for a signed-in reader and hands off to onboarding', async () => {
    localStorage.setItem('token', 'a-token');
    adoptWikiStarterPack.mockResolvedValue({ pages: [{ _id: 'new-page-1', title: 'Loss Aversion' }] });

    renderForkable();
    fireEvent.click(await screen.findByRole('button', { name: 'Make this mine' }));

    await waitFor(() => expect(adoptWikiStarterPack).toHaveBeenCalledWith('mental-models'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(
      '/onboarding/wiki?adoptedPage=new-page-1&source=shared',
      { replace: true }
    ));
  });

  it('reports a failed fork instead of leaving a dead button', async () => {
    localStorage.setItem('token', 'a-token');
    adoptWikiStarterPack.mockRejectedValue(new Error('Could not copy that wiki. Try again.'));

    renderForkable();
    fireEvent.click(await screen.findByRole('button', { name: 'Make this mine' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy that wiki. Try again.');
    expect(screen.getByRole('button', { name: 'Make this mine' })).not.toBeDisabled();
  });
});
