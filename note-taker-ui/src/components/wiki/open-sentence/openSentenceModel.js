import {
  distinctionRecord,
  heldInstrumentFrom,
  recordFailedApplication
} from '../../../utils/distinctionUse';

export { heldInstrumentFrom };

export const EXPLORATION_STATUS = Object.freeze({
  closed: 'closed',
  open: 'open'
});

const asLine = (value) => String(value || '').trim();

const asDay = (value) => {
  const text = asLine(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

const MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]);

const todayStamp = (now = new Date()) => {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export const formatNamedOn = (day) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asDay(day));
  if (!match) return '';
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
};

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
  draft: unlessSame(exploration?.then?.draft, exploration?.distinction)
}, exploration?.originalText, exploration?.source, exploration?.other, exploration?.bearing);

export const createExploration = ({
  id = '',
  originalText = '',
  source = null,
  other = null,
  bearing = null,
  mark = '',
  then = null
} = {}) => {
  const text = String(originalText || '');
  const boundSource = source && typeof source === 'object' ? source : null;
  const boundOther = other && typeof other === 'object' ? other : null;
  const boundBearing = bearing && typeof bearing === 'object' ? bearing : null;
  const recorded = asThen(then, text, boundSource, boundOther, boundBearing);
  return {
    id: String(id || '').trim(),
    originalText: text,
    provisionalText: text,
    title: '',
    writing: '',
    question: '',
    distinction: '',
    mark: mark === '!' ? '!' : '',
    source: boundSource,
    other: boundOther,
    ...(boundBearing ? { bearing: boundBearing } : {}),
    ...(recorded ? { then: recorded } : {}),
    placed: false,
    status: EXPLORATION_STATUS.closed
  };
};

export const openExploration = (exploration) => ({
  ...exploration,
  status: EXPLORATION_STATUS.open
});

export const closeExploration = (exploration) => {
  const { without: _aside, withoutSource: _source, ...rest } = exploration || {};
  return { ...rest, status: EXPLORATION_STATUS.closed };
};

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

export const sourceClip = (source) => {
  if (!source || source.available === false) return '';
  const passage = asLine(source.passage);
  if (!passage) return '';
  const title = asLine(source.title);
  const href = source.here ? '' : asLine(source.href);
  return [`"${passage}"`, title && `— ${title}`, href].filter(Boolean).join('\n');
};

const inspectablePassage = (source, ...sameAs) => {
  if (!source || source.available === false) return null;
  const passage = asLine(source.passage);
  if (!passage || sameAs.some((item) => passage === asLine(item?.passage))) return null;
  return source;
};

export const inspectableOther = (exploration) => inspectablePassage(
  exploration?.other,
  exploration?.source
);

const samePassage = (left, right) => {
  const passage = asLine(left?.passage);
  return Boolean(passage && passage === asLine(right?.passage));
};

const recordedPassage = (source) => {
  const bound = inspectablePassage(source);
  if (!bound) return null;
  const title = asLine(bound.title);
  return title ? { title, passage: asLine(bound.passage) } : { passage: asLine(bound.passage) };
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

export const canRearrange = (exploration) => Boolean(
  recordedPassage(exploration?.source) && inspectableOther(exploration)
);

export const isRearranged = (exploration) => Boolean(
  canRearrange(exploration) && exploration?.rearranged
);

export const tryTheOtherWay = (exploration) => (
  canRearrange(exploration) && !exploration?.rearranged
    ? { ...exploration, rearranged: true }
    : exploration
);

export const putThemBack = (exploration) => (
  exploration?.rearranged ? { ...exploration, rearranged: false } : exploration
);

const firstLine = (value) => String(value || '').split(/\n/, 1)[0];

const setFlag = (exploration, flag, allowed) => (
  allowed && !exploration?.[flag]
    ? { ...exploration, [flag]: true }
    : exploration
);

const clearFlag = (exploration, flag) => {
  if (!exploration?.[flag]) return exploration;
  const { [flag]: _aside, ...rest } = exploration;
  return rest;
};

const restoreOpenFlag = (parsed, restored, flag, allowed) => Boolean(
  restored.status === EXPLORATION_STATUS.open
  && parsed[flag]
  && asLine(parsed.originalText) === asLine(restored.originalText)
  && allowed
);

const paragraphName = (exploration) => asLine(exploration?.originalText);

export const canTryWithoutParagraph = (exploration) => Boolean(
  paragraphName(exploration) && !exploration?.source?.here
);

export const isWithoutParagraph = (exploration) => Boolean(
  canTryWithoutParagraph(exploration) && exploration?.without
);

export const tryWithoutThisParagraph = (exploration) => (
  setFlag(exploration, 'without', canTryWithoutParagraph(exploration))
);

export const bringTheParagraphBack = (exploration) => clearFlag(exploration, 'without');

export const bringParagraphBackLabel = (exploration) => {
  const name = paragraphName(exploration);
  return name ? `Bring “${name}” back` : '';
};

const sourceName = (exploration) => (
  asLine(exploration?.source?.title) || 'this source'
);

export const canTryWithoutSource = (exploration) => Boolean(
  inspectablePassage(exploration?.source)
);

export const isWithoutSource = (exploration) => Boolean(
  canTryWithoutSource(exploration) && exploration?.withoutSource
);

export const tryWithoutThisSource = (exploration) => (
  setFlag(exploration, 'withoutSource', canTryWithoutSource(exploration))
);

export const bringTheSourceBack = (exploration) => clearFlag(exploration, 'withoutSource');

export const bringSourceBackLabel = (exploration) => `Bring ${sourceName(exploration)} back`;

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

const liveAgainst = (value, exploration) => {
  if (!value || typeof value !== 'object') return '';
  const against = asLine(value.against);
  return against && against === asLine(exploration?.originalText) ? against : '';
};

export const liveEssay = (exploration) => {
  const against = liveAgainst(exploration?.essay, exploration);
  const text = asLine(exploration?.essay?.text);
  return against && text ? { text, against } : null;
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

const asInstrumentRecord = (value, current) => {
  if (!value || typeof value !== 'object') return null;
  const definition = asLine(value.definition);
  const against = asLine(value.against);
  if (!definition || !against || against !== current) return null;
  if (!asLine(value.name)) {
    return {
      name: String(value.name || ''),
      definition,
      against
    };
  }
  return distinctionRecord({ ...value, definition, against });
};

export const pendingInstrument = (exploration) => (
  asInstrumentRecord(exploration?.instrument, asLine(exploration?.originalText))
);

export const liveInstrument = (exploration) => {
  const pending = pendingInstrument(exploration);
  return pending && asLine(pending.name) ? pending : null;
};

export const canKeepAsInstrument = (exploration) => {
  const distinction = liveDistinction(exploration);
  if (!distinction) return false;
  return pendingInstrument(exploration)?.definition !== distinction;
};

export const keepAsInstrument = (exploration) => {
  if (!canKeepAsInstrument(exploration)) return exploration;
  return {
    ...exploration,
    instrument: {
      name: '',
      definition: liveDistinction(exploration),
      against: asLine(exploration.originalText)
    }
  };
};

export const setInstrumentName = (exploration, name) => {
  const pending = pendingInstrument(exploration);
  if (!pending) return exploration;
  const text = String(name ?? '');
  if (!asLine(text) && text === '') return leaveInstrument(exploration);
  const next = {
    ...pending,
    name: text
  };
  return {
    ...exploration,
    instrument: asLine(text) ? distinctionRecord({ ...next, against: pending.against }) : next
  };
};

export const leaveInstrument = (exploration) => (
  exploration?.instrument ? { ...exploration, instrument: null } : exploration
);

export const canApplyInstrument = (exploration, held) => {
  const tool = heldInstrumentFrom(held);
  if (!tool || !asLine(exploration?.originalText)) return false;
  if (pendingInstrument(exploration)) return false;
  const distinction = liveDistinction(exploration);
  if (distinction && distinction !== tool.definition) return false;
  return true;
};

export const applyInstrument = (exploration, held) => {
  if (!canApplyInstrument(exploration, held)) return exploration;
  const tool = heldInstrumentFrom(held);
  return {
    ...exploration,
    instrument: distinctionRecord({
      ...tool,
      against: asLine(exploration.originalText),
      appliedAt: todayStamp()
    })
  };
};

export const isAppliedInstrument = (exploration) => {
  const instrument = liveInstrument(exploration);
  if (!instrument) return false;
  if (asLine(instrument.appliedAt) || instrument.inapplicable || instrument.narrowedTo) return true;
  return !liveDistinction(exploration);
};

export const canJudgeApplication = (exploration) => {
  const instrument = liveInstrument(exploration);
  return Boolean(isAppliedInstrument(exploration) && instrument && !instrument.inapplicable && !instrument.narrowedTo);
};

export const markInapplicable = (exploration, { reason = '', at } = {}) => {
  if (!canJudgeApplication(exploration)) return exploration;
  return {
    ...exploration,
    instrument: recordFailedApplication(liveInstrument(exploration), {
      inapplicable: true,
      reason,
      at: asDay(at) || todayStamp()
    })
  };
};

export const proposeNarrowerDefinition = (exploration, { definition, name, reason, at } = {}) => {
  if (!canJudgeApplication(exploration)) return exploration;
  const current = liveInstrument(exploration);
  const next = recordFailedApplication(current, {
    narrower: {
      name: asLine(name) || current.name,
      definition
    },
    reason,
    at: asDay(at) || todayStamp()
  });
  if (!next?.narrowedTo) return exploration;
  return { ...exploration, instrument: next };
};

export const instrumentWayHome = (exploration) => {
  const instrument = liveInstrument(exploration);
  return instrument ? `An instrument: ${instrument.name.split(/\n/, 1)[0]}` : '';
};

const exhibitSlots = (exhibit = {}) => ({
  name: String(exhibit?.name || ''),
  thisWay: String(exhibit?.thisWay || ''),
  otherWay: String(exhibit?.otherWay || ''),
  showing: exhibit?.showing === 'other' ? 'other' : 'this'
});

export const pendingExhibit = (exploration) => {
  const against = liveAgainst(exploration?.exhibit, exploration);
  if (!against) return null;
  return { against, ...exhibitSlots(exploration.exhibit) };
};

export const liveExhibit = (exploration) => {
  const pending = pendingExhibit(exploration);
  if (!pending) return null;
  const thisWay = asLine(pending.thisWay);
  const otherWay = asLine(pending.otherWay);
  if (!thisWay || !otherWay || thisWay === otherWay) return null;
  return {
    ...pending,
    name: asLine(pending.name),
    thisWay,
    otherWay
  };
};

export const canKeepAsExhibit = (exploration) => (
  Boolean(inspectablePassage(exploration?.source) || inspectableOther(exploration))
  && !pendingExhibit(exploration)
);

export const keepAsExhibit = (exploration) => {
  if (!canKeepAsExhibit(exploration)) return exploration;
  return {
    ...exploration,
    exhibit: {
      against: asLine(exploration.originalText),
      ...exhibitSlots()
    }
  };
};

export const setExhibitField = (exploration, field, value) => {
  const pending = pendingExhibit(exploration);
  if (!pending || !['name', 'thisWay', 'otherWay'].includes(field)) return exploration;
  return {
    ...exploration,
    exhibit: {
      ...pending,
      [field]: String(value ?? '')
    }
  };
};

export const setExhibitFields = (exploration, fields = {}) => (
  Object.entries(fields).reduce(
    (walk, [field, value]) => setExhibitField(walk, field, value),
    exploration
  )
);

export const showExhibitWay = (exploration, showing) => {
  const pending = pendingExhibit(exploration);
  if (!pending || (showing !== 'this' && showing !== 'other')) return exploration;
  return {
    ...exploration,
    exhibit: {
      ...pending,
      showing
    }
  };
};

export const leaveExhibit = (exploration) => (
  exploration?.exhibit ? { ...exploration, exhibit: null } : exploration
);

export const exhibitWayHome = (exploration) => {
  const exhibit = liveExhibit(exploration);
  if (!exhibit) return '';
  return `An exhibit: ${firstLine(exhibit.name || exhibit.thisWay)}`;
};

export const pendingRehearsal = (exploration) => {
  const against = liveAgainst(exploration?.rehearsal, exploration);
  if (!against) return null;
  return {
    against,
    attempt: String(exploration.rehearsal.attempt || '')
  };
};

export const liveRehearsal = (exploration) => {
  const pending = pendingRehearsal(exploration);
  const attempt = asLine(pending?.attempt);
  return pending && attempt ? { ...pending, attempt } : null;
};

export const canKeepAsRehearsal = (exploration) => !pendingRehearsal(exploration);

export const keepAsRehearsal = (exploration) => {
  if (!canKeepAsRehearsal(exploration) || !asLine(exploration?.originalText)) return exploration;
  return {
    ...exploration,
    rehearsal: {
      against: asLine(exploration.originalText),
      attempt: ''
    }
  };
};

export const setRehearsalAttempt = (exploration, attempt) => {
  const pending = pendingRehearsal(exploration);
  if (!pending) return exploration;
  const text = String(attempt ?? '');
  if (!asLine(text) && text === '') return leaveRehearsal(exploration);
  return {
    ...exploration,
    rehearsal: {
      ...pending,
      attempt: text
    }
  };
};

export const leaveRehearsal = (exploration) => (
  exploration?.rehearsal ? { ...exploration, rehearsal: null } : exploration
);

export const rehearsalWayHome = (exploration) => {
  const rehearsal = liveRehearsal(exploration);
  return rehearsal ? `A rehearsal: ${firstLine(rehearsal.attempt)}` : '';
};

export const pendingUnwritten = (exploration) => {
  const against = liveAgainst(exploration?.unwritten, exploration);
  if (!against) return null;
  return {
    against,
    question: String(exploration.unwritten.question || ''),
    gap: String(exploration.unwritten.gap || '')
  };
};

export const liveUnwritten = (exploration) => {
  const pending = pendingUnwritten(exploration);
  const question = asLine(pending?.question);
  return pending && question ? { ...pending, question, gap: asLine(pending.gap) } : null;
};

export const canKeepAsUnwritten = (exploration) => !pendingUnwritten(exploration);

export const keepAsUnwritten = (exploration) => {
  if (!canKeepAsUnwritten(exploration) || !asLine(exploration?.originalText)) return exploration;
  return {
    ...exploration,
    unwritten: {
      against: asLine(exploration.originalText),
      question: '',
      gap: ''
    }
  };
};

export const setUnwrittenField = (exploration, field, value) => {
  const pending = pendingUnwritten(exploration);
  if (!pending || (field !== 'question' && field !== 'gap')) return exploration;
  const text = String(value ?? '');
  if (field === 'question' && !asLine(text) && text === '') {
    return leaveUnwritten(exploration);
  }
  return {
    ...exploration,
    unwritten: {
      ...pending,
      [field]: text
    }
  };
};

export const leaveUnwritten = (exploration) => (
  exploration?.unwritten ? { ...exploration, unwritten: null } : exploration
);

export const unwrittenWayHome = (exploration) => {
  const unwritten = liveUnwritten(exploration);
  return unwritten ? `Unwritten: ${firstLine(unwritten.question)}` : '';
};

const asCarryPassage = (value) => {
  const recorded = recordedPassage(value);
  if (!recorded) return null;
  const title = asLine(recorded.title);
  return title ? { title, passage: recorded.passage } : { passage: recorded.passage };
};

const carrySlots = (carry = {}) => ({
  question: String(carry?.question || ''),
  conclusion: String(carry?.conclusion || ''),
  source: asCarryPassage(carry?.source),
  other: asCarryPassage(carry?.other)
});

export const pendingCarry = (exploration) => {
  const against = liveAgainst(exploration?.carry, exploration);
  if (!against) return null;
  return { against, ...carrySlots(exploration.carry) };
};

export const liveCarry = (exploration) => {
  const pending = pendingCarry(exploration);
  const question = asLine(pending?.question);
  const conclusion = asLine(pending?.conclusion);
  if (!pending || !question || !conclusion || !pending.source || !pending.other) return null;
  return {
    against: pending.against,
    question,
    conclusion,
    source: pending.source,
    other: pending.other
  };
};

const pairedInspection = (exploration) => Boolean(
  recordedPassage(exploration?.source) && inspectableOther(exploration)
);

export const canCarryOut = (exploration) => (
  pairedInspection(exploration) && !pendingCarry(exploration)
);

export const beginCarry = (exploration) => {
  if (!canCarryOut(exploration) || !asLine(exploration?.originalText)) return exploration;
  return {
    ...exploration,
    carry: {
      against: asLine(exploration.originalText),
      ...carrySlots()
    }
  };
};

export const leaveCarry = (exploration) => (
  exploration?.carry ? { ...exploration, carry: null } : exploration
);

export const setCarryField = (exploration, field, value) => {
  const pending = pendingCarry(exploration);
  if (!pending || (field !== 'question' && field !== 'conclusion')) return exploration;
  const text = String(value ?? '');
  if (field === 'question' && !asLine(text) && text === '') return leaveCarry(exploration);
  return {
    ...exploration,
    carry: {
      ...pending,
      [field]: text
    }
  };
};

export const setCarryFields = (exploration, fields = {}) => (
  Object.entries(fields).reduce(
    (walk, [field, value]) => setCarryField(walk, field, value),
    exploration
  )
);

const boundCarryPassage = (exploration, slot) => {
  if (slot === 'source') {
    return isWithoutSource(exploration) ? null : recordedPassage(exploration?.source);
  }
  if (slot === 'other') return recordedPassage(inspectableOther(exploration));
  return null;
};

export const includeCarryPassage = (exploration, slot) => {
  const pending = pendingCarry(exploration);
  const recorded = asCarryPassage(boundCarryPassage(exploration, slot));
  if (!pending || !recorded) return exploration;
  return {
    ...exploration,
    carry: {
      ...pending,
      [slot]: recorded
    }
  };
};

export const leaveCarryPassage = (exploration, slot) => {
  const pending = pendingCarry(exploration);
  if (!pending || (slot !== 'source' && slot !== 'other') || !pending[slot]) return exploration;
  return {
    ...exploration,
    carry: {
      ...pending,
      [slot]: null
    }
  };
};

export const canIncludeCarryPassage = (exploration, slot) => {
  const pending = pendingCarry(exploration);
  return Boolean(pending && !pending[slot] && boundCarryPassage(exploration, slot));
};

export const carrySlotName = (exploration, slot) => {
  const pending = pendingCarry(exploration);
  const included = slot === 'source' || slot === 'other' ? pending?.[slot] : null;
  const bound = slot === 'source' ? exploration?.source : exploration?.other;
  return asLine(included?.title) || asLine(bound?.title) || 'this passage';
};

export const canFillCarryQuestion = (exploration) => {
  const pending = pendingCarry(exploration);
  const question = asLine(exploration?.question);
  return Boolean(pending && question && question !== asLine(pending.question));
};

export const fillCarryQuestion = (exploration) => {
  if (!canFillCarryQuestion(exploration)) return exploration;
  return setCarryField(exploration, 'question', String(exploration.question || ''));
};

export const canFillCarryBetween = (exploration) => {
  const pending = pendingCarry(exploration);
  const between = asLine(liveMeet(exploration)?.between);
  return Boolean(pending && between && between !== asLine(pending.conclusion));
};

export const fillCarryBetween = (exploration) => {
  if (!canFillCarryBetween(exploration)) return exploration;
  return setCarryField(exploration, 'conclusion', liveMeet(exploration).between);
};

const namedCarryPassage = (passage) => (
  [asLine(passage?.title), passage?.passage ? `"${passage.passage}"` : '']
    .filter(Boolean)
    .join('\n')
);

export const carryClip = (exploration) => {
  const carry = liveCarry(exploration);
  if (!carry) return '';
  return [
    carry.question,
    namedCarryPassage(carry.source),
    namedCarryPassage(carry.other),
    carry.conclusion
  ].filter(Boolean).join('\n\n');
};

export const carryWayHome = (exploration) => {
  const carry = liveCarry(exploration);
  return carry ? `A snapshot: ${firstLine(carry.question)}` : '';
};

export const CONTRIBUTION_KINDS = Object.freeze([
  'fact',
  'definition',
  'horizon',
  'values',
  'risk'
]);

const KIND_LABELS = Object.freeze({
  fact: 'Disputed facts',
  definition: 'Different definitions',
  horizon: 'Different time horizons',
  values: 'Different values',
  risk: 'Different acceptable risks'
});

export const contributionKindLabel = (kind) => KIND_LABELS[kind] || '';

const asContributionKind = (value) => (
  CONTRIBUTION_KINDS.includes(value) ? value : ''
);

const CONTRIBUTION_TEXT_FIELDS = Object.freeze([
  'question',
  'bothAccept',
  'thisDisputes',
  'otherDisputes',
  'observation'
]);

const contributionSlots = (value = {}) => ({
  question: String(value?.question || ''),
  kind: asContributionKind(value?.kind),
  bothAccept: String(value?.bothAccept || ''),
  thisDisputes: String(value?.thisDisputes || ''),
  otherDisputes: String(value?.otherDisputes || ''),
  observation: String(value?.observation || '')
});

export const pendingContributions = (exploration) => {
  const against = liveAgainst(exploration?.contributions, exploration);
  if (!against) return null;
  return { against, ...contributionSlots(exploration.contributions) };
};

export const liveContributions = (exploration) => {
  const pending = pendingContributions(exploration);
  if (!pending || !asLine(pending.question)) return null;
  if (!pairedInspection(exploration) || isWithoutSource(exploration)) return null;
  return pending;
};

export const canMeetContributions = (exploration) => (
  pairedInspection(exploration)
  && !isWithoutSource(exploration)
  && !pendingContributions(exploration)
);

export const beginContributions = (exploration) => {
  if (!canMeetContributions(exploration) || !asLine(exploration?.originalText)) {
    return exploration;
  }
  return {
    ...exploration,
    contributions: {
      against: asLine(exploration.originalText),
      ...contributionSlots()
    }
  };
};

export const leaveContributions = (exploration) => (
  exploration?.contributions ? { ...exploration, contributions: null } : exploration
);

export const setContributionField = (exploration, field, value) => {
  const pending = pendingContributions(exploration);
  if (!pending || !CONTRIBUTION_TEXT_FIELDS.includes(field)) return exploration;
  const text = String(value ?? '');
  if (field === 'question' && !asLine(text) && text === '') {
    return leaveContributions(exploration);
  }
  return {
    ...exploration,
    contributions: {
      ...pending,
      [field]: text
    }
  };
};

export const setContributionKind = (exploration, kind) => {
  const pending = pendingContributions(exploration);
  if (!pending) return exploration;
  const next = asContributionKind(kind);
  return {
    ...exploration,
    contributions: {
      ...pending,
      kind: pending.kind === next ? '' : next
    }
  };
};

export const setContributionFields = (exploration, fields = {}) => (
  Object.entries(fields).reduce((walk, [field, value]) => (
    field === 'kind'
      ? setContributionKind(walk, value)
      : setContributionField(walk, field, value)
  ), exploration)
);

export const contributionName = (exploration, side) => {
  const bound = side === 'source'
    ? exploration?.source
    : (side === 'other' ? exploration?.other : null);
  if (!bound) {
    return side === 'other' ? 'the other contribution' : 'this contribution';
  }
  return asLine(bound.title)
    || (side === 'other' ? 'the other contribution' : 'this contribution');
};

export const canFillContributionQuestion = (exploration) => {
  const pending = pendingContributions(exploration);
  const question = asLine(exploration?.question);
  return Boolean(pending && question && question !== asLine(pending.question));
};

export const fillContributionQuestion = (exploration) => {
  if (!canFillContributionQuestion(exploration)) return exploration;
  return setContributionField(exploration, 'question', String(exploration.question || ''));
};

export const contributionsWayHome = (exploration) => {
  const live = liveContributions(exploration);
  return live ? `Two contributions: ${firstLine(live.question)}` : '';
};

export const closedWayHome = (exploration) => (
  liveDistinction(exploration)
  || (asLine(exploration?.question) ? 'You left this open.' : '')
  || (liveProposal(exploration) ? 'Proposed, not accepted.' : '')
  || pressureWayHome(exploration)
  || meetWayHome(exploration)
  || essayWayHome(exploration)
  || instrumentWayHome(exploration)
  || exhibitWayHome(exploration)
  || rehearsalWayHome(exploration)
  || unwrittenWayHome(exploration)
  || carryWayHome(exploration)
  || contributionsWayHome(exploration)
);

export const liveDistinction = (exploration) => {
  const against = asLine(exploration?.distinctionAgainst);
  const current = asLine(exploration?.originalText);
  if (against && against !== current) return '';
  return unlessSame(exploration?.distinction, exploration?.question);
};

const CONTENT_STOP = Object.freeze(new Set([
  'also', 'and', 'are', 'been', 'can', 'does', 'for', 'from', 'have', 'into',
  'not', 'one', 'onto', 'still', 'than', 'that', 'the', 'them', 'then', 'they',
  'this', 'versus', 'was', 'were', 'what', 'when', 'which', 'with', 'you', 'your'
]));

const contentWords = (value) => asLine(value).toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter((word) => word.length >= 3 && !CONTENT_STOP.has(word));

const overlapsDistinction = (passage, distinction) => {
  const keys = contentWords(distinction);
  if (keys.length < 2) return false;
  const have = new Set(contentWords(passage));
  return keys.filter((word) => have.has(word)).length >= 2;
};

export const liveBearing = (exploration) => {
  const distinction = liveDistinction(exploration);
  if (!asLine(exploration?.question) || !distinction) return null;
  const bound = inspectablePassage(
    exploration?.bearing,
    exploration?.source,
    exploration?.other
  );
  if (!bound || !overlapsDistinction(bound.passage, distinction)) return null;
  return bound;
};

export const rehearsalStillBeside = (exploration) => {
  const rehearsal = liveRehearsal(exploration);
  if (!rehearsal) return null;
  const bound = isWithoutSource(exploration)
    ? inspectableOther(exploration)
    : (inspectablePassage(exploration?.source) || inspectableOther(exploration));
  if (!bound || overlapsDistinction(bound.passage, rehearsal.attempt)) return null;
  return bound;
};

export const namedOn = (exploration) => (
  liveDistinction(exploration) ? asDay(exploration?.distinctionAt) : ''
);

export const keepsClosedDraft = (exploration, { preserveAuthorship = false } = {}) => Boolean(
  String(exploration?.writing || '').trim()
  || String(exploration?.title || '').trim()
  || (preserveAuthorship && wordingChanged(exploration))
  || exploration?.selectedSource
  || String(exploration?.question || '').trim()
  || String(exploration?.returnNote || '').trim()
  || liveDistinction(exploration)
  || exploration?.placed
  || liveProposal(exploration)
  || livePressure(exploration)
  || liveMeet(exploration)
  || liveEssay(exploration)
  || liveInstrument(exploration)
  || liveExhibit(exploration)
  || liveRehearsal(exploration)
  || liveUnwritten(exploration)
  || liveCarry(exploration)
  || liveContributions(exploration)
);

export const forgetExperiment = (live) => createExploration({
  id: live?.id,
  originalText: live?.originalText,
  source: live?.source,
  other: live?.other,
  bearing: live?.bearing,
  then: live?.then
});

export const tryWording = (exploration, text) => ({
  ...exploration,
  provisionalText: String(text ?? '')
});

export const writeThought = (exploration, writing) => ({
  ...exploration,
  writing: String(writing ?? '')
});

export const titleThought = (exploration, title) => ({
  ...exploration,
  title: String(title ?? '').slice(0, 240)
});

export const thoughtTitle = (exploration) => String(
  exploration?.title?.trim() || exploration?.writing?.split('\n').find(line => line.trim()) ||
  exploration?.question || exploration?.returnNote || exploration?.pressure?.premise ||
  exploration?.pressure?.stillHolds || exploration?.pressure?.unknown ||
  exploration?.meet?.between || exploration?.meet?.relation || exploration?.meet?.limit || exploration?.essay?.text || exploration?.proposal?.text ||
  (exploration?.provisionalText !== exploration?.originalText ? exploration?.provisionalText : '') || ''
).trim();

export const chooseLibraryPassage = (exploration, source) => ({
  ...exploration,
  selectedSource: source || null,
  other: source || exploration.attachedOther || null,
  attachedOther: exploration.attachedOther || (!exploration.selectedSource ? exploration.other : null),
  // The relationship described a specific pair. Keep the person's words,
  // but do not present them as a relationship to a newly chosen passage.
  meet: exploration.meet ? { ...exploration.meet, against: '' } : null
});

export const putItBack = (exploration) => ({
  ...exploration,
  provisionalText: exploration.originalText
});

export const keepQuestion = (exploration, question) => ({
  ...exploration,
  question: String(question ?? '')
});

export const setReturnNote = (exploration, returnNote) => ({ ...exploration, returnNote: String(returnNote ?? '') });

export const setDistinction = (exploration, distinction) => {
  const {
    distinctionAt: previousAt,
    distinctionAgainst: _previousAgainst,
    ...rest
  } = exploration || {};
  const text = String(distinction ?? '');
  if (!asLine(text)) {
    return { ...rest, distinction: '' };
  }
  return {
    ...rest,
    distinction: text,
    distinctionAt: asDay(previousAt) || todayStamp(),
    distinctionAgainst: asLine(rest.originalText)
  };
};

const restoreDistinction = (value, legacyNote, against, at, current) => {
  const distinction = (value == null || value === '') ? asLine(legacyNote) : String(value);
  const bound = asLine(against);
  if (!asLine(distinction) || (bound && bound !== current)) {
    return { distinction: '' };
  }
  return {
    distinction,
    ...(asDay(at) ? { distinctionAt: asDay(at) } : {}),
    ...(bound ? { distinctionAgainst: bound } : {})
  };
};

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

export const hasPersonalWork = (exploration) => {
  const then = liveThen(exploration);
  return Boolean(
    keepsClosedDraft(exploration)
    || wordingChanged(exploration)
    || isPressured(exploration)
    || pendingExhibit(exploration)
    || pendingRehearsal(exploration)
    || pendingUnwritten(exploration)
    || pendingCarry(exploration)
    || pendingContributions(exploration)
    || exploration?.mark
    || then?.question
    || then?.draft
  );
};

export const wikiAcceptedText = (exploration) => String(exploration?.originalText || '');

export const canMakeThisTheTitle = (pageTitle, wording) => {
  const line = asLine(wording);
  return Boolean(line && line !== asLine(pageTitle));
};

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

export const restoreExploration = (raw, fallback, { preserveAuthorship = false } = {}) => {
  const base = fallback || createExploration();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    const restored = {
      ...base,
      ...parsed,
      originalText: base.originalText,
      authoredAgainst: preserveAuthorship && parsed.originalText && parsed.originalText !== base.originalText ? parsed.originalText : '',
      source: base.source,
      other: parsed.selectedSource || base.other,
      attachedOther: base.other,
      bearing: base.bearing,
      id: base.id,
      mark: parsed.mark === '!' ? '!' : '',
      status: parsed.status === EXPLORATION_STATUS.open
        ? EXPLORATION_STATUS.open
        : EXPLORATION_STATUS.closed
    };
    const recorded = asThen(
      base.then,
      restored.originalText,
      restored.source,
      restored.other,
      restored.bearing
    );
    const {
      then: _ignoredThen,
      returnNote: legacyNote,
      distinctionAt: rawAt,
      distinctionAgainst: rawAgainst,
      ...withoutThen
    } = restored;
    return {
      ...withoutThen,
      ...(preserveAuthorship && legacyNote !== undefined ? { returnNote: legacyNote } : {}),
      ...restoreDistinction(
        withoutThen.distinction,
        preserveAuthorship ? undefined : legacyNote,
        rawAgainst,
        rawAt,
        asLine(restored.originalText)
      ),
      ...(recorded ? { then: recorded } : {}),
      proposal: preserveAuthorship ? restored.proposal : liveProposal(restored),
      pressure: preserveAuthorship ? restored.pressure : (isPressured(restored) ? restored.pressure : null),
      meet: restored.meet || null,
      essay: preserveAuthorship ? restored.essay : liveEssay(restored),
      instrument: pendingInstrument(restored),
      exhibit: pendingExhibit(restored),
      rehearsal: pendingRehearsal(restored),
      unwritten: pendingUnwritten(restored),
      carry: pendingCarry(restored),
      contributions: pendingContributions(restored),
      rearranged: Boolean(
        canRearrange(restored)
        && parsed.rearranged
        && samePassage(parsed.source, restored.source)
        && samePassage(parsed.other, restored.other)
      ),
      without: restoreOpenFlag(
        parsed,
        restored,
        'without',
        canTryWithoutParagraph(restored)
      ),
      withoutSource: restoreOpenFlag(
        parsed,
        restored,
        'withoutSource',
        canTryWithoutSource(restored)
      )
    };
  } catch (_unreadable) {
    return base;
  }
};
