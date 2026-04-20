import {
  buildMarketingHref,
  captureMarketingAttribution,
  clearMarketingAttribution,
  readMarketingAttribution
} from './marketingAttribution';

describe('marketingAttribution', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: ''
    });
  });

  it('adds marketing query params to internal signup links', () => {
    expect(buildMarketingHref('/register', {
      entry: 'ai-second-brain',
      cta: 'hero',
      pageType: 'guide'
    })).toBe('/register?via=marketing&entry=ai-second-brain&cta=hero&page_type=guide');

    expect(buildMarketingHref('https://example.com/register', {
      entry: 'ignored'
    })).toBe('https://example.com/register');
  });

  it('captures organic attribution from search params and referrer', () => {
    window.history.replaceState({}, '', '/register?via=marketing&entry=ai-second-brain&cta=hero&utm_source=google&utm_medium=organic');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://www.google.com/search?q=noeis'
    });

    const attribution = captureMarketingAttribution({ pageType: 'signup', target: '/register' });

    expect(attribution.entry).toBe('ai-second-brain');
    expect(attribution.cta).toBe('hero');
    expect(attribution.pageType).toBe('signup');
    expect(attribution.target).toBe('/register');
    expect(attribution.utmSource).toBe('google');
    expect(attribution.utmMedium).toBe('organic');
    expect(attribution.referrerHost).toBe('www.google.com');
    expect(readMarketingAttribution()).toMatchObject({
      entry: 'ai-second-brain',
      cta: 'hero',
      utmSource: 'google',
      utmMedium: 'organic'
    });

    clearMarketingAttribution();
    expect(readMarketingAttribution()).toBeNull();
  });
});
