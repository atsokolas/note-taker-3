import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AccountSection from './AccountSection';
import AdvancedSection from './AdvancedSection';
import { changePassword, closeAccount, getAccount } from '../../api/account';

jest.mock('../../api/account', () => ({
  getAccount: jest.fn(),
  changePassword: jest.fn(),
  closeAccount: jest.fn()
}));
jest.mock('./SystemInventoryCard', () => () => <div>System registry</div>);
jest.mock('../../api/tourApi', () => ({ resetTourState: jest.fn() }));

describe('Account', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAccount.mockResolvedValue({ username: 'reader', since: '2026-10-01T12:00:00Z', admin: false });
  });

  it('says who you are and logs you out', async () => {
    const onLogout = jest.fn();
    render(<AccountSection onLogout={onLogout} />);
    expect(await screen.findByText('reader')).toBeInTheDocument();
    expect(screen.getByText(/Reading here since October 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('changes the password, and checks the new one first', async () => {
    changePassword.mockResolvedValue({ changed: true });
    render(<AccountSection />);
    await screen.findByText('reader');
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old1pass' } });
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(changePassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'new1passw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/Your password is changed/)).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith({ password: 'old1pass', newPassword: 'new1passw' });
  });

  it('closes the account only with the password, and can be kept', async () => {
    const onClosed = jest.fn();
    closeAccount.mockRejectedValueOnce({ response: { data: { error: 'That password is not right.' } } }).mockResolvedValueOnce({ closed: true });
    render(<AccountSection onClosed={onClosed} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close my account…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close my account…' }));

    fireEvent.change(screen.getByLabelText('Your password, to confirm'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close my account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
    expect(onClosed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close my account' }));
    await waitFor(() => expect(onClosed).toHaveBeenCalled());
    expect(closeAccount).toHaveBeenLastCalledWith({ password: 'nope' });
  });

  it('keeps operator tools from readers and shows them to the admin list', async () => {
    const { unmount } = render(<MemoryRouter><AdvancedSection /></MemoryRouter>);
    await waitFor(() => expect(getAccount).toHaveBeenCalled());
    expect(screen.queryByText('Marketing analytics ↗')).not.toBeInTheDocument();
    expect(screen.queryByText('System registry')).not.toBeInTheDocument();
    unmount();

    getAccount.mockResolvedValue({ username: 'owner', admin: true });
    render(<MemoryRouter><AdvancedSection /></MemoryRouter>);
    expect(await screen.findByText('Marketing analytics ↗')).toBeInTheDocument();
    expect(screen.getByText('System registry')).toBeInTheDocument();
  });
});
