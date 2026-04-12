const clean = (value = '') => String(value || '').trim();

const createId = (prefix = 'change-draft') => (
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2, 9)}-${Date.now()}`}`
);

const toTimestamp = (value) => {
  if (!value) return 0;
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const truncate = (value = '', limit = 96) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const summarizeCount = (count, noun) => {
  if (count === 1) return `1 ${noun}`;
  return `${count} ${noun}s`;
};

const leadLabel = (cards = [], fallback = 'the current draft') => {
  const lead = (Array.isArray(cards) ? cards : [])
    .map((card) => clean(card?.title) || clean(card?.content) || clean(card?.source))
    .find(Boolean);
  if (!lead) return fallback;
  return truncate(lead, 88);
};

const buildChangeDraftSummary = (kind, cards = []) => {
  const count = Array.isArray(cards) ? cards.length : 0;
  const lead = leadLabel(cards);
  const verb = count === 1 ? 'is' : 'are';
  if (kind === 'support') {
    return `${lead} looks like the clearest footing. ${summarizeCount(count, 'support')} ${verb} ready to attach.`;
  }
  if (kind === 'contradiction') {
    return `${lead} is the sharpest tension. ${summarizeCount(count, 'contradiction')} ${verb} ready to test the draft.`;
  }
  if (kind === 'related') {
    return `${lead} is the best adjacent source. ${summarizeCount(count, 'source')} ${verb} ready for the concept margin.`;
  }
  if (kind === 'question') {
    return `${lead} is the question worth keeping open. ${summarizeCount(count, 'open question')} ${verb} ready to add.`;
  }
  if (kind === 'refresh') {
    return `${lead} is the freshest signal. ${summarizeCount(count, 'newer source')} may change this concept.`;
  }
  return `${lead} is ready for review.`;
};

const CHANGE_DRAFT_META = {
  support: {
    title: 'Support pull prepared',
    summary: (_count, cards) => buildChangeDraftSummary('support', cards),
    applyLabel: 'support',
    zone: 'supports'
  },
  contradiction: {
    title: 'Tension pull prepared',
    summary: (_count, cards) => buildChangeDraftSummary('contradiction', cards),
    applyLabel: 'tension',
    zone: 'contradictions'
  },
  related: {
    title: 'Related sources prepared',
    summary: (_count, cards) => buildChangeDraftSummary('related', cards),
    applyLabel: 'source',
    zone: 'workspace'
  },
  question: {
    title: 'Open questions prepared',
    summary: (_count, cards) => buildChangeDraftSummary('question', cards),
    applyLabel: 'question',
    zone: 'questions'
  },
  refresh: {
    title: 'Fresh material waiting',
    summary: (_count, cards) => buildChangeDraftSummary('refresh', cards),
    applyLabel: 'fresh source',
    zone: 'workspace'
  }
};

const mapCardZoneForDraft = (kind, card) => {
  if (kind === 'refresh') {
    return clean(card?.zone).toLowerCase() === 'questions' ? 'questions' : 'workspace';
  }
  return CHANGE_DRAFT_META[kind]?.zone || clean(card?.zone) || 'workspace';
};

export const buildConceptChangeDraft = ({
  kind = 'support',
  cards = [],
  title = '',
  summary = '',
  caption = '',
  reason = ''
}) => {
  const safeCards = (Array.isArray(cards) ? cards : [])
    .filter(Boolean)
    .map((card) => ({
      ...card,
      zone: mapCardZoneForDraft(kind, card)
    }));
  const meta = CHANGE_DRAFT_META[kind] || CHANGE_DRAFT_META.support;
  const signature = safeCards
    .map((card) => clean(card?.sourceKey || card?.id))
    .filter(Boolean)
    .join('|');

  return {
    id: createId(),
    kind,
    status: 'pending',
    title: clean(title) || meta.title,
    summary: clean(summary) || meta.summary(safeCards.length, safeCards),
    caption: clean(caption),
    reason: clean(reason),
    cards: safeCards,
    sourceKeys: safeCards.map((card) => clean(card?.sourceKey)).filter(Boolean),
    signature,
    createdAt: new Date().toISOString(),
    applyMessage: `Applied ${meta.applyLabel === 'support' ? 'the' : ''} ${meta.applyLabel} draft to the concept.`.replace(/\s+/g, ' ').trim()
  };
};

export const mergeConceptChangeDrafts = (existing = [], additions = []) => {
  const next = [];
  const seen = new Set();
  [...additions, ...existing].forEach((draft) => {
    if (!draft) return;
    const key = `${clean(draft.kind)}:${clean(draft.signature || draft.id)}`;
    if (seen.has(key)) return;
    seen.add(key);
    next.push(draft);
  });
  return next;
};

export const computeConceptFreshness = ({
  materialLibrary = [],
  importedSourceKeys = [],
  lastReviewedAt = ''
}) => {
  const imported = new Set((Array.isArray(importedSourceKeys) ? importedSourceKeys : []).map((value) => clean(value)));
  const lastReviewedTs = toTimestamp(lastReviewedAt);
  const freshCards = (Array.isArray(materialLibrary) ? materialLibrary : [])
    .filter((card) => {
      const sourceKey = clean(card?.sourceKey);
      if (!sourceKey || imported.has(sourceKey)) return false;
      const updatedTs = toTimestamp(card?.updatedAt || card?.createdAt);
      if (!lastReviewedTs) return true;
      return updatedTs > lastReviewedTs;
    })
    .slice(0, 4);

  const unreviewedCount = freshCards.length;
  const summary = unreviewedCount > 0
    ? `${summarizeCount(unreviewedCount, 'newer source')} landed after the last review.`
    : 'The concept is current with reviewed material.';

  return {
    status: unreviewedCount > 0 ? 'stale' : 'current',
    isStale: unreviewedCount > 0,
    unreviewedCount,
    summary,
    lastReviewedAt,
    freshCards,
    signature: freshCards.map((card) => clean(card?.sourceKey || card?.id)).filter(Boolean).join('|'),
    preview: freshCards.map((card) => truncate(card.title || card.content || card.source, 88))
  };
};

export default buildConceptChangeDraft;
