import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { hasUsableStoredToken } from '../api';
const mockPersonal = jest.fn();
jest.mock('../api', () => ({ clearStoredTokens: jest.fn(), hasUsableStoredToken: jest.fn(() => true) }));
jest.mock('../utils/marketingAnalytics', () => ({ trackMarketingEvent: jest.fn() }));
jest.mock('../api/uiSettings', () => ({ fetchUiSettings: jest.fn(async () => ({})), saveUiSettings: jest.fn() }));
jest.mock('@vercel/analytics/react', () => ({ Analytics: () => null }), { virtual: true });
jest.mock('@vercel/analytics', () => ({ track: jest.fn() }), { virtual: true });
jest.mock('../agent/AgentRailContext', () => ({ AgentRailProvider: ({ children }) => { mockPersonal(); return children; }, useAgentRail: () => ({}) }));
jest.mock('./WorkNotes', () => ({ appearance }) => <div>Isolated Work writing<button onClick={appearance?.onOpen}>Change Work theme</button></div>);
jest.mock('react-router-dom', () => {
  const React = require('react'); const pass = ({ children }) => <>{children}</>;
  return { BrowserRouter: pass, Routes: pass, Route: () => null, Navigate: () => null, Link: pass, NavLink: pass, useLocation: () => ({ pathname: '/think', search: '?context=work', hash: '' }), useNavigate: () => jest.fn(), useParams: () => ({}), useSearchParams: () => [new URLSearchParams('context=work'), jest.fn()] };
});
test('Work entry never mounts Personal providers or global Partner runtime', async () => {
  hasUsableStoredToken.mockReturnValue(true); render(<App />);
  expect(await screen.findByText('Isolated Work writing')).toBeInTheDocument(); expect(mockPersonal).not.toHaveBeenCalled();
});

test('Work opens the existing shared theme picker without mounting the Personal runtime', async () => {
  hasUsableStoredToken.mockReturnValue(true);
  render(<App />); fireEvent.click(await screen.findByRole('button', { name: 'Change Work theme' }));
  expect(await screen.findByRole('dialog', { name: 'A different light to read by.' })).toBeInTheDocument();
  expect(mockPersonal).not.toHaveBeenCalled();
});
