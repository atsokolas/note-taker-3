import { track } from '@vercel/analytics';

export const trackGuideCta = ({ page, cta, target }) => {
  try {
    track('Guide CTA Clicked', {
      page,
      cta,
      target
    });
  } catch (_error) {
    // Ignore analytics failures; navigation should still succeed.
  }
};
