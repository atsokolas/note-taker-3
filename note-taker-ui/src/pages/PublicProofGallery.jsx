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
  const [error, setError] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('noeis-public-share');
    document.body.classList.add('noeis-public-share');
    return () => {
      document.body.classList.remove('noeis-public-share');
      document.documentElement.classList.remove('noeis-public-share');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
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
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A proof gallery should contain proof and inspectable candidates, not broad examples.
  // Illustrative objects can live in /examples once they are useful enough on their own.
  const publicItems = items.filter((item) => ['proven', 'candidate'].includes(item.proofGrade?.grade));
  const schema = useMemo(() => buildPublicProofGallerySchema(publicItems), [publicItems]);
  const provenItems = publicItems.filter((item) => item.proofGrade?.grade === 'proven');
  const flagship = provenItems[0] || null;
  const additionalProven = provenItems.slice(1);
  const repoCandidate = publicItems.find((item) => item.proofGrade?.grade === 'candidate') || null;
  const acceptanceItems = items.filter((item) => item.proofGrade?.grade === 'acceptance_in_progress');

  const renderProofObject = (item, { primary = false, candidate = false } = {}) => {
    const proof = candidate ? {
      ...item.maintenanceProof,
      latestMaterialEvent: {
        type: 'candidate_review',
        summary: 'No material accepted change has been demonstrated.',
        at: null
      }
    } : item.maintenanceProof;
    const comparisonHref = item.proofGrade?.comparisonUrl || '';
    return (
    <article
      className={`public-proof-gallery__card${primary ? ' is-flagship' : ''}${candidate ? ' is-candidate' : ''}`}
      key={item.slot || item.href}
    >
      <div className="public-proof-gallery__card-topline">
        <span>{primary ? item.proofGrade?.label || 'Proven' : candidate ? 'Candidate proof' : item.label}</span>
        {item.maintenanceProof?.clock?.label ? <span>{item.maintenanceProof.clock.label}</span> : null}
      </div>
      <h3>{item.title}</h3>
      {item.description ? <p>{item.description}</p> : null}
      {item.proofGrade?.reason ? <p className="public-proof-gallery__grade-reason">{item.proofGrade.reason}</p> : null}
      <MaintenanceProofStamp
        proof={proof}
        className="public-proof-gallery__stamp maintenance-proof-stamp"
        showCounts={false}
      />
      <dl className="public-proof-gallery__metrics">
        {item.sourceCount !== null ? <div><dt>Sources</dt><dd>{item.sourceCount}</dd></div> : null}
        {item.claimCount !== null ? <div><dt>Claims</dt><dd>{item.claimCount}</dd></div> : null}
        {item.maintenanceProof?.lastReviewedAt ? (
          <div><dt>Reviewed</dt><dd>{formatMaintenanceDate(item.maintenanceProof.lastReviewedAt)}</dd></div>
        ) : null}
      </dl>
      <div className="public-proof-gallery__card-actions">
        {comparisonHref ? (
          <Link className="public-proof-gallery__card-link" to={comparisonHref}>Inspect the maintenance proof</Link>
        ) : null}
        <Link className="public-proof-gallery__text-link" to={item.href}>Read maintained wiki</Link>
      </div>
    </article>
    );
  };

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
        <h1>Watch trusted knowledge survive a changing source.</h1>
        <p>
          Noeis is one maintained-object knowledge system. A source changes; Noeis evaluates it,
          protects or advances trusted state, and records an auditable receipt. Only accepted knowledge
          is published.
        </p>
        <div className="public-proof-gallery__hero-actions">
          <a href={flagship ? '#flagship' : '#candidate'}>
            {flagship ? 'Inspect the flagship proof' : 'Inspect the candidate evidence'}
          </a>
          <Link to="/register">Make one yours</Link>
        </div>
      </section>

      <section className="public-proof-gallery__principle" aria-label="How public proof works">
        <div>
          <span>1 · Source changed</span>
          <p>A public repository, filing, or other attached source moves.</p>
        </div>
        <div>
          <span>2 · Noeis evaluated it</span>
          <p>The candidate is checked against evidence and the accepted page.</p>
        </div>
        <div>
          <span>3 · Trusted state decided</span>
          <p>The page advances or stays protected, and the outcome is recorded.</p>
        </div>
      </section>

      <section className="public-proof-gallery__section" id={flagship ? 'flagship' : 'candidate'} aria-label={flagship ? 'Flagship proof' : 'Candidate proof'}>
        <div className="public-proof-gallery__section-head">
          <p className="public-proof-gallery__eyebrow">
            {loading ? 'Resolving proof grades' : flagship ? flagship.proofGrade.label || 'Proven' : repoCandidate?.proofGrade?.label || 'Candidate proof'}
          </p>
          <h2>{loading ? 'Checking the public acceptance registry…' : flagship ? 'One accepted maintenance loop.' : 'No object meets the flagship bar yet.'}</h2>
          <p>
            {loading
              ? 'No object is promoted until its explicit public proof grade resolves.'
              : flagship
              ? flagship.proofGrade.reason
              : repoCandidate?.proofGrade?.reason || 'No object has an explicit proven grade in the public registry.'}
          </p>
          <p className="public-proof-gallery__privacy">{privacyStatement}</p>
        </div>

        {loading ? (
          <div className="public-proof-gallery__state" role="status">
            <strong>Resolving accepted proof…</strong>
            <span>The explanation remains available while the public registry responds.</span>
          </div>
        ) : flagship ? renderProofObject(flagship, { primary: true }) : repoCandidate ? (
          renderProofObject(repoCandidate, { candidate: true })
        ) : (
          <div className="public-proof-gallery__state">
            <strong>{error ? 'The proof registry is temporarily unavailable.' : 'No candidate comparison is currently available.'}</strong>
            <span>No object is promoted here until its accepted maintenance state is public and inspectable.</span>
          </div>
        )}
      </section>

      {additionalProven.length > 0 ? (
        <section className="public-proof-gallery__section" aria-label="More proven maintenance loops">
          <div className="public-proof-gallery__section-head">
            <p className="public-proof-gallery__eyebrow">More proven objects</p>
            <h2>Different sources. The same acceptance bar.</h2>
            <p>Each object below has its own source clock, accepted material event, and inspectable maintenance record.</p>
          </div>
          <div className="public-proof-gallery__grid">
            {additionalProven.map(item => renderProofObject(item))}
          </div>
        </section>
      ) : null}

      {(!flagship || acceptanceItems.length > 0) ? (
      <section className="public-proof-gallery__section" aria-label="Acceptance in progress">
        <div className="public-proof-gallery__section-head">
          <p className="public-proof-gallery__eyebrow">Acceptance in progress</p>
          <h2>Promising is not the same as proven.</h2>
          <p>These objects remain outside the proven set until their material claims and source-review events pass the same acceptance bar.</p>
        </div>
        {acceptanceItems.length ? acceptanceItems.map((item) => (
          <div className="public-proof-gallery__acceptance-notice" role="note" key={item.slot || item.title}>
            <strong>{item.title} · {item.proofGrade.label || 'Acceptance in progress'}</strong>
            <span>{item.proofGrade.reason || 'No article link is distributed here until acceptance passes.'}</span>
          </div>
        )) : (
          <div className="public-proof-gallery__acceptance-notice" role="note">
            <strong>Acceptance work remains unlisted</strong>
            <span>No article link is distributed from this section.</span>
          </div>
        )}
      </section>
      ) : null}

      {flagship && repoCandidate ? (
        <section className="public-proof-gallery__section" id="candidate" aria-label="Candidate proof">
          <div className="public-proof-gallery__section-head">
            <p className="public-proof-gallery__eyebrow">Candidate · inspectable, not proven</p>
            <h2>One maintenance comparison is still earning its grade.</h2>
            <p>{repoCandidate.proofGrade?.reason}</p>
          </div>
          {renderProofObject(repoCandidate, { candidate: true })}
        </section>
      ) : null}

      <section className="public-proof-gallery__section public-proof-gallery__section--next" aria-label="Proof standard">
        <p className="public-proof-gallery__eyebrow">The bar</p>
        <h2>Broad examples are not public proof.</h2>
        <p>
          This gallery stays deliberately small. An object appears here only when it has an accepted maintenance loop,
          or a specific candidate comparison you can inspect. General concept pages and thin examples are excluded.
        </p>
      </section>
    </main>
  );
};

export default PublicProofGallery;
