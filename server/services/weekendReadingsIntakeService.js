const path = require('path');
const { canonicalizeReadingUrl } = require('./weekendReadingsService');
const { serializePublishedArtifact } = require('./weekendReadingsApprovalService');

const OPENCLAW_AFTERNOON_RESEARCH_JOB_ID = '0a35a454-de07-47b7-b8c5-f3229717af35';
const OPENCLAW_ITEM_ROLES = new Set(['support', 'counterevidence', 'context', 'broadening']);
const ROLE_MAP = Object.freeze({
  support: 'thesis_evidence',
  counterevidence: 'counterevidence',
  context: 'context',
  broadening: 'intellectual_broadening'
});

const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const cleanList = (value = [], limit = 40) => Array.from(new Set(
  (Array.isArray(value) ? value : []).map(item => clean(item, 240)).filter(Boolean)
)).slice(0, limit);

const isoDate = (value, field) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date.toISOString();
};

const dateKey = (value, field) => isoDate(value, field).slice(0, 10);

const safeSourceName = value => path.basename(clean(value, 500)) || 'unknown-source';

const validateOpenClawHandoff = (handoff = {}, { sourceName = 'latest.json' } = {}) => {
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    throw new Error('OpenClaw afternoon-research handoff must be a JSON object.');
  }
  const schemaVersion = clean(handoff.schemaVersion, 40);
  if (!schemaVersion) throw new Error('OpenClaw handoff requires schemaVersion.');
  const generatedAt = isoDate(handoff.generatedAt, 'generatedAt');
  const sourceJobId = clean(handoff.sourceJobId, 120);
  if (sourceJobId !== OPENCLAW_AFTERNOON_RESEARCH_JOB_ID) {
    throw new Error('OpenClaw handoff sourceJobId does not match Jarvis Afternoon Research Brief.');
  }
  const signalQuality = clean(handoff.signalQuality, 120);
  const takeaway = clean(handoff.takeaway, 2000);
  if (!signalQuality || !takeaway) throw new Error('OpenClaw handoff requires signalQuality and takeaway.');
  if (!Array.isArray(handoff.items) || handoff.items.length < 3 || handoff.items.length > 5) {
    throw new Error('OpenClaw handoff must contain 3-5 items.');
  }

  const externalIds = new Set();
  const canonicalUrls = new Set();
  const items = handoff.items.map((item, index) => {
    const prefix = `OpenClaw item ${index + 1}`;
    const externalId = clean(item?.externalId, 240);
    const title = clean(item?.title, 300);
    const sourceLabel = clean(item?.sourceLabel, 200);
    const summary = clean(item?.summary, 2000);
    const whyItMatters = clean(item?.whyItMatters, 1600);
    const proposedEvidenceRole = clean(item?.proposedEvidenceRole, 80).toLowerCase();
    if (!externalId || !title || !sourceLabel || !summary || !whyItMatters) {
      throw new Error(`${prefix} requires externalId, title, sourceLabel, summary, and whyItMatters.`);
    }
    if (externalIds.has(externalId)) throw new Error(`${prefix} has a duplicate externalId.`);
    externalIds.add(externalId);
    if (!OPENCLAW_ITEM_ROLES.has(proposedEvidenceRole)) {
      throw new Error(`${prefix} has an invalid proposedEvidenceRole.`);
    }
    if (!Array.isArray(item?.lanes) || !Array.isArray(item?.proposedThesisRefs)) {
      throw new Error(`${prefix} requires lanes and proposedThesisRefs arrays.`);
    }
    if (item?.requiresHumanAcceptance !== true) {
      throw new Error(`${prefix} must set requiresHumanAcceptance=true.`);
    }
    const canonicalUrl = canonicalizeReadingUrl(item?.canonicalUrl);
    if (canonicalUrls.has(canonicalUrl)) throw new Error(`${prefix} has a duplicate canonical URL.`);
    canonicalUrls.add(canonicalUrl);
    const publishedAt = item?.publishedAt ? isoDate(item.publishedAt, `${prefix}.publishedAt`) : null;
    return {
      externalId,
      title,
      canonicalUrl,
      sourceLabel,
      publishedAt,
      summary,
      whyItMatters,
      lanes: cleanList(item?.lanes, 20),
      proposedEvidenceRole,
      proposedThesisRefs: cleanList(item?.proposedThesisRefs, 40),
      requiresHumanAcceptance: true,
      provenance: [{
        sourceType: 'openclaw_afternoon_research',
        sourceName: safeSourceName(sourceName),
        schemaVersion,
        generatedAt,
        sourceJobId,
        externalId,
        signalQuality
      }]
    };
  });

  return { schemaVersion, generatedAt, sourceJobId, signalQuality, takeaway, items };
};

const sectionDateFromHeading = line => {
  const heading = String(line || '').match(/^##\s+(\d{4}-\d{2}-\d{2})(?:\s+run)?\s*$/i);
  if (heading) return heading[1];
  const updated = String(line || '').match(/^Last updated:\s+(\d{4}-\d{2}-\d{2})\b/i);
  return updated ? updated[1] : '';
};

const parseAutomationMemory = ({ text = '', sourceKind = '', sourceName = '', windowStart, windowEnd } = {}) => {
  const start = dateKey(windowStart, 'windowStart');
  const end = dateKey(windowEnd, 'windowEnd');
  const kind = clean(sourceKind, 80);
  if (!['sunday_reading_sweep', 'friday_research_curation', 'friday_research_papers'].includes(kind)) {
    throw new Error('Automation memory sourceKind is invalid.');
  }
  let sectionDate = '';
  const items = [];
  String(text || '').split(/\r?\n/).forEach((line) => {
    const nextDate = sectionDateFromHeading(line);
    if (nextDate) sectionDate = nextDate;
    if (!sectionDate || sectionDate < start || sectionDate > end) return;
    const numbered = line.match(/^\s*\d+\.\s+(.+?)\s+-\s+(https?:\/\/\S+)\s*$/);
    const urlOnly = line.match(/^\s*\d+\.\s+(https?:\/\/\S+)\s*$/);
    if (!numbered && !urlOnly) return;
    const rawUrl = (numbered?.[2] || urlOnly?.[1] || '').replace(/[),.;]+$/, '');
    const canonicalUrl = canonicalizeReadingUrl(rawUrl);
    const sourceLabel = new URL(canonicalUrl).hostname.replace(/^www\./, '');
    items.push({
      externalId: `${kind}:${sectionDate}:${canonicalUrl}`,
      title: clean(numbered?.[1], 300) || canonicalUrl,
      canonicalUrl,
      sourceLabel,
      publishedAt: null,
      summary: '',
      whyItMatters: '',
      lanes: [],
      proposedEvidenceRole: '',
      proposedThesisRefs: [],
      requiresHumanAcceptance: true,
      provenance: [{
        sourceType: kind,
        sourceName: safeSourceName(sourceName),
        generatedAt: `${sectionDate}T12:00:00.000Z`,
        sourceJobId: kind,
        externalId: `${kind}:${sectionDate}:${canonicalUrl}`,
        signalQuality: 'human_curated'
      }]
    });
  });
  return {
    sourceKind: kind,
    sourceName: safeSourceName(sourceName),
    items,
    warnings: kind === 'friday_research_papers' && items.length === 0
      ? ['Friday Research Papers memory describes its selections but does not preserve item URLs; no candidates could be recovered from this memory.']
      : []
  };
};

const candidateScore = item => [item.title && item.title !== item.canonicalUrl, item.whyItMatters, item.summary, item.proposedEvidenceRole]
  .filter(Boolean).length;

const mergeCandidate = (existing, incoming) => {
  const preferred = candidateScore(incoming) > candidateScore(existing) ? incoming : existing;
  const alternate = preferred === existing ? incoming : existing;
  return {
    ...alternate,
    ...preferred,
    lanes: cleanList([...(existing.lanes || []), ...(incoming.lanes || [])], 20),
    proposedThesisRefs: cleanList([...(existing.proposedThesisRefs || []), ...(incoming.proposedThesisRefs || [])], 40),
    provenance: [...(existing.provenance || []), ...(incoming.provenance || [])]
  };
};

const normalizeCandidateInput = (item = {}, index = 0) => {
  if (item?.requiresHumanAcceptance !== true) {
    throw new Error(`Intake candidate ${index + 1} must require human acceptance.`);
  }
  const proposedEvidenceRole = clean(item.proposedEvidenceRole, 80).toLowerCase();
  if (proposedEvidenceRole && !OPENCLAW_ITEM_ROLES.has(proposedEvidenceRole)) {
    throw new Error(`Intake candidate ${index + 1} has an invalid proposedEvidenceRole.`);
  }
  const canonicalUrl = canonicalizeReadingUrl(item.canonicalUrl);
  const provenance = (Array.isArray(item.provenance) ? item.provenance : []).slice(0, 12).map(entry => ({
    sourceType: clean(entry?.sourceType, 120),
    sourceName: safeSourceName(entry?.sourceName),
    schemaVersion: clean(entry?.schemaVersion, 40),
    generatedAt: isoDate(entry?.generatedAt, `candidate ${index + 1} provenance generatedAt`),
    sourceJobId: clean(entry?.sourceJobId, 160),
    externalId: clean(entry?.externalId, 240),
    signalQuality: clean(entry?.signalQuality, 120)
  })).filter(entry => entry.sourceType && entry.externalId);
  if (!provenance.length) throw new Error(`Intake candidate ${index + 1} requires provenance.`);
  return {
    externalId: clean(item.externalId, 240) || provenance[0].externalId,
    title: clean(item.title, 300) || canonicalUrl,
    canonicalUrl,
    sourceLabel: clean(item.sourceLabel, 200) || new URL(canonicalUrl).hostname.replace(/^www\./, ''),
    publishedAt: item.publishedAt ? isoDate(item.publishedAt, `candidate ${index + 1} publishedAt`) : null,
    summary: clean(item.summary, 2000),
    whyItMatters: clean(item.whyItMatters, 1600),
    lanes: cleanList(item.lanes, 20),
    proposedEvidenceRole,
    proposedThesisRefs: cleanList(item.proposedThesisRefs, 40),
    requiresHumanAcceptance: true,
    provenance
  };
};

const toDraftCandidate = (item = {}) => {
  const readingRole = ROLE_MAP[item.proposedEvidenceRole] || '';
  const boundaryRequired = readingRole === 'context';
  const needsHumanFields = [
    ...(!item.whyItMatters ? ['whyItMatters'] : []),
    ...(!readingRole ? ['readingRole'] : []),
    ...(boundaryRequired ? ['boundary'] : []),
    'sourceQuality',
    'publicRelationship'
  ];
  return {
    externalId: item.externalId,
    title: item.title,
    canonicalUrl: item.canonicalUrl,
    sourceLabel: item.sourceLabel,
    publishedAt: item.publishedAt,
    summary: item.summary,
    whyItMatters: item.whyItMatters,
    readingRole,
    proposedEvidenceRole: item.proposedEvidenceRole,
    lanes: item.lanes,
    proposedThesisRefs: item.proposedThesisRefs,
    requiresHumanAcceptance: true,
    accepted: false,
    draftReady: needsHumanFields.length === 0,
    needsHumanFields,
    intakeProvenance: item.provenance
  };
};

const buildWeekendReadingsIntake = ({ openClawHandoffs = [], automationMemories = [], candidateItems = [], priorEditionUrls = [] } = {}) => {
  const warnings = [];
  const sourceItems = [];
  openClawHandoffs.forEach((entry, index) => {
    const payload = entry?.payload || entry;
    const sourceName = entry?.sourceName || `openclaw-${index + 1}.json`;
    const validated = validateOpenClawHandoff(payload, { sourceName });
    sourceItems.push(...validated.items);
  });
  automationMemories.forEach((entry) => {
    const parsed = parseAutomationMemory(entry);
    sourceItems.push(...parsed.items);
    warnings.push(...parsed.warnings);
  });
  sourceItems.push(...(Array.isArray(candidateItems) ? candidateItems : []).map(normalizeCandidateInput));

  const merged = new Map();
  sourceItems.forEach((item) => {
    const existing = merged.get(item.canonicalUrl);
    merged.set(item.canonicalUrl, existing ? mergeCandidate(existing, item) : item);
  });
  const prior = new Set(priorEditionUrls.map(url => canonicalizeReadingUrl(url)));
  const excluded = [];
  const candidates = [];
  merged.forEach((item) => {
    if (prior.has(item.canonicalUrl)) {
      excluded.push({ canonicalUrl: item.canonicalUrl, title: item.title, reason: 'prior_weekend_readings_edition' });
      return;
    }
    candidates.push(toDraftCandidate(item));
  });
  candidates.sort((a, b) => String(b.intakeProvenance?.[0]?.generatedAt || '').localeCompare(String(a.intakeProvenance?.[0]?.generatedAt || '')) || a.title.localeCompare(b.title));
  return {
    candidates,
    excluded,
    warnings,
    summary: {
      sourceItemCount: sourceItems.length,
      candidateCount: candidates.length,
      duplicateCount: sourceItems.length - merged.size,
      priorEditionExcludedCount: excluded.length,
      requiresHumanAcceptanceCount: candidates.length
    }
  };
};

const resolveQuery = async (query) => {
  if (!query) return [];
  if (typeof query.lean === 'function') return query.lean();
  return query;
};

const loadPriorWeekendReadingsUrls = async ({ NoeisReceipt, userId, excludePageId = '' } = {}) => {
  if (!NoeisReceipt?.find || !userId) return [];
  const publications = await resolveQuery(NoeisReceipt.find({
    userId,
    kind: 'weekend_readings_revision_published',
    status: 'published'
  }));
  const approvalIds = Array.from(new Set((Array.isArray(publications) ? publications : [])
    .map(receipt => clean(receipt?.provenance?.approvalReceiptId, 300))
    .filter(Boolean)));
  if (!approvalIds.length) return [];
  const approvals = await resolveQuery(NoeisReceipt.find({
    userId,
    receiptId: { $in: approvalIds },
    kind: 'weekend_readings_revision_approved',
    status: 'approved'
  }));
  const approvalById = new Map((Array.isArray(approvals) ? approvals : []).map(receipt => [receipt.receiptId, receipt]));
  const urls = [];
  for (const publication of (Array.isArray(publications) ? publications : [])) {
    if (clean(publication?.provenance?.pageId, 160) === clean(excludePageId, 160)) continue;
    const approvalId = clean(publication?.provenance?.approvalReceiptId, 300);
    const approval = approvalById.get(approvalId);
    const artifact = approval?.provenance?.publicArtifact;
    const samePage = clean(publication?.provenance?.pageId, 160) === clean(approval?.provenance?.pageId, 160);
    const sameRevision = clean(publication?.provenance?.revisionId, 160) === clean(approval?.provenance?.revisionId, 160);
    const artifactRevisionMatches = clean(artifact?.revisionId, 160) === clean(publication?.provenance?.revisionId, 160);
    const editionKey = clean(artifact?.editionKey, 240);
    const sameEdition = editionKey
      && editionKey === clean(approval?.provenance?.editionKey, 240)
      && editionKey === clean(publication?.provenance?.editionKey, 240);
    const serialized = serializePublishedArtifact({ approvalReceipt: approval, publicationReceipt: publication });
    if (!approval || !serialized || !samePage || !sameRevision || !artifactRevisionMatches || !sameEdition) {
      throw new Error('Prior Weekend Readings publication history is inconsistent; intake preview failed closed.');
    }
    urls.push(...(Array.isArray(serialized.sourceRefs) ? serialized.sourceRefs.map(item => item?.url) : []));
  }
  return Array.from(new Set(urls.filter(Boolean).map(url => canonicalizeReadingUrl(url))));
};

module.exports = {
  OPENCLAW_AFTERNOON_RESEARCH_JOB_ID,
  ROLE_MAP,
  buildWeekendReadingsIntake,
  loadPriorWeekendReadingsUrls,
  normalizeCandidateInput,
  parseAutomationMemory,
  validateOpenClawHandoff
};
