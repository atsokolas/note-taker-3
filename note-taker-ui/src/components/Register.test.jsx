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
    api.post.mockResolvedValue({ data: { message: 'ok' } });

    render(
      <MemoryRouter>
        <Register chromeStoreLink="https://example.com" />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Username:'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password:'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('Confirm Password:'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/auth/register',
      { username: 'alice', password: 'secret' },
      { skipAuthHandling: true }
    ));
    expect(clearStoredTokens).toHaveBeenCalled();
  });
});
