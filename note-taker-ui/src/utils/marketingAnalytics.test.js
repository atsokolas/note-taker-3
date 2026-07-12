import api from '../api';
import { trackMarketingCta } from './marketingAnalytics';

jest.mock('../api', () => ({
  __esModule: true,
  default: { post: jest.fn().mockResolvedValue({ data: { ok: true } }) }
}));

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }));

jest.mock('./marketingAttribution', () => ({
  buildMarketingPayload: jest.fn(() => ({ page: 'home' })),
  captureMarketingAttribution: jest.fn(() => ({ visitorId: 'visitor-1' })),
  readMarketingAttribution: jest.fn(() => ({ visitorId: 'visitor-1' }))
}));

describe('marketingAnalytics backend transport', () => {
  beforeEach(() => api.post.mockClear());

  it('uses the configured API client for public CTA events', async () => {
    trackMarketingCta({
      page: 'home',
      cta: 'living-dossier',
      target: '/share/wiki/alphabet',
      pageType: 'home'
    });

    await Promise.resolve();
    expect(api.post).toHaveBeenCalledWith(
      '/api/analytics/marketing',
      expect.objectContaining({ event: 'marketing_cta_clicked' }),
      { skipAuthHandling: true }
    );
  });
});
