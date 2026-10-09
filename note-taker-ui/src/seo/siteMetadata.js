export const SITE_NAME = 'Noeis';
export const PRODUCT_NAME = 'Noeis';
export const CANONICAL_HOST = 'https://www.noeis.io';
export const DEFAULT_AUTHOR_NAME = 'Athan Tsokolas';
export const LOGO_PATH = '/logo512.png';
export const DEFAULT_SOCIAL_IMAGE_PATH = '/og-image.png';
export const DEFAULT_LAST_UPDATED = '2026-04-19';
export const DEFAULT_LAST_UPDATED_LABEL = 'April 19, 2026';
export const DEFAULT_DESCRIPTION = 'Noeis grows a knowledge base from what you read: a wiki that cites every source, answers quoted from your own reading, and read-only access for your AI agents.';

export const buildCanonicalUrl = (path = '/') => {
  const normalizedPath = String(path || '/').trim();
  const pathname = normalizedPath.startsWith('/')
    ? normalizedPath
    : `/${normalizedPath}`;
  return new URL(pathname, `${CANONICAL_HOST}/`).toString();
};

const buildPublisher = () => ({
  '@type': 'Organization',
  name: SITE_NAME,
  url: CANONICAL_HOST,
  logo: {
    '@type': 'ImageObject',
    url: buildCanonicalUrl(LOGO_PATH)
  }
});

export const buildOrganizationSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: CANONICAL_HOST,
  logo: buildCanonicalUrl(LOGO_PATH)
});

export const buildWebsiteSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: CANONICAL_HOST
});

export const buildSoftwareApplicationSchema = ({
  description = DEFAULT_DESCRIPTION,
  path = '/'
} = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: PRODUCT_NAME,
  applicationCategory: 'ProductivityApplication',
  operatingSystem: 'Web',
  url: buildCanonicalUrl(path),
  description,
  publisher: buildPublisher()
});

export const buildArticleSchema = ({
  headline,
  description,
  path,
  dateModified = DEFAULT_LAST_UPDATED,
  datePublished = DEFAULT_LAST_UPDATED,
  authorName = DEFAULT_AUTHOR_NAME
}) => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline,
  description,
  mainEntityOfPage: buildCanonicalUrl(path),
  datePublished,
  dateModified,
  author: {
    '@type': 'Person',
    name: authorName
  },
  publisher: buildPublisher()
});
