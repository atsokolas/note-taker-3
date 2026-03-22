import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import api, { clearStoredTokens } from '../api';

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    post: jest.fn()
  },
  clearStoredTokens: jest.fn()
}));

describe('Register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits registration through the public auth path', async () => {
    api.post.mockResolvedValue({ data: { message: 'ok', loginMessage: 'Account created. You can log in now.' } });

    render(
      <MemoryRouter>
        <Register chromeStoreLink="https://example.com" />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Username:'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password:'), { target: { value: 'secret12' } });
    fireEvent.change(screen.getByLabelText('Confirm Password:'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/auth/register',
      { username: 'alice', password: 'secret12' },
      { skipAuthHandling: true }
    ));
    expect(clearStoredTokens).toHaveBeenCalled();
  });

  it('blocks weak passwords before sending the request', async () => {
    render(
      <MemoryRouter>
        <Register chromeStoreLink="https://example.com" />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Username:'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password:'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Confirm Password:'), { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
