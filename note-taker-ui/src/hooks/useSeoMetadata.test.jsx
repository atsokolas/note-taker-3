import React from 'react';
import { render } from '@testing-library/react';
import useSeoMetadata from './useSeoMetadata';

const SeoProbe = () => {
  useSeoMetadata({
    title: 'Test Page | Noeis',
    description: 'Test page description',
    canonicalPath: '/guides',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: 'Test Page'
    }
  });

  return <div>seo probe</div>;
};

const NoindexSeoProbe = () => {
  useSeoMetadata({
    title: 'Private Draft | Noeis',
    description: 'Private draft description',
    canonicalPath: '/share/wiki/private-draft',
    robots: 'noindex,follow'
  });

  return <div>private seo probe</div>;
};

describe('useSeoMetadata', () => {
  it('writes Noeis metadata against the preferred canonical host', () => {
    render(<SeoProbe />);

    expect(document.title).toBe('Test Page | Noeis');
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.noeis.io/guides');
    expect(document.head.querySelector('meta[property="og:url"]')).toHaveAttribute('content', 'https://www.noeis.io/guides');
    expect(document.head.querySelector('meta[property="og:site_name"]')).toHaveAttribute('content', 'Noeis');
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    expect(document.head.querySelector('#seo-schema')).toHaveTextContent('"name":"Test Page"');
  });

  it('allows pages to opt out of indexing while retaining canonical metadata', () => {
    render(<NoindexSeoProbe />);

    expect(document.title).toBe('Private Draft | Noeis');
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.noeis.io/share/wiki/private-draft');
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  });
});
