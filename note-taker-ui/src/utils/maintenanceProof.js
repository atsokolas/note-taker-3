import { normalizeSpaces } from './editorialText';

export const PUBLIC_PROOF_PRIVACY_STATEMENT = (
  'Public article and references are shown. Private highlights, backlinks, notes, library context, and agent state remain private.'
);

export const NO_ACCEPTED_MAINTENANCE_EVENT_COPY = 'No accepted maintenance event yet';

const PUBLIC_PROOF_GRADES = new Set(['proven', 'candidate', 'acceptance_in_progress', 'illustrative']);

export const normalizeProofGrade = (proofGrade = null) => {
  if (!proofGrade || typeof proofGrade !== 'object') return null;
  const grade = normalizeSpaces(proofGrade.grade).toLowerCase();
  if (!PUBLIC_PROOF_GRADES.has(grade)) return null;
  const comparisonUrl = normalizeSpaces(proofGrade.comparisonUrl);
  const criteria = proofGrade.criteria && typeof proofGrade.criteria === 'object'
    ? proofGrade.criteria
    : {};
  const acceptedAt = proofGrade.acceptedAt ? new Date(proofGrade.acceptedAt) : null;
  const hasValidAcceptance = grade !== 'proven' || (
    criteria.explicitlyAccepted === true
    && criteria.acceptedVersion === true
    && criteria.materialEvent === true
    && criteria.sourceGrounded === true
    && criteria.acceptanceBound === true
    && acceptedAt
    && !Number.isNaN(acceptedAt.getTime())
  );
  if (!hasValidAcceptance) return null;
  return {
    grade,
    label: normalizeSpaces(proofGrade.label),
    reason: normalizeSpaces(proofGrade.reason),
    acceptedAt: grade === 'proven' ? acceptedAt.toISOString() : null,
    comparisonUrl: comparisonUrl.startsWith('/share/wiki/') ? comparisonUrl : '',
    criteria: {
      explicitlyAccepted: criteria.explicitlyAccepted === true,
      acceptedVersion: criteria.acceptedVersion === true,
      materialEvent: criteria.materialEvent === true,
      sourceGrounded: criteria.sourceGrounded === true,
      acceptanceBound: criteria.acceptanceBound === true,
      requiredClocks: criteria.requiredClocks && typeof criteria.requiredClocks === 'object'
        ? { ...criteria.requiredClocks }
        : {},
      optionalClocks: criteria.optionalClocks && typeof criteria.optionalClocks === 'object'
        ? { ...criteria.optionalClocks }
        : {}
    }
  };
};

export const formatMaintenanceDate = (value) => {
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

export const pagePublicPath = (page = {}, publicUrl = '') => {
  const direct = normalizeSpaces(publicUrl);
  if (direct.startsWith('/share/wiki/')) return direct;
  if (direct) return `/share/wiki/${direct.replace(/^\/+/, '')}`;
  const id = normalizeSpaces(page?._id || page?.id || page?.slug);
  return id ? `/share/wiki/${id}` : '';
};

export const normalizeMaintenanceProof = (proof = null) => {
  if (!proof || typeof proof !== 'object') return null;
  const clock = proof.clock && typeof proof.clock === 'object'
    ? {
      type: normalizeSpaces(proof.clock.type),
      label: normalizeSpaces(proof.clock.label)
    }
    : null;
  const currentThrough = proof.currentThrough && typeof proof.currentThrough === 'object'
    ? {
      label: normalizeSpaces(proof.currentThrough.label),
      at: proof.currentThrough.at || null,
      ref: normalizeSpaces(proof.currentThrough.ref)
    }
    : null;
  const latestMaterialEvent = proof.latestMaterialEvent && typeof proof.latestMaterialEvent === 'object'
    ? {
      type: normalizeSpaces(proof.latestMaterialEvent.type),
      summary: normalizeSpaces(proof.latestMaterialEvent.summary),
      at: proof.latestMaterialEvent.at || null
    }
    : null;
  const sourceCount = Number.isFinite(Number(proof.sourceCount)) ? Number(proof.sourceCount) : null;
  const claimCount = Number.isFinite(Number(proof.claimCount)) ? Number(proof.claimCount) : null;
  const lastReviewedAt = proof.lastReviewedAt || null;

  const hasAnyField = Boolean(
    clock?.label
    || currentThrough?.label
    || lastReviewedAt
    || latestMaterialEvent?.summary
    || sourceCount !== null
    || claimCount !== null
  );

  if (!hasAnyField) return null;

  return {
    clock,
    currentThrough,
    lastReviewedAt,
    latestMaterialEvent,
    sourceCount,
    claimCount
  };
};

export const normalizePublicProofItem = (entry = {}) => {
  const page = entry?.page && typeof entry.page === 'object' ? entry.page : {};
  const maintenanceProof = normalizeMaintenanceProof(entry.maintenanceProof);
  const proofGrade = normalizeProofGrade(entry.proofGrade);
  const href = pagePublicPath(page, entry.publicUrl);
  const sourceCount = maintenanceProof?.sourceCount ?? (
    Number.isFinite(Number(page.sourceCount)) ? Number(page.sourceCount) : null
  );
  const claimCount = maintenanceProof?.claimCount ?? (
    Number.isFinite(Number(page.claimCount)) ? Number(page.claimCount) : null
  );

  return {
    slot: normalizeSpaces(entry.slot),
    label: normalizeSpaces(entry.label),
    title: normalizeSpaces(page.title || entry.title) || 'Untitled page',
    description: normalizeSpaces(entry.description || page.plainText).slice(0, 220),
    href,
    maintenanceProof,
    sourceCount,
    claimCount,
    proofGrade,
    page
  };
};

export const normalizePublicProofRegistry = (payload = {}) => {
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .map(normalizePublicProofItem)
    .filter(item => item.href);
  const requestedHomepageCta = payload.homepageCta && typeof payload.homepageCta === 'object'
    ? {
      href: pagePublicPath({}, payload.homepageCta.href || payload.homepageCta.url),
      title: normalizeSpaces(payload.homepageCta.title)
    }
    : null;
  const promotableItems = items.filter(item => ['proven', 'candidate'].includes(item.proofGrade?.grade));
  const provenItems = promotableItems.filter(item => item.proofGrade.grade === 'proven');
  const requestedHomepageItem = requestedHomepageCta?.href
    ? promotableItems.find(item => item.href === requestedHomepageCta.href)
    : null;
  const homepageItem = requestedHomepageItem || provenItems[0] || promotableItems[0] || null;
  const privacyStatement = normalizeSpaces(payload.privacyStatement) || PUBLIC_PROOF_PRIVACY_STATEMENT;

  return {
    items,
    registryState: provenItems.length > 0 ? 'resolved' : 'unresolved',
    provenCount: provenItems.length,
    slotCoverageComplete: payload.slotCoverageComplete === true,
    homepageCta: homepageItem ? {
      href: homepageItem.href,
      title: requestedHomepageItem?.title || homepageItem.title
    } : null,
    privacyStatement
  };
};

export const buildMaintenanceStampFacts = (proof = null) => {
  const normalized = normalizeMaintenanceProof(proof);
  if (!normalized) return [];

  const facts = [];
  if (normalized.clock?.label) {
    facts.push({ label: 'Clock', value: normalized.clock.label });
  }
  if (normalized.currentThrough?.label) {
    facts.push({ label: 'Current through', value: normalized.currentThrough.label });
  }
  if (normalized.lastReviewedAt) {
    const reviewed = formatMaintenanceDate(normalized.lastReviewedAt);
    if (reviewed) facts.push({ label: 'Last reviewed', value: reviewed });
  }
  if (normalized.latestMaterialEvent?.summary) {
    const eventDate = normalized.latestMaterialEvent.at
      ? formatMaintenanceDate(normalized.latestMaterialEvent.at)
      : '';
    facts.push({
      label: 'Latest material event',
      value: eventDate
        ? `${normalized.latestMaterialEvent.summary} · ${eventDate}`
        : normalized.latestMaterialEvent.summary
    });
  } else if (proof) {
    facts.push({ label: 'Latest material event', value: NO_ACCEPTED_MAINTENANCE_EVENT_COPY });
  }
  if (normalized.sourceCount !== null) {
    facts.push({ label: 'Sources', value: String(normalized.sourceCount) });
  }
  if (normalized.claimCount !== null) {
    facts.push({ label: 'Claims', value: String(normalized.claimCount) });
  }
  return facts;
};

export const reviewedDateForPublicPage = (page = {}) => (
  page?.maintenanceProof?.lastReviewedAt
  || page?.lastReviewedAt
  || null
);
