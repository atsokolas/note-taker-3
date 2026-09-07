export const EXPLORATION_STATUS = Object.freeze({
  closed: 'closed',
  open: 'open'
});

const asLine = (value) => String(value || '').trim();

const unlessSame = (value, ...sameAs) => {
  const text = asLine(value);
  return text && !sameAs.map(asLine).includes(text) ? text : '';
};

const liveDoors = (source) => (
  [asLine(source?.href), asLine(source?.originalHref)].filter(Boolean)
);

const historicalDoor = (value, ...today) => {
  const taken = today.flatMap(liveDoors);
  const href = asLine(value?.href);
  const original = asLine(value?.originalHref);
  if (href && !taken.includes(href)) {
    const articleId = asLine(value?.articleId);
    const highlightId = asLine(value?.highlightId);
    return {
      href,
      ...(value?.isLibrary ? { isLibrary: true } : {}),
      ...(articleId ? { articleId } : {}),
      ...(highlightId ? { highlightId } : {})
    };
  }
  if (original && !taken.includes(original) && original !== href) {
    return { href: original };
  }
  return null;
};

const asRecordedPassage = (value, ...today) => {
  const passage = asLine(value?.passage);
  if (!passage || today.some((item) => passage === asLine(item?.passage))) return null;
  const title = asLine(value?.title);
  const aroundBefore = asLine(value?.aroundBefore);
  const aroundAfter = asLine(value?.aroundAfter);
  const door = historicalDoor(value, ...today);
  return {
    ...(title ? { title } : {}),
    passage,
    ...(aroundBefore ? { aroundBefore } : {}),
    ...(aroundAfter ? { aroundAfter } : {}),
    ...(door || {})
  };
};

const recordedSources = (value, ...today) => (
  (Array.isArray(value?.sources) ? value.sources : []).reduce((list, item) => {
    const recorded = asRecordedPassage(item, ...today, ...list);
    return recorded ? [...list, recorded] : list;
  }, [])
);

const asThen = (value, currentText, ...today) => {
  const text = asLine(value?.text);
  const now = asLine(currentText);
  if (!text || !now || text === now) return null;
  const sources = recordedSources(value, ...today);
  const question = asLine(value?.question);
  const draft = unlessSame(value?.draft, text, question);
  return {
    text,
    ...(sources.length ? { sources } : {}),
    ...(question ? { question } : {}),
    ...(draft ? { draft } : {})
  };
};

export const liveThen = (exploration) => asThen({
  ...(exploration?.then || {}),
  question: unlessSame(exploration?.then?.question, exploration?.question),
  draft: unlessSame(exploration?.then?.draft, exploration?.returnNote)
}, exploration?.originalText, exploration?.source, exploration?.other);

export const createExploration = ({
  id = '',
  originalText = '',
  source = null,
  other = null,
  mark = '',
  then = null
} = {}) => {
  const text = String(originalText || '');
  const boundSource = source && typeof source === 'object' ? source : null;
  const boundOther = other && typeof other === 'object' ? other : null;
  const recorded = asThen(then, text, boundSource, boundOther);
  return {
    id: String(id || '').trim(),
    originalText: text,
    provisionalText: text,
    question: '',
    returnNote: '',
    mark: mark === '!' ? '!' : '',
    source: boundSource,
    other: boundOther,
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

export const proposeWording = (exploration, from = exploration?.provisionalText) => {
  if (!canProposeWording(exploration)) return exploration;
  const text = String(from ?? '').trim();
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

const PRESSURE_SLOTS = ['premise', 'stillHolds', 'unknown'];

const pressureSlots = (pressure = {}) => Object.fromEntries(
  PRESSURE_SLOTS.map((slot) => [slot, String(pressure?.[slot] || '')])
);

export const beginPressure = (exploration) => {
  if (isPressured(exploration)) return exploration;
  const against = String(exploration?.originalText || '').trim();
  if (!against) return exploration;
  return {
    ...exploration,
    pressure: { against, ...pressureSlots() }
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
  const slots = pressureSlots(exploration.pressure);
  const premise = slots.premise.trim();
  if (!premise) return null;
  return {
    against: String(exploration.pressure.against || '').trim(),
    premise,
    stillHolds: slots.stillHolds.trim(),
    unknown: slots.unknown.trim()
  };
};

export const setPressureField = (exploration, field, value) => {
  if (!isPressured(exploration) || !PRESSURE_SLOTS.includes(field)) return exploration;
  return {
    ...exploration,
    pressure: {
      against: String(exploration.originalText || '').trim(),
      ...pressureSlots(exploration.pressure),
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

const recordedPassage = (source) => {
  if (!source || source.available === false) return null;
  const passage = asLine(source.passage);
  if (!passage) return null;
  const title = asLine(source.title);
  return title ? { title, passage } : { passage };
};

export const pressurePassages = (exploration) => {
  const seen = new Set();
  return [
    exploration?.source,
    inspectableOther(exploration),
    ...(liveThen(exploration)?.sources || [])
  ].reduce((list, source) => {
    const recorded = recordedPassage(source);
    if (!recorded || seen.has(recorded.passage)) return list;
    seen.add(recorded.passage);
    return [...list, recorded];
  }, []);
};

export const keepPressureName = (source, passages = []) => {
  const name = asLine(source?.title) || 'this passage';
  const same = passages.filter((item) => (asLine(item.title) || 'this passage') === name);
  if (same.length < 2) return name;
  return asLine(same[0]?.passage) === asLine(source?.passage) ? name : `earlier ${name}`;
};

export const keepPressurePassage = (exploration, field, source) => {
  if (field !== 'stillHolds' && field !== 'unknown') return exploration;
  const recorded = recordedPassage(source);
  if (!recorded) return exploration;
  if (!pressurePassages(exploration).some((item) => item.passage === recorded.passage)) {
    return exploration;
  }
  const slots = pressureSlots(exploration?.pressure);
  if ([slots.stillHolds, slots.unknown].map((text) => text.trim()).includes(recorded.passage)) {
    return exploration;
  }
  return setPressureField(exploration, field, recorded.passage);
};

export const isMeeting = (exploration) => {
  if (!inspectableOther(exploration)) return false;
  const meet = exploration?.meet;
  if (!meet || typeof meet !== 'object') return false;
  return String(meet.against || '').trim() === String(exploration?.originalText || '').trim();
};

const MEET_SLOTS = ['relation', 'limit', 'between'];

export const meetSlots = (meet = {}) => Object.fromEntries(
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

export const canKeepBetweenAsExperiment = (exploration) => (
  Boolean(liveMeet(exploration)?.between) && !livePressure(exploration)
);

export const keepBetweenAsExperiment = (exploration) => {
  if (!canKeepBetweenAsExperiment(exploration)) return exploration;
  return setPressureField(beginPressure(exploration), 'premise', liveMeet(exploration).between);
};

export const canProposeBetween = (exploration) => {
  const between = liveMeet(exploration)?.between;
  if (!between || !canProposeWording(exploration)) return false;
  if (between === String(exploration.originalText || '').trim()) return false;
  if (between === String(exploration.provisionalText || '').trim()) return false;
  return liveProposal(exploration)?.text !== between;
};

export const liveEssay = (exploration) => {
  const essay = exploration?.essay;
  if (!essay || typeof essay !== 'object') return null;
  const text = String(essay.text || '').trim();
  const against = String(essay.against || '').trim();
  const current = String(exploration?.originalText || '').trim();
  if (!text || !against || against !== current) return null;
  return { text, against };
};

export const canKeepBetweenAsEssay = (exploration) => {
  const between = liveMeet(exploration)?.between;
  return Boolean(between) && liveEssay(exploration)?.text !== between;
};

export const keepBetweenAsEssay = (exploration) => {
  if (!canKeepBetweenAsEssay(exploration)) return exploration;
  return {
    ...exploration,
    essay: {
      against: String(exploration.originalText || '').trim(),
      text: liveMeet(exploration).between
    }
  };
};

export const leaveEssay = (exploration) => (
  exploration?.essay ? { ...exploration, essay: null } : exploration
);

export const essayWayHome = (exploration) => {
  const essay = liveEssay(exploration);
  return essay ? `An essay: ${essay.text.split(/\n/, 1)[0]}` : '';
};

export const keepsClosedDraft = (exploration) => Boolean(
  String(exploration?.question || '').trim()
  || String(exploration?.returnNote || '').trim()
  || exploration?.placed
  || liveProposal(exploration)
  || livePressure(exploration)
  || liveMeet(exploration)
  || liveEssay(exploration)
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
    const recorded = asThen(base.then, restored.originalText, restored.source, restored.other);
    const { then: _ignoredThen, ...withoutThen } = restored;
    return {
      ...withoutThen,
      ...(recorded ? { then: recorded } : {}),
      proposal: liveProposal(restored),
      pressure: isPressured(restored) ? restored.pressure : null,
      meet: isMeeting(restored) ? restored.meet : null,
      essay: liveEssay(restored)
    };
  } catch (_unreadable) {
    return base;
  }
};
