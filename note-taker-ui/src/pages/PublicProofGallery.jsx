import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicWikiCollection } from '../api/wiki';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { CANONICAL_HOST, SITE_NAME, buildCanonicalUrl } from '../seo/siteMetadata';
import '../styles/seo-article.css';

const PROOF_COLLECTIONS = [
  {
    id: 'value-investing',
    label: 'Investing dossier',
    clock: 'Filings and transcripts next',
    fallbackDescription: 'Intrinsic value, moats, capital allocation, and owner-oriented judgment.'
  },
  {
    id: 'mental-models',
    label: 'Concept dossier',
    clock: 'Reading and source events',
    fallbackDescription: 'Core models for tradeoffs, safety, incentives, and compounding.'
  },
  {
    id: 'behavioral-economics',
    label: 'Question cluster',
    clock: 'Evidence and contradiction checks',
    fallbackDescription: 'Biases, base rates, and the psychology of judgment.'
  },
  {
    id: 'how-to-think-about-ai',
    label: 'Technology map',
    clock: 'Release and research drift next',
    fallbackDescription: 'Agents, evals, context windows, and capability tradeoffs.'
  }
];

const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const pageIdFor = (page = {}) => String(page?._id || page?.id || page?.slug || '');

const newestTimestamp = (pages = []) => {
  const timestamps = (Array.isArray(pages) ? pages : [])
    .map(page => page?.lastReviewedAt || page?.updatedAt || page?.createdAt)
    .map(value => new Date(value || 0).getTime())
    .filter(value => Number.isFinite(value) && value > 0);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : '';
};

const sumMetric = (pages = [], key) => (
  (Array.isArray(pages) ? pages : []).reduce((sum, page) => sum + (Number(page?.[key]) || 0), 0)
);

const normalizeProofCollection = (entry, payload = {}) => {
  const collection = payload?.collection || {};
  const pages = Array.isArray(collection.pages) ? collection.pages : [];
  return {
    id: entry.id,
    label: entry.label,
    clock: entry.clock,
    name: cleanText(collection.name || collection.title) || entry.id,
    description: cleanText(collection.description) || entry.fallbackDescription,
    href: `/share/wiki/collection/${entry.id}`,
    pageCount: pages.length || Number(collection.pageCount) || 0,
    sourceCount: sumMetric(pages, 'sourceCount'),
    claimCount: sumMetric(pages, 'claimCount'),
    reviewedAt: newestTimestamp(pages),
    pages: pages.slice(0, 4).map(page => ({
      id: pageIdFor(page),
      title: cleanText(page.title) || 'Untitled page',
      sourceCount: Number(page.sourceCount) || 0,
      claimCount: Number(page.claimCount) || 0
    }))
  };
};

export const buildPublicProofGallerySchema = (items = []) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Living Research Dossiers',
  headline: 'Living Research Dossiers',
  description: 'Public Noeis proof pages showing maintained source-grounded research dossiers.',
  url: buildCanonicalUrl('/proof'),
  mainEntityOfPage: buildCanonicalUrl('/proof'),
  isAccessibleForFree: true,
  inLanguage: 'en',
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
    url: CANONICAL_HOST
  },
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: `${CANONICAL_HOST}${item.href}`,
      description: item.description
    }))
  }
});

const PublicProofGallery = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(PROOF_COLLECTIONS.map(entry => getPublicWikiCollection(entry.id)))
      .then((results) => {
        if (cancelled) return;
        const nextItems = results
          .map((result, index) => (
            result.status === 'fulfilled'
              ? normalizeProofCollection(PROOF_COLLECTIONS[index], result.value)
              : null
          ))
          .filter(Boolean);
        setItems(nextItems);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const schema = useMemo(() => buildPublicProofGallerySchema(items), [items]);

  useSeoMetadata({
    title: 'Living Research Dossiers | Noeis',
    description: 'Public Noeis proof pages showing maintained source-grounded research dossiers with references, freshness, and private graph data withheld.',
    canonicalPath: '/proof',
    ogType: 'website',
    robots: 'index,follow',
    schema
  });

  return (
    <main className="public-proof-gallery">
      <nav className="public-proof-gallery__topbar" aria-label="Proof gallery navigation">
        <Link to="/" className="public-proof-gallery__brand">Noeis</Link>
        <div className="public-proof-gallery__navlinks">
          <Link to="/examples">Examples</Link>
          <Link to="/register">Build yours</Link>
        </div>
      </nav>

      <section className="public-proof-gallery__hero">
        <p className="public-proof-gallery__eyebrow">Public proof gallery</p>
        <h1>Living research dossiers, not generated pages.</h1>
        <p>
          Noeis keeps knowledge objects attached to sources, review dates, and safe public citations.
          These pages are public proof of the maintenance loop: the private graph stays sealed, while
          the useful dossier can be read, shared, and adopted.
        </p>
        <div className="public-proof-gallery__hero-actions">
          <a href="#dossiers">See living dossiers</a>
          <Link to="/register">Make one yours</Link>
        </div>
      </section>

      <section className="public-proof-gallery__principle" aria-label="How public proof works">
        <div>
          <span>Object</span>
          <p>A concept, company, question, or repo becomes a maintained wiki object.</p>
        </div>
        <div>
          <span>Clock</span>
          <p>New filings, releases, reading, and citations become source events.</p>
        </div>
        <div>
          <span>Receipt</span>
          <p>The page shows what is public and what the agent last reviewed.</p>
        </div>
      </section>

      <section className="public-proof-gallery__section" id="dossiers" aria-label="Living dossiers">
        <div className="public-proof-gallery__section-head">
          <p className="public-proof-gallery__eyebrow">Maintained examples</p>
          <h2>Start with the public-safe proof set.</h2>
          <p>
            These use the same shared-wiki serializer as public pages: body, references, and claims can
            appear; private highlights, backlinks, source notes, and agent state do not.
          </p>
        </div>

        {loading ? (
          <div className="public-proof-gallery__state" role="status">Loading public proof pages...</div>
        ) : items.length ? (
          <div className="public-proof-gallery__grid">
            {items.map(item => (
              <article className="public-proof-gallery__card" key={item.id}>
                <div className="public-proof-gallery__card-topline">
                  <span>{item.label}</span>
                  <span>{item.clock}</span>
                </div>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <div className="public-proof-gallery__stamp" aria-label={`${item.name} maintenance stamp`}>
                  <span>Maintained by the owner's agent</span>
                  <strong>{item.reviewedAt ? `Last reviewed ${formatDate(item.reviewedAt)}` : 'Review date pending'}</strong>
                </div>
                <dl className="public-proof-gallery__metrics">
                  <div>
                    <dt>Pages</dt>
                    <dd>{item.pageCount}</dd>
                  </div>
                  <div>
                    <dt>Sources</dt>
                    <dd>{item.sourceCount}</dd>
                  </div>
                  <div>
                    <dt>Claims</dt>
                    <dd>{item.claimCount}</dd>
                  </div>
                </dl>
                {item.pages.length ? (
                  <ul className="public-proof-gallery__page-list">
                    {item.pages.map(page => (
                      <li key={page.id || page.title}>
                        <span>{page.title}</span>
                        <small>{page.sourceCount} sources · {page.claimCount} claims</small>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Link className="public-proof-gallery__card-link" to={item.href}>
                  Open public dossier
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="public-proof-gallery__state">
            Public proof pages are being curated. Try the shared starter wikis from the examples page.
          </div>
        )}
      </section>

      <section className="public-proof-gallery__section public-proof-gallery__section--next" aria-label="What comes next">
        <p className="public-proof-gallery__eyebrow">Next source clocks</p>
        <h2>The core does not change. The clocks get louder.</h2>
        <p>
          Investing and OSS are not separate apps. They are source clocks attached to the same maintained
          object loop: EDGAR filings and transcripts for company dossiers; GitHub releases and docs for repo wikis.
        </p>
      </section>
    </main>
  );
};

export default PublicProofGallery;
