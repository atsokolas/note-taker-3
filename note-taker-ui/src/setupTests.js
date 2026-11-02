// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no layout, so Range has no rects; editor menus measure a selection after a short delay.
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [];
  Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} });
}

jest.mock('react-router-dom', () => {
  const React = require('react');
  const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
  const linkEl = ({ children, to, ...props }) => React.createElement(
    'a',
    {
      ...props,
      href: typeof to === 'string' ? to : '#'
    },
    children
  );

  const navigate = jest.fn();
  return {
    __esModule: true,
    MemoryRouter: passthrough,
    BrowserRouter: passthrough,
    Routes: passthrough,
    Route: passthrough,
    Outlet: () => null,
    Navigate: () => null,
    Link: linkEl,
    NavLink: linkEl,
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(), jest.fn()],
    createSearchParams: (init) => new URLSearchParams(init)
  };
}, { virtual: true });
