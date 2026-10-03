import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import ChatGPTConnectAuthorize from './ChatGPTConnectAuthorize';
import { getChatGPTConsentRequest, decideChatGPTConsent } from '../api/chatgpt';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    MemoryRouter: ({ children }) => React.createElement(React.Fragment, null, children),
    Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children),
    useLocation: jest.fn()
  };
});
jest.mock('../api/chatgpt', () => ({ getChatGPTConsentRequest: jest.fn(), decideChatGPTConsent: jest.fn() }));
const open = (url = '/settings/connected-agents/chatgpt?request=opaque-id') => {
  const route = new URL(url, 'https://noeis.example');
  useLocation.mockReturnValue({ pathname: route.pathname, search: route.search, hash: route.hash });
  const navigate = jest.fn();
  render(<MemoryRouter initialEntries={[url]}><ChatGPTConnectAuthorize navigateToClient={navigate} /></MemoryRouter>);
  return navigate;
};
beforeEach(() => {
  jest.clearAllMocks();
  getChatGPTConsentRequest.mockResolvedValue({ clientName: 'ChatGPT', scopes: ['read', 'agent-write'], expiresAt: '2099-01-01T00:00:00Z' });
  decideChatGPTConsent.mockResolvedValue({ redirectUrl: 'https://chatgpt.com/connector/oauth/callback?code=example' });
});

it('loads exact permissions without granting access automatically', async () => {
  open();
  expect(await screen.findByText('ChatGPT requests access')).toBeInTheDocument();
  expect(getChatGPTConsentRequest).toHaveBeenCalledWith('opaque-id');
  expect(screen.getByText(/Create, change, or delete Library items/)).toBeInTheDocument();
  expect(screen.getByText(/Existing Wiki tools can accept proposals/)).toBeInTheDocument();
  expect(decideChatGPTConsent).not.toHaveBeenCalled();
});
it.each([[true, 'Allow connection'], [false, 'Deny connection']])('sends explicit decision %s before returning to the verified client', async (approved, label) => {
  const navigate = open();
  fireEvent.click(await screen.findByRole('button', { name: label }));
  await waitFor(() => expect(decideChatGPTConsent).toHaveBeenCalledWith('opaque-id', approved));
  expect(navigate).toHaveBeenCalledWith('https://chatgpt.com/connector/oauth/callback?code=example');
});
it('blocks approval for an expired request', async () => {
  getChatGPTConsentRequest.mockResolvedValue({ scopes: ['read'], expiresAt: '2000-01-01T00:00:00Z' });
  open();
  expect(await screen.findByRole('button', { name: 'Allow connection' })).toBeDisabled();
  expect(decideChatGPTConsent).not.toHaveBeenCalled();
});
it('blocks unknown permissions rather than silently granting them', async () => {
  getChatGPTConsentRequest.mockResolvedValue({ scopes: ['admin'] });
  open();
  expect(await screen.findByRole('button', { name: 'Allow connection' })).toBeDisabled();
});
it('does not replay a consent decision after a lost response', async () => {
  decideChatGPTConsent.mockRejectedValue(new Error('network lost'));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Allow connection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The connection result could not be confirmed');
  expect(screen.queryByRole('button', { name: 'Allow connection' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try loading again' })).not.toBeInTheDocument();
  expect(decideChatGPTConsent).toHaveBeenCalledTimes(1);
});
it('handles a missing request without making an API call', async () => {
  open('/settings/connected-agents/chatgpt');
  expect(await screen.findByRole('alert')).toHaveTextContent('connection request is missing');
  expect(getChatGPTConsentRequest).not.toHaveBeenCalled();
});
it('retries only request loading after an initial network failure', async () => {
  getChatGPTConsentRequest.mockRejectedValueOnce(new Error('offline'));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Try loading again' }));
  expect(await screen.findByRole('button', { name: 'Allow connection' })).toBeEnabled();
  expect(getChatGPTConsentRequest).toHaveBeenCalledTimes(2);
  expect(decideChatGPTConsent).not.toHaveBeenCalled();
});
