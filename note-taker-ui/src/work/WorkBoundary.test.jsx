import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { hasUsableStoredToken } from '../api';
const mockPersonal = jest.fn();
jest.mock('../api', () => ({ clearStoredTokens: jest.fn(), hasUsableStoredToken: jest.fn(() => true) }));
jest.mock('../utils/marketingAnalytics', () => ({ trackMarketingEvent: jest.fn() }));
jest.mock('../api/uiSettings', () => ({ fetchUiSettings: jest.fn(async () => ({})), saveUiSettings: jest.fn() }));
jest.mock('@vercel/analytics/react', () => ({ Analytics: () => null }), { virtual: true });
jest.mock('@vercel/analytics', () => ({ track: jest.fn() }), { virtual: true });
jest.mock('../agent/AgentRailContext', () => ({ AgentRailProvider: ({ children }) => { mockPersonal(); return children; }, useAgentRail: () => ({}) }));
jest.mock('./WorkNotes', () => () => <div>Isolated Work writing</div>);
jest.mock('react-router-dom', () => {
  const React = require('react'); const pass = ({ children }) => <>{children}</>;
  return { BrowserRouter: pass, Routes: pass, Route: () => null, Navigate: () => null, Link: pass, NavLink: pass, useLocation: () => ({ pathname: '/think', search: '?context=work', hash: '' }), useNavigate: () => jest.fn(), useParams: () => ({}), useSearchParams: () => [new URLSearchParams('context=work'), jest.fn()] };
});
test('Work entry never mounts Personal providers or global Partner runtime', async () => {
  hasUsableStoredToken.mockReturnValue(true); render(<App />);
  expect(await screen.findByText('Isolated Work writing')).toBeInTheDocument(); expect(mockPersonal).not.toHaveBeenCalled();
});
