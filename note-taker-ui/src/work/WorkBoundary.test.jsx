import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { hasUsableStoredToken } from '../api';
import { hasPartnerPanel } from '../agent/contextualAgentContracts';
jest.mock('../api', () => ({ clearStoredTokens: jest.fn(), hasUsableStoredToken: jest.fn(() => true) }));
jest.mock('../utils/marketingAnalytics', () => ({ trackMarketingEvent: jest.fn() }));
jest.mock('../api/uiSettings', () => ({ fetchUiSettings: jest.fn(async () => ({})), saveUiSettings: jest.fn() }));
jest.mock('@vercel/analytics/react', () => ({ Analytics: () => null }), { virtual: true });
jest.mock('@vercel/analytics', () => ({ track: jest.fn() }), { virtual: true });
jest.mock('react-router-dom', () => {
  const React = require('react'); const pass = ({ children }) => <>{children}</>;
  return { BrowserRouter: pass, Routes: pass, Route: () => null, Navigate: ({ to }) => <p>Redirected to {to}</p>, Link: pass, NavLink: pass, useLocation: () => ({ pathname: '/think', search: '?context=work&date=2026-10-26', hash: '' }), useNavigate: () => jest.fn(), useParams: () => ({}), useSearchParams: () => [new URLSearchParams('context=work'), jest.fn()] };
});

test('the old Work address in Think lands on /work with its day kept', async () => {
  hasUsableStoredToken.mockReturnValue(true); render(<App />);
  expect(await screen.findByText('Redirected to /work?date=2026-10-26')).toBeInTheDocument();
});

test('no Partner works in Work', () => {
  expect(hasPartnerPanel('/work')).toBe(false);
});
