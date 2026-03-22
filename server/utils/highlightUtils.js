const DEFAULT_HIGHLIGHT_COLOR = '#f6e27a';

const HIGHLIGHT_AGGREGATE_PROJECTION = Object.freeze({
  _id: '$highlights._id',
  articleId: '$_id',
  articleTitle: '$title',
  text: '$highlights.text',
  note: '$highlights.note',
  tags: '$highlights.tags',
  color: '$highlights.color',
  type: '$highlights.type',
  claimId: '$highlights.claimId',
  createdAt: '$highlights.createdAt'
});

const normalizeHighlightColor = (value) => {
  const candidate = String(value || '').trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate)) {
    return candidate.length === 4
      ? `#${candidate.slice(1).split('').map(char => `${char}${char}`).join('')}`
      : candidate.toLowerCase();
  }
  return DEFAULT_HIGHLIGHT_COLOR;
};

const normalizeHighlightAnchor = (anchor, fallbackText = '') => {
  if (!anchor || typeof anchor !== 'object') return undefined;
  const text = String(anchor.text || fallbackText || '').trim();
  if (!text) return undefined;
  const normalized = {
    text,
    prefix: String(anchor.prefix || ''),
    suffix: String(anchor.suffix || '')
  };
  if (Number.isFinite(anchor.startOffsetApprox)) {
    normalized.startOffsetApprox = anchor.startOffsetApprox;
  }
  return normalized;
};

const buildHighlightDocument = ({
  text,
  note = '',
  tags,
  color,
  anchor,
  normalizeTags
}) => ({
  text,
  note: note || '',
  tags: normalizeTags(tags),
  color: normalizeHighlightColor(color),
  type: 'note',
  claimId: null,
  anchor: normalizeHighlightAnchor(anchor, text)
});

const serializeHighlightWithArticle = (article, highlight, options = {}) => {
  const { includeAnchor = false, normalizeItemType = (value) => value || 'note' } = options;
  const payload = {
    _id: highlight._id,
    articleId: article._id,
    articleTitle: article.title || 'Untitled article',
    text: highlight.text,
    note: highlight.note || '',
    tags: highlight.tags || [],
    color: normalizeHighlightColor(highlight.color),
    type: normalizeItemType(highlight.type, 'note'),
    claimId: highlight.claimId || null,
    createdAt: highlight.createdAt
  };
  if (includeAnchor) {
    payload.anchor = normalizeHighlightAnchor(highlight.anchor, highlight.text);
  }
  return payload;
};

module.exports = {
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_AGGREGATE_PROJECTION,
  normalizeHighlightColor,
  normalizeHighlightAnchor,
  buildHighlightDocument,
  serializeHighlightWithArticle
};
