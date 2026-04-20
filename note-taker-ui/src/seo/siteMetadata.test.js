import {
  CANONICAL_HOST,
  SITE_NAME,
  buildCanonicalUrl,
  buildOrganizationSchema,
  buildWebsiteSchema
} from './siteMetadata';

describe('siteMetadata', () => {
  it('builds canonical URLs against the preferred public host', () => {
    expect(CANONICAL_HOST).toBe('https://www.noeis.io');
    expect(buildCanonicalUrl('/guides')).toBe('https://www.noeis.io/guides');
    expect(buildCanonicalUrl('ai-second-brain')).toBe('https://www.noeis.io/ai-second-brain');
    expect(buildCanonicalUrl('/')).toBe('https://www.noeis.io/');
  });

  it('describes the organization and website with Noeis branding', () => {
    expect(SITE_NAME).toBe('Noeis');

    expect(buildOrganizationSchema()).toEqual(expect.objectContaining({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Noeis',
      url: 'https://www.noeis.io'
    }));

    expect(buildWebsiteSchema()).toEqual(expect.objectContaining({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Noeis',
      url: 'https://www.noeis.io'
    }));
  });
});
