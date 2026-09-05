export const EXPLORATION_STATUS = Object.freeze({
  closed: 'closed',
  open: 'open'
});

export const createExploration = ({
  id = '',
  originalText = '',
  source = null
} = {}) => ({
  id: String(id || '').trim(),
  originalText: String(originalText || ''),
  provisionalText: String(originalText || ''),
  question: '',
  returnNote: '',
  source: source && typeof source === 'object' ? source : null,
  placed: false,
  status: EXPLORATION_STATUS.closed
});

export const openExploration = (exploration) => ({
  ...exploration,
  status: EXPLORATION_STATUS.open
});

export const closeExploration = (exploration) => ({
  ...exploration,
  status: EXPLORATION_STATUS.closed
});

export const tryWording = (exploration, text) => ({
  ...exploration,
  provisionalText: String(text ?? '')
});

export const putItBack = (exploration) => ({
  ...exploration,
  provisionalText: exploration.originalText
});

export const keepQuestion = (exploration, question) => ({
  ...exploration,
  question: String(question ?? '')
});

export const setReturnNote = (exploration, returnNote) => ({
  ...exploration,
  returnNote: String(returnNote ?? '')
});

export const placeSource = (exploration) => (
  exploration.source?.available === false ? exploration : { ...exploration, placed: true }
);

export const cancelPlacement = (exploration) => ({
  ...exploration,
  placed: false
});

export const isOpen = (exploration) => exploration?.status === EXPLORATION_STATUS.open;

export const wordingChanged = (exploration) => (
  String(exploration?.provisionalText || '').trim() !== String(exploration?.originalText || '').trim()
);

export const wikiAcceptedText = (exploration) => String(exploration?.originalText || '');

const tokenize = (value = '') => String(value).split(/(\s+)/).filter((part) => part.length > 0);

export const changedWordSpans = (original = '', next = '') => {
  const from = tokenize(original);
  const to = tokenize(next);
  if (from.join('') === to.join('')) {
    return to.map((text) => ({ text, changed: false }));
  }
  const fromWords = new Set(from.filter((part) => /\S/.test(part)));
  return to.map((text) => ({
    text,
    changed: /\S/.test(text) && !fromWords.has(text)
  }));
};

export const snapshotExploration = (exploration) => JSON.stringify(exploration || {});

export const restoreExploration = (raw, fallback) => {
  const base = fallback || createExploration();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    return {
      ...base,
      ...parsed,
      originalText: base.originalText,
      source: base.source,
      id: base.id,
      status: parsed.status === EXPLORATION_STATUS.open
        ? EXPLORATION_STATUS.open
        : EXPLORATION_STATUS.closed
    };
  } catch (_unreadable) {
    return base;
  }
};
