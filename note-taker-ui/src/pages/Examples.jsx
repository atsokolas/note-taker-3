import React from 'react';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { buttonClass } from '../components/ui';
import { CANONICAL_HOST } from '../seo/siteMetadata';
import publishingContent from '../seo/publishingContent.json';
import { trackMarketingCta } from '../utils/marketingAnalytics';
import '../styles/seo-article.css';

const COPY = publishingContent.hubs.examples;

const examplesSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: COPY.headline,
  url: `${CANONICAL_HOST}/examples`,
  description: COPY.description,
  hasPart: (Array.isArray(publishingContent.examples) ? publishingContent.examples : []).map((example) => ({
    '@type': 'CreativeWork',
    name: example.title,
    url: `${CANONICAL_HOST}${example.href}`,
    description: example.description
  }))
};

const Examples = () => {
  useSeoMetadata({
    title: COPY.title,
    description: COPY.description,
    canonicalPath: '/examples',
    ogType: 'website',
    schema: examplesSchema
  });

  return (
    <div className="seo-article-page">
      <article className="seo-article">
        <header className="seo-hero">
          <p className="seo-eyebrow">Examples</p>
          <h1>{COPY.headline}</h1>
          <p className="seo-lede">{COPY.lede}</p>
          <div className="seo-guide-grid">
            {publishingContent.examples.map((example) => (
              <a
                key={example.href}
                href={example.href}
                className="seo-guide-card"
                onClick={() => trackMarketingCta({
                  page: 'examples',
                  cta: 'example_card',
                  target: example.href,
                  pageType: 'examples'
                })}
              >
                <h2>{example.title}</h2>
                <p>{example.description}</p>
              </a>
            ))}
          </div>
        </header>

        <section className="seo-section">
          <h2>Start your own</h2>
          <div className="seo-cta-row">
            <a
              href="/register?via=marketing&entry=examples&cta=examples&page_type=examples"
              className={buttonClass('primary')}
              onClick={() => trackMarketingCta({
                page: 'examples',
                cta: 'examples',
                target: '/register',
                pageType: 'examples'
              })}
            >
              Build your own research wiki
            </a>
            <a href="/from-saved-article-to-draft-in-noeis" className={buttonClass()}>
              See the draft workflow
            </a>
          </div>
        </section>
      </article>
    </div>
  );
};

export default Examples;
