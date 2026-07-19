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

/** Visible evidence link label: title first, then path, then URL. Never blank. */
export const evidenceRefLabel = (ref = {}) => {
  const title = cleanText(ref?.title);
  const path = cleanText(ref?.path);
  const url = cleanText(ref?.url);
  return title || path || url || 'GitHub reference';
};

/**
 * One-word / broken claim fragments are not material public proof.
 * Examples: "Create", "repo wiki", leading-colon continuations.
 */
export const isMalformedClaimText = (text = '') => {
  const value = cleanText(text);
  if (!value) return true;
  if (value.startsWith(':')) return true;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && value.length < 24) return true;
  return false;
};

export const claimDeltaLabels = Object.freeze({
  added: 'Added',
  changed: 'Changed',
  evidenceRefreshed: 'Preserved with refreshed evidence',
  gainedSupport: 'Gained support',
  contradicted: 'Contradicted',
  preserved: 'Preserved',
  removed: 'Removed'
});

export const CLAIM_DELTA_ORDER = Object.freeze([
  'added',
  'changed',
  'evidenceRefreshed',
  'gainedSupport',
  'contradicted',
  'preserved',
  'removed'
]);

/** Semantic claim rewrites only — never include evidenceRefreshed. */
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

export const ACCEPTANCE_BLOCKER_LABELS = Object.freeze({
  no_source_backed_claim_rewrite:
    'No source-backed claim rewrite has been demonstrated.',
  no_preserved_peer_claims:
    'No accepted peer claims were preserved through the update.',
  editorial_quality_risks:
    'One or more material rewrites failed structured editorial review.'
});

export const describeAcceptanceBlocker = (blocker = '') => {
  const key = cleanText(blocker);
  return ACCEPTANCE_BLOCKER_LABELS[key] || key.replace(/_/g, ' ') || 'Acceptance requirements unmet.';
};

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
    .slice(0, 12);
  const acceptanceRaw = proofPulse.acceptance && typeof proofPulse.acceptance === 'object'
    ? proofPulse.acceptance
    : null;
  const acceptance = acceptanceRaw
    ? {
      eligible: Boolean(acceptanceRaw.eligible),
      realClaimChanges: Number(acceptanceRaw.realClaimChanges) || 0,
      sourceBackedClaimChanges: Number(acceptanceRaw.sourceBackedClaimChanges) || 0,
      preservedClaims: Number(acceptanceRaw.preservedClaims) || 0,
      blockingEditorialRisks: Number(acceptanceRaw.blockingEditorialRisks) || 0,
      blockers: (Array.isArray(acceptanceRaw.blockers) ? acceptanceRaw.blockers : [])
        .map((item) => cleanText(item))
        .filter(Boolean)
    }
    : null;
  return {
    state,
    headline,
    facts,
    acceptance,
    baselineVersion: cleanText(proofPulse.baselineVersion),
    observedVersion: cleanText(proofPulse.observedVersion),
    publishedVersion: cleanText(proofPulse.publishedVersion)
  };
};

const countOf = (comparison, key) => {
  const counts = comparison?.claimComparison?.counts || {};
  const n = Number(counts[key]);
  return Number.isFinite(n) ? n : 0;
};

export const repositoryPathTotals = (comparison = {}) => {
  const totals = comparison.repositoryChangeTotals;
  const changes = comparison.repositoryChanges || {};
  const truncated = comparison.repositoryChangesTruncated || {};
  const added = Number.isFinite(Number(totals?.added))
    ? Number(totals.added)
    : (Array.isArray(changes.added) ? changes.added.length : 0);
  const changed = Number.isFinite(Number(totals?.changed))
    ? Number(totals.changed)
    : (Array.isArray(changes.changed) ? changes.changed.length : 0)
      + (Number(truncated.changed) || 0);
  const removed = Number.isFinite(Number(totals?.removed))
    ? Number(totals.removed)
    : (Array.isArray(changes.removed) ? changes.removed.length : 0);
  const displayed = {
    added: Array.isArray(changes.added) ? changes.added.length : 0,
    changed: Array.isArray(changes.changed) ? changes.changed.length : 0,
    removed: Array.isArray(changes.removed) ? changes.removed.length : 0
  };
  const omitted = {
    added: Number(truncated.added) || Math.max(0, added - displayed.added),
    changed: Number(truncated.changed) || Math.max(0, changed - displayed.changed),
    removed: Number(truncated.removed) || Math.max(0, removed - displayed.removed)
  };
  return {
    added,
    changed,
    removed,
    total: added + changed + removed,
    displayed,
    omitted
  };
};

const repoChangeCount = (comparison = {}) => repositoryPathTotals(comparison).total;

/**
 * Deduplicate rejected candidate builds by disposition + counts + head SHA.
 * Does not merge rejected with currently-held; those stay separate.
 */
export const uniqueRejectedCandidateBuilds = (rejectedCandidates = []) => {
  const list = Array.isArray(rejectedCandidates) ? rejectedCandidates : [];
  const seen = new Set();
  const unique = [];
  list.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const disposition = cleanText(item.disposition || 'rejected').toLowerCase() || 'rejected';
    if (disposition === 'held' || disposition === 'held_for_review') return;
    const counts = item.counts && typeof item.counts === 'object' ? item.counts : {};
    const countSignature = Object.keys(counts)
      .sort()
      .map((key) => `${key}:${Number(counts[key]) || 0}`)
      .join('|');
    const signature = [
      disposition,
      cleanText(item.candidateHeadSha),
      countSignature
    ].join('::');
    if (seen.has(signature)) return;
    seen.add(signature);
    unique.push(item);
  });
  return unique;
};

export const currentlyHeldCandidateBuilds = (rejectedCandidates = []) => {
  const list = Array.isArray(rejectedCandidates) ? rejectedCandidates : [];
  return list.filter((item) => {
    const disposition = cleanText(item?.disposition).toLowerCase();
    return disposition === 'held' || disposition === 'held_for_review';
  });
};

export const isZeroChangeComparison = (comparison = {}) => {
  if (!comparison) return false;
  const materialClaims = MATERIAL_CLAIM_KEYS.reduce((sum, key) => sum + countOf(comparison, key), 0);
  return repoChangeCount(comparison) === 0
    && materialClaims === 0
    && countOf(comparison, 'evidenceRefreshed') === 0
    && countOf(comparison, 'preserved') >= 0
    && (!Array.isArray(comparison.staticWikiErrors) || comparison.staticWikiErrors.length === 0);
};

export const summarizeRepositoryChanges = (comparison = {}) => {
  const paths = repositoryPathTotals(comparison);
  if (paths.total === 0) {
    return 'No repository files, docs, or releases changed since the baseline snapshot.';
  }
  const parts = [];
  if (paths.added) parts.push(`${paths.added} added`);
  if (paths.changed) parts.push(`${paths.changed} changed`);
  if (paths.removed) parts.push(`${paths.removed} removed`);
  let summary = `Repository evidence moved: ${parts.join(', ')}.`;
  if (paths.omitted.changed > 0) {
    summary += ` ${paths.changed} paths changed in total; only ${paths.displayed.changed} are displayed (${paths.omitted.changed} omitted from this public envelope).`;
  }
  return summary;
};

export const summarizeNoeisChanges = (comparison = {}) => {
  const material = MATERIAL_CLAIM_KEYS.reduce((sum, key) => sum + countOf(comparison, key), 0);
  const preserved = countOf(comparison, 'preserved');
  const evidenceRefreshed = countOf(comparison, 'evidenceRefreshed');
  const rejectedUnique = uniqueRejectedCandidateBuilds(comparison.rejectedCandidates).length;
  if (material === 0 && rejectedUnique === 0 && evidenceRefreshed === 0) {
    return preserved > 0
      ? `Noeis preserved ${preserved} accepted claim${preserved === 1 ? '' : 's'} with no material claim edits.`
      : 'Noeis recorded no material claim edits against this baseline.';
  }
  const parts = [];
  MATERIAL_CLAIM_KEYS.forEach((key) => {
    const n = countOf(comparison, key);
    if (n > 0) parts.push(`${n} ${claimDeltaLabels[key].toLowerCase()}`);
  });
  if (evidenceRefreshed > 0) {
    parts.push(
      `${evidenceRefreshed} preserved with refreshed evidence`
    );
  }
  if (preserved > 0 && evidenceRefreshed === 0) {
    parts.push(`${preserved} preserved`);
  }
  if (rejectedUnique > 0) {
    parts.push(
      `${rejectedUnique} unique rejected candidate build${rejectedUnique === 1 ? '' : 's'}`
    );
  }
  return `Noeis recorded claim outcomes: ${parts.join(', ')}.`;
};

export const summarizePreservedClaims = (comparison = {}) => {
  const preserved = countOf(comparison, 'preserved');
  const evidenceRefreshed = countOf(comparison, 'evidenceRefreshed');
  if (preserved === 0 && evidenceRefreshed === 0) {
    return 'No accepted claims were preserved against this baseline.';
  }
  if (evidenceRefreshed > 0) {
    return `${evidenceRefreshed} preserved with refreshed evidence`
      + (preserved > evidenceRefreshed
        ? ` (${preserved} preserved in total).`
        : '. These are not semantic claim rewrites.');
  }
  return `${preserved} accepted claim${preserved === 1 ? '' : 's'} preserved with no material rewrite.`;
};

export const summarizeStaticWikiRisk = (comparison = {}) => {
  const errors = Array.isArray(comparison.staticWikiErrors) ? comparison.staticWikiErrors : [];
  if (errors.length === 0) {
    return 'A generate-once wiki has no demonstrated stale statements against this baseline yet.';
  }
  return `A generate-once wiki would now state ${errors.length} claim${errors.length === 1 ? '' : 's'} incorrectly.`;
};

export const summarizeAcceptanceFailure = (comparison = {}, proofPulse = null) => {
  const acceptance = proofPulse?.acceptance
    || (comparison?.acceptance && typeof comparison.acceptance === 'object'
      ? {
        eligible: Boolean(comparison.acceptance.eligible),
        blockers: (Array.isArray(comparison.acceptance.blockers)
          ? comparison.acceptance.blockers
          : []).map(cleanText).filter(Boolean)
      }
      : null);
  if (!acceptance || acceptance.eligible) return null;
  const blockers = acceptance.blockers || [];
  const blockerText = blockers.length
    ? blockers.map(describeAcceptanceBlocker).join(' ')
    : 'Acceptance requirements unmet.';
  return `This is a candidate comparison, not public proof. ${blockerText}`;
};

const evidenceFor = (row = {}) => {
  const claim = row.after || row.before || {};
  const candidates = [
    ...(Array.isArray(row.refs) ? row.refs : []),
    ...(Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []),
    ...(Array.isArray(claim.sourceRefs) ? claim.sourceRefs : []),
    ...(Array.isArray(claim.evidenceRefs) ? claim.evidenceRefs : [])
  ];
  const ref = candidates.find((item) => item && (item.title || item.path || item.url));
  return ref
    ? {
      label: evidenceRefLabel(ref),
      url: cleanText(ref.url)
    }
    : null;
};

/**
 * Curate claim-level examples for the public surface.
 * Omits malformed standalone fragments; preserves aggregate counts elsewhere.
 */
export const materialExamples = (comparison = {}, limit = 5) => {
  const examples = [];
  let omittedMalformedCount = 0;

  const pushRow = (group, row) => {
    const before = cleanText(row.before?.text);
    const after = cleanText(row.after?.text);
    const primaryText = after || before;
    if (primaryText && isMalformedClaimText(primaryText) && (!before || isMalformedClaimText(before))) {
      omittedMalformedCount += 1;
      return;
    }
    if (before && after && isMalformedClaimText(before) && isMalformedClaimText(after)) {
      omittedMalformedCount += 1;
      return;
    }
    const beforeSupport = cleanText(row.before?.support);
    const afterSupport = cleanText(row.after?.support);
    const beforeSection = cleanText(row.before?.section);
    const afterSection = cleanText(row.after?.section);
    const evidence = evidenceFor(row);
    const textChanged = before !== after;
    const supportChanged = beforeSupport !== afterSupport;
    const sectionChanged = beforeSection !== afterSection;
    const demonstrable = textChanged || supportChanged || sectionChanged || Boolean(evidence);
    if (!(before || after) || !demonstrable) return;

    let disposition;
    if (group === 'evidenceRefreshed') {
      disposition = 'Preserved with refreshed evidence — not a semantic rewrite';
    } else if (group === 'changed' && !textChanged && !supportChanged && !sectionChanged && evidence) {
      disposition = 'Evidence changed; claim text preserved';
    } else if (group === 'preserved') {
      disposition = 'Preserved after review';
    } else if (group === 'contradicted') {
      disposition = 'Flagged as contradicted';
    } else if (group === 'gainedSupport') {
      disposition = 'Candidate gained support';
    } else {
      disposition = `Candidate ${claimDeltaLabels[group].toLowerCase()}`;
    }

    examples.push({
      type: claimDeltaLabels[group],
      before: before
        ? `${before}${supportChanged && beforeSupport ? ` · Support: ${beforeSupport}` : ''}${sectionChanged && beforeSection ? ` · Section: ${beforeSection}` : ''}`
        : 'No prior accepted claim.',
      after: after
        ? `${after}${supportChanged && afterSupport ? ` · Support: ${afterSupport}` : ''}${sectionChanged && afterSection ? ` · Section: ${afterSection}` : ''}`
        : 'Removed from the candidate claim set.',
      evidence,
      disposition
    });
  };

  // Prefer semantic rewrites; evidence refreshes are last and never labeled "changed".
  ['changed', 'gainedSupport', 'contradicted', 'added', 'removed', 'evidenceRefreshed', 'preserved']
    .forEach((group) => {
      const rows = comparison.claimComparison?.deltas?.[group] || [];
      rows.forEach((row) => pushRow(group, row));
    });

  const rejectedUnique = uniqueRejectedCandidateBuilds(comparison.rejectedCandidates);
  rejectedUnique.forEach((row, index) => {
    const counts = Object.entries(row?.counts || {})
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => `${value} ${key}`)
      .join(', ');
    examples.push({
      type: 'Rejected candidate build',
      before: 'Trusted published claims remained in place.',
      after: 'Candidate prose is intentionally withheld from public output.',
      evidence: null,
      disposition: counts
        ? `Rejected unique build ${index + 1}: ${counts}`
        : `Rejected unique build ${index + 1}`
    });
  });

  (comparison.staticWikiErrors || []).forEach((row) => {
    const stale = cleanText(row.staleClaim);
    if (!stale || isMalformedClaimText(stale)) {
      if (stale) omittedMalformedCount += 1;
      return;
    }
    const ref = Array.isArray(row.refs) && row.refs[0] ? row.refs[0] : null;
    examples.push({
      type: 'Static-wiki risk',
      before: stale,
      after: cleanText(row.reason) || 'The supporting repository source changed.',
      evidence: ref
        ? {
          label: evidenceRefLabel(ref),
          url: cleanText(ref.url)
        }
        : null,
      disposition: 'Demonstrably stale baseline claim'
    });
  });

  const sliced = examples.slice(0, limit);
  const disclosure = omittedMalformedCount > 0
    ? `${omittedMalformedCount} technical claim row${omittedMalformedCount === 1 ? '' : 's'} were excluded from curated examples because they were malformed standalone fragments; aggregate counts above are unchanged.`
    : '';

  return {
    examples: sliced,
    omittedMalformedCount,
    disclosure
  };
};

const publicEvidenceRefsFor = (row = {}) => {
  const claim = row.after || row.before || {};
  const seen = new Set();
  return [
    ...(Array.isArray(row.refs) ? row.refs : []),
    ...(Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []),
    ...(Array.isArray(claim.sourceRefs) ? claim.sourceRefs : []),
    ...(Array.isArray(claim.evidenceRefs) ? claim.evidenceRefs : [])
  ].filter((ref) => {
    const key = cleanText(ref?.url || ref?.path || ref?.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
};

const genericChangeNarrative = ({ before, after, section, paths }) => {
  const location = section ? ` in “${section}”` : '';
  const evidence = paths.length
    ? ` The current wording is grounded in ${paths.slice(0, 2).join(' and ')}.`
    : '';
  if (!before && after) {
    return {
      title: 'New accepted guidance',
      explanation: `The maintained dossier added a claim${location} that was not present in the baseline.${evidence}`,
      impact: 'Readers now receive guidance the baseline could not provide.'
    };
  }
  if (before && !after) {
    return {
      title: 'Stale guidance removed',
      explanation: `The maintained dossier removed a baseline claim${location} after the repository evidence no longer supported keeping it.${evidence}`,
      impact: 'Readers are no longer asked to rely on guidance the current repository does not justify.'
    };
  }
  return {
    title: section ? `${section} guidance was corrected` : 'Accepted guidance was corrected',
    explanation: `The maintained claim was rewritten to match the repository’s current source of truth${location}.${evidence}`,
    impact: 'The page advances only the affected guidance while leaving unrelated accepted claims intact.'
  };
};

/**
 * Turn claim deltas into reader-facing explanations. Before/after text remains
 * available as audit evidence, but is not asked to carry the explanation.
 */
export const explainMaterialChanges = (comparison = {}, limit = 5) => {
  const narratives = [];
  const groups = ['changed', 'gainedSupport', 'contradicted', 'added', 'removed'];
  groups.forEach((group) => {
    const rows = comparison?.claimComparison?.deltas?.[group] || [];
    rows.forEach((row, rowIndex) => {
      if (narratives.length >= limit) return;
      const before = cleanText(row?.before?.text);
      const after = cleanText(row?.after?.text);
      const section = cleanText(row?.after?.section || row?.before?.section);
      if ((!before && !after) || (isMalformedClaimText(before) && isMalformedClaimText(after))) return;
      const refs = publicEvidenceRefsFor(row);
      const paths = refs.map(ref => cleanText(ref.path || ref.title)).filter(Boolean);
      const combined = `${before} ${after}`;
      const structuredRisk = (comparison?.editorialReview?.risks || []).find(risk => (
        cleanText(risk?.group) === group && Number(risk?.index) === rowIndex
      ));
      let narrative;

      if (structuredRisk) {
        narrative = {
          title: cleanText(structuredRisk.title) || 'This rewrite requires editorial correction',
          explanation: cleanText(structuredRisk.explanation) || 'The structured editorial review found a material regression in this rewrite.',
          impact: cleanText(structuredRisk.impact) || 'This comparison cannot pass public-proof acceptance until the rewrite is corrected.',
          tone: cleanText(structuredRisk.severity) === 'blocking' ? 'concern' : 'neutral'
        };
      } else if (paths.some(path => /(?:^|\/)\.env\.example$/i.test(path))
        && /PUBLIC_PROOF_/i.test(after)
        && /AI_SERVICE_/i.test(before)) {
        narrative = {
          title: 'Proof configuration was added, but AI settings disappeared from the claim',
          explanation: 'The maintained wording now names the six public-proof page selectors, but it drops several AI-service variables that still exist in .env.example. The product configuration did not remove those variables; only the dossier’s summary stopped mentioning them.',
          impact: 'The claim is more current about public proof but less complete as setup guidance. It should be reviewed before this comparison is promoted.',
          tone: 'concern'
        };
      } else if (paths.some(path => /package\.json$/i.test(path))
        && /declared package manager/i.test(after)
        && /run the API/i.test(before)) {
        narrative = {
          title: 'Setup guidance became broader—and less executable',
          explanation: 'The runbook moved from explicit API/UI startup guidance to a multi-package rule: use the repository’s package evidence, work only in the affected package, and run its own proof commands.',
          impact: 'The new rule is safer across packages, but it no longer gives a new contributor the concrete local startup sequence. The dossier’s quickstart must carry that missing detail.',
          tone: 'concern'
        };
      } else if (/wiki-mcp/i.test(combined)
        && /README\.md/i.test(before)
        && /package\.json/i.test(after)) {
        narrative = {
          title: 'The claim now points to metadata instead of the actual documentation',
          explanation: 'The maintained wording replaced packages/wiki-mcp/README.md with packages/wiki-mcp/package.json as the file said to document connected-agent tools and runtime transport. Package metadata proves the binary entrypoint and scripts; the README still contains the transport instructions.',
          impact: 'The new wording overstates what package.json documents. This looks like a weaker rewrite and should be corrected before public-proof acceptance.',
          tone: 'concern'
        };
      } else {
        narrative = genericChangeNarrative({ before, after, section, paths });
      }

      const beforeSupport = cleanText(row?.before?.support);
      const afterSupport = cleanText(row?.after?.support);
      if (group === 'gainedSupport' || (beforeSupport && afterSupport && beforeSupport !== afterSupport)) {
        narrative.explanation += ` Evidence status moved from ${beforeSupport || 'unrated'} to ${afterSupport || 'unrated'}.`;
      }
      if (group === 'contradicted') {
        narrative.impact = 'The page flags the conflict instead of silently presenting the prior claim as settled.';
      }

      narratives.push({
        type: claimDeltaLabels[group],
        section,
        before: before || 'No prior accepted claim.',
        after: after || 'Removed from the candidate claim set.',
        refs,
        disposition: group === 'contradicted'
          ? 'Flagged as contradicted'
          : group === 'gainedSupport'
            ? 'Accepted with stronger support'
            : `Accepted ${claimDeltaLabels[group].toLowerCase()}`,
        tone: narrative.tone || 'neutral',
        ...narrative
      });
    });
  });
  return narratives;
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
      const name = evidenceRefLabel(ref);
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
  if (!text || isMalformedClaimText(text)) return null;
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

const ChangeNarrative = ({ change, index }) => (
  <article className={`public-wiki-comparison__change-narrative${change.tone === 'concern' ? ' is-concern' : ''}`}>
    <p className="public-wiki-comparison__change-kicker">
      Change {index + 1}{change.section ? ` · ${change.section}` : ''}{change.tone === 'concern' ? ' · Editorial concern' : ''}
    </p>
    <h3>{change.title}</h3>
    <p className="public-wiki-comparison__change-explanation">{change.explanation}</p>
    <p className="public-wiki-comparison__change-impact">
      <strong>Why it matters</strong>
      {change.impact}
    </p>
    {change.refs.length ? (
      <ul className="public-wiki-comparison__change-evidence" aria-label={`Evidence for change ${index + 1}`}>
        {change.refs.map((ref, refIndex) => (
          <li key={ref.url || ref.path || ref.title || refIndex}>
            {ref.url ? (
              <a href={ref.url} target="_blank" rel="noopener noreferrer">{evidenceRefLabel(ref)}</a>
            ) : evidenceRefLabel(ref)}
          </li>
        ))}
      </ul>
    ) : null}
    <details className="public-wiki-comparison__change-audit">
      <summary>Inspect accepted wording</summary>
      <dl>
        <div><dt>Before</dt><dd>{change.before}</dd></div>
        <div><dt>After</dt><dd>{change.after}</dd></div>
        <div><dt>Disposition</dt><dd>{change.disposition}</dd></div>
      </dl>
    </details>
  </article>
);

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
  const baselineSha = shortSha(
    proofPulse?.baselineVersion || comparison?.baseline?.headSha
  );
  const publishedSha = shortSha(comparison?.current?.publishedHeadSha);
  const observedSha = shortSha(comparison?.current?.observedHeadSha);
  const pulsePublishedSha = shortSha(proofPulse?.publishedVersion || comparison?.current?.publishedHeadSha);
  const pulseObservedSha = shortSha(proofPulse?.observedVersion || comparison?.current?.observedHeadSha);
  const changes = comparison?.repositoryChanges || {};
  const pathTotals = repositoryPathTotals(comparison || {});
  const claimDeltas = comparison?.claimComparison?.deltas || {};
  const rejectedAll = Array.isArray(comparison?.rejectedCandidates) ? comparison.rejectedCandidates : [];
  const rejectedUnique = uniqueRejectedCandidateBuilds(rejectedAll);
  const heldBuilds = currentlyHeldCandidateBuilds(rejectedAll);
  const staticErrors = Array.isArray(comparison?.staticWikiErrors) ? comparison.staticWikiErrors : [];
  const refs = Array.isArray(comparison?.supportingRefs) ? comparison.supportingRefs : [];
  const exampleBundle = materialExamples(comparison || {});
  const exampleDisclosure = exampleBundle.disclosure;
  const changeNarratives = explainMaterialChanges(comparison || {});
  const editorialConcernCount = changeNarratives.filter(change => change.tone === 'concern').length;
  const semanticClaimCount = MATERIAL_CLAIM_KEYS.reduce((sum, key) => sum + countOf(comparison, key), 0);
  const evidenceRefreshedCount = countOf(comparison, 'evidenceRefreshed');
  const largeClaimDelta = semanticClaimCount >= 25;
  const provenComparison = proofGrade?.grade === 'proven';
  const acceptanceFailure = summarizeAcceptanceFailure(comparison, proofPulse);
  const acceptanceIneligible = Boolean(acceptanceFailure);
  const pulseStateLabel = acceptanceIneligible && proofPulse?.state === 'held_for_review' && heldBuilds.length === 0
    ? 'Acceptance not met'
    : (PROOF_PULSE_STATE_LABELS[proofPulse?.state] || proofPulse?.state);
  const summaryClassName = [
    'public-wiki-comparison__summary',
    proofPulse ? `is-pulse is-pulse-${proofPulse.state}` : '',
    acceptanceIneligible ? 'is-acceptance-failed' : '',
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
            data-acceptance-eligible={acceptanceIneligible ? 'false' : (proofPulse?.acceptance ? 'true' : undefined)}
          >
            <h2>The maintenance decision</h2>
            {acceptanceFailure ? (
              <p
                className="public-wiki-comparison__acceptance-failure"
                role="status"
                data-testid="acceptance-failure"
              >
                {acceptanceFailure}
              </p>
            ) : null}
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
                    {pulseStateLabel}
                  </span>
                </p>
                <p
                  className="public-wiki-comparison__pulse-headline"
                  data-testid="proof-pulse-headline"
                >
                  {proofPulse.headline}
                </p>
                {(baselineSha || pulsePublishedSha || pulseObservedSha) ? (
                  <dl
                    className="public-wiki-comparison__pulse-versions"
                    aria-label="Baseline, published, and observed repository versions"
                  >
                    <div data-version-role="baseline">
                      <dt>Baseline</dt>
                      <dd data-testid="proof-pulse-baseline">
                        {baselineSha || 'unknown'}
                      </dd>
                    </div>
                    <div data-version-role="published">
                      <dt>Published / trusted</dt>
                      <dd data-testid="proof-pulse-published">
                        {pulsePublishedSha || 'unknown'}
                      </dd>
                    </div>
                    <div data-version-role="observed">
                      <dt>
                        {pulsePublishedSha && pulseObservedSha && pulsePublishedSha === pulseObservedSha
                          ? 'Latest observed (matches published)'
                          : 'Latest observed'}
                      </dt>
                      <dd data-testid="proof-pulse-observed">
                        {pulseObservedSha || 'unknown'}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                {proofPulse.state === 'held_for_review' ? (
                  <p className="public-wiki-comparison__pulse-trust" role="status">
                    {acceptanceIneligible && heldBuilds.length === 0
                      ? `Noeis preserved the trusted published article. This comparison remains a candidate because the required claim-level proof is incomplete. ${rejectedUnique.length} prior candidate build${rejectedUnique.length === 1 ? ' was' : 's were'} rejected; no build is currently held for review.`
                      : 'Noeis preserved the trusted published article. A candidate is currently held for review rather than silently replacing what readers already rely on. Rejected builds and currently-held builds are counted separately.'}
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
            <dl className="public-wiki-comparison__three-facts public-wiki-comparison__five-answers">
              <div>
                <dt>1 · What was baseline?</dt>
                <dd data-testid="answer-baseline">
                  {baselineSha
                    ? `Day-one accepted snapshot ${baselineSha}${comparison.baseline?.capturedAt ? `, captured ${formatComparisonDate(comparison.baseline.capturedAt)}` : ''}.`
                    : 'Baseline commit is not available in this comparison envelope.'}
                </dd>
              </div>
              <div>
                <dt>2 · What is trusted now?</dt>
                <dd data-testid="answer-trusted">
                  {publishedSha
                    ? `Published / trusted head ${publishedSha}${comparison.current?.buildStatus ? ` · build ${comparison.current.buildStatus}` : ''}.`
                    : 'No published head is recorded yet.'}
                </dd>
              </div>
              <div>
                <dt>3 · What actually changed?</dt>
                <dd data-testid="answer-changed">
                  {summarizeRepositoryChanges(comparison)}
                  {semanticClaimCount > 0
                    ? ` Semantic claim outcomes: ${MATERIAL_CLAIM_KEYS
                      .map((key) => {
                        const n = countOf(comparison, key);
                        return n > 0 ? `${n} ${claimDeltaLabels[key].toLowerCase()}` : null;
                      })
                      .filter(Boolean)
                      .join(', ')}.`
                    : ' No semantic claim rewrites were demonstrated.'}
                  {evidenceRefreshedCount > 0
                    ? ` ${evidenceRefreshedCount} claims were preserved with refreshed evidence — not counted as changed.`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>4 · What was preserved?</dt>
                <dd data-testid="answer-preserved">{summarizePreservedClaims(comparison)}</dd>
              </div>
              <div>
                <dt>5 · Why still only a candidate?</dt>
                <dd data-testid="answer-candidate">
                  {acceptanceFailure
                    || (editorialConcernCount > 0
                      ? `${editorialConcernCount} material claim rewrite${editorialConcernCount === 1 ? '' : 's'} still need editorial correction before this comparison should be treated as public proof.`
                      : (!provenComparison
                        ? 'A wiki version may be published, but this comparison has not cleared the public-proof acceptance bar.'
                        : proofPulse?.state === 'held_for_review'
                          ? 'The candidate did not clear the evidence bar, so the trusted published page stayed unchanged.'
                          : publishedSha === observedSha
                            ? 'The reviewed repository version cleared acceptance and now backs the public wiki.'
                            : 'Repository ahead means GitHub has changed, but the public wiki stays on the last accepted version until review clears.'))}
                </dd>
              </div>
            </dl>
            {largeClaimDelta ? (
              <p className="public-wiki-comparison__stability-warning" role="status">
                {semanticClaimCount} material claim deltas is a regeneration-stability warning. It needs editorial inspection; volume alone is not proof of good maintenance.
              </p>
            ) : null}
            {!provenComparison && !acceptanceFailure ? (
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

          <section className="public-wiki-comparison__section public-wiki-comparison__examples" aria-label="What actually changed">
            <h2>What actually changed</h2>
            <p>
              {changeNarratives.length
                ? 'Each accepted change is explained first. The exact before-and-after wording remains available as audit evidence.'
                : 'No material claim change can be explained from this public comparison.'}
            </p>
            {exampleDisclosure ? (
              <p className="public-wiki-comparison__example-disclosure" role="note" data-testid="example-disclosure">
                {exampleDisclosure}
              </p>
            ) : null}
            {changeNarratives.length ? (
              <div className="public-wiki-comparison__change-narratives">
                {changeNarratives.map((change, index) => (
                  <ChangeNarrative key={`${change.type}-${change.title}-${index}`} change={change} index={index} />
                ))}
              </div>
            ) : null}
          </section>

          <details className="public-wiki-comparison__technical">
            <summary>Technical detail and full evidence</summary>
            <div className="public-wiki-comparison__technical-body">

          <section className="public-wiki-comparison__section" aria-label="Repository versions">
            <h2>Repository versions</h2>
            <p>
              Baseline is the day-one accepted snapshot. Published is the head that currently backs the shared article.
              Observed is the latest GitHub head Noeis has checked — never treated as a second published comparison when it matches.
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
                  {publishedSha && observedSha && publishedSha === observedSha
                    ? 'Matches the published head — shown for completeness, not as a separate comparison.'
                    : 'This is not the published/current-through head unless it equals the published commit.'}
                </p>
              </div>
            </div>
          </section>

          <section className="public-wiki-comparison__section" aria-label="Repository files docs and releases changed">
            <h2>Repository files, docs, and releases changed</h2>
            <p data-testid="repository-path-totals">
              Totals: {pathTotals.added} added, {pathTotals.changed} changed, {pathTotals.removed} removed
              {pathTotals.omitted.changed > 0
                ? ` · ${pathTotals.changed} paths changed; only ${pathTotals.displayed.changed} are displayed (${pathTotals.omitted.changed} truncated).`
                : '.'}
            </p>
            {['added', 'changed', 'removed'].map((group) => {
              const rows = Array.isArray(changes[group]) ? changes[group] : [];
              const totalForGroup = pathTotals[group];
              return (
                <div
                  key={group}
                  className="public-wiki-comparison__change-group"
                  data-repo-change-group={group}
                >
                  <h3>
                    {group === 'added' ? 'Added' : group === 'changed' ? 'Changed' : 'Removed'}
                    {' '}
                    ({totalForGroup}
                    {pathTotals.omitted[group] > 0 ? `; showing ${rows.length}` : ''})
                  </h3>
                  {rows.length === 0 ? (
                    <p className="public-wiki-comparison__empty">None in this group.</p>
                  ) : (
                    <ul className="public-wiki-comparison__list">
                      {rows.map((row) => {
                        const path = row.path || row.current?.path || row.baseline?.path || 'path';
                        const url = row.current?.url || row.baseline?.url;
                        const label = evidenceRefLabel({
                          title: row.current?.title || row.baseline?.title,
                          path,
                          url
                        });
                        return (
                          <li key={`${group}-${path}`}>
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer">{label}</a>
                            ) : label}
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
            <p>
              Semantic claim rewrites only. Preserved claims with refreshed evidence are listed separately
              and are never labeled changed or updated.
            </p>
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

          <section className="public-wiki-comparison__section" aria-label="Claims preserved with refreshed evidence">
            <h2>Preserved with refreshed evidence</h2>
            <div className="public-wiki-comparison__claim-group" data-claim-group="evidenceRefreshed">
              <h3>
                Preserved with refreshed evidence
                {' '}
                ({evidenceRefreshedCount})
              </h3>
              <p className="public-wiki-comparison__empty">
                These claims kept their accepted text. Supporting repository evidence was refreshed.
                They are not semantic claim rewrites.
              </p>
              {(Array.isArray(claimDeltas.evidenceRefreshed) ? claimDeltas.evidenceRefreshed : []).length === 0 ? (
                <p className="public-wiki-comparison__empty">
                  No evidence-refreshed claim rows in this public envelope.
                </p>
              ) : (
                <>
                  <ul className="public-wiki-comparison__list">
                    {claimDeltas.evidenceRefreshed.slice(0, 40).map((row, index) => (
                      <ClaimRow key={`evidence-refreshed-${index}`} row={row} />
                    ))}
                  </ul>
                  {claimDeltas.evidenceRefreshed.length > 40 ? (
                    <p className="public-wiki-comparison__empty">
                      Showing 40 of {claimDeltas.evidenceRefreshed.length} evidence-refreshed claims.
                    </p>
                  ) : null}
                </>
              )}
            </div>
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
                  No preserved claim rows in this public envelope
                  {countOf(comparison, 'preserved') > 0
                    ? ` (aggregate count remains ${countOf(comparison, 'preserved')}).`
                    : '.'}
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
            <h2>Rejected candidate builds</h2>
            <p>
              Unique rejected builds are summarized by counts only. Candidate prose is never shown.
              Currently-held builds are listed separately and are not merged into rejected totals.
            </p>
            {rejectedUnique.length === 0 ? (
              <p className="public-wiki-comparison__empty">No unique rejected candidate builds recorded.</p>
            ) : (
              <ul className="public-wiki-comparison__rejected-list" data-testid="rejected-builds">
                {rejectedUnique.map((item, index) => {
                  const counts = item?.counts || {};
                  const countSummary = Object.entries(counts)
                    .filter(([, value]) => Number(value) > 0)
                    .map(([key, value]) => `${value} ${key}`)
                    .join(', ');
                  return (
                    <li key={`rejected-${index}`}>
                      <span>Rejected unique build {index + 1}</span>
                      {item.at ? <span>{formatComparisonDate(item.at)}</span> : null}
                      <span>{countSummary || 'Rejected without material count detail'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {heldBuilds.length > 0 ? (
              <div className="public-wiki-comparison__claim-group" data-testid="held-builds">
                <h3>Currently held for review ({heldBuilds.length})</h3>
                <ul className="public-wiki-comparison__rejected-list">
                  {heldBuilds.map((item, index) => {
                    const counts = item?.counts || {};
                    const countSummary = Object.entries(counts)
                      .filter(([, value]) => Number(value) > 0)
                      .map(([key, value]) => `${value} ${key}`)
                      .join(', ');
                    return (
                      <li key={`held-${index}`}>
                        <span>Held build {index + 1}</span>
                        {item.at ? <span>{formatComparisonDate(item.at)}</span> : null}
                        <span>{countSummary || 'Held without material count detail'}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="public-wiki-comparison__empty" data-testid="held-builds-empty">
                0 candidate builds are currently held for review.
              </p>
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
              staticErrors.map((item, index) => {
                const stale = cleanText(item.staleClaim);
                if (!stale || isMalformedClaimText(stale)) return null;
                return (
                  <div
                    key={index}
                    className="public-wiki-comparison__error-card"
                    data-static-wiki-error="true"
                  >
                    <p>{stale}</p>
                    <p className="public-wiki-comparison__claim-meta">
                      {cleanText(item.reason) || 'Supporting repository source drifted.'}
                    </p>
                    {Array.isArray(item.refs) && item.refs.length > 0 ? (
                      <ul className="public-wiki-comparison__list">
                        {item.refs.map((ref, refIndex) => (
                          <li key={ref.path || ref.url || refIndex}>
                            {ref.url ? (
                              <a href={ref.url} target="_blank" rel="noopener noreferrer">
                                {evidenceRefLabel(ref)}
                              </a>
                            ) : evidenceRefLabel(ref)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            )}
          </section>

          <section className="public-wiki-comparison__section" aria-label="Supporting GitHub refs">
            <h2>Supporting GitHub refs</h2>
            {refs.length === 0 ? (
              <p className="public-wiki-comparison__empty">No public GitHub references in this comparison.</p>
            ) : (
              <ul className="public-wiki-comparison__refs">
                {refs.map((ref, index) => {
                  const label = evidenceRefLabel(ref);
                  return (
                    <li key={ref.path || ref.url || index}>
                      {ref.url ? (
                        <a href={ref.url} target="_blank" rel="noopener noreferrer">
                          {label}
                        </a>
                      ) : (
                        <strong>{label}</strong>
                      )}
                      <span>
                        {[
                          ref.path && ref.path !== label ? ref.path : null,
                          ref.evidenceType,
                          ref.commitSha ? `commit ${shortSha(ref.commitSha)}` : null,
                          ref.tagName ? `tag ${ref.tagName}` : null
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  );
                })}
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
