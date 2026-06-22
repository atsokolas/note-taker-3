import React from 'react';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { CANONICAL_HOST } from '../seo/siteMetadata';
import publishingContent from '../seo/publishingContent.json';
import { trackMarketingCta } from '../utils/marketingAnalytics';
import '../styles/seo-article.css';

const examplesSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Source-Grounded Wiki Examples',
  url: `${CANONICAL_HOST}/examples`,
  description: 'Curated source-grounded Noeis wiki examples for serious readers evaluating evidence-backed research workflows.',
  hasPart: (Array.isArray(publishingContent.examples) ? publishingContent.examples : []).map((example) => ({
    '@type': 'CreativeWork',
    name: example.title,
    url: `${CANONICAL_HOST}${example.href}`,
    description: example.description
  }))
};

const Examples = () => {
  useSeoMetadata({
    title: 'Source-Grounded Wiki Examples | Noeis',
    description: 'Curated source-grounded Noeis wiki examples for serious readers evaluating evidence-backed research workflows.',
    canonicalPath: '/examples',
    ogType: 'website',
    schema: examplesSchema
  });

  return (
    <div className="seo-article-page">
      <article className="seo-article">
        <header className="seo-hero">
          <p className="seo-eyebrow">Examples</p>
          <h1>Source-Grounded Wiki Examples</h1>
          <p className="seo-lede">
            Curated public Noeis wikis show how serious readers can turn source material into durable pages,
            claims, and reusable research structure.
          </p>
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
          <h2>Why these examples are curated</h2>
          <p>
            Shared wiki pages should be indexable only when they are intentional public examples.
            This page points search engines and readers to selected examples instead of treating every
            shared page as a growth asset.
          </p>
          <div className="seo-cta-row">
            <a
              href="/register?via=marketing&entry=examples&cta=examples&page_type=examples"
              className="ui-button ui-button-primary"
              onClick={() => trackMarketingCta({
                page: 'examples',
                cta: 'examples',
                target: '/register',
                pageType: 'examples'
              })}
            >
              Build your own research wiki
            </a>
            <a href="/from-saved-article-to-draft-in-noeis" className="ui-button ui-button-secondary">
              See the draft workflow
            </a>
          </div>
        </section>
      </article>
    </div>
  );
};

export default Examples;
