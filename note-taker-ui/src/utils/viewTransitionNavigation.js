// A view transition is skipped whenever a second one starts before the first
// finishes — which is exactly what happens when someone clicks twice, or when a
// route change lands mid-transition. The browser rejects `finished` in that
// case, and nobody was listening, so the skip surfaced as an uncaught runtime
// error. Skipping is the expected outcome, not a failure; a real failure still
// reaches the console.
const isExpectedViewTransitionAbort = (error) => {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  return name === 'AbortError' || /transition was skipped|view transition/i.test(message);
};

export const swallowSkippedViewTransition = (transition) => {
  transition?.finished?.catch?.((error) => {
    if (!isExpectedViewTransitionAbort(error)) console.error(error);
  });
  return transition;
};

export const navigateWithViewTransition = (navigate, destination, options) => {
  const runNavigation = () => navigate(destination, options);

  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
    runNavigation();
    return null;
  }

  return swallowSkippedViewTransition(document.startViewTransition(runNavigation));
};

export default navigateWithViewTransition;
