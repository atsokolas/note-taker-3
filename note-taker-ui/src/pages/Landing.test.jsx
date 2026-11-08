import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import Landing from './Landing';
import { trackMarketingCta } from '../utils/marketingAnalytics';
import HOME from '../seo/homeCopy.json';

jest.mock('../utils/marketingAnalytics', () => ({
  trackMarketingCta: jest.fn()
}));

describe('Landing', () => {
  beforeEach(() => jest.clearAllMocks());

  const open = () => render(
    <MemoryRouter initialEntries={['/']}>
      <Landing />
    </MemoryRouter>
  );

  it('says what Noeis is, shows a page of it, and offers one way in', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: HOME.headline })).toBeInTheDocument();
    expect(screen.getByText(HOME.lede)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: HOME.specimen.title })).toBeInTheDocument();
    HOME.statements.forEach(({ title, copy }) => {
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByText(copy)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('opens account setup straight from Get started', () => {
    open();
    const start = screen.getByRole('link', { name: HOME.primaryCta.label });
    expect(start.getAttribute('href')).toMatch(/^\/register\?via=marketing&entry=home&cta=hero/);
    fireEvent.click(start);
    expect(trackMarketingCta).toHaveBeenCalledWith(expect.objectContaining({ page: 'home', cta: 'hero' }));
  });
});
