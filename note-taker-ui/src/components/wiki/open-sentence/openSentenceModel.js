export const EXPLORATION_STATUS = Object.freeze({
  closed: 'closed',
  open: 'open'
});

export const createExploration = ({
  id = '',
  originalText = '',
  source = null,
  mark = ''
} = {}) => ({
  id: String(id || '').trim(),
  originalText: String(originalText || ''),
  provisionalText: String(originalText || ''),
  question: '',
  returnNote: '',
  mark: mark === '!' ? '!' : '',
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

export const liveProposal = (exploration) => {
  const proposal = exploration?.proposal;
  if (!proposal || typeof proposal !== 'object') return null;
  const text = String(proposal.text || '').trim();
  const against = String(proposal.against || '').trim();
  const current = String(exploration?.originalText || '').trim();
  if (!text || !against || text === against || against !== current) return null;
  return { text, against };
};

export const proposeWording = (exploration) => {
  const text = String(exploration?.provisionalText || '').trim();
  const against = String(exploration?.originalText || '').trim();
  if (!text || !against || text === against) return exploration;
  return { ...exploration, proposal: { text, against } };
};

export const withdrawProposal = (exploration) => (
  exploration?.proposal ? { ...exploration, proposal: null } : exploration
);

export const keepsClosedDraft = (exploration) => Boolean(
  String(exploration?.question || '').trim()
  || String(exploration?.returnNote || '').trim()
  || exploration?.placed
  || liveProposal(exploration)
);

export const forgetExperiment = (live) => createExploration({
  id: live?.id,
  originalText: live?.originalText,
  source: live?.source
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

export const placeSource = (exploration) => {
  const source = exploration?.source;
  if (!source || source.available === false || !String(source.passage || '').trim()) {
    return exploration;
  }
  return { ...exploration, placed: true };
};

export const cancelPlacement = (exploration) => ({
  ...exploration,
  placed: false
});

export const leaveMark = (exploration, marked = true) => ({
  ...exploration,
  mark: marked ? '!' : ''
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
    const restored = {
      ...base,
      ...parsed,
      originalText: base.originalText,
      source: base.source,
      id: base.id,
      mark: parsed.mark === '!' ? '!' : '',
      status: parsed.status === EXPLORATION_STATUS.open
        ? EXPLORATION_STATUS.open
        : EXPLORATION_STATUS.closed
    };
    return {
      ...restored,
      proposal: liveProposal(restored)
    };
  } catch (_unreadable) {
    return base;
  }
};
