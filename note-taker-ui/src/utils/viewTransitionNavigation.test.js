import { navigateWithViewTransition } from './viewTransitionNavigation';

describe('navigateWithViewTransition', () => {
  const originalStartViewTransition = document.startViewTransition;

  afterEach(() => {
    document.startViewTransition = originalStartViewTransition;
    jest.restoreAllMocks();
  });

  it('falls back to direct navigation when the browser API is unavailable', () => {
    const navigate = jest.fn();
    document.startViewTransition = undefined;

    const transition = navigateWithViewTransition(navigate, '/wiki/workspace?page=wiki-1');

    expect(transition).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-1', undefined);
  });

  it('runs navigation inside document.startViewTransition when supported', () => {
    const navigate = jest.fn();
    const transitionHandle = { finished: Promise.resolve() };
    document.startViewTransition = jest.fn((callback) => {
      callback();
      return transitionHandle;
    });

    const transition = navigateWithViewTransition(navigate, '/wiki/workspace?page=wiki-1', { replace: true });

    expect(transition).toBe(transitionHandle);
    expect(document.startViewTransition).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=wiki-1', { replace: true });
  });
});
