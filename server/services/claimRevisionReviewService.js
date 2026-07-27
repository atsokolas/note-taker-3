const crypto = require('crypto');

const clean = (value = '', limit = 1200) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);
const stripHtml = (value = '', limit = 1200) => clean(
  String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&'),
  limit
);
const id = value => String(value?._id || value || '');
const list = value => Array.isArray(value) ? value : [];
const uniqueIds = value => Array.from(new Set(list(value).map(id).filter(Boolean))).sort();

const semanticClaim = claim => claim ? {
  claimId: clean(claim.claimId, 240),
  text: stripHtml(claim.text),
  section: stripHtml(claim.section, 240),
  support: clean(claim.support, 40) || 'unsupported',
  confidence: claim.confidence !== null && claim.confidence !== undefined && claim.confidence !== ''
    && Number.isFinite(Number(claim.confidence))
    ? Number(claim.confidence)
    : null,
  epistemicStatus: clean(claim.epistemicStatus, 80) || null,
  materiality: clean(claim.materiality, 40) || null,
  sourceRefIds: uniqueIds(claim.sourceRefIds),
  citationIds: uniqueIds(claim.citationIds),
  contradictedByCitationIds: uniqueIds(claim.contradictedByCitationIds)
} : null;

const digest = value => crypto.createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const tokenize = value => clean(value, 5000).split(/(\s+)/).filter(Boolean);
const diffSegments = (before = '', after = '') => {
  const left = tokenize(before);
  const right = tokenize(after);
  if (left.join('') === right.join('')) {
    return left.length ? [{ kind: 'equal', text: left.join('') }] : [];
  }
  const rows = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      rows[i][j] = left[i] === right[j]
        ? rows[i + 1][j + 1] + 1
        : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  const parts = [];
  const push = (kind, text) => {
    if (!text) return;
    const previous = parts[parts.length - 1];
    if (previous?.kind === kind) previous.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      push('equal', left[i]);
      i += 1;
      j += 1;
    } else if (rows[i + 1][j] >= rows[i][j + 1]) {
      push('removed', left[i]);
      i += 1;
    } else {
      push('added', right[j]);
      j += 1;
    }
  }
  while (i < left.length) push('removed', left[i++]);
  while (j < right.length) push('added', right[j++]);
  return parts.slice(0, 120);
};

const combinedMap = (before = [], after = []) => new Map(
  [...list(before), ...list(after)]
    .filter(value => id(value))
    .map(value => [id(value), value])
);
const sourceIdsForClaim = (claim, citations) => {
  const ids = new Set(uniqueIds(claim?.sourceRefIds));
  [...uniqueIds(claim?.citationIds), ...uniqueIds(claim?.contradictedByCitationIds)]
    .forEach(citationId => {
      const citation = citations.get(citationId);
      if (citation?.sourceRefId) ids.add(id(citation.sourceRefId));
    });
  return ids;
};
const resolveRefs = ({ ids, sourceRefs, resolveSource }) => (
  Array.from(ids)
    .map(sourceId => sourceRefs.get(sourceId))
    .map((ref) => {
      if (!ref) return null;
      const resolved = resolveSource({ type: ref.type, id: ref.objectId })?.ref;
      if (resolved) return resolved;
      const sourceUrl = /^https?:\/\//i.test(clean(ref?.url, 2000)) ? clean(ref.url, 2000) : '';
      if (clean(ref?.type, 40) !== 'external' || !sourceUrl) return null;
      return {
        type: 'external',
        id: id(ref),
        title: stripHtml(ref?.title || ref?.citationLabel || 'External evidence', 220),
        href: sourceUrl,
        sourceUrl
      };
    })
    .filter(Boolean)
    .filter((ref, index, rows) => rows.findIndex(other => (
      other.type === ref.type && other.id === ref.id && other.parentId === ref.parentId
    )) === index)
);

const buildClaimRevisionReview = ({
  concept,
  page,
  revision,
  currentClaim,
  proposedClaim,
  resolveSource
} = {}) => {
  if (!concept || !page || !revision || !currentClaim || !proposedClaim || !resolveSource) return null;
  const current = semanticClaim(currentClaim);
  const proposed = semanticClaim(proposedClaim);
  if (!current?.claimId || current.claimId !== proposed?.claimId) return null;

  const sourceRefs = combinedMap(revision?.before?.sourceRefs, revision?.after?.sourceRefs);
  const citations = combinedMap(revision?.before?.citations, revision?.after?.citations);
  const beforeIds = sourceIdsForClaim(currentClaim, citations);
  const afterIds = sourceIdsForClaim(proposedClaim, citations);
  const addedIds = new Set(Array.from(afterIds).filter(value => !beforeIds.has(value)));
  const removedIds = new Set(Array.from(beforeIds).filter(value => !afterIds.has(value)));
  const contradictionSourceIds = new Set(uniqueIds(proposedClaim.contradictedByCitationIds)
    .map(citationId => citations.get(citationId)?.sourceRefId)
    .map(id)
    .filter(Boolean));
  const supportingIds = new Set(Array.from(afterIds).filter(value => !contradictionSourceIds.has(value)));
  const semantic = {
    version: 1,
    conceptId: id(concept),
    wikiPageId: id(page),
    revisionId: id(revision),
    claimId: current.claimId,
    current,
    proposed
  };
  const changedFields = ['text', 'section', 'support', 'confidence', 'epistemicStatus', 'materiality']
    .filter(field => current[field] !== proposed[field]);
  const evidenceChanged = addedIds.size > 0 || removedIds.size > 0
    || JSON.stringify(current.contradictedByCitationIds) !== JSON.stringify(proposed.contradictedByCitationIds);

  const state = clean(revision?.claimReview?.state, 40) || 'pending';
  const rawReceipt = revision?.claimReview?.receipt;
  const receipt = rawReceipt && typeof rawReceipt === 'object'
    ? {
        id: id(rawReceipt.id || rawReceipt._id),
        kind: clean(rawReceipt.kind, 80),
        status: clean(rawReceipt.status, 40),
        completedAt: rawReceipt.completedAt || null
      }
    : null;
  const canAct = ['pending', 'deferred'].includes(state);
  return {
    version: 1,
    identity: {
      conceptId: id(concept),
      wikiPageId: id(page),
      revisionId: id(revision),
      claimId: current.claimId
    },
    state,
    canAct,
    unavailableReason: canAct ? '' : `This candidate was already ${state}.`,
    current,
    proposed,
    diff: {
      segments: diffSegments(current.text, proposed.text),
      changedFields,
      boundedExplanation: changedFields.length || evidenceChanged
        ? `${changedFields.length ? `Changed ${changedFields.join(', ')}` : 'Claim text and judgment fields are unchanged'}; ${addedIds.size} evidence reference${addedIds.size === 1 ? '' : 's'} added and ${removedIds.size} removed.`
        : 'The candidate does not materially change this claim.'
    },
    evidenceDelta: {
      added: resolveRefs({ ids: addedIds, sourceRefs, resolveSource }),
      removed: resolveRefs({ ids: removedIds, sourceRefs, resolveSource }),
      supporting: resolveRefs({ ids: supportingIds, sourceRefs, resolveSource }),
      contradicting: resolveRefs({ ids: contradictionSourceIds, sourceRefs, resolveSource })
    },
    affected: {
      pages: [{ type: 'wiki_page', id: id(page), title: stripHtml(page.title, 180), href: `/wiki/workspace?page=${encodeURIComponent(id(page))}` }],
      concepts: [{
        type: 'concept',
        id: id(concept),
        title: stripHtml(concept.name, 180),
        href: `/think?tab=concepts&conceptId=${encodeURIComponent(id(concept))}`
      }]
    },
    unresolved: stripHtml(page?.judgment?.strongestCounterargument)
      ? [{ text: stripHtml(page.judgment.strongestCounterargument), source: 'current_wiki_judgment' }]
      : [],
    allowedDispositions: canAct ? ['accept', 'reject', 'defer', 'preserve'] : [],
    candidateHash: digest(semantic),
    currentClaimHash: digest(current),
    resolvedAt: revision?.claimReview?.reviewedAt || null,
    deferredUntil: revision?.claimReview?.deferredUntil || null,
    receipt
  };
};

module.exports = {
  buildClaimRevisionReview,
  semanticClaim,
  diffSegments,
  __testables: { digest, sourceIdsForClaim, resolveRefs }
};
