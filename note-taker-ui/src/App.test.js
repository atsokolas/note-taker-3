import { render } from '@testing-library/react';
import App from './App';

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

jest.mock('@vercel/analytics/react', () => ({
  Analytics: () => null
}), { virtual: true });

jest.mock('@vercel/analytics', () => ({
  track: jest.fn()
}), { virtual: true });

test('renders without crashing', () => {
  const { container } = render(<App />);
  expect(container).toBeTruthy();
});
