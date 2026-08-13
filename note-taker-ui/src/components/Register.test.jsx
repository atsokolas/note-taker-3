import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import api, { clearStoredTokens } from '../api';
import {
  trackSignupFailed,
  trackSignupStarted,
  trackSignupSucceeded,
  trackSignupViewed
} from '../utils/marketingAnalytics';

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    post: jest.fn()
  },
  clearStoredTokens: jest.fn()
}));

jest.mock('../utils/marketingAnalytics', () => ({
  trackSignupFailed: jest.fn(),
  trackSignupStarted: jest.fn(),
  trackSignupSucceeded: jest.fn(),
  trackSignupViewed: jest.fn()
}));

describe('Register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('submits registration through the public auth path', async () => {
    api.post.mockResolvedValue({ data: { message: 'ok', loginMessage: 'Account created. You can log in now.' } });
    localStorage.setItem('marketing.attribution.v1', JSON.stringify({
      visitorId: 'visitor-1',
      entry: 'ai-second-brain',
      cta: 'hero',
      pageType: 'guide'
    }));

    render(
      <MemoryRouter>
        <Register chromeStoreLink="https://example.com" />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({
        username: 'alice',
        password: 'secret12',
        marketingAttribution: expect.objectContaining({
          visitorId: 'visitor-1',
          entry: 'ai-second-brain',
          cta: 'hero',
          pageType: 'guide'
        })
      }),
      { skipAuthHandling: true }
    ));
    expect(trackSignupViewed).toHaveBeenCalledTimes(1);
    expect(trackSignupStarted).toHaveBeenCalledTimes(1);
    expect(trackSignupSucceeded).toHaveBeenCalledWith({ username: 'alice' });
    expect(clearStoredTokens).toHaveBeenCalled();
  });

  it('signs the new account straight in instead of routing to the login form', async () => {
    api.post.mockImplementation((path) => {
      if (path === '/api/auth/register') {
        return Promise.resolve({ data: { message: 'ok', loginMessage: 'Account created.' } });
      }
      return Promise.resolve({ data: { token: 'fresh-token', username: 'alice' } });
    });
    const onLoginSuccess = jest.fn();

    render(
      <MemoryRouter>
        <Register chromeStoreLink="https://example.com" onLoginSuccess={onLoginSuccess} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/auth/login',
      { username: 'alice', password: 'secret12' },
      { skipAuthHandling: true }
    ));
    await waitFor(() => expect(localStorage.getItem('token')).toBe('fresh-token'));
    expect(onLoginSuccess).toHaveBeenCalledTimes(1);
    // The old flow parked a notice for the login screen. There is no login screen now.
    expect(sessionStorage.getItem('registration_notice')).toBeNull();
  });

  it('falls back to the login form when auto sign-in fails', async () => {
    api.post.mockImplementation((path) => {
      if (path === '/api/auth/register') {
        return Promise.resolve({ data: { message: 'ok', loginMessage: 'Account created.' } });
      }
      return Promise.reject(new Error('login unavailable'));
    });

    render(
      <MemoryRouter>
        <Register chromeStoreLink="https://example.com" onLoginSuccess={jest.fn()} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    // The account exists; the user must still be able to get in.
    await waitFor(() => expect(sessionStorage.getItem('registration_notice')).toBe('Account created.'));
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('blocks weak passwords before sending the request', async () => {
    render(
      <MemoryRouter>
        <Register chromeStoreLink="https://example.com" />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(trackSignupViewed).toHaveBeenCalledTimes(1);
    expect(trackSignupFailed).toHaveBeenCalledWith({
      reason: 'validation',
      error: 'Password must be at least 8 characters.'
    });
    expect(api.post).not.toHaveBeenCalled();
  });
});
