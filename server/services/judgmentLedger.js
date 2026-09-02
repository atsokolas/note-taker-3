/**
 * Stage 3 — The Judgment Ledger.
 *
 * Five clocks, never one timeline. Each fact names its clock, who wrote it,
 * how precise the time is, and when it was inked. Reconstruction asks what
 * was believed, not what later became true. Replay walks evidence → action →
 * outcome. Lessons travel forward as proposals. Nothing here rewrites the
 * past.
 */

const crypto = require('crypto');
const { wordBoundaryTrim } = require('../lib/editorialText');

const CLOCKS = Object.freeze(['evidence', 'expectation', 'decision', 'review', 'outcome']);
const PRECISION = Object.freeze(['exact', 'day', 'month', 'year', 'unknown']);
const AUTHORS = Object.freeze(['user', 'world', 'system']);
const CAUSAL = Object.freeze(['evidence', 'inference']);
const CONFIDENCE = Object.freeze(['certain', 'probable', 'uncertain', '']);
const OUTCOME_RESULTS = Object.freeze(['held', 'missed', 'mixed', 'silent', 'unknown']);
const LESSON_RESOLUTIONS = Object.freeze(['accepted', 'rejected', 'narrowed', 'retired']);
const VERDICTS = Object.freeze(['held_up', 'broke', 'partly', 'unresolvable', 'right_for_wrong_reasons']);
const SETTLED = new Set(['parked', 'closed', 'archived']);

const CLOCK_LABEL = Object.freeze({
  evidence: 'When the world spoke',
  expectation: 'When you said you would know',
  decision: 'When you decided',
  review: 'When you looked again',
  outcome: 'When the result arrived'
});

const AUTHOR_LABEL = Object.freeze({
  user: 'You',
  world: 'The world',
  system: 'Read from the record'
});

const VERDICT_LABEL = Object.freeze({
  held_up: 'Held up',
  broke: 'Broke',
  partly: 'Partly',
  unresolvable: 'Unresolvable',
  right_for_wrong_reasons: 'Right for the wrong reasons'
});

const POSTMORTEM = Object.freeze({
  held_up: 'Did it hold for the reasons you thought?',
  broke: 'What did you miss?',
  partly: 'Which part survived?',
  unresolvable: 'What would you need to know?',
  right_for_wrong_reasons: 'What was the real reason?'
});

const SHORT_MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]);

const clean = (value = '', limit = 4000) => wordBoundaryTrim(String(value || '').replace(/\s+/g, ' ').trim(), { maxLength: limit });
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const time = (value) => {
  if (value === undefined || value === null || value === '') return NaN;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

const asDate = (value) => {
  const ms = time(value);
  return Number.isNaN(ms) ? null : new Date(ms);
};

const iso = (value) => {
  const date = asDate(value);
  return date ? date.toISOString() : null;
};

const isClock = (value) => CLOCKS.includes(String(value || ''));
const isPrecision = (value) => PRECISION.includes(String(value || ''));
const isAuthor = (value) => AUTHORS.includes(String(value || ''));
const isCausal = (value) => CAUSAL.includes(String(value || ''));
const isVerdict = (value) => VERDICTS.includes(String(value || ''));
const isConfidence = (value) => CONFIDENCE.includes(String(value || ''));
const isLessonResolution = (value) => LESSON_RESOLUTIONS.includes(String(value || ''));

const uniqueIds = (values) => Array.from(new Set(list(values).map(idOf).filter(Boolean)));

const tokens = (value) => clean(value, 8000)
  .toLowerCase()
  .split(/[^a-z0-9]+/i)
  .filter((word) => word.length > 3);

const overlap = (left, right) => {
  const other = new Set(tokens(right));
  return tokens(left).filter((word) => other.has(word)).length;
};

const knownAt = (stamp, at) => {
  const when = time(stamp);
  const instant = time(at);
  if (Number.isNaN(when) || Number.isNaN(instant)) return false;
  return when <= instant;
};

const laterThan = (stamp, at) => {
  const when = time(stamp);
  const instant = time(at);
  if (Number.isNaN(when) || Number.isNaN(instant)) return false;
  return when > instant;
};

const inferPrecision = (value) => {
  const date = asDate(value);
  if (!date) return 'unknown';
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  if (hours === 0 && minutes === 0 && seconds === 0 && ms === 0) return 'day';
  if (hours === 12 && minutes === 0 && seconds === 0 && ms === 0) return 'day';
  return 'exact';
};

/**
 * The ledger prints days.
 *
 * An hour was printed for anything recorded to the second, which made the
 * machine's timestamp the loudest thing in a row whose point is the sentence
 * underneath it. Nobody reads a ledger to learn what happened at 14:20:36.
 *
 * The month and year forms stay: a record that only knows the month must not
 * be printed as though it knows the day. That is the one thing a date here is
 * carrying, and it is the reason this is not simply one format.
 *
 * The client has the same rule, because it can move a time cursor without a
 * round trip. Both must agree, so both are tested against the same shapes.
 */
const formatByPrecision = (value, precision) => {
  const date = asDate(value);
  const kind = isPrecision(precision) ? precision : inferPrecision(value);
  if (!date || kind === 'unknown') return '';
  if (kind === 'year') return String(date.getUTCFullYear());
  if (kind === 'month') return `${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return `${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
};

const explainDate = (fact = {}) => {
  const clock = isClock(fact.clock) ? fact.clock : '';
  const precision = isPrecision(fact.precision) ? fact.precision : inferPrecision(fact.occurredAt);
  const occurred = formatByPrecision(fact.occurredAt, precision);
  const recorded = formatByPrecision(fact.recordedAt, 'exact') || formatByPrecision(fact.recordedAt, 'day');
  const late = Boolean(
    fact.occurredAt
    && fact.recordedAt
    && time(fact.occurredAt) < time(fact.recordedAt)
    && (precision === 'exact' ? time(fact.recordedAt) - time(fact.occurredAt) > 60 * 1000 : true)
  );
  return {
    clock,
    label: CLOCK_LABEL[clock] || '',
    when: occurred,
    precision,
    // A note only earns its place when the day itself is in doubt. "The hour
    // is not known" explained a missing hour back when other rows showed one.
    precisionNote: precision === 'unknown'
      ? 'The day is not known.'
      : precision === 'year'
        ? 'The year is known; the day is not.'
        : precision === 'month'
          ? 'The month is known; the day is not.'
          : '',
    author: AUTHOR_LABEL[fact.authoredBy] || AUTHOR_LABEL.system,
    authoredBy: fact.authoredBy || 'system',
    recorded: recorded,
    late,
    lateNote: late ? `Written down ${formatByPrecision(fact.recordedAt, inferPrecision(fact.recordedAt))}.` : '',
    causalKind: isCausal(fact.causalKind) ? fact.causalKind : 'evidence'
  };
};

const factIdFor = (parts) => `clock_${digest(parts).slice(0, 24)}`;

const clockFact = ({
  clock,
  occurredAt = null,
  recordedAt = new Date(),
  precision = '',
  authoredBy = 'user',
  sourceRefIds = [],
  sourceLabel = '',
  summary = '',
  causalKind = 'evidence',
  relatedId = '',
  derived = false,
  factId = '',
  receiptId = '',
  revisionId = null,
  claimHash = ''
} = {}) => {
  if (!isClock(clock)) {
    const error = new Error('clock must be evidence, expectation, decision, review, or outcome.');
    error.statusCode = 400;
    error.code = 'invalid_clock';
    throw error;
  }
  const author = isAuthor(authoredBy) ? authoredBy : 'system';
  const occurred = asDate(occurredAt);
  const recorded = asDate(recordedAt) || new Date();
  const safePrecision = isPrecision(precision)
    ? precision
    : (occurred ? inferPrecision(occurred) : 'unknown');
  if (!occurred && safePrecision !== 'unknown') {
    const error = new Error('A dated clock needs a time, or precision must be unknown.');
    error.statusCode = 400;
    error.code = 'fabricated_precision';
    throw error;
  }
  if (causalKind && !isCausal(causalKind)) {
    const error = new Error('A causal claim must be evidence or an inference.');
    error.statusCode = 400;
    error.code = 'unlabeled_inference';
    throw error;
  }
  const core = {
    clock,
    occurredAt: occurred,
    recordedAt: recorded,
    precision: occurred ? safePrecision : 'unknown',
    authoredBy: author,
    sourceRefIds: uniqueIds(sourceRefIds),
    sourceLabel: clean(sourceLabel, 240),
    summary: clean(summary, 2000),
    causalKind: isCausal(causalKind) ? causalKind : 'evidence',
    relatedId: clean(relatedId, 160)
  };
  return Object.freeze({
    ...core,
    factId: clean(factId, 80) || factIdFor({ clock, relatedId: core.relatedId, occurredAt: iso(occurred), recordedAt: iso(recorded), summary: core.summary }),
    derived: Boolean(derived),
    receiptId: clean(receiptId, 300),
    revisionId: revisionId || null,
    claimHash: clean(claimHash, 128),
    recordHash: digest(core)
  });
};

const persistedClocks = (page = {}) => list(plain(page)?.judgment?.clocks).map((row) => {
  try {
    return clockFact({ ...plain(row), derived: false });
  } catch (_error) {
    return null;
  }
}).filter(Boolean);

const derivedFromLine = (clock, item, { authoredBy = 'user', relatedPrefix, summary, sourceRefIds, sourceLabel }) => {
  const at = item?.createdAt || item?.at || item?.decidedAt || item?.recordedAt || item?.observedAt || item?.setAt;
  if (!time(at)) return null;
  return clockFact({
    clock,
    occurredAt: at,
    recordedAt: item?.recordedAt || item?.createdAt || at,
    precision: inferPrecision(at),
    authoredBy,
    sourceRefIds: sourceRefIds || item?.sourceRefIds || item?.evidenceSourceRefIds || [],
    sourceLabel,
    summary,
    relatedId: item?.reasonId || item?.unknownId || item?.decisionId || item?.verdictId || item?.lessonId || `${relatedPrefix}:${summary}`,
    derived: true
  });
};

const derivedClocks = (page = {}) => {
  const raw = plain(page) || {};
  const judgment = plain(raw.judgment) || {};
  const facts = [];
  const push = (fact) => {
    if (!fact) return;
    facts.push(fact);
  };

  if (judgment.bornAt || judgment.startedAt || raw.createdAt) {
    push(clockFact({
      clock: 'decision',
      occurredAt: judgment.bornAt || judgment.startedAt || raw.createdAt,
      recordedAt: judgment.bornAt || judgment.startedAt || raw.createdAt,
      precision: inferPrecision(judgment.bornAt || judgment.startedAt || raw.createdAt),
      authoredBy: judgment.bornAt ? 'user' : 'system',
      summary: clean(judgment.currentJudgment || raw.title, 400) || 'The claim was held.',
      relatedId: 'bornAt',
      derived: true
    }));
  }

  if (judgment.resolutionCriteria) {
    push(clockFact({
      clock: 'expectation',
      occurredAt: judgment.resolutionHorizonAt || judgment.resolutionSetAt,
      recordedAt: judgment.resolutionSetAt || judgment.bornAt,
      precision: judgment.resolutionHorizonAt ? inferPrecision(judgment.resolutionHorizonAt) : 'unknown',
      authoredBy: 'user',
      summary: judgment.resolutionCriteria,
      relatedId: list(judgment.resolutionHistory).at(-1)?.receiptId || 'expectation',
      derived: true
    }));
  }

  list(judgment.why).forEach((line) => push(derivedFromLine('evidence', line, {
    relatedPrefix: 'why',
    summary: line.text,
    sourceLabel: line.sourceLabel
  })));
  list(judgment.against).forEach((line) => push(derivedFromLine('evidence', line, {
    relatedPrefix: 'against',
    summary: line.text,
    sourceLabel: line.sourceLabel
  })));
  list(judgment.unknowns).forEach((line) => push(derivedFromLine('review', line, {
    relatedPrefix: 'unknown',
    summary: line.question
  })));
  list(judgment.verdicts).forEach((verdict) => {
    push(clockFact({
      clock: 'review',
      occurredAt: verdict.recordedAt,
      recordedAt: verdict.recordedAt,
      precision: inferPrecision(verdict.recordedAt),
      authoredBy: 'user',
      sourceRefIds: verdict.evidenceSourceRefIds,
      summary: VERDICT_LABEL[verdict.result] || verdict.result,
      relatedId: verdict.verdictId,
      derived: true
    }));
  });
  list(judgment.decisions).forEach((decision) => {
    if (decision.decidedAt || decision.createdAt) {
      push(clockFact({
        clock: 'decision',
        occurredAt: decision.decidedAt || decision.createdAt,
        recordedAt: decision.createdAt || decision.decidedAt,
        precision: inferPrecision(decision.decidedAt || decision.createdAt),
        authoredBy: decision.createdBy === 'ai_proposed' ? 'system' : 'user',
        sourceRefIds: decision.sourceRefIds,
        summary: decision.summary,
        relatedId: decision.decisionId,
        derived: true
      }));
    }
    if (decision.reviewAt) {
      push(clockFact({
        clock: 'review',
        occurredAt: decision.reviewAt,
        recordedAt: decision.reviewAt,
        precision: inferPrecision(decision.reviewAt),
        authoredBy: 'user',
        summary: decision.summary,
        relatedId: `${decision.decisionId}:review`,
        derived: true
      }));
    }
    if (decision.outcome?.observedAt) {
      push(clockFact({
        clock: 'outcome',
        occurredAt: decision.outcome.observedAt,
        recordedAt: decision.outcome.reviewedAt || decision.outcome.observedAt,
        precision: inferPrecision(decision.outcome.observedAt),
        authoredBy: 'user',
        sourceRefIds: decision.outcome.evidenceSourceRefIds,
        summary: decision.outcome.summary || decision.outcome.lesson,
        relatedId: `${decision.decisionId}:outcome`,
        derived: true
      }));
    }
  });
  list(judgment.outcomes).forEach((outcome) => {
    push(clockFact({
      clock: 'outcome',
      occurredAt: outcome.observedAt,
      recordedAt: outcome.recordedAt || outcome.observedAt,
      precision: outcome.precision || inferPrecision(outcome.observedAt),
      authoredBy: 'user',
      sourceRefIds: outcome.sourceRefIds,
      summary: outcome.result,
      relatedId: outcome.outcomeId,
      derived: true
    }));
  });

  return facts;
};

const sameFact = (left, right) => (
  left.clock === right.clock
  && (left.relatedId && left.relatedId === right.relatedId
    || (iso(left.occurredAt) === iso(right.occurredAt) && left.summary === right.summary))
);

const clocksOf = (page = {}) => {
  const stored = persistedClocks(page);
  const extras = derivedClocks(page).filter((derived) => (
    !stored.some((row) => sameFact(row, derived))
  ));
  return [...stored, ...extras].sort((left, right) => (
    (time(left.occurredAt) || time(left.recordedAt) || 0)
    - (time(right.occurredAt) || time(right.recordedAt) || 0)
  ));
};

const clocksKnownAt = (page, at) => clocksOf(page).filter((fact) => knownAt(fact.recordedAt, at));

const lineageAfter = (page, at) => clocksOf(page)
  .filter((fact) => laterThan(fact.recordedAt, at))
  .map((fact) => ({
    factId: fact.factId,
    clock: fact.clock,
    summary: fact.summary,
    recordedAt: iso(fact.recordedAt),
    note: 'Written later. The past does not move.'
  }));

const sourceById = (page = {}) => {
  const map = new Map();
  list(plain(page)?.sourceRefs).forEach((ref) => {
    const key = idOf(ref);
    if (key) map.set(key, ref);
  });
  return map;
};

const cite = (page, sourceId) => {
  const ref = sourceById(page).get(String(sourceId || ''));
  if (!ref) {
    return {
      id: String(sourceId || ''),
      resolved: false,
      absence: 'This source is not on the case.'
    };
  }
  return {
    id: idOf(ref),
    resolved: true,
    label: clean(ref.citationLabel || ref.provider || ref.title || ref.url, 180),
    href: clean(ref.url, 500)
  };
};

const citationsAt = ({ page, snapshot, sourceRefIds = [] }) => uniqueIds(sourceRefIds).map((sourceId) => {
  const then = cite(snapshot || {}, sourceId);
  if (then.resolved) return then;
  const now = cite(page || {}, sourceId);
  if (now.resolved) {
    return {
      id: sourceId,
      resolved: false,
      absence: 'This source arrived later.',
      laterLabel: now.label
    };
  }
  return {
    id: sourceId,
    resolved: false,
    absence: 'This citation no longer resolves.'
  };
});

const latestRevisionAt = (revisions = [], at) => {
  const instant = time(at);
  if (Number.isNaN(instant)) return null;
  return list(revisions)
    .map(plain)
    .filter((revision) => knownAt(revision.createdAt, at))
    .sort((left, right) => time(left.createdAt) - time(right.createdAt))
    .at(-1) || null;
};

const snapshotAt = ({ page, revisions = [], at }) => {
  const revision = latestRevisionAt(revisions, at);
  if (revision?.after) {
    return { ...plain(revision.after), _id: idOf(page), createdAt: revision.createdAt };
  }
  const born = plain(page)?.createdAt || plain(page)?.judgment?.bornAt;
  if (born && laterThan(born, at)) return null;
  return plain(page);
};

const linesKnownAt = (items, at, stamp = (item) => item?.createdAt || item?.at) => (
  list(items).filter((item) => {
    const when = time(stamp(item));
    if (Number.isNaN(when)) return true;
    return knownAt(stamp(item), at);
  })
);

const reconstructAt = ({ page, revisions = [], at } = {}) => {
  const instant = asDate(at);
  if (!instant) {
    return { known: false, reason: 'Name a moment.', at: null, clocks: [], lineage: [], citations: [] };
  }
  const snapshot = snapshotAt({ page, revisions, at: instant });
  if (!snapshot) {
    return {
      known: false,
      reason: 'This case did not exist yet.',
      at: instant.toISOString(),
      clocks: [],
      lineage: lineageAfter(page, instant),
      citations: []
    };
  }
  const judgment = plain(snapshot.judgment) || {};
  const why = linesKnownAt(judgment.why, instant);
  const against = linesKnownAt(judgment.against, instant);
  const unknowns = linesKnownAt(judgment.unknowns, instant);
  const decisions = linesKnownAt(judgment.decisions, instant, (item) => item.decidedAt || item.createdAt);
  const citedIds = [
    ...why.flatMap((line) => list(line.sourceRefIds)),
    ...against.flatMap((line) => list(line.sourceRefIds)),
    ...clocksKnownAt(page, instant).flatMap((fact) => fact.sourceRefIds)
  ];
  return {
    known: true,
    at: instant.toISOString(),
    posture: judgment.decisionPosture || '',
    status: judgment.status || '',
    claim: clean(judgment.currentJudgment, 8000),
    confidence: judgment.confidence == null ? null : judgment.confidence,
    questions: unknowns.map((item) => clean(item.question, 2000)).filter(Boolean),
    evidence: {
      why: why.map((line) => clean(line.text, 2000)).filter(Boolean),
      against: against.map((line) => clean(line.text, 2000)).filter(Boolean)
    },
    decisions: decisions.map((item) => clean(item.summary, 2000)).filter(Boolean),
    clocks: clocksKnownAt(page, instant),
    citations: citationsAt({ page, snapshot, sourceRefIds: citedIds }),
    lineage: lineageAfter(page, instant)
  };
};

const isPivotal = (fact, frames) => {
  if (fact.clock === 'outcome') return true;
  if (fact.clock === 'decision' && !fact.derived) return true;
  if (fact.clock === 'review' && /held up|broke|partly|unresolvable|wrong reasons/i.test(fact.summary)) return true;
  if (fact.clock === 'evidence' && frames.filter((row) => row.clock === 'evidence').length === 1) return true;
  if (fact.clock === 'expectation') return true;
  return false;
};

const replayDecision = (page = {}) => {
  const frames = clocksOf(page).map((fact, index, all) => {
    const explained = explainDate(fact);
    const citations = citationsAt({
      page,
      snapshot: page,
      sourceRefIds: fact.sourceRefIds
    });
    const unlabeled = Boolean(fact.summary) && fact.causalKind !== 'evidence' && fact.causalKind !== 'inference'
      ? 'inference'
      : fact.causalKind;
    return {
      index,
      factId: fact.factId,
      clock: fact.clock,
      label: CLOCK_LABEL[fact.clock],
      summary: fact.summary,
      source: citations[0] || (fact.sourceLabel ? { resolved: true, label: fact.sourceLabel } : null),
      citations,
      causalKind: unlabeled || 'evidence',
      pivotal: false,
      occurredAt: iso(fact.occurredAt),
      recordedAt: iso(fact.recordedAt),
      explained
    };
  });
  frames.forEach((frame, index) => {
    frame.pivotal = isPivotal({ ...clocksOf(page)[index], summary: frame.summary, derived: clocksOf(page)[index]?.derived }, frames);
  });
  const evidence = frames.find((frame) => frame.clock === 'evidence');
  const action = frames.find((frame) => frame.clock === 'decision') || frames.find((frame) => frame.clock === 'expectation');
  const outcome = frames.find((frame) => frame.clock === 'outcome') || frames.filter((frame) => frame.clock === 'review').at(-1);
  const parts = [
    evidence?.summary ? `Knew ${evidence.summary.replace(/\.$/, '')}` : '',
    action?.summary ? `then ${action.summary.replace(/\.$/, '')}` : '',
    outcome?.summary ? `and later ${outcome.summary.replace(/\.$/, '')}` : ''
  ].filter(Boolean);
  return {
    frames,
    summary: parts.length ? `${parts.join('; ')}.` : '',
    pivotal: frames.filter((frame) => frame.pivotal).map((frame) => frame.factId)
  };
};

const postmortemQuestion = (verdict) => POSTMORTEM[String(verdict || '')] || POSTMORTEM.held_up;

const outcomeRecord = ({
  result = '',
  observedAt = null,
  recordedAt = new Date(),
  sourceRefIds = [],
  sourceLabel = '',
  confidence = '',
  silence = false,
  question = '',
  answer = '',
  lesson = '',
  verdictId = '',
  verdictSnapshot = '',
  precision = '',
  outcomeId = ''
} = {}) => {
  const safeConfidence = isConfidence(confidence) ? confidence : '';
  const skipped = Boolean(silence) || !clean(answer);
  const observed = asDate(observedAt);
  const recorded = asDate(recordedAt) || new Date();
  const core = {
    result: clean(result, 40) || (skipped ? 'silent' : 'unknown'),
    observedAt: observed,
    recordedAt: recorded,
    precision: observed ? (isPrecision(precision) ? precision : inferPrecision(observed)) : 'unknown',
    sourceRefIds: uniqueIds(sourceRefIds),
    sourceLabel: clean(sourceLabel, 240),
    confidence: skipped ? '' : safeConfidence,
    silence: skipped,
    question: clean(question, 400),
    answer: skipped ? '' : clean(answer, 4000),
    lesson: clean(lesson, 2000),
    verdictId: clean(verdictId, 160),
    verdictSnapshot: clean(verdictSnapshot, 40)
  };
  return Object.freeze({
    ...core,
    outcomeId: clean(outcomeId, 80) || `outcome_${digest({ ...core, at: iso(recorded) }).slice(0, 24)}`,
    recordHash: digest(core)
  });
};

const liveStatus = (page = {}) => {
  const status = clean(plain(page)?.judgment?.status);
  return !SETTLED.has(status);
};

const claimText = (page = {}) => clean(
  plain(page)?.judgment?.currentJudgment || plain(page)?.title,
  8000
);

const sourceIdsOf = (page = {}) => uniqueIds([
  ...list(plain(page)?.sourceRefs).map(idOf),
  ...list(plain(page)?.judgment?.why).flatMap((line) => list(line.sourceRefIds)),
  ...list(plain(page)?.judgment?.against).flatMap((line) => list(line.sourceRefIds))
]);

const dependsOnIds = (page = {}) => uniqueIds(list(plain(page)?.judgment?.dependsOn).map((row) => row.pageId));

const relevance = (live, settled) => {
  if (idOf(live) && idOf(live) === idOf(settled)) return null;
  const sharedEdge = dependsOnIds(live).some((pageId) => (
    pageId === idOf(settled) || dependsOnIds(settled).includes(pageId)
  )) || dependsOnIds(settled).includes(idOf(live));
  if (sharedEdge) return 'kinship';
  const liveSources = new Set(sourceIdsOf(live));
  if (sourceIdsOf(settled).some((sourceId) => liveSources.has(sourceId))) return 'shared evidence';
  if (overlap(claimText(live), claimText(settled)) >= 2) return 'the same words';
  return null;
};

const settledLessons = (pages = []) => list(pages).flatMap((page) => {
  const judgment = plain(page)?.judgment || {};
  const closed = SETTLED.has(clean(judgment.status)) || list(judgment.verdicts).length > 0 || list(judgment.outcomes).length > 0;
  if (!closed) return [];
  return list(judgment.lessons).map((lesson) => ({
    lessonId: clean(lesson.lessonId, 120),
    text: clean(lesson.text, 2000),
    at: iso(lesson.at),
    closedAs: clean(lesson.closedAs, 40),
    pageId: idOf(page),
    claim: claimText(page)
  })).filter((lesson) => lesson.lessonId && lesson.text);
});

const alreadyResolved = (live, lesson) => list(plain(live)?.judgment?.lessonApplications).some((row) => (
  clean(row.lessonId) === lesson.lessonId
  && idOf(row.sourcePageId) === lesson.pageId
));

const proposeLessons = ({ livePage, settledPages = [] } = {}) => {
  if (!liveStatus(livePage)) return [];
  return settledLessons(settledPages)
    .filter((lesson) => lesson.pageId !== idOf(livePage))
    .filter((lesson) => !alreadyResolved(livePage, lesson))
    .map((lesson) => {
      const settled = list(settledPages).find((page) => idOf(page) === lesson.pageId);
      const why = settled ? relevance(livePage, settled) : null;
      if (!why) return null;
      return {
        applicationId: `apply_${digest(`${idOf(livePage)}:${lesson.pageId}:${lesson.lessonId}`).slice(0, 24)}`,
        lessonId: lesson.lessonId,
        text: lesson.text,
        sourcePageId: lesson.pageId,
        sourceClaim: lesson.claim,
        proposed: true,
        asserted: false,
        relevance: why,
        status: 'proposed'
      };
    })
    .filter(Boolean);
};

const applyLessonResolution = ({
  livePage,
  lesson,
  status,
  narrowedText = '',
  note = '',
  at = new Date()
} = {}) => {
  if (!isLessonResolution(status)) {
    const error = new Error('A lesson may be accepted, rejected, narrowed, or retired.');
    error.statusCode = 400;
    error.code = 'invalid_lesson_resolution';
    throw error;
  }
  const original = {
    lessonId: clean(lesson?.lessonId, 120),
    text: clean(lesson?.text, 2000),
    sourcePageId: idOf(lesson?.sourcePageId || lesson?.pageId)
  };
  const recorded = {
    applicationId: clean(lesson?.applicationId, 80) || `apply_${digest(`${idOf(livePage)}:${original.lessonId}`).slice(0, 24)}`,
    lessonId: original.lessonId,
    sourcePageId: original.sourcePageId,
    sourceText: original.text,
    status,
    proposedAt: asDate(lesson?.proposedAt) || asDate(at),
    resolvedAt: asDate(at),
    narrowedText: status === 'narrowed' ? clean(narrowedText || original.text, 2000) : '',
    note: clean(note, 2000)
  };
  const copy = status === 'accepted' || status === 'narrowed'
    ? {
      lessonId: `lesson_${digest(`${recorded.applicationId}:${status}`).slice(0, 24)}`,
      text: status === 'narrowed' ? recorded.narrowedText : original.text,
      closedAs: '',
      at: asDate(at),
      sourcePageId: original.sourcePageId,
      sourceLessonId: original.lessonId
    }
    : null;
  return { application: recorded, lesson: copy, original };
};

const momentsOf = (page = {}, revisions = []) => {
  const stamps = [
    ...clocksOf(page).flatMap((fact) => [fact.occurredAt, fact.recordedAt]),
    ...list(revisions).map((revision) => revision.createdAt),
    plain(page)?.createdAt,
    plain(page)?.judgment?.bornAt
  ];
  const unique = Array.from(new Set(stamps.map(iso).filter(Boolean)));
  return unique
    .map((stamp) => new Date(stamp))
    .sort((left, right) => left - right)
    .map((date) => date.toISOString());
};

const ledgerFor = ({ page, revisions = [], settledPages = [], at = null } = {}) => {
  const reconstructed = at ? reconstructAt({ page, revisions, at }) : null;
  const replay = replayDecision(page);
  const latestVerdict = list(plain(page)?.judgment?.verdicts).at(-1) || null;
  return {
    clocks: clocksOf(page).map((fact) => ({ ...fact, explained: explainDate(fact) })),
    moments: momentsOf(page, revisions),
    reconstructed,
    replay,
    postmortem: latestVerdict
      ? {
        question: postmortemQuestion(latestVerdict.result),
        verdictId: latestVerdict.verdictId,
        verdict: latestVerdict.result,
        asked: true
      }
      : null,
    outcomes: list(plain(page)?.judgment?.outcomes),
    lessons: proposeLessons({ livePage: page, settledPages })
  };
};

module.exports = {
  AUTHORS,
  AUTHOR_LABEL,
  CAUSAL,
  CLOCK_LABEL,
  CLOCKS,
  CONFIDENCE,
  LESSON_RESOLUTIONS,
  OUTCOME_RESULTS,
  POSTMORTEM,
  PRECISION,
  VERDICT_LABEL,
  VERDICTS,
  applyLessonResolution,
  clockFact,
  clocksOf,
  explainDate,
  inferPrecision,
  isVerdict,
  ledgerFor,
  momentsOf,
  outcomeRecord,
  postmortemQuestion,
  proposeLessons,
  reconstructAt,
  replayDecision
};
