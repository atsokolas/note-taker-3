export const EXPLORATION_STATUS = Object.freeze({
  closed: 'closed',
  open: 'open'
});

const asThen = (value, currentText) => {
  const text = String(value?.text || '').trim();
  const now = String(currentText || '').trim();
  if (!text || !now || text === now) return null;
  return { text };
};

export const liveThen = (exploration) => asThen(exploration?.then, exploration?.originalText);

export const createExploration = ({
  id = '',
  originalText = '',
  source = null,
  other = null,
  mark = '',
  then = null
} = {}) => {
  const text = String(originalText || '');
  const recorded = asThen(then, text);
  return {
    id: String(id || '').trim(),
    originalText: text,
    provisionalText: text,
    question: '',
    returnNote: '',
    mark: mark === '!' ? '!' : '',
    source: source && typeof source === 'object' ? source : null,
    other: other && typeof other === 'object' ? other : null,
    ...(recorded ? { then: recorded } : {}),
    placed: false,
    status: EXPLORATION_STATUS.closed
  };
};

export const openExploration = (exploration) => ({
  ...exploration,
  status: EXPLORATION_STATUS.open
});

export const closeExploration = (exploration) => ({
  ...exploration,
  status: EXPLORATION_STATUS.closed
});

export const canProposeWording = (exploration) => !exploration?.source?.here;

export const liveProposal = (exploration) => {
  if (!canProposeWording(exploration)) return null;
  const proposal = exploration?.proposal;
  if (!proposal || typeof proposal !== 'object') return null;
  const text = String(proposal.text || '').trim();
  const against = String(proposal.against || '').trim();
  const current = String(exploration?.originalText || '').trim();
  if (!text || !against || text === against || against !== current) return null;
  return { text, against };
};

export const proposeWording = (exploration) => {
  if (!canProposeWording(exploration)) return exploration;
  const text = String(exploration?.provisionalText || '').trim();
  const against = String(exploration?.originalText || '').trim();
  if (!text || !against || text === against) return exploration;
  return { ...exploration, proposal: { text, against } };
};

export const withdrawProposal = (exploration) => (
  exploration?.proposal ? { ...exploration, proposal: null } : exploration
);

export const acceptWording = (exploration) => {
  const proposal = liveProposal(exploration);
  if (!proposal) return exploration;
  return {
    ...exploration,
    originalText: proposal.text,
    provisionalText: proposal.text,
    proposal: null
  };
};

export const beginPressure = (exploration) => {
  if (isPressured(exploration)) return exploration;
  const against = String(exploration?.originalText || '').trim();
  if (!against) return exploration;
  return {
    ...exploration,
    pressure: { against, premise: '', stillHolds: '', unknown: '' }
  };
};

export const endPressure = (exploration) => (
  exploration?.pressure ? { ...exploration, pressure: null } : exploration
);

export const isPressured = (exploration) => {
  const pressure = exploration?.pressure;
  if (!pressure || typeof pressure !== 'object') return false;
  return String(pressure.against || '').trim() === String(exploration?.originalText || '').trim();
};

export const livePressure = (exploration) => {
  if (!isPressured(exploration)) return null;
  const premise = String(exploration.pressure.premise || '').trim();
  if (!premise) return null;
  return {
    against: String(exploration.pressure.against || '').trim(),
    premise,
    stillHolds: String(exploration.pressure.stillHolds || '').trim(),
    unknown: String(exploration.pressure.unknown || '').trim()
  };
};

export const setPressureField = (exploration, field, value) => {
  if (!isPressured(exploration)) return exploration;
  if (field !== 'premise' && field !== 'stillHolds' && field !== 'unknown') return exploration;
  return {
    ...exploration,
    pressure: {
      against: String(exploration.originalText || '').trim(),
      premise: String(exploration.pressure.premise || ''),
      stillHolds: String(exploration.pressure.stillHolds || ''),
      unknown: String(exploration.pressure.unknown || ''),
      [field]: String(value ?? '')
    }
  };
};

export const pressureWayHome = (exploration) => {
  const pressure = livePressure(exploration);
  return pressure ? `For this experiment: ${pressure.premise}` : '';
};

export const inspectableOther = (exploration) => {
  const other = exploration?.other;
  if (!other || other.available === false) return null;
  const passage = String(other.passage || '').trim();
  const first = String(exploration?.source?.passage || '').trim();
  if (!passage || passage === first) return null;
  return other;
};

export const isMeeting = (exploration) => {
  if (!inspectableOther(exploration)) return false;
  const meet = exploration?.meet;
  if (!meet || typeof meet !== 'object') return false;
  return String(meet.against || '').trim() === String(exploration?.originalText || '').trim();
};

const MEET_SLOTS = ['relation', 'limit', 'between'];

const meetSlots = (meet = {}) => Object.fromEntries(
  MEET_SLOTS.map((slot) => [slot, String(meet?.[slot] || '')])
);

export const liveMeet = (exploration) => {
  if (!isMeeting(exploration)) return null;
  const slots = meetSlots(exploration.meet);
  const relation = slots.relation.trim();
  const between = slots.between.trim();
  if (!relation && !between) return null;
  return {
    against: String(exploration.meet.against || '').trim(),
    relation,
    limit: slots.limit.trim(),
    between
  };
};

export const setMeetField = (exploration, field, value) => {
  if (!inspectableOther(exploration)) return exploration;
  if (!MEET_SLOTS.includes(field)) return exploration;
  return {
    ...exploration,
    meet: {
      ...meetSlots(isMeeting(exploration) ? exploration.meet : {}),
      against: String(exploration.originalText || '').trim(),
      [field]: String(value ?? '')
    }
  };
};

export const endMeet = (exploration) => (
  exploration?.meet ? { ...exploration, meet: null } : exploration
);

export const meetWayHome = (exploration) => {
  const meet = liveMeet(exploration);
  if (!meet) return '';
  if (meet.relation) return `They meet: ${meet.relation}`;
  return meet.between.split(/\n/, 1)[0];
};

export const keepsClosedDraft = (exploration) => Boolean(
  String(exploration?.question || '').trim()
  || String(exploration?.returnNote || '').trim()
  || exploration?.placed
  || liveProposal(exploration)
  || livePressure(exploration)
  || liveMeet(exploration)
);

export const forgetExperiment = (live) => createExploration({
  id: live?.id,
  originalText: live?.originalText,
  source: live?.source,
  other: live?.other,
  then: live?.then
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
      other: base.other,
      id: base.id,
      mark: parsed.mark === '!' ? '!' : '',
      status: parsed.status === EXPLORATION_STATUS.open
        ? EXPLORATION_STATUS.open
        : EXPLORATION_STATUS.closed
    };
    const recorded = asThen(base.then, restored.originalText);
    const { then: _ignoredThen, ...withoutThen } = restored;
    return {
      ...withoutThen,
      ...(recorded ? { then: recorded } : {}),
      proposal: liveProposal(restored),
      pressure: isPressured(restored) ? restored.pressure : null,
      meet: isMeeting(restored) ? restored.meet : null
    };
  } catch (_unreadable) {
    return base;
  }
};
