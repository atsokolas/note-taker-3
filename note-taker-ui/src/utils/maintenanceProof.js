export const PUBLIC_PROOF_PRIVACY_STATEMENT = (
  'Public article and references are shown. Private highlights, backlinks, notes, library context, and agent state remain private.'
);

export const NO_ACCEPTED_MAINTENANCE_EVENT_COPY = 'No accepted maintenance event yet';

const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

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
  const direct = cleanText(publicUrl);
  if (direct.startsWith('/share/wiki/')) return direct;
  if (direct) return `/share/wiki/${direct.replace(/^\/+/, '')}`;
  const id = cleanText(page?._id || page?.id || page?.slug);
  return id ? `/share/wiki/${id}` : '';
};

export const normalizeMaintenanceProof = (proof = null) => {
  if (!proof || typeof proof !== 'object') return null;
  const clock = proof.clock && typeof proof.clock === 'object'
    ? {
      type: cleanText(proof.clock.type),
      label: cleanText(proof.clock.label)
    }
    : null;
  const currentThrough = proof.currentThrough && typeof proof.currentThrough === 'object'
    ? {
      label: cleanText(proof.currentThrough.label),
      at: proof.currentThrough.at || null,
      ref: cleanText(proof.currentThrough.ref)
    }
    : null;
  const latestMaterialEvent = proof.latestMaterialEvent && typeof proof.latestMaterialEvent === 'object'
    ? {
      type: cleanText(proof.latestMaterialEvent.type),
      summary: cleanText(proof.latestMaterialEvent.summary),
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
  const href = pagePublicPath(page, entry.publicUrl);
  const sourceCount = maintenanceProof?.sourceCount ?? (
    Number.isFinite(Number(page.sourceCount)) ? Number(page.sourceCount) : null
  );
  const claimCount = maintenanceProof?.claimCount ?? (
    Number.isFinite(Number(page.claimCount)) ? Number(page.claimCount) : null
  );

  return {
    slot: cleanText(entry.slot),
    label: cleanText(entry.label),
    title: cleanText(page.title || entry.title) || 'Untitled page',
    description: cleanText(entry.description || page.plainText).slice(0, 220),
    href,
    maintenanceProof,
    sourceCount,
    claimCount,
    page
  };
};

export const normalizePublicProofRegistry = (payload = {}) => {
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .map(normalizePublicProofItem)
    .filter(item => item.href);
  const homepageCta = payload.homepageCta && typeof payload.homepageCta === 'object'
    ? {
      href: pagePublicPath({}, payload.homepageCta.href || payload.homepageCta.url),
      title: cleanText(payload.homepageCta.title)
    }
    : null;
  const privacyStatement = cleanText(payload.privacyStatement) || PUBLIC_PROOF_PRIVACY_STATEMENT;

  return {
    items,
    homepageCta: homepageCta?.href ? homepageCta : (items[0]?.href ? {
      href: items[0].href,
      title: items[0].title
    } : null),
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
