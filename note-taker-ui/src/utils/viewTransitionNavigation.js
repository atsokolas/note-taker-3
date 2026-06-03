export const navigateWithViewTransition = (navigate, destination, options) => {
  const runNavigation = () => navigate(destination, options);

  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
    runNavigation();
    return null;
  }

  return document.startViewTransition(runNavigation);
};

export default navigateWithViewTransition;
