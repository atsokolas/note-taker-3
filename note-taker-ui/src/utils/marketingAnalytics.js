import { track } from '@vercel/analytics';
import api from '../api';
import {
  buildMarketingPayload,
  captureMarketingAttribution,
  readMarketingAttribution
} from './marketingAttribution';

const safeTrack = (eventName, payload = {}) => {
  try {
    track(eventName, payload);
  } catch (_error) {
    // Ignore analytics failures; user flows should still succeed.
  }
};

const postBackendMarketingEvent = async ({ event, reason = '', error = '' } = {}) => {
  try {
    const attribution = readMarketingAttribution();
    await api.post('/api/analytics/marketing', {
      event,
      reason,
      error,
      attribution
    }, {
      skipAuthHandling: true
    });
  } catch (_error) {
    // Ignore analytics transport failures.
  }
};

export const trackMarketingCta = ({ page, cta, target, pageType = 'marketing' }) => {
  const attribution = captureMarketingAttribution({
    entry: page,
    cta,
    pageType,
    target
  });
  safeTrack('Marketing CTA Clicked', {
    ...buildMarketingPayload({ page, cta, target, pageType }),
    attributionCaptured: Boolean(attribution)
  });
  postBackendMarketingEvent({ event: 'marketing_cta_clicked' });
};

export const trackGuideCta = ({ page, cta, target }) => {
  trackMarketingCta({ page, cta, target, pageType: 'guide' });
};

export const trackSharedWikiViewed = ({ page = '', title = '', sourceCount = 0, claimCount = 0 } = {}) => {
  const target = typeof window !== 'undefined' ? window.location.pathname : page;
  const attribution = captureMarketingAttribution({
    entry: page,
    cta: 'shared_wiki_view',
    pageType: 'shared_wiki',
    target
  });
  safeTrack('Shared Wiki Viewed', {
    ...buildMarketingPayload({
      page,
      title,
      pageType: 'shared_wiki',
      sourceCount,
      claimCount
    }),
    attributionCaptured: Boolean(attribution)
  });
};

export const trackSharedWikiAdoptClicked = ({ page = '', title = '', sourceCount = 0, claimCount = 0 } = {}) => {
  const target = '/register';
  const attribution = captureMarketingAttribution({
    entry: page,
    cta: 'adopt_shared_wiki',
    pageType: 'shared_wiki',
    target
  });
  safeTrack('Shared Wiki Adopt Clicked', {
    ...buildMarketingPayload({
      page,
      title,
      pageType: 'shared_wiki',
      sourceCount,
      claimCount,
      target
    }),
    attributionCaptured: Boolean(attribution)
  });
};

export const trackSignupViewed = () => {
  captureMarketingAttribution({ pageType: 'signup', target: '/register' });
  safeTrack('Marketing Signup Viewed', buildMarketingPayload({ pageType: 'signup' }));
  postBackendMarketingEvent({ event: 'marketing_signup_viewed' });
};

export const trackSignupStarted = () => {
  safeTrack('Marketing Signup Started', buildMarketingPayload({ pageType: 'signup' }));
  postBackendMarketingEvent({ event: 'marketing_signup_started' });
};

export const trackSignupSucceeded = ({ username = '' } = {}) => {
  safeTrack('Marketing Signup Succeeded', buildMarketingPayload({
    pageType: 'signup',
    username
  }));
};

export const trackSignupFailed = ({ reason = '', error = '' } = {}) => {
  safeTrack('Marketing Signup Failed', buildMarketingPayload({
    pageType: 'signup',
    reason,
    error
  }));
  postBackendMarketingEvent({
    event: 'marketing_signup_failed',
    reason,
    error
  });
};

export const trackActivationMilestone = ({
  milestone,
  sourceType = '',
  title = '',
  conceptName = '',
  dueInDays = '',
  importedArticles = 0,
  importedHighlights = 0,
  importedNotes = 0
}) => {
  safeTrack('Marketing Activation Milestone', buildMarketingPayload({
    milestone,
    sourceType,
    title,
    conceptName,
    dueInDays,
    importedArticles,
    importedHighlights,
    importedNotes
  }));
};
