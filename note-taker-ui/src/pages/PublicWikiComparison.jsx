import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getPublicProofRegistry, getPublicWikiComparison } from '../api/wiki';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { CANONICAL_HOST, SITE_NAME, buildCanonicalUrl } from '../seo/siteMetadata';
import { PUBLIC_PROOF_PRIVACY_STATEMENT, normalizePublicProofRegistry } from '../utils/maintenanceProof';
import '../styles/public-wiki-comparison.css';

const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export const shortSha = (sha = '') => {
  const value = cleanText(sha);
  if (!value) return '';
  return value.length > 7 ? value.slice(0, 7) : value;
};

export const formatComparisonDate = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const claimDeltaLabels = Object.freeze({
  added: 'Added',
  changed: 'Changed',
  gainedSupport: 'Gained support',
  contradicted: 'Contradicted',
  preserved: 'Preserved',
  removed: 'Removed'
});

export const CLAIM_DELTA_ORDER = Object.freeze([
  'added',
  'changed',
  'gainedSupport',
  'contradicted',
  'preserved',
  'removed'
]);

export const MATERIAL_CLAIM_KEYS = Object.freeze([
  'added',
  'changed',
  'gainedSupport',
  'contradicted',
  'removed'
]);

/** Calm proof-pulse states from the public comparison envelope. */
export const PROOF_PULSE_STATES = Object.freeze([
  'current',
  'maintained',
  'repository_ahead',
  'held_for_review'
]);

export const PROOF_PULSE_STATE_LABELS = Object.freeze({
  current: 'No drift observed',
  maintained: 'Candidate update',
  repository_ahead: 'Repository ahead',
  held_for_review: 'Held for review'
});

/**
 * Normalize optional comparison.proofPulse for public rendering.
 * Returns null when absent so the page keeps its existing zero-change narrative.
 */
export const normalizeProofPulse = (proofPulse = null) => {
  if (!proofPulse || typeof proofPulse !== 'object') return null;
  const stateRaw = cleanText(proofPulse.state).toLowerCase().replace(/[\s-]+/g, '_');
  const state = PROOF_PULSE_STATES.includes(stateRaw) ? stateRaw : 'current';
  const headline = cleanText(proofPulse.headline);
  if (!headline) return null;
  const facts = (Array.isArray(proofPulse.facts) ? proofPulse.facts : [])
    .map((fact) => cleanText(fact))
    .filter(Boolean)
    .slice(0, 8);
  return {
    state,
    headline,
    facts,
    observedVersion: cleanText(proofPulse.observedVersion),
    publishedVersion: cleanText(proofPulse.publishedVersion)
  };
};

const countOf = (comparison, key) => {
  const counts = comparison?.claimComparison?.counts || {};
  const n = Number(counts[key]);
  return Number.isFinite(n) ? n : 0;
};

const repoChangeCount = (comparison = {}) => {
  const changes = comparison.repositoryChanges || {};
  return ['added', 'changed', 'removed']
    .reduce((sum, key) => sum + (Array.isArray(changes[key]) ? changes[key].length : 0), 0);
};

export const isZeroChangeComparison = (comparison = {}) => {
  if (!comparison) return false;
  const materialClaims = MATERIAL_CLAIM_KEYS.reduce((sum, key) => sum + countOf(comparison, key), 0);
  return repoChangeCount(comparison) === 0
    && materialClaims === 0
    && countOf(comparison, 'preserved') >= 0
    && (!Array.isArray(comparison.staticWikiErrors) || comparison.staticWikiErrors.length === 0);
};

export const summarizeRepositoryChanges = (comparison = {}) => {
  const n = repoChangeCount(comparison);
  if (n === 0) {
    return 'No repository files, docs, or releases changed since the baseline snapshot.';
  }
  const changes = comparison.repositoryChanges || {};
  const parts = [];
  if (changes.added?.length) parts.push(`${changes.added.length} added`);
  if (changes.changed?.length) parts.push(`${changes.changed.length} changed`);
  if (changes.removed?.length) parts.push(`${changes.removed.length} removed`);
  return `Repository evidence moved: ${parts.join(', ')}.`;
};

export const summarizeNoeisChanges = (comparison = {}) => {
  const material = MATERIAL_CLAIM_KEYS.reduce((sum, key) => sum + countOf(comparison, key), 0);
  const preserved = countOf(comparison, 'preserved');
  const rejected = Array.isArray(comparison.rejectedCandidates)
    ? comparison.rejectedCandidates.length
    : 0;
  if (material === 0 && rejected === 0) {
    return preserved > 0
      ? `Noeis preserved ${preserved} accepted claim${preserved === 1 ? '' : 's'} with no material claim edits.`
      : 'Noeis recorded no material claim edits against this baseline.';
  }
  const parts = MATERIAL_CLAIM_KEYS
    .map((key) => {
      const n = countOf(comparison, key);
      return n > 0 ? `${n} ${claimDeltaLabels[key].toLowerCase()}` : null;
    })
    .filter(Boolean);
  if (rejected > 0) parts.push(`${rejected} rejected candidate run${rejected === 1 ? '' : 's'}`);
  return `Noeis updated the maintained dossier: ${parts.join(', ')}.`;
};

export const summarizeStaticWikiRisk = (comparison = {}) => {
  const errors = Array.isArray(comparison.staticWikiErrors) ? comparison.staticWikiErrors : [];
  if (errors.length === 0) {
    return 'A generate-once wiki has no demonstrated stale statements against this baseline yet.';
  }
  return `A generate-once wiki would now state ${errors.length} claim${errors.length === 1 ? '' : 's'} incorrectly.`;
};

export const materialExamples = (comparison = {}, limit = 5) => {
  const examples = [];
  const evidenceFor = (row = {}) => {
    const claim = row.after || row.before || {};
    const candidates = [
      ...(Array.isArray(row.refs) ? row.refs : []),
      ...(Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []),
      ...(Array.isArray(claim.sourceRefs) ? claim.sourceRefs : []),
      ...(Array.isArray(claim.evidenceRefs) ? claim.evidenceRefs : [])
    ];
    const ref = candidates.find((item) => item && (item.title || item.path || item.url));
    return ref ? {
      label: cleanText(ref.title || ref.path || ref.url),
      url: cleanText(ref.url)
    } : null;
  };
  ['changed', 'gainedSupport', 'contradicted', 'preserved', 'added', 'removed'].forEach((group) => {
    const rows = comparison.claimComparison?.deltas?.[group] || [];
    rows.forEach((row) => {
      const before = cleanText(row.before?.text);
      const after = cleanText(row.after?.text);
      const beforeSupport = cleanText(row.before?.support);
      const afterSupport = cleanText(row.after?.support);
      const beforeSection = cleanText(row.before?.section);
      const afterSection = cleanText(row.after?.section);
      const evidence = evidenceFor(row);
      const textChanged = before !== after;
      const supportChanged = beforeSupport !== afterSupport;
      const sectionChanged = beforeSection !== afterSection;
      const demonstrable = textChanged || supportChanged || sectionChanged || Boolean(evidence);
      if ((before || after) && demonstrable) examples.push({
        type: claimDeltaLabels[group],
        before: before
          ? `${before}${supportChanged && beforeSupport ? ` · Support: ${beforeSupport}` : ''}${sectionChanged && beforeSection ? ` · Section: ${beforeSection}` : ''}`
          : 'No prior accepted claim.',
        after: after
          ? `${after}${supportChanged && afterSupport ? ` · Support: ${afterSupport}` : ''}${sectionChanged && afterSection ? ` · Section: ${afterSection}` : ''}`
          : 'Removed from the candidate claim set.',
        evidence,
        disposition: group === 'preserved'
          ? 'Preserved after review'
          : group === 'contradicted'
            ? 'Flagged as contradicted'
            : group === 'gainedSupport'
              ? 'Candidate gained support'
              : `Candidate ${claimDeltaLabels[group].toLowerCase()}`
      });
    });
  });
  (comparison.rejectedCandidates || []).forEach((row) => {
    const counts = Object.entries(row?.counts || {})
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => `${value} ${key}`)
      .join(', ');
    examples.push({
      type: 'Rejected candidate',
      before: 'Trusted published claims remained in place.',
      after: 'Candidate prose is intentionally withheld from public output.',
      evidence: null,
      disposition: counts ? `Rejected or held: ${counts}` : 'Rejected or held for review'
    });
  });
  (comparison.staticWikiErrors || []).forEach((row) => {
    if (cleanText(row.staleClaim)) examples.push({
      type: 'Static-wiki risk',
      before: cleanText(row.staleClaim),
      after: cleanText(row.reason) || 'The supporting repository source changed.',
      evidence: Array.isArray(row.refs) && row.refs[0] ? {
        label: cleanText(row.refs[0].title || row.refs[0].path || row.refs[0].url),
        url: cleanText(row.refs[0].url)
      } : null,
      disposition: 'Demonstrably stale baseline claim'
    });
  });
  return examples.slice(0, limit);
};

export const buildPublicWikiComparisonSchema = ({
  comparison,
  canonicalPath = '/',
  idOrSlug = ''
} = {}) => {
  if (!comparison) return null;
  const repo = comparison.repository || {};
  const fullName = [repo.owner, repo.repo].filter(Boolean).join('/');
  const title = fullName
    ? `${fullName} repository maintenance comparison`
    : 'Repository maintenance comparison';
  const description = [
    summarizeRepositoryChanges(comparison),
    summarizeNoeisChanges(comparison),
    summarizeStaticWikiRisk(comparison)
  ].join(' ');
  const canonicalUrl = buildCanonicalUrl(canonicalPath);
  const published = shortSha(comparison.current?.publishedHeadSha);
  const baseline = shortSha(comparison.baseline?.headSha);
  const citations = (Array.isArray(comparison.supportingRefs) ? comparison.supportingRefs : [])
    .slice(0, 24)
    .map((ref) => {
      const name = cleanText(ref?.title || ref?.path || ref?.url || 'GitHub reference');
      if (!name) return null;
      return {
        '@type': 'CreativeWork',
        name,
        ...(ref?.url ? { url: ref.url } : {})
      };
    })
    .filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    name: title,
    headline: title,
    description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    isAccessibleForFree: true,
    inLanguage: 'en',
    datePublished: comparison.baseline?.capturedAt || undefined,
    dateModified: comparison.current?.publishedAt || comparison.baseline?.capturedAt || undefined,
    dateReviewed: comparison.current?.publishedAt || comparison.baseline?.capturedAt || undefined,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: CANONICAL_HOST
    },
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: CANONICAL_HOST
    },
    about: [
      fullName || 'public GitHub repository',
      'repository maintenance comparison',
      'source-grounded wiki claims',
      ...(baseline ? [`baseline commit ${baseline}`] : []),
      ...(published ? [`published commit ${published}`] : []),
      ...(idOrSlug ? [`shared wiki ${idOrSlug}`] : [])
    ].filter(Boolean),
    ...(citations.length ? { citation: citations } : {})
  };
};

const usePublicShareScrollSurface = () => {
  useEffect(() => {
    document.documentElement.classList.add('noeis-public-share');
    document.body.classList.add('noeis-public-share');
    return () => {
      document.body.classList.remove('noeis-public-share');
      document.documentElement.classList.remove('noeis-public-share');
    };
  }, []);
};

const ClaimRow = ({ row }) => {
  const claim = row?.after || row?.before || {};
  const text = cleanText(claim.text);
  if (!text) return null;
  return (
    <li>
      <p className="public-wiki-comparison__claim-text">{text}</p>
      <p className="public-wiki-comparison__claim-meta">
        {[
          claim.section ? `Section: ${claim.section}` : null,
          claim.support ? `Support: ${claim.support}` : null
        ].filter(Boolean).join(' · ')}
      </p>
    </li>
  );
};

const PublicWikiComparison = () => {
  const { idOrSlug = '' } = useParams();
  const location = useLocation();
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [proofGrade, setProofGrade] = useState(null);

  usePublicShareScrollSurface();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setComparison(null);
    getPublicWikiComparison(idOrSlug)
      .then((payload) => {
        if (cancelled) return;
        setComparison(payload?.comparison || null);
        if (!payload?.comparison) {
          setError('This repository comparison is private, incomplete, or no longer exists.');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.status === 404
          ? 'This repository comparison is private, incomplete, or no longer exists.'
          : err?.response?.data?.error || 'Failed to load repository comparison.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  useEffect(() => {
    let cancelled = false;
    const comparisonPath = location.pathname || `/share/wiki/${idOrSlug}/comparison`;
    getPublicProofRegistry()
      .then((payload) => {
        if (cancelled) return;
        const registry = normalizePublicProofRegistry(payload);
        const matched = registry.items.find((item) => item.proofGrade?.comparisonUrl === comparisonPath);
        setProofGrade(matched?.proofGrade || null);
      })
      .catch(() => {
        if (!cancelled) setProofGrade(null);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrSlug, location.pathname]);

  const canonicalPath = location.pathname || `/share/wiki/${idOrSlug}/comparison`;
  const sharedPagePath = `/share/wiki/${encodeURIComponent(idOrSlug)}`;
  const repo = comparison?.repository || {};
  const fullName = [repo.owner, repo.repo].filter(Boolean).join('/') || 'repository';
  const pageTitle = comparison
    ? `${fullName} maintenance comparison · Noeis`
    : 'Repository comparison · Noeis';
  const seoDescription = useMemo(() => {
    if (!comparison) {
      return 'Public Noeis repository maintenance comparison.';
    }
    return [
      summarizeRepositoryChanges(comparison),
      summarizeNoeisChanges(comparison),
      summarizeStaticWikiRisk(comparison)
    ].join(' ');
  }, [comparison]);
  const seoSchema = useMemo(
    () => buildPublicWikiComparisonSchema({ comparison, canonicalPath, idOrSlug }),
    [canonicalPath, comparison, idOrSlug]
  );

  useSeoMetadata({
    title: pageTitle,
    description: seoDescription,
    canonicalPath,
    schema: comparison && !error ? seoSchema : null,
    ogType: 'article',
    robots: comparison && !error ? 'index,follow' : 'noindex,follow'
  });

  const zeroChange = isZeroChangeComparison(comparison || {});
  const proofPulse = normalizeProofPulse(comparison?.proofPulse);
  const baselineSha = shortSha(comparison?.baseline?.headSha);
  const publishedSha = shortSha(comparison?.current?.publishedHeadSha);
  const observedSha = shortSha(comparison?.current?.observedHeadSha);
  const pulsePublishedSha = shortSha(proofPulse?.publishedVersion || comparison?.current?.publishedHeadSha);
  const pulseObservedSha = shortSha(proofPulse?.observedVersion || comparison?.current?.observedHeadSha);
  const changes = comparison?.repositoryChanges || {};
  const claimDeltas = comparison?.claimComparison?.deltas || {};
  const rejected = Array.isArray(comparison?.rejectedCandidates) ? comparison.rejectedCandidates : [];
  const staticErrors = Array.isArray(comparison?.staticWikiErrors) ? comparison.staticWikiErrors : [];
  const refs = Array.isArray(comparison?.supportingRefs) ? comparison.supportingRefs : [];
  const examples = materialExamples(comparison || {});
  const changedClaimCount = MATERIAL_CLAIM_KEYS.reduce((sum, key) => sum + countOf(comparison, key), 0);
  const largeClaimDelta = changedClaimCount >= 25;
  const provenComparison = proofGrade?.grade === 'proven';
  const summaryClassName = [
    'public-wiki-comparison__summary',
    proofPulse ? `is-pulse is-pulse-${proofPulse.state}` : '',
    zeroChange && !proofPulse ? 'is-zero-change' : ''
  ].filter(Boolean).join(' ');

  return (
    <main className="public-wiki-comparison">
      <nav className="public-wiki-comparison__topbar" aria-label="Repository comparison navigation">
        <Link to="/" className="public-wiki-comparison__brand">Noeis</Link>
        <Link to={sharedPagePath} className="public-wiki-comparison__back">
          Back to shared wiki
        </Link>
      </nav>

      {loading ? (
        <section className="public-wiki-comparison__state" role="status">
          Loading repository comparison…
        </section>
      ) : error ? (
        <section className="public-wiki-comparison__state" aria-label="Comparison unavailable">
          <h1>Comparison unavailable</h1>
          <p>{error}</p>
        </section>
      ) : comparison ? (
        <article className="public-wiki-comparison__article">
          <header className="public-wiki-comparison__hero">
            <p className="public-wiki-comparison__eyebrow">
              {provenComparison
                ? proofGrade.label || 'Proven'
                : proofGrade?.label
                  ? `${proofGrade.label} · regeneration stability under review`
                  : 'Ungraded comparison · no proven status inferred'}
            </p>
            <h1>{fullName}</h1>
            <p className="public-wiki-comparison__lede">
              Day-one baseline versus the currently published maintained wiki for this public GitHub repository.
            </p>
            <p className="public-wiki-comparison__privacy">{PUBLIC_PROOF_PRIVACY_STATEMENT}</p>
          </header>

          <section
            className={summaryClassName}
            aria-label="Summary"
            data-screenshot-region="comparison-summary"
            data-proof-pulse-state={proofPulse?.state || undefined}
          >
            <h2>The maintenance decision</h2>
            {proofPulse ? (
              <div
                className="public-wiki-comparison__proof-pulse"
                aria-label="Why maintenance matters"
                data-testid="proof-pulse"
              >
                <p className="public-wiki-comparison__pulse-kicker">
                  Why maintenance matters
                  <span
                    className={`public-wiki-comparison__pulse-state is-${proofPulse.state}`}
                    data-testid="proof-pulse-state"
                  >
                    {PROOF_PULSE_STATE_LABELS[proofPulse.state] || proofPulse.state}
                  </span>
                </p>
                <p
                  className="public-wiki-comparison__pulse-headline"
                  data-testid="proof-pulse-headline"
                >
                  {proofPulse.headline}
                </p>
                {(pulsePublishedSha || pulseObservedSha) ? (
                  <dl
                    className="public-wiki-comparison__pulse-versions"
                    aria-label="Published and observed repository versions"
                  >
                    <div data-version-role="published">
                      <dt>Published / trusted</dt>
                      <dd data-testid="proof-pulse-published">
                        {pulsePublishedSha || 'unknown'}
                      </dd>
                    </div>
                    <div data-version-role="observed">
                      <dt>Latest observed</dt>
                      <dd data-testid="proof-pulse-observed">
                        {pulseObservedSha || 'unknown'}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                {proofPulse.state === 'held_for_review' ? (
                  <p className="public-wiki-comparison__pulse-trust" role="status">
                    Noeis preserved the trusted published article. A weaker candidate was held for review
                    rather than silently replacing what readers already rely on.
                  </p>
                ) : null}
                {proofPulse.facts.length > 0 ? (
                  <ul className="public-wiki-comparison__pulse-facts" aria-label="Maintenance evidence">
                    {proofPulse.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <dl className="public-wiki-comparison__three-facts public-wiki-comparison__four-answers">
              <div>
                <dt>1 · What changed?</dt>
                <dd>{summarizeRepositoryChanges(comparison)}</dd>
              </div>
              <div>
                <dt>2 · What does the trusted wiki reflect?</dt>
                <dd>{summarizeNoeisChanges(comparison)}</dd>
              </div>
              <div>
                <dt>3 · Why publish or hold?</dt>
                <dd>{!provenComparison
                  ? 'A wiki version may be published, but this comparison has not cleared the public-proof acceptance bar.'
                  : proofPulse?.state === 'held_for_review'
                  ? 'The candidate did not clear the evidence bar, so the trusted published page stayed unchanged.'
                  : publishedSha === observedSha
                    ? 'The reviewed repository version cleared acceptance and now backs the public wiki.'
                    : 'Repository ahead means GitHub has changed, but the public wiki stays on the last accepted version until review clears.'}</dd>
              </div>
              <div>
                <dt>4 · What should I inspect?</dt>
                <dd>{examples.length
                  ? 'Start with the material examples below, then open the linked GitHub evidence.'
                  : 'Inspect the accepted version and public GitHub references; no material delta has been demonstrated yet.'}</dd>
              </div>
            </dl>
            {largeClaimDelta ? (
              <p className="public-wiki-comparison__stability-warning" role="status">
                {changedClaimCount} material claim deltas is a regeneration-stability warning. It needs editorial inspection; volume alone is not proof of good maintenance.
              </p>
            ) : null}
            {!provenComparison ? (
              <p className="public-wiki-comparison__candidate-note" role="status">
                Candidate proof. Promotion requires a legible source event tied to specific before-and-after claims, public evidence, an acceptance disposition, and preserved trusted state where change is not supported.
              </p>
            ) : null}
            {zeroChange && !proofPulse ? (
              <p className="public-wiki-comparison__zero-note" role="status">
                Baseline state: the repository evidence set and claim ledger match the day-one snapshot.
                {countOf(comparison, 'preserved') > 0
                  ? ` ${countOf(comparison, 'preserved')} claims are preserved with no material repository drift yet.`
                  : ' This is a legitimate baseline comparison, not an error.'}
              </p>
            ) : null}
          </section>

          <section className="public-wiki-comparison__section public-wiki-comparison__examples" aria-label="Material examples">
            <h2>Material examples</h2>
            <p>{examples.length ? 'Claim-level outcomes appear before technical repository paths.' : 'No claim-level source-to-claim example can be demonstrated from this public comparison.'}</p>
            {examples.length ? (
              <ol>
                {examples.map((example, index) => (
                  <li key={`${example.type}-${example.before}-${index}`}>
                    <span>{example.type}</span>
                    <dl>
                      <div><dt>Before</dt><dd>{example.before}</dd></div>
                      <div><dt>After</dt><dd>{example.after}</dd></div>
                      <div>
                        <dt>Evidence</dt>
                        <dd>{example.evidence?.url ? (
                          <a href={example.evidence.url} target="_blank" rel="noopener noreferrer">{example.evidence.label}</a>
                        ) : example.evidence?.label || 'No public source is linked to this claim delta.'}</dd>
                      </div>
                      <div><dt>Disposition</dt><dd>{example.disposition}</dd></div>
                    </dl>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>

          <details className="public-wiki-comparison__technical">
            <summary>Technical detail and full evidence</summary>
            <div className="public-wiki-comparison__technical-body">

          <section className="public-wiki-comparison__section" aria-label="Repository versions">
            <h2>Repository versions</h2>
            <p>
              Baseline is the day-one accepted snapshot. Published is the head that currently backs the shared article.
              Observed is the latest GitHub head Noeis has checked — never the same as published unless they match.
            </p>
            <div className="public-wiki-comparison__version-grid">
              <div className="public-wiki-comparison__version-card is-baseline" data-version="baseline">
                <h3>Baseline</h3>
                <p className="public-wiki-comparison__sha">{baselineSha || 'unknown'}</p>
                <p>
                  {[
                    comparison.baseline?.releaseTag ? `Tag ${comparison.baseline.releaseTag}` : null,
                    comparison.baseline?.generatorVersion
                      ? `Generator ${comparison.baseline.generatorVersion}`
                      : null,
                    comparison.baseline?.capturedAt
                      ? `Captured ${formatComparisonDate(comparison.baseline.capturedAt)}`
                      : null
                  ].filter(Boolean).join(' · ') || 'Day-one accepted snapshot'}
                </p>
              </div>
              <div className="public-wiki-comparison__version-card is-published" data-version="published">
                <h3>Successfully published</h3>
                <p className="public-wiki-comparison__sha">{publishedSha || 'unknown'}</p>
                <p>
                  {[
                    comparison.current?.releaseTag ? `Tag ${comparison.current.releaseTag}` : null,
                    comparison.current?.generatorVersion
                      ? `Generator ${comparison.current.generatorVersion}`
                      : null,
                    comparison.current?.publishedAt
                      ? `Published ${formatComparisonDate(comparison.current.publishedAt)}`
                      : null,
                    comparison.current?.buildStatus
                      ? `Build ${comparison.current.buildStatus}`
                      : null
                  ].filter(Boolean).join(' · ') || 'Current accepted publication'}
                </p>
              </div>
              <div className="public-wiki-comparison__version-card is-observed" data-version="observed">
                <h3>Latest observed GitHub head</h3>
                <p className="public-wiki-comparison__sha">{observedSha || 'unknown'}</p>
                <p>
                  Checked against GitHub
                  {repo.defaultBranch ? ` on ${repo.defaultBranch}` : ''}.
                  {' '}
                  This is not the published/current-through head unless it equals the published commit.
                </p>
              </div>
            </div>
          </section>

          <section className="public-wiki-comparison__section" aria-label="Repository files docs and releases changed">
            <h2>Repository files, docs, and releases changed</h2>
            {['added', 'changed', 'removed'].map((group) => {
              const rows = Array.isArray(changes[group]) ? changes[group] : [];
              return (
                <div
                  key={group}
                  className="public-wiki-comparison__change-group"
                  data-repo-change-group={group}
                >
                  <h3>
                    {group === 'added' ? 'Added' : group === 'changed' ? 'Changed' : 'Removed'}
                    {' '}
                    ({rows.length})
                  </h3>
                  {rows.length === 0 ? (
                    <p className="public-wiki-comparison__empty">None in this group.</p>
                  ) : (
                    <ul className="public-wiki-comparison__list">
                      {rows.map((row) => {
                        const path = row.path || row.current?.path || row.baseline?.path || 'path';
                        const url = row.current?.url || row.baseline?.url;
                        return (
                          <li key={`${group}-${path}`}>
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer">{path}</a>
                            ) : path}
                            {group === 'changed' && row.baseline?.blobSha && row.current?.blobSha ? (
                              <span>
                                {' '}
                                · blob
                                {' '}
                                {shortSha(row.baseline.blobSha)}
                                {' → '}
                                {shortSha(row.current.blobSha)}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>

          <section className="public-wiki-comparison__section" aria-label="Claims changed">
            <h2>Claims changed</h2>
            <p>Material claim deltas since the baseline snapshot.</p>
            {MATERIAL_CLAIM_KEYS.map((key) => {
              const rows = Array.isArray(claimDeltas[key]) ? claimDeltas[key] : [];
              return (
                <div key={key} className="public-wiki-comparison__claim-group" data-claim-group={key}>
                  <h3>
                    {claimDeltaLabels[key]}
                    {' '}
                    ({countOf(comparison, key)})
                  </h3>
                  {rows.length === 0 ? (
                    <p className="public-wiki-comparison__empty">None in this group.</p>
                  ) : (
                    <ul className="public-wiki-comparison__list">
                      {rows.map((row, index) => (
                        <ClaimRow key={`${key}-${index}`} row={row} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>

          <section className="public-wiki-comparison__section" aria-label="Claims preserved">
            <h2>Claims preserved</h2>
            <div className="public-wiki-comparison__claim-group" data-claim-group="preserved">
              <h3>
                Preserved
                {' '}
                ({countOf(comparison, 'preserved')})
              </h3>
              {(Array.isArray(claimDeltas.preserved) ? claimDeltas.preserved : []).length === 0 ? (
                <p className="public-wiki-comparison__empty">
                  No preserved claims in this comparison envelope.
                </p>
              ) : (
                <>
                  <p className="public-wiki-comparison__empty">
                    These accepted claims still match the baseline after review.
                  </p>
                  <ul className="public-wiki-comparison__list">
                    {claimDeltas.preserved.slice(0, 40).map((row, index) => (
                      <ClaimRow key={`preserved-${index}`} row={row} />
                    ))}
                  </ul>
                  {claimDeltas.preserved.length > 40 ? (
                    <p className="public-wiki-comparison__empty">
                      Showing 40 of {claimDeltas.preserved.length} preserved claims.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </section>

          <section className="public-wiki-comparison__section" aria-label="Claims rejected or flagged">
            <h2>Claims rejected or flagged</h2>
            <p>
              Rejected candidate runs are summarized by counts only. Candidate prose is never shown.
            </p>
            {rejected.length === 0 ? (
              <p className="public-wiki-comparison__empty">No rejected candidate runs recorded.</p>
            ) : (
              <ul className="public-wiki-comparison__rejected-list">
                {rejected.map((item, index) => {
                  const counts = item?.counts || {};
                  const countSummary = Object.entries(counts)
                    .filter(([, value]) => Number(value) > 0)
                    .map(([key, value]) => `${value} ${key}`)
                    .join(', ');
                  return (
                    <li key={index}>
                      <span>Rejected candidate {index + 1}</span>
                      {item.at ? <span>{formatComparisonDate(item.at)}</span> : null}
                      <span>{countSummary || 'Rejected without material count detail'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {(Array.isArray(claimDeltas.contradicted) ? claimDeltas.contradicted : []).length > 0 ? (
              <div className="public-wiki-comparison__claim-group" data-claim-group="flagged-contradicted">
                <h3>Flagged as contradicted ({countOf(comparison, 'contradicted')})</h3>
                <ul className="public-wiki-comparison__list">
                  {claimDeltas.contradicted.map((row, index) => (
                    <ClaimRow key={`flag-${index}`} row={row} />
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="public-wiki-comparison__section" aria-label="What a static wiki would now say incorrectly">
            <h2>What a static wiki would now say incorrectly</h2>
            {staticErrors.length === 0 ? (
              <p className="public-wiki-comparison__empty">
                No demonstrably stale baseline statements against changed repository sources.
              </p>
            ) : (
              staticErrors.map((item, index) => (
                <div
                  key={index}
                  className="public-wiki-comparison__error-card"
                  data-static-wiki-error="true"
                >
                  <p>{cleanText(item.staleClaim)}</p>
                  <p className="public-wiki-comparison__claim-meta">
                    {cleanText(item.reason) || 'Supporting repository source drifted.'}
                  </p>
                  {Array.isArray(item.refs) && item.refs.length > 0 ? (
                    <ul className="public-wiki-comparison__list">
                      {item.refs.map((ref, refIndex) => (
                        <li key={ref.path || ref.url || refIndex}>
                          {ref.url ? (
                            <a href={ref.url} target="_blank" rel="noopener noreferrer">
                              {ref.path || ref.title || ref.url}
                            </a>
                          ) : (ref.path || ref.title || 'Reference')}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))
            )}
          </section>

          <section className="public-wiki-comparison__section" aria-label="Supporting GitHub refs">
            <h2>Supporting GitHub refs</h2>
            {refs.length === 0 ? (
              <p className="public-wiki-comparison__empty">No public GitHub references in this comparison.</p>
            ) : (
              <ul className="public-wiki-comparison__refs">
                {refs.map((ref, index) => (
                  <li key={ref.path || ref.url || index}>
                    {ref.url ? (
                      <a href={ref.url} target="_blank" rel="noopener noreferrer">
                        {ref.title || ref.path || ref.url}
                      </a>
                    ) : (
                      <strong>{ref.title || ref.path || 'Reference'}</strong>
                    )}
                    <span>
                      {[
                        ref.path,
                        ref.evidenceType,
                        ref.commitSha ? `commit ${shortSha(ref.commitSha)}` : null,
                        ref.tagName ? `tag ${ref.tagName}` : null
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
            </div>
          </details>
        </article>
      ) : null}
    </main>
  );
};

export default PublicWikiComparison;
