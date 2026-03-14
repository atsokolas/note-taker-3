import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import api, { clearStoredTokens } from '../api';

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
  });

  it('submits credentials through the public auth path and stores the token', async () => {
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

    fireEvent.change(screen.getByLabelText('Username:'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password:'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/auth/login',
      { username: 'alice', password: 'secret' },
      { skipAuthHandling: true }
    ));
    expect(clearStoredTokens).toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('header.payload.signature');
    expect(onLoginSuccess).toHaveBeenCalled();
  });
});
