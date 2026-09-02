import { wordBoundaryTrim } from '../utils/editorialText';
import { formatCalendarDate } from '../utils/calendarDate';
/**
 * Client projection of the Judgment Ledger. The server is the source of
 * clocks, receipts, and reconstruction against revisions. This file only
 * names what the page can already see, so a time cursor can move without a
 * round trip.
 */

export const CLOCKS = Object.freeze(['evidence', 'expectation', 'decision', 'review', 'outcome']);

export const CLOCK_LABEL = Object.freeze({
  evidence: 'When the world spoke',
  expectation: 'When you said you would know',
  decision: 'When you decided',
  review: 'When you looked again',
  outcome: 'When the result arrived'
});

export const AUTHOR_LABEL = Object.freeze({
  user: 'You',
  world: 'The world',
  system: 'Read from the record'
});

export const VERDICT_LABEL = Object.freeze({
  held_up: 'Held up',
  broke: 'Broke',
  partly: 'Partly',
  unresolvable: 'Unresolvable',
  right_for_wrong_reasons: 'Right for the wrong reasons'
});

const clean = (value = '', limit = 4000) => wordBoundaryTrim(value, { maxLength: limit });
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => String(value?._id || value?.id || value || '').trim();

const time = (value) => {
  if (value === undefined || value === null || value === '') return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

const asDate = (value) => {
  const ms = time(value);
  return Number.isNaN(ms) ? null : new Date(ms);
};

export const inferPrecision = (value) => {
  const date = asDate(value);
  if (!date) return 'unknown';
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  if ((hours === 0 || hours === 12) && minutes === 0 && seconds === 0) return 'day';
  return 'exact';
};

/**
 * The ledger prints days.
 *
 * It used to print `2026-08-18 14:20:36 UTC` for anything recorded to the
 * second, which made the machine's timestamp the loudest thing in a row whose
 * point is the sentence underneath it. Nobody reads a ledger to find out what
 * happened at 14:20:36. They read it to find out what happened, and roughly
 * when — and the day is the honest unit for that.
 *
 * The month and year forms stay, because a record that only knows the month
 * must not be printed as though it knows the day. That is the one distinction
 * a date here is carrying.
 */
const formatByPrecision = (value, precision) => {
  const date = asDate(value);
  const kind = precision || inferPrecision(value);
  if (!date || kind === 'unknown') return '';
  if (kind === 'year') return String(date.getUTCFullYear());
  if (kind === 'month') {
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  }
  return formatCalendarDate(date, { year: true });
};

export const explainDate = (fact = {}) => {
  const clock = CLOCKS.includes(fact.clock) ? fact.clock : '';
  const precision = fact.precision || inferPrecision(fact.occurredAt);
  const late = Boolean(fact.occurredAt && fact.recordedAt && time(fact.occurredAt) < time(fact.recordedAt));
  return {
    clock,
    label: CLOCK_LABEL[clock] || '',
    when: formatByPrecision(fact.occurredAt, precision),
    precision,
    // A note only earns its place when the day itself is in doubt. "The hour
    // is not known" explained a missing hour back when other rows showed one.
    precisionNote: precision === 'unknown'
      ? 'The day is not known.'
      : precision === 'month'
        ? 'The month is known; the day is not.'
        : '',
    author: AUTHOR_LABEL[fact.authoredBy] || AUTHOR_LABEL.system,
    late,
    lateNote: late ? `Written down ${formatByPrecision(fact.recordedAt, inferPrecision(fact.recordedAt))}.` : '',
    causalKind: fact.causalKind === 'inference' ? 'inference' : 'evidence'
  };
};

const knownAt = (stamp, at) => {
  const when = time(stamp);
  const instant = time(at);
  if (Number.isNaN(when) || Number.isNaN(instant)) return false;
  return when <= instant;
};

const linesKnownAt = (items, at) => list(items).filter((item) => {
  const stamp = item?.createdAt || item?.at || item?.decidedAt;
  if (!time(stamp)) return true;
  return knownAt(stamp, at);
});

export const reconstructAt = ({ page, at } = {}) => {
  const instant = asDate(at);
  if (!instant) return { known: false, reason: 'Name a moment.', evidence: { why: [], against: [] }, questions: [], citations: [] };
  const born = page?.createdAt || page?.judgment?.bornAt;
  if (born && time(born) > instant.getTime()) {
    return { known: false, reason: 'This case did not exist yet.', evidence: { why: [], against: [] }, questions: [], citations: [] };
  }
  const judgment = page?.judgment || {};
  const why = linesKnownAt(judgment.why, instant);
  const against = linesKnownAt(judgment.against, instant);
  const unknowns = linesKnownAt(judgment.unknowns, instant);
  const sources = new Map(list(page?.sourceRefs).map((ref) => [idOf(ref), ref]));
  const cited = [...why, ...against].flatMap((line) => list(line.sourceRefIds));
  return {
    known: true,
    at: instant.toISOString(),
    posture: judgment.decisionPosture || '',
    claim: clean(judgment.currentJudgment, 8000),
    questions: unknowns.map((item) => clean(item.question)).filter(Boolean),
    evidence: {
      why: why.map((line) => clean(line.text)).filter(Boolean),
      against: against.map((line) => clean(line.text)).filter(Boolean)
    },
    citations: cited.map((sourceId) => {
      const ref = sources.get(String(sourceId));
      if (ref) return { id: sourceId, resolved: true, label: clean(ref.citationLabel || ref.title, 180) };
      return { id: sourceId, resolved: false, absence: 'This citation no longer resolves.' };
    })
  };
};

export const replayDecision = (page = {}, ledger = {}) => {
  if (ledger?.replay?.frames) return ledger.replay;
  const facts = list(page?.judgment?.clocks);
  const frames = facts.map((fact, index) => ({
    index,
    factId: fact.factId || `clock:${index}`,
    clock: fact.clock,
    label: CLOCK_LABEL[fact.clock],
    summary: fact.summary,
    pivotal: fact.clock === 'outcome' || fact.clock === 'decision' || fact.clock === 'expectation',
    causalKind: fact.causalKind === 'inference' ? 'inference' : 'evidence',
    explained: explainDate(fact)
  }));
  const evidence = frames.find((frame) => frame.clock === 'evidence');
  const action = frames.find((frame) => frame.clock === 'decision') || frames.find((frame) => frame.clock === 'expectation');
  const outcome = frames.find((frame) => frame.clock === 'outcome') || frames.filter((frame) => frame.clock === 'review').at(-1);
  const parts = [
    evidence?.summary ? `Knew ${String(evidence.summary).replace(/\.$/, '')}` : '',
    action?.summary ? `then ${String(action.summary).replace(/\.$/, '')}` : '',
    outcome?.summary ? `and later ${String(outcome.summary).replace(/\.$/, '')}` : ''
  ].filter(Boolean);
  return {
    frames,
    summary: parts.length ? `${parts.join('; ')}.` : '',
    pivotal: frames.filter((frame) => frame.pivotal).map((frame) => frame.factId)
  };
};

const tokens = (value) => clean(value).toLowerCase().split(/[^a-z0-9]+/i).filter((word) => word.length > 3);

export const proposeLessons = ({ livePage, settledPages = [] } = {}) => {
  if (['parked', 'closed', 'archived'].includes(clean(livePage?.judgment?.status))) return [];
  const liveClaim = clean(livePage?.judgment?.currentJudgment);
  const liveSources = new Set(list(livePage?.sourceRefs).map(idOf));
  return list(settledPages).flatMap((page) => {
    if (idOf(page) === idOf(livePage)) return [];
    const lessons = list(page?.judgment?.lessons);
    if (!lessons.length) return [];
    const settledClaim = clean(page?.judgment?.currentJudgment);
    const shared = list(page?.sourceRefs).some((ref) => liveSources.has(idOf(ref)));
    const words = tokens(liveClaim).filter((word) => tokens(settledClaim).includes(word)).length;
    if (!shared && words < 2) return [];
    return lessons.map((lesson) => ({
      applicationId: `${idOf(page)}:${lesson.lessonId}`,
      lessonId: lesson.lessonId,
      text: lesson.text,
      sourcePageId: idOf(page),
      sourceClaim: settledClaim,
      proposed: true,
      asserted: false,
      status: 'proposed',
      relevance: shared ? 'shared evidence' : 'the same words'
    }));
  });
};
