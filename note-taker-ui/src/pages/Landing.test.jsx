import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import * as router from 'react-router-dom';
import Landing from './Landing';
import { trackMarketingCta } from '../utils/marketingAnalytics';
import HOME from '../seo/homeCopy.json';

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
  });

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
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('sends a newcomer to create an account, and a reader back to the wiki', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: HOME.primaryCta.label }));
    expect(trackMarketingCta).toHaveBeenCalledWith(expect.objectContaining({ page: 'home', cta: 'hero' }));
    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/register\?/));

    localStorage.setItem('token', 'x');
    fireEvent.click(screen.getByRole('button', { name: HOME.primaryCta.label }));
    expect(navigate).toHaveBeenLastCalledWith('/wiki');
  });
});
