import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import ConnectAppAuthorize from './ConnectAppAuthorize';
import { getConsentRequest, decideConsent } from '../api/oauthConsent';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    MemoryRouter: ({ children }) => React.createElement(React.Fragment, null, children),
    Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children),
    useLocation: jest.fn()
  };
});
jest.mock('../api/oauthConsent', () => ({ getConsentRequest: jest.fn(), decideConsent: jest.fn() }));
const open = (url = '/settings/connected-agents/connect?request=opaque-id') => {
  const route = new URL(url, 'https://noeis.example');
  useLocation.mockReturnValue({ pathname: route.pathname, search: route.search, hash: route.hash });
  const navigate = jest.fn();
  render(<MemoryRouter initialEntries={[url]}><ConnectAppAuthorize navigateToClient={navigate} /></MemoryRouter>);
  return navigate;
};
beforeEach(() => {
  jest.clearAllMocks();
  getConsentRequest.mockResolvedValue({ clientName: 'ChatGPT', clientVerified: true, returnTo: { kind: 'site', name: 'chatgpt.com' }, scopes: ['read'], expiresAt: '2099-01-01T00:00:00Z' });
  decideConsent.mockResolvedValue({ redirectUrl: 'https://chatgpt.com/connector/oauth/callback?code=example' });
});

it('loads exact permissions without granting access automatically', async () => {
  getConsentRequest.mockResolvedValue({ clientName: 'ChatGPT', clientVerified: true, returnTo: { kind: 'site', name: 'chatgpt.com' }, scopes: ['read', 'agent-write'], expiresAt: '2099-01-01T00:00:00Z' });
  open();
  expect(await screen.findByText('ChatGPT wants to connect')).toBeInTheDocument();
  expect(screen.queryByText(/comes from the app itself/)).not.toBeInTheDocument();
  expect(getConsentRequest).toHaveBeenCalledWith('opaque-id');
  expect(screen.getByText(/Save private thoughts on source passages/)).toBeInTheDocument();
  expect(screen.getByText(/Wiki candidates require your review and acceptance/)).toBeInTheDocument();
  expect(decideConsent).not.toHaveBeenCalled();
});
it.each([[true, 'Allow connection'], [false, 'Deny connection']])('sends explicit decision %s before returning to the verified client', async (approved, label) => {
  const navigate = open();
  fireEvent.click(await screen.findByRole('button', { name: label }));
  await waitFor(() => expect(decideConsent).toHaveBeenCalledWith('opaque-id', approved, undefined));
  expect(navigate).toHaveBeenCalledWith('https://chatgpt.com/connector/oauth/callback?code=example');
});
it('blocks approval for an expired request', async () => {
  getConsentRequest.mockResolvedValue({ scopes: ['read'], expiresAt: '2000-01-01T00:00:00Z' });
  open();
  expect(await screen.findByRole('button', { name: 'Allow connection' })).toBeDisabled();
  expect(decideConsent).not.toHaveBeenCalled();
});
it('blocks unknown permissions rather than silently granting them', async () => {
  getConsentRequest.mockResolvedValue({ scopes: ['admin'] });
  open();
  expect(await screen.findByRole('button', { name: 'Allow connection' })).toBeDisabled();
});
it('does not replay a consent decision after a lost response', async () => {
  decideConsent.mockRejectedValue(new Error('network lost'));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Allow connection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The connection result could not be confirmed');
  expect(screen.queryByRole('button', { name: 'Allow connection' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try loading again' })).not.toBeInTheDocument();
  expect(decideConsent).toHaveBeenCalledTimes(1);
});
it('handles a missing request without making an API call', async () => {
  open('/settings/connected-agents/connect');
  expect(await screen.findByRole('alert')).toHaveTextContent('connection request is missing');
  expect(getConsentRequest).not.toHaveBeenCalled();
});
it('retries only request loading after an initial network failure', async () => {
  getConsentRequest.mockRejectedValueOnce(new Error('offline'));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Try loading again' }));
  expect(await screen.findByRole('button', { name: 'Allow connection' })).toBeEnabled();
  expect(getConsentRequest).toHaveBeenCalledTimes(2);
  expect(decideConsent).not.toHaveBeenCalled();
});
it('names where a self-registered app returns, says its name is unchecked, and can hold it to reading only', async () => {
  getConsentRequest.mockResolvedValue({ clientName: 'Claude', clientVerified: false, returnTo: { kind: 'site', name: 'claude.ai' }, scopes: ['read', 'agent-write'], expiresAt: '2099-01-01T00:00:00Z' });
  decideConsent.mockResolvedValue({ redirectUrl: 'https://claude.ai/api/mcp/auth_callback?code=example' });
  const navigate = open();
  expect(await screen.findByText('Claude wants to connect')).toBeInTheDocument();
  expect(screen.getByText('claude.ai').closest('p')).toHaveTextContent("After you choose, you'll return to claude.ai. The name “Claude” comes from the app itself; NOEIS has not checked it.");
  fireEvent.click(screen.getByRole('button', { name: 'Allow reading only' }));
  await waitFor(() => expect(decideConsent).toHaveBeenCalledWith('opaque-id', true, ['read']));
  expect(navigate).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=example');
});
it.each([
  [{ kind: 'local', name: 'localhost' }, 'an app on this computer'],
  [{ kind: 'app', name: 'cursor' }, 'the cursor app on this computer']
])('says plainly when the return is to an app on this computer', async (returnTo, phrase) => {
  getConsentRequest.mockResolvedValue({ clientName: 'Cursor', clientVerified: false, returnTo, scopes: ['read'], expiresAt: '2099-01-01T00:00:00Z' });
  open();
  expect(await screen.findByText((_, node) => node?.tagName === 'P' && node.textContent.includes(phrase))).toBeInTheDocument();
});
