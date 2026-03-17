import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfUse from './TermsOfUse';

describe('legal pages', () => {
  it('renders the privacy policy page', () => {
    render(
      <MemoryRouter>
        <PrivacyPolicy />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });

  it('renders the terms page', () => {
    render(
      <MemoryRouter>
        <TermsOfUse />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Terms of Use' })).toBeInTheDocument();
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });
});
