import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate as mockUseNavigate } from 'react-router-dom';
import Login from './Login';
import api, { clearStoredTokens } from '../api';

const navigate = mockUseNavigate();

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    post: jest.fn()
  },
  clearStoredTokens: jest.fn()
}));

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each([
    ['/library?articleId=a1&highlightId=h1&exploration=1', '/library?articleId=a1&highlightId=h1&exploration=1'],
    ['/wiki/read/p1?claimId=c1&exploration=1#source', '/wiki/read/p1?claimId=c1&exploration=1#source'],
    ['//elsewhere.test', '/login'],
    ['/\\elsewhere.test', '/login'],
    ['https://elsewhere.test', '/login']
  ])('resumes a safe saved destination: %s', async (returnTo, expected) => {
    sessionStorage.setItem('auth_return_to', returnTo);
    api.post.mockResolvedValue({ data: { token: 'test-token' } });
    render(<MemoryRouter initialEntries={['/login']}><Login /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    await screen.findByText('Login successful.');
    if (expected === '/login') expect(navigate).not.toHaveBeenCalled();
    else expect(navigate).toHaveBeenCalledWith(expected, { replace: true });
    expect(sessionStorage.getItem('auth_return_to')).toBeNull();
  });

  it('submits credentials through the public auth path and stores the token', async () => {
    sessionStorage.setItem('auth_return_to', '/wiki/read/p1?claimId=c1&exploration=1');
    const onLoginSuccess = jest.fn();
    api.post.mockResolvedValue({
      data: {
        token: 'header.payload.signature'
      }
    });

    render(
      <MemoryRouter>
        <Login onLoginSuccess={onLoginSuccess} chromeStoreLink="https://example.com" />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/auth/login',
      { username: 'alice', password: 'secret' },
      { skipAuthHandling: true }
    ));
    expect(clearStoredTokens).toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('header.payload.signature');
    expect(onLoginSuccess).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('auth_return_to')).toBe('/wiki/read/p1?claimId=c1&exploration=1');
  });
});
