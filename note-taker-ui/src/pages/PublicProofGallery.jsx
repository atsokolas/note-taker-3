import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicProofRegistry } from '../api/wiki';
import MaintenanceProofStamp from '../components/public/MaintenanceProofStamp';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { CANONICAL_HOST, SITE_NAME, buildCanonicalUrl } from '../seo/siteMetadata';
import {
  PUBLIC_PROOF_PRIVACY_STATEMENT,
  formatMaintenanceDate,
  normalizePublicProofRegistry
} from '../utils/maintenanceProof';
import '../styles/seo-article.css';
import '../styles/maintenance-proof-stamp.css';

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
      name: item.title,
      url: `${CANONICAL_HOST}${item.href}`,
      description: item.description,
      ...(item.maintenanceProof?.lastReviewedAt
        ? { dateReviewed: item.maintenanceProof.lastReviewedAt }
        : {}),
      ...(Array.isArray(item.page?.sourceRefs) && item.page.sourceRefs.length
        ? {
          citation: item.page.sourceRefs.slice(0, 8).map((source) => ({
            '@type': 'CreativeWork',
            name: source.title || source.url || 'Source',
            ...(source.url ? { url: source.url } : {})
          }))
        }
        : {})
    }))
  }
});

const PublicProofGallery = () => {
  const [items, setItems] = useState([]);
  const [privacyStatement, setPrivacyStatement] = useState(PUBLIC_PROOF_PRIVACY_STATEMENT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPublicProofRegistry()
      .then((payload) => {
        if (cancelled) return;
        const registry = normalizePublicProofRegistry(payload);
        setItems(registry.items);
        setPrivacyStatement(registry.privacyStatement);
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
          <h2>Six public-safe proof objects.</h2>
          <p>
            Each card links directly to one maintained object. Clocks, current-through facts, review
            dates, and material events come from accepted state only.
          </p>
          <p className="public-proof-gallery__privacy">{privacyStatement}</p>
        </div>

        {loading ? (
          <div className="public-proof-gallery__state" role="status">Loading public proof pages...</div>
        ) : items.length ? (
          <div className="public-proof-gallery__grid">
            {items.map(item => (
              <article className="public-proof-gallery__card" key={item.slot || item.href}>
                <div className="public-proof-gallery__card-topline">
                  <span>{item.label}</span>
                  {item.maintenanceProof?.clock?.label ? (
                    <span>{item.maintenanceProof.clock.label}</span>
                  ) : null}
                </div>
                <h3>{item.title}</h3>
                {item.description ? <p>{item.description}</p> : null}
                <MaintenanceProofStamp
                  proof={item.maintenanceProof}
                  className="public-proof-gallery__stamp maintenance-proof-stamp"
                  showCounts={false}
                />
                <dl className="public-proof-gallery__metrics">
                  {item.sourceCount !== null ? (
                    <div>
                      <dt>Sources</dt>
                      <dd>{item.sourceCount}</dd>
                    </div>
                  ) : null}
                  {item.claimCount !== null ? (
                    <div>
                      <dt>Claims</dt>
                      <dd>{item.claimCount}</dd>
                    </div>
                  ) : null}
                  {item.maintenanceProof?.lastReviewedAt ? (
                    <div>
                      <dt>Reviewed</dt>
                      <dd>{formatMaintenanceDate(item.maintenanceProof.lastReviewedAt)}</dd>
                    </div>
                  ) : null}
                </dl>
                <Link className="public-proof-gallery__card-link" to={item.href}>
                  Open public dossier
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="public-proof-gallery__state">
            Public proof pages are being curated. Check back once the proof registry is published.
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
