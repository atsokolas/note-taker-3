import { render } from '@testing-library/react';
import App, { isPublicSharePath } from './App';
import { hasUsableStoredToken } from './api';

jest.mock('axios', () => ({
  create: () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  })
}));

jest.mock('./api', () => ({
  clearStoredTokens: jest.fn(),
  hasUsableStoredToken: jest.fn(() => false)
}));

jest.mock('./api/uiSettings', () => ({
  fetchUiSettings: jest.fn(() => Promise.resolve({})),
  saveUiSettings: jest.fn(() => Promise.resolve({}))
}));

jest.mock('@vercel/analytics/react', () => ({
  Analytics: () => null
}), { virtual: true });

jest.mock('@vercel/analytics', () => ({
  track: jest.fn()
}), { virtual: true });

beforeEach(() => {
  hasUsableStoredToken.mockReturnValue(false);
  window.history.pushState({}, '', '/');
});

test('renders without crashing', () => {
  const { container } = render(<App />);
  expect(container).toBeTruthy();
});

test('treats shared routes as public even when auth is available', () => {
  expect(isPublicSharePath('/share/wiki/example-page')).toBe(true);
  expect(isPublicSharePath('/share/wiki/collection/mental-models')).toBe(true);
  expect(isPublicSharePath('/share/concepts/opportunity-cost')).toBe(true);
  expect(isPublicSharePath('/wiki/workspace')).toBe(false);
});
