import React from 'react';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { CANONICAL_HOST, DEFAULT_AUTHOR_NAME, DEFAULT_LAST_UPDATED_LABEL } from '../seo/siteMetadata';
import publishingContent from '../seo/publishingContent.json';
import { trackGuideCta } from '../utils/marketingAnalytics';
import '../styles/seo-article.css';

const guidesHubSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Noeis Guides for Thinking, Reading, and Knowledge Work',
  url: `${CANONICAL_HOST}/guides`,
  description: 'Opinionated guides on source-grounded research workflows, reliable recall, reading-to-draft systems, and evidence-backed synthesis for serious readers.'
};

const GuidesHub = () => {
  useSeoMetadata({
    title: 'Noeis Guides for Thinking, Reading, and Knowledge Work',
    description: 'Opinionated guides on source-grounded research workflows, reliable recall, reading-to-draft systems, and evidence-backed synthesis for serious readers.',
    canonicalPath: '/guides',
    ogType: 'website',
    schema: guidesHubSchema
  });

  return (
    <div className="seo-article-page">
      <article className="seo-article">
        <header className="seo-hero">
          <p className="seo-eyebrow">Guides</p>
          <div className="seo-meta">
            <span>By {DEFAULT_AUTHOR_NAME}</span>
            <span>Updated {DEFAULT_LAST_UPDATED_LABEL}</span>
          </div>
          <h1>Practical guides for thinking, writing and knowledge work</h1>
          <p className="seo-lede">
            These guides are built for founders, writers, researchers, analysts, and serious readers
            evaluating better workflows for source-grounded research, recall, synthesis, and drafts.
          </p>
          <div className="seo-guide-grid">
            {publishingContent.guides.map((guide) => (
              <a
                key={guide.slug}
                href={`/${guide.slug}`}
                className="seo-guide-card"
                onClick={() => trackGuideCta({ page: 'guides', cta: 'card', target: `/${guide.slug}` })}
              >
                <h2>{guide.title}</h2>
                <p>{guide.description}</p>
              </a>
            ))}
          </div>
        </header>

        <section className="seo-section">
          <h2>Where to start</h2>
          <p>
            If you are still defining the category, start with <a href="/ai-second-brain">AI Second Brain</a>.
            If you are choosing a tool, move to <a href="/second-brain-app">Second Brain App</a>.
            If you already have a tool and need a better operating model, use
            <a href="/ai-note-taking-workflow"> AI Note-Taking Workflow</a>.
          </p>
          <p>
            If your problem is note sprawl and weak retrieval across your own archive, use
            <a href="/personal-knowledge-management-ai"> Personal Knowledge Management AI</a>.
          </p>
        </section>

      </article>
    </div>
  );
};

export default GuidesHub;
