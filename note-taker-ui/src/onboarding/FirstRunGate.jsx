import useFirstRunGate from './useFirstRunGate';

/**
 * FirstRunGate — mounts the first-run check inside the authenticated router.
 * Renders nothing; it only decides whether a brand-new user should be sent to the
 * start of the flow instead of the home page.
 */
const FirstRunGate = () => {
  useFirstRunGate();
  return null;
};

export default FirstRunGate;
