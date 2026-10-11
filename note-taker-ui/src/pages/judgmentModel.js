import { normalizeSpaces, sentenceBoundaryTrim } from '../utils/editorialText';
import { buildSourceOpenPath, buildSourceOriginPath } from '../utils/sourceRoutes';

// The Judgment room's read model.
//
// A view is one sentence you hold, the passages for and against it, what would
// change your mind, and a record of what happened to it. Everything here is a
// projection of what is stored on the page's judgment contract. Nothing is
// inferred, and an empty part is absent rather than padded.

const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => normalizeSpaces(value?._id || value?.id || value);
const DAY = 24 * 60 * 60 * 1000;

const time = (value) => {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

/** One sentence, ending where the first sentence ends. */
export const oneSentence = (value, maxLength = 240) => {
  const text = normalizeSpaces(value);
  if (!text) return '';
  const boundary = text.search(/[.!?](\s|$)/);
  const sentence = boundary >= 0 ? text.slice(0, boundary + 1) : text;
  return sentenceBoundaryTrim(sentence, { maxLength, fallback: '' });
};

/* A page is a view when it holds a sentence. The index, the Mirror and the
   reader all ask this one question, so they count the same objects. */
export const isJudgmentPage = (page) => Boolean(normalizeSpaces(page?.judgment?.currentJudgment));

const sameLine = (left, right) => normalizeSpaces(left).toLowerCase() === normalizeSpaces(right).toLowerCase();

const normalizeClaimKey = (value = '') => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** The claim is the sentence. It is the same sentence everywhere it appears. */
export const claimSentence = (page) => (
  normalizeSpaces(page?.judgment?.currentJudgment)
  || normalizeSpaces(page?.judgment?.governingQuestion)
  || normalizeSpaces(page?.title)
);

/* The page title, when it is a name rather than a copy of the sentence. */
export const namedTitle = (page = {}) => {
  const title = normalizeSpaces(page?.title);
  const claim = claimSentence(page);
  if (!title || (claim && sameLine(title, claim))) return '';
  return title;
};

export const judgmentHeadline = (page = {}) => namedTitle(page) || claimSentence(page);

export const formatLedgerDate = (value) => {
  const at = time(value);
  if (Number.isNaN(at)) return '';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/* ---------- the parts of a view ---------- */

/* The confidence you chose, as a word. Stored on the existing 0–1 field so the
   Mirror's calibration reads the same number. */
export const CONFIDENCE = [
  { word: 'I think so', value: 0.6 },
  { word: 'Fairly sure', value: 0.75 },
  { word: 'Sure', value: 0.9 }
];

export const confidenceWord = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return CONFIDENCE.reduce((best, option) => (
    Math.abs(option.value - n) < Math.abs(best.value - n) ? option : best
  )).word;
};

export const VERDICTS = [
  { result: 'held_up', word: 'Held up' },
  { result: 'broke', word: 'Broke' },
  { result: 'partly', word: 'Partly' }
];

const VERDICT_WORDS = {
  held_up: 'held up',
  broke: 'broke',
  partly: 'held up in part',
  unresolvable: 'could not be settled',
  right_for_wrong_reasons: 'right, for the wrong reasons'
};

/* Why and Against read the judgment's own lists first. Pages written by the
   older dossier surfaces only have `assumptions` and the single
   `strongestCounterargument`; those read as the same two columns. */
const reasonLines = (items = []) => list(items)
  .map((item, index) => ({
    id: normalizeSpaces(item?.reasonId) || `reason:${index}`,
    text: normalizeSpaces(item?.text),
    sourceRefIds: list(item?.sourceRefIds),
    sourceLabel: normalizeSpaces(item?.sourceLabel),
    acceptedFrom: normalizeSpaces(item?.acceptedFrom),
    at: item?.createdAt || item?.at || null
  }))
  .filter(line => line.text);

const whyLines = (judgment = {}) => {
  const own = reasonLines(judgment.why);
  if (own.length) return own;
  return reasonLines(list(judgment.assumptions)
    .filter(item => normalizeSpaces(item?.status) !== 'failed')
    .map(item => ({ ...item, reasonId: item?.assumptionId })));
};

const againstLines = (judgment = {}) => {
  const own = reasonLines(judgment.against);
  if (own.length) return own;
  const counter = normalizeSpaces(judgment.strongestCounterargument);
  return counter ? reasonLines([{ reasonId: 'strongest-counterargument', text: counter }]) : [];
};

const changeMindLines = (judgment = {}) => list(judgment.falsifiers)
  .filter(item => normalizeSpaces(item?.status) !== 'retired')
  .map(item => normalizeSpaces(item?.text))
  .filter(Boolean);

/* Where a passage came from, and the door that opens it at the words. */
const passageOf = (page, line) => {
  const ref = list(page?.sourceRefs).find(item => line.sourceRefIds.map(idOf).includes(idOf(item)));
  const label = line.sourceLabel
    || normalizeSpaces(ref?.title)
    || normalizeSpaces(ref?.citationLabel)
    || normalizeSpaces(ref?.provider);
  const href = buildSourceOriginPath(line.acceptedFrom) || (ref ? buildSourceOpenPath(ref) : '');
  return { id: line.id, text: line.text, source: label, href, at: line.at };
};

export const isParked = (page) => normalizeSpaces(page?.judgment?.status) === 'parked';
const setAside = (page) => isParked(page) || normalizeSpaces(page?.judgment?.status) === 'closed';

export const heldSinceOf = (page = {}) => (
  page?.judgment?.startedAt || page?.judgment?.bornAt || page?.createdAt || null
);

const SYSTEM_DECISION = /^judgment-change-/;

/* What happened to the view, oldest first, each a dated plain sentence. Built
   only from what is stored: a line that has no date has no place here. */
export const viewRecord = (page = {}) => {
  const judgment = page?.judgment || {};
  const lines = [];
  const add = (at, text, was = '') => {
    if (Number.isNaN(time(at)) || !text) return;
    lines.push({ id: `${lines.length}:${time(at)}`, at, text, was });
  };
  add(heldSinceOf(page), 'Held.');
  whyLines(judgment).forEach(line => add(line.at, line.sourceLabel
    ? `Filed a passage for, from ${line.sourceLabel}.`
    : 'Wrote a reason for.'));
  againstLines(judgment).forEach(line => add(line.at, line.sourceLabel
    ? `Filed a passage against, from ${line.sourceLabel}.`
    : 'Wrote a reason against.'));
  list(judgment.heldHistory).forEach(entry => add(entry?.until, 'Revised. Was:', normalizeSpaces(entry?.text)));
  list(judgment.resolutionHistory).forEach(entry => add(entry?.setAt, entry?.horizonAt
    ? `Said what would change my mind, by ${formatLedgerDate(entry.horizonAt)}.`
    : 'Said what would change my mind.'));
  list(judgment.verdicts).forEach(verdict => add(
    verdict?.recordedAt,
    `Resolved: ${VERDICT_WORDS[verdict?.result] || 'settled'}.`
  ));
  list(judgment.decisions)
    .filter(decision => !SYSTEM_DECISION.test(normalizeSpaces(decision?.decisionId)))
    .forEach(decision => add(decision?.decidedAt || decision?.createdAt, oneSentence(decision?.summary)));
  if (normalizeSpaces(judgment.status) === 'parked') add(judgment.parkedAt, 'Set aside.');
  return lines.sort((left, right) => time(left.at) - time(right.at));
};

/** The whole view, as one object. Empty parts come back empty. */
export const projectView = (page) => {
  const judgment = page?.judgment || {};
  const verdicts = list(judgment.verdicts);
  const latest = verdicts[verdicts.length - 1] || null;
  return {
    id: idOf(page),
    claim: claimSentence(page),
    heldSince: heldSinceOf(page),
    confidence: confidenceWord(judgment.confidence),
    forPassages: whyLines(judgment).map(line => passageOf(page, line)),
    againstPassages: againstLines(judgment).map(line => passageOf(page, line)),
    test: {
      text: normalizeSpaces(judgment.resolutionCriteria) || changeMindLines(judgment)[0] || '',
      by: judgment.resolutionHorizonAt || null
    },
    resolved: latest ? VERDICT_WORDS[latest.result] || '' : '',
    record: viewRecord(page),
    parked: setAside(page)
  };
};

/* ---------- the index ---------- */

export const heldDaysBetween = (startedAt, now = Date.now()) => {
  const start = time(startedAt);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / DAY));
};

/* "Held 84 days · 3 for · 1 against · moved Oct 12". Each part appears only
   when it is true; a view with nothing filed is just how long it has been held. */
export const indexCardLine = (page = {}, now = Date.now()) => {
  const judgment = page?.judgment || {};
  const days = heldDaysBetween(heldSinceOf(page), now);
  const forCount = whyLines(judgment).length;
  const againstCount = againstLines(judgment).length;
  const held = time(heldSinceOf(page));
  const moved = viewRecord(page)
    .map(line => time(line.at))
    .filter(at => at > held + 60 * 1000)
    .pop();
  return [
    days === 0 ? 'Held today' : `Held ${days} ${days === 1 ? 'day' : 'days'}`,
    forCount ? `${forCount} for` : '',
    againstCount ? `${againstCount} against` : '',
    moved ? `moved ${formatLedgerDate(moved)}` : ''
  ].filter(Boolean).join(' · ');
};

/* Why a judgment goes quiet, and which kind of quiet it is. Kept for the
   weekly brief, which still reads it. */
const AVOIDED_AFTER_DAYS = 21;

export const judgmentActivity = (page, events = [], now = Date.now()) => {
  const judgment = page?.judgment || {};
  const pageId = idOf(page);
  if (normalizeSpaces(judgment.status) === 'parked') return { state: 'parked', arrived: 0, newestAt: null };
  if (page?.evergreen) return { state: 'evergreen', arrived: 0, newestAt: null };
  const touched = time(judgment.lastReviewedAt || page?.updatedAt || null);
  const touchedAt = Number.isNaN(touched) ? 0 : touched;
  const arrivals = list(events)
    .filter(event => list(event?.affectedPageIds).map(idOf).includes(pageId))
    .filter(event => normalizeSpaces(event?.status) !== 'ignored')
    .map(event => time(event?.sourceUpdatedAt || event?.createdAt || null))
    .filter(at => !Number.isNaN(at) && at > touchedAt)
    .sort((left, right) => right - left);
  if (arrivals.length) {
    const state = (now - arrivals[0]) > AVOIDED_AFTER_DAYS * DAY ? 'avoided' : 'live';
    return { state, arrived: arrivals.length, newestAt: new Date(arrivals[0]).toISOString() };
  }
  if (!changeMindLines(judgment).length) return { state: 'unfalsifiable', arrived: 0, newestAt: null };
  return { state: 'quiet', arrived: 0, newestAt: null };
};

export const activityNote = ({ state, arrived } = {}) => {
  if (state === 'avoided') {
    return `${arrived} thing${arrived === 1 ? '' : 's'} arrived about this and ${arrived === 1 ? 'is' : 'are'} unread`;
  }
  if (state === 'parked') return 'Parked';
  if (state === 'evergreen') return 'Kept';
  return '';
};

export const lessonLines = (judgment = {}) => list(judgment.lessons)
  .map((item, index) => ({
    id: normalizeSpaces(item?.lessonId) || `lesson:${index}`,
    text: normalizeSpaces(item?.text),
    closedAs: normalizeSpaces(item?.closedAs),
    at: item?.at || null
  }))
  .filter(line => line.text);

/* One claim, one row. Write-time dedupe prevents new copies; this fold keeps
   legacy duplicates out of the list: most evidence wins, then most recent. */
const claimWeight = (page) => {
  const judgment = page?.judgment || {};
  return [
    whyLines(judgment).length + againstLines(judgment).length,
    time(judgment.lastReviewedAt || page?.updatedAt || 0) || 0
  ];
};

const strongerClaim = (candidate, incumbent) => {
  const left = claimWeight(candidate);
  const right = claimWeight(incumbent);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return String(idOf(candidate)) > String(idOf(incumbent));
};

export const foldJudgmentPages = (pages = []) => {
  const byKey = new Map();
  list(pages).forEach((page, index) => {
    const key = normalizeClaimKey(claimSentence(page));
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, { page, index });
    else if (strongerClaim(page, existing.page)) existing.page = page;
  });
  return [...byKey.values()].sort((left, right) => left.index - right.index);
};

/** The index: one row per view, newest movement first. The middle argument is
    the source-event list older callers still pass; the card no longer reads it. */
export const buildJudgmentIndex = (pages = [], _events = [], now = Date.now()) => foldJudgmentPages(
  list(pages).filter(isJudgmentPage)
)
  .map(({ page }) => ({
    id: idOf(page),
    title: namedTitle(page),
    headline: judgmentHeadline(page),
    sentence: claimSentence(page),
    card: indexCardLine(page, now),
    state: setAside(page) ? 'parked' : 'open',
    updatedAt: page?.judgment?.lastReviewedAt || page?.updatedAt || null
  }))
  .filter(item => item.id && item.sentence)
  .sort((left, right) => (time(right.updatedAt) || 0) - (time(left.updatedAt) || 0));

/* ---------- writes ---------- */

export const parkJudgment = (page) => ({ ...(page?.judgment || {}), status: 'parked' });

export const resumeJudgment = (page) => ({ ...(page?.judgment || {}), status: 'monitoring', parkedAt: null });

const persistReason = (line = {}) => {
  const next = {
    reasonId: line.id,
    text: line.text,
    sourceRefIds: line.sourceRefIds,
    sourceLabel: line.sourceLabel
  };
  if (line.acceptedFrom) next.acceptedFrom = line.acceptedFrom;
  if (line.at) next.createdAt = line.at;
  return next;
};

const appendReason = (judgment, field, fields) => {
  const target = field === 'why' ? 'why' : 'against';
  const current = target === 'why' ? whyLines(judgment) : againstLines(judgment);
  return {
    ...judgment,
    [target]: [
      ...current.map(persistReason),
      { ...fields, createdAt: new Date().toISOString() }
    ]
  };
};

/* Accepting a line the Partner retrieved appends it to For or Against, with
   the origin it came from, or sets it as what would change your mind. */
export const acceptProposalIntoJudgment = (page, proposal, field) => {
  const text = normalizeSpaces(proposal?.body || proposal?.sentence);
  if (field === 'criteria' || field === 'changeMindIf') {
    return writeLineIntoJudgment(page, text, 'changeMindIf');
  }
  return appendReason(page?.judgment || {}, field, {
    text,
    acceptedFrom: normalizeSpaces(proposal?.acceptedFrom || proposal?.id),
    sourceLabel: normalizeSpaces(proposal?.sourceLabel || proposal?.source)
  });
};

/* A line written by hand, from wherever a judgment is started. */
export const writeLineIntoJudgment = (page, text, field) => {
  const judgment = page?.judgment || {};
  const line = normalizeSpaces(text);
  if (!line) return judgment;
  if (field === 'why' || field === 'against') return appendReason(judgment, field, { text: line });
  if (field === 'changeMindIf') {
    return { ...judgment, falsifiers: [...list(judgment.falsifiers), { text: line }] };
  }
  if (field === 'whatIDid') {
    return {
      ...judgment,
      decisions: [
        ...list(judgment.decisions),
        { summary: line, decidedAt: new Date().toISOString(), status: 'taken' }
      ]
    };
  }
  return judgment;
};

export const judgmentIdOf = (held) => (
  typeof held === 'string' || typeof held === 'number'
    ? String(held)
    : String(held?.id || '')
);

/* Writing a judgment down, wherever you are when you decide to. A judgment is
   a wiki page carrying a judgment contract, which is two calls. Sending `kind`
   as well would make the server ask for a governing question; a claim is not a
   question, so this is the one place that knows to leave it out. */
export const createJudgment = async (claim, { createPage, updatePage, now = Date.now() } = {}) => {
  const sentence = oneSentence(claim);
  if (!sentence) throw new Error('A judgment starts with a sentence.');
  const page = await createPage({ title: sentence, pageType: 'topic' });
  const id = idOf(page);
  if (!id) throw new Error('The judgment was not created.');
  const held = normalizeClaimKey(page?.judgment?.currentJudgment);
  const reused = Boolean(held && (held === normalizeClaimKey(sentence) || page?.reusedExisting));
  const startedAt = page?.judgment?.startedAt || page?.createdAt || now;
  if (reused) return { id, reused: true, heldDays: heldDaysBetween(startedAt, now), sentence };
  await updatePage(id, {
    judgment: {
      currentJudgment: sentence,
      startedAt: new Date(now).toISOString()
    }
  });
  return { id, reused: false, heldDays: 0, sentence };
};
