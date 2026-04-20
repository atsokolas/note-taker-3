import React from 'react';
import { Link } from 'react-router-dom';
import useSeoMetadata from '../../hooks/useSeoMetadata';
import {
  DEFAULT_LAST_UPDATED,
  DEFAULT_LAST_UPDATED_LABEL,
  buildArticleSchema,
  buildSoftwareApplicationSchema
} from '../../seo/siteMetadata';
import publishingContent from '../../seo/publishingContent.json';
import { trackGuideCta } from '../../utils/marketingAnalytics';
import { buildMarketingHref } from '../../utils/marketingAttribution';
import '../../styles/seo-article.css';

const guideLookup = new Map(publishingContent.guides.map((guide) => [guide.slug, guide]));

const buildFaqSchema = (guide) => {
  if (!Array.isArray(guide.faq) || guide.faq.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faq.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer
      }
    }))
  };
};

const GuideLinks = ({ slugs = [] }) => (
  <ul>
    {slugs.map((slug) => {
      const guide = guideLookup.get(slug);
      if (!guide) return null;
      return (
        <li key={slug}>
          <a href={`/${slug}`}>{guide.title}</a>
        </li>
      );
    })}
  </ul>
);

const StructuredPanel = ({ label, children, className = '' }) => (
  <section className={className ? `seo-structured-card ${className}` : 'seo-structured-card'}>
    <p className="seo-structured-label">{label}</p>
    {children}
  </section>
);

const CardGrid = ({ variant = 'mistake', items = [] }) => {
  const className = variant === 'example'
    ? 'seo-example-grid'
    : variant === 'compare'
      ? 'seo-compare-grid'
      : variant === 'faq'
        ? 'seo-faq-list'
        : 'seo-mistake-list';
  const cardClassName = variant === 'example'
    ? 'seo-example-card'
    : variant === 'compare'
      ? 'seo-compare-card'
      : null;

  return (
    <div className={className}>
      {items.map((item) => (
        <section key={item.title} className={cardClassName}>
          <h3>{item.title}</h3>
          {item.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
};

const SectionBlocks = ({ blocks, slug }) => blocks.map((block, index) => {
  const key = `${block.type}-${index}`;

  if (block.type === 'paragraph') {
    return <p key={key}>{block.text}</p>;
  }

  if (block.type === 'orderedList') {
    return (
      <ol key={key}>
        {block.items.map((item) => <li key={item}>{item}</li>)}
      </ol>
    );
  }

  if (block.type === 'unorderedList') {
    return (
      <ul key={key}>
        {block.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    );
  }

  if (block.type === 'cards' || block.type === 'faqCards') {
    return <CardGrid key={key} variant={block.variant || 'faq'} items={block.items} />;
  }

  if (block.type === 'claimEvidence') {
    return (
      <div key={key} className="seo-structured-grid">
        <StructuredPanel label="Claim">
          <p>{block.claim}</p>
        </StructuredPanel>
        <StructuredPanel label="Evidence">
          <ul>
            {block.evidence.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </StructuredPanel>
        {block.whyItMatters ? (
          <StructuredPanel label="Why this matters">
            <p>{block.whyItMatters}</p>
          </StructuredPanel>
        ) : null}
      </div>
    );
  }

  if (block.type === 'comparison') {
    return (
      <div key={key} className="seo-comparison-block">
        <p className="seo-structured-label">Comparison</p>
        <CardGrid variant="compare" items={block.items} />
      </div>
    );
  }

  if (block.type === 'subsections') {
    return (
      <React.Fragment key={key}>
        {block.items.map((item) => (
          <React.Fragment key={item.title}>
            <h3>{item.title}</h3>
            {item.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {item.orderedList ? (
              <ol>
                {item.orderedList.map((listItem) => <li key={listItem}>{listItem}</li>)}
              </ol>
            ) : null}
          </React.Fragment>
        ))}
      </React.Fragment>
    );
  }

  if (block.type === 'ctas') {
    return (
      <div key={key} className="seo-cta-row">
        {block.items.map((cta) => (
          <Link
            key={cta.label}
            to={cta.href === '/register'
              ? buildMarketingHref(cta.href, {
                  entry: slug,
                  cta: cta.track || 'body',
                  pageType: 'guide'
                })
              : cta.href}
            className={`ui-button ui-button-${cta.variant || 'secondary'}`}
            onClick={() => trackGuideCta({ page: slug, cta: cta.track || 'body', target: cta.href })}
          >
            {cta.label}
          </Link>
        ))}
      </div>
    );
  }

  if (block.type === 'relatedGuides') {
    return <GuideLinks key={key} slugs={block.items} />;
  }

  if (block.type === 'externalLinks') {
    return (
      <ul key={key}>
        {block.items.map((item) => (
          <li key={item.href}>
            <a href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a>
          </li>
        ))}
      </ul>
    );
  }

  return null;
});

const GuideArticlePage = ({ slug }) => {
  const guide = guideLookup.get(slug);
  const guideMethodology = Array.isArray(guide.methodology) && guide.methodology.length > 0
    ? guide.methodology
    : Array.isArray(publishingContent.site.editorialMethodology)
      ? publishingContent.site.editorialMethodology
      : [];

  const schema = [
    buildArticleSchema({
      headline: guide.heroTitle,
      description: guide.heroDescription,
      path: `/${guide.slug}`
    }),
    buildSoftwareApplicationSchema()
  ];

  const faqSchema = buildFaqSchema(guide);
  if (faqSchema) schema.push(faqSchema);

  useSeoMetadata({
    title: guide.pageTitle,
    description: guide.heroDescription,
    canonicalPath: `/${guide.slug}`,
    schema
  });

  return (
    <div className="seo-article-page">
      <article className="seo-article">
        <header className="seo-hero">
          <p className="seo-eyebrow">{guide.eyebrow || 'Guide'}</p>
          <div className="seo-meta">
            <span>By {publishingContent.site.authorName}</span>
            <span>Updated {DEFAULT_LAST_UPDATED_LABEL}</span>
            <span>Publishing system {DEFAULT_LAST_UPDATED}</span>
          </div>
          <h1>{guide.heroTitle}</h1>
          {guide.heroIntro.map((paragraph) => (
            <p key={paragraph} className="seo-lede">{paragraph}</p>
          ))}
          <div className="seo-cta-row">
            {guide.ctas.map((cta) => (
              <Link
                key={cta.label}
                to={cta.href === '/register'
                  ? buildMarketingHref(cta.href, {
                      entry: guide.slug,
                      cta: cta.track || 'hero',
                      pageType: 'guide'
                    })
                  : cta.href}
                className={`ui-button ui-button-${cta.variant || 'secondary'}`}
                onClick={() => trackGuideCta({ page: guide.slug, cta: cta.track || 'hero', target: cta.href })}
              >
                {cta.label}
              </Link>
            ))}
          </div>
          {Array.isArray(guide.toc) && guide.toc.length > 0 ? (
            <nav className="seo-toc" aria-label="On-page sections">
              {guide.toc.map((item) => (
                <a key={item.id} href={`#${item.id}`}>{item.label}</a>
              ))}
            </nav>
          ) : null}
          <section className="seo-trust-panel" aria-label="Editorial trust signals">
            <div className="seo-trust-copy">
              <h2>How this guide was produced</h2>
              <p className="seo-trust-byline">
                Written by {publishingContent.site.authorName}
                {publishingContent.site.authorTitle ? `, ${publishingContent.site.authorTitle}` : ''}.
              </p>
              {guideMethodology.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
          {guide.directAnswer ? (
            <section className="seo-answer-panel" aria-label="Direct answer">
              <p className="seo-structured-label">{guide.directAnswer.label || 'Direct answer'}</p>
              <h2>{guide.directAnswer.title}</h2>
              <p className="seo-answer-text">{guide.directAnswer.text}</p>
              {Array.isArray(guide.directAnswer.points) && guide.directAnswer.points.length > 0 ? (
                <ul className="seo-answer-points">
                  {guide.directAnswer.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              ) : null}
            </section>
          ) : null}
        </header>

        {guide.sections.map((section, index) => {
          const className = section.style === 'callout'
            ? 'seo-callout'
            : section.style === 'footer'
              ? 'seo-footer-cta'
              : 'seo-section';
          const Tag = section.style === 'callout' ? 'aside' : section.style === 'footer' ? 'footer' : 'section';

          return (
            <Tag key={`${section.title}-${index}`} id={section.id} className={className}>
              <h2>{section.title}</h2>
              <SectionBlocks blocks={section.blocks} slug={guide.slug} />
            </Tag>
          );
        })}
      </article>
    </div>
  );
};

export default GuideArticlePage;
