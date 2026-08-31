import { buildSourceOpenPath, buildSourceOriginPath, isLibraryHref } from '../utils/sourceRoutes';
import { answersHeldSentence } from './judgmentHold';
import { sentenceBoundaryTrim } from '../utils/editorialText';

// The Judgment page's read model.
//
// Judgment compounds human judgment: agents retrieve, the human accepts. The
// page shows one claim and four human-labelled fields — Why, Against, I'd
// change my mind if, What I did — and nothing else until there is something
// else to say. Everything here is a projection of what is actually stored on
// the wiki page's judgment contract. Nothing is inferred, nothing is filled in
// to keep a section from being empty: an empty section is absent, not a box.

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => clean(value?._id || value?.id || value);

const time = (value) => {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

/** Tiptap answers arrive as a doc; the page only ever renders one sentence. */
export const docText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return clean(node);
  if (Array.isArray(node)) return clean(node.map(docText).filter(Boolean).join(' '));
  if (typeof node !== 'object') return '';
  const own = typeof node.text === 'string' ? node.text : '';
  const child = Array.isArray(node.content) ? docText(node.content) : '';
  return clean([own, child].filter(Boolean).join(' '));
};

/** One sentence, ending where the first sentence ends. */
export const oneSentence = (value, maxLength = 240) => {
  const text = clean(value);
  if (!text) return '';
  const boundary = text.search(/[.!?](\s|$)/);
  const sentence = boundary >= 0 ? text.slice(0, boundary + 1) : text;
  return sentenceBoundaryTrim(sentence, { maxLength, fallback: '' });
};

/* A page is a judgment page when it holds a judgment — meaning any of the four
   things this page renders. It used to ask only about the claim, the kind, the
   falsifiers and the ledger, which left out Why and Against entirely. So a page
   whose Why and Against were filled in through the wiki's own dossier panel —
   stored as `assumptions` and `strongestCounterargument`, which the four fields
   below read and render — was not counted, and never appeared on the index. You
   could fill a judgment in and then not find it. This asks the same question
   the page answers: is there anything under the claim? */
export const isJudgmentPage = (page) => {
  const judgment = page?.judgment || {};
  return Boolean(
    clean(judgment.currentJudgment)
    || clean(judgment.kind)
    || whyLines(judgment).length
    || againstLines(judgment).length
    || changeMindLines(judgment).length
    || whatIDidLines(judgment).length
  );
};

const sameLine = (left, right) => clean(left).toLowerCase() === clean(right).toLowerCase();

/** Normalized claim identity: case, punctuation, and extra space do not make a second hold. */
export const normalizeClaimKey = (value = '') => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** The claim is the sentence. It is the same sentence everywhere it appears. */
export const claimSentence = (page) => (
  clean(page?.judgment?.currentJudgment)
  || clean(page?.judgment?.governingQuestion)
  || clean(page?.title)
);

/* The wiki name, when it is actually a name.

   Graph, links, same-title grouping, and every other room already key off
   `page.title`. A judgment starts with the claim written into that field as
   well, because a case has to exist as a wiki page from the first sentence.
   That copy is not a name yet. Naming the page is what lets the case join
   the wiki hierarchy without rewriting what you think. */
export const namedTitle = (page = {}) => {
  const title = clean(page?.title);
  const claim = claimSentence(page);
  if (!title || (claim && sameLine(title, claim))) return '';
  return title;
};

/** What pops up: the name if there is one, otherwise the claim. */
export const judgmentHeadline = (page = {}) => namedTitle(page) || claimSentence(page);

export { isLibraryHref };

const sourceLabel = (ref) => (
  clean(ref?.citationLabel)
  || clean(ref?.provider)
  || clean(ref?.title)
);

/* Library evidence arrives as highlight:article:highlight or article:article.
   Wiki already opens those in the library rather than reprinting the title;
   Why and Against should do the same. */
export const sourceHrefFromOrigin = (origin = '', fallbackUrl = '') => {
  return buildSourceOriginPath(origin, fallbackUrl);
};

/** Where a retrieved answer came from, as one line: the citations the answer
 *  carried, in the human's own naming for them. Returns '' when the answer
 *  cited nothing, which the rail says out loud rather than hiding. */
export const answerProvenance = (page, answer) => {
  const byId = new Map(list(page?.sourceRefs).map(ref => [idOf(ref), ref]));
  const labels = [];
  list(answer?.citations).forEach((citation) => {
    const ref = byId.get(idOf(citation?.sourceRefId ?? citation)) || citation;
    const label = sourceLabel(ref);
    if (label && !labels.includes(label)) labels.push(label);
  });
  return labels.slice(0, 3).join(' · ');
};

const sourceKey = (source) => source?.href || source?.id || source?.label;

const sourcesForLine = (page, line = {}) => {
  const byId = new Map(list(page?.sourceRefs).map(ref => [idOf(ref), ref]));
  const seen = new Set();
  const sources = [];
  const add = (source) => {
    const key = sourceKey(source);
    if (!source.label || !key || seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  };
  list(line.sourceRefIds).map(idOf).forEach((refId) => {
    const ref = byId.get(refId);
    const label = sourceLabel(ref);
    if (!ref || !label) return;
    add({ id: refId, label, href: buildSourceOpenPath(ref) });
  });
  const literal = clean(line.sourceLabel);
  if (literal) {
    add({
      id: `label:${literal}`,
      label: literal,
      href: sourceHrefFromOrigin(line.acceptedFrom)
    });
  }
  return sources;
};

const numberCitations = (lines = []) => {
  const numbers = new Map();
  let next = 1;
  return lines.map((line) => ({
    ...line,
    sources: list(line.sources).map((source) => {
      const key = sourceKey(source);
      if (!numbers.has(key)) numbers.set(key, next++);
      return { ...source, n: numbers.get(key) };
    })
  }));
};

const uniqueSources = (lines = []) => {
  const seen = new Set();
  const sources = [];
  lines.forEach((line) => {
    list(line.sources).forEach((source) => {
      const key = sourceKey(source);
      if (!key || seen.has(key)) return;
      seen.add(key);
      sources.push(source);
    });
  });
  return sources;
};

const reasonLines = (items = [], prefix) => list(items)
  .map((item, index) => ({
    id: clean(item?.reasonId) || `${prefix}:${index}`,
    text: clean(item?.text),
    sourceRefIds: list(item?.sourceRefIds),
    sourceLabel: clean(item?.sourceLabel),
    acceptedFrom: clean(item?.acceptedFrom),
    at: item?.at || item?.createdAt || null
  }))
  .filter(line => line.text);

/* Why and Against read the judgment's own lists first. Pages written by the
   older dossier surfaces only have `assumptions` and the single
   `strongestCounterargument`; those read as the same two fields rather than
   showing the human a blank page over a storage detail. */
const whyLines = (judgment = {}) => {
  const own = reasonLines(judgment.why, 'why');
  if (own.length) return own;
  return list(judgment.assumptions)
    .filter(item => clean(item?.status) !== 'failed')
    .map((item, index) => ({
      id: clean(item?.assumptionId) || `assumption:${index}`,
      text: clean(item?.text),
      sourceRefIds: list(item?.sourceRefIds),
      sourceLabel: '',
      acceptedFrom: '',
      at: item?.at || item?.createdAt || null
    }))
    .filter(line => line.text);
};

const againstLines = (judgment = {}) => {
  const own = reasonLines(judgment.against, 'against');
  if (own.length) return own;
  const counter = clean(judgment.strongestCounterargument);
  return counter ? [{
    id: 'strongest-counterargument',
    text: counter,
    sourceRefIds: [],
    sourceLabel: '',
    acceptedFrom: '',
    at: null
  }] : [];
};

const changeMindLines = (judgment = {}) => list(judgment.falsifiers)
  .filter(item => clean(item?.status) !== 'retired')
  .map((item, index) => ({
    id: clean(item?.falsifierId) || `falsifier:${index}`,
    text: clean(item?.text)
  }))
  .filter(line => line.text);

/* What I did is a ledger. Lines are ordered oldest first and are never
   rewritten — a cancelled decision stays on the page as a thing that was
   decided, because that is what happened. */
const whatIDidLines = (judgment = {}) => list(judgment.decisions)
  .map((item, index) => ({
    id: clean(item?.decisionId) || `decision:${index}`,
    text: clean(item?.summary),
    at: item?.decidedAt || item?.createdAt || null,
    status: clean(item?.status) || 'planned',
    order: index
  }))
  .filter(line => line.text)
  .sort((left, right) => {
    const delta = (time(left.at) || 0) - (time(right.at) || 0);
    return Number.isNaN(delta) || delta === 0 ? left.order - right.order : delta;
  });

/* The review is not on the page until the review date. Then one block arrives
   and asks the human what happened. The answer is never inferred from
   anything the agents observed. */
const reviewBlock = (judgment = {}, now = Date.now()) => {
  const dated = list(judgment.decisions)
    .map(item => ({
      id: clean(item?.decisionId),
      summary: clean(item?.summary),
      reviewAt: item?.reviewAt || null,
      outcome: item?.outcome || {}
    }))
    .filter(item => item.reviewAt || item.outcome?.observedAt);
  if (!dated.length) return null;
  const latest = dated
    .slice()
    .sort((left, right) => (time(right.reviewAt) || 0) - (time(left.reviewAt) || 0))[0];

  const observedAt = latest.outcome?.observedAt || null;
  if (observedAt) {
    return {
      state: 'observed',
      decisionId: latest.id,
      at: observedAt,
      summary: clean(latest.outcome.summary),
      lesson: clean(latest.outcome.lesson)
    };
  }
  const due = time(latest.reviewAt);
  if (!Number.isNaN(due) && now >= due) {
    return { state: 'due', decisionId: latest.id, at: latest.reviewAt, summary: '', lesson: '' };
  }
  return null;
};

const sameLocalDay = (a, b) => (
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate()
);

/* "Since November. You looked this morning." Both halves come from real
   timestamps; a half with no timestamp behind it simply is not written. */
export const provenanceLine = (page, now = Date.now()) => {
  const judgment = page?.judgment || {};
  const parts = [];
  const startedAt = judgment.bornAt
    || judgment.startedAt
    || whatIDidLines(judgment)[0]?.at
    || null;
  const started = time(startedAt);
  if (!Number.isNaN(started)) {
    const date = new Date(started);
    // Inside a year the month names itself. Past that it needs the year, or
    // "Since November" quietly means one of several Novembers.
    const withinAYear = now - started < 365 * 24 * 60 * 60 * 1000;
    parts.push(`Since ${date.toLocaleDateString(undefined, withinAYear
      ? { month: 'long' }
      : { month: 'long', year: 'numeric' })}.`);
  }
  const looked = time(judgment.lastReviewedAt);
  if (!Number.isNaN(looked)) {
    const date = new Date(looked);
    const today = new Date(now);
    if (sameLocalDay(date, today)) {
      parts.push(date.getHours() < 12 ? 'You looked this morning.' : 'You looked today.');
    } else {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      parts.push(sameLocalDay(date, yesterday)
        ? 'You looked yesterday.'
        : `You looked ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.`);
    }
  }
  return parts.join(' ');
};

export const formatLedgerDate = (value) => {
  const at = time(value);
  if (Number.isNaN(at)) return '';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** The whole page, as one object. Empty fields come back empty, not padded. */
export const projectJudgment = (page, now = Date.now()) => {
  const judgment = page?.judgment || {};
  const withSources = (lines) => lines.map((line) => ({ ...line, sources: sourcesForLine(page, line) }));
  const whyBase = withSources(whyLines(judgment));
  const againstBase = withSources(againstLines(judgment));
  const numbered = numberCitations([...whyBase, ...againstBase]);
  const why = numbered.slice(0, whyBase.length);
  const against = numbered.slice(whyBase.length);
  return {
    id: idOf(page),
    claim: claimSentence(page),
    title: namedTitle(page),
    headline: judgmentHeadline(page),
    pageTitle: clean(page?.title),
    provenance: provenanceLine(page, now),
    why,
    whySources: uniqueSources(why),
    against,
    againstSources: uniqueSources(against),
    changeMindIf: changeMindLines(judgment),
    whatIDid: whatIDidLines(judgment),
    lessons: lessonLines(judgment),
    parked: clean(judgment.status) === 'parked',
    evergreen: Boolean(page?.evergreen),
    review: reviewBlock(judgment, now),
    resolution: {
      bornAt: judgment.bornAt || judgment.startedAt || page?.createdAt || null,
      criteria: clean(judgment.resolutionCriteria),
      horizonAt: judgment.resolutionHorizonAt || null,
      setAt: judgment.resolutionSetAt || null,
      verdicts: list(judgment.verdicts)
    }
  };
};

/* Why a judgment goes quiet, and which kind of quiet it is.

   Three states are worth telling apart, and every tool that collapses them
   into "stale" ends up nagging:

     live     evidence arrived and the reader has been here since
     quiet    nothing has arrived. Not the reader's fault, and not a problem —
              a belief nothing has touched in six months may be the best one
              they hold
     avoided  evidence arrived and has sat unread. This is the only one worth
              surfacing, and it is the whole job

   And a fourth that is not about time at all: a claim with nothing that could
   ever bear on it. Saying so once is a service; a belief that cannot be
   checked is not a belief being maintained.

   Parked is its own answer. The reader already said they are not tending it,
   so it is never bubbled. */
export const AVOIDED_AFTER_DAYS = 21;
const DAY = 24 * 60 * 60 * 1000;

export const judgmentActivity = (page, events = [], now = Date.now()) => {
  const judgment = page?.judgment || {};
  const pageId = idOf(page);
  if (clean(judgment.status) === 'parked') return { state: 'parked', arrived: 0, newestAt: null };
  /* Evergreen outranks the clock entirely. The reader said this one is
     permanent, so it is never quiet, never avoided, and never told it lacks a
     falsifier — those are all ways of saying "you have neglected this", and
     you cannot neglect something you decided to keep. */
  if (page?.evergreen) return { state: 'evergreen', arrived: 0, newestAt: null };

  const lastTouched = time(judgment.lastReviewedAt || page?.updatedAt || null);
  const touchedAt = Number.isNaN(lastTouched) ? 0 : lastTouched;

  const arrivals = list(events)
    .filter(event => list(event?.affectedPageIds).map(idOf).includes(pageId))
    .filter(event => clean(event?.status) !== 'ignored')
    .map(event => time(event?.sourceUpdatedAt || event?.createdAt || null))
    .filter(at => !Number.isNaN(at) && at > touchedAt)
    .sort((left, right) => right - left);

  if (arrivals.length) {
    const newestAt = arrivals[0];
    const state = (now - newestAt) > AVOIDED_AFTER_DAYS * DAY ? 'avoided' : 'live';
    return { state, arrived: arrivals.length, newestAt: new Date(newestAt).toISOString() };
  }

  /* Only worth saying about a claim nothing is arriving for anyway. A live
     claim gathering evidence does not need to be told it lacks a falsifier. */
  if (!changeMindLines(judgment).length) return { state: 'unfalsifiable', arrived: 0, newestAt: null };

  return { state: 'quiet', arrived: 0, newestAt: null };
};

/* The mark the index carries. Live, quiet, and a claim without a falsifier
   say nothing at all — a missing pin is not a nag. */
export const activityNote = ({ state, arrived } = {}) => {
  if (state === 'avoided') {
    return `${arrived} thing${arrived === 1 ? '' : 's'} arrived about this and ${arrived === 1 ? 'is' : 'are'} unread`;
  }
  if (state === 'unfalsifiable') return '';
  if (state === 'parked') return 'Parked';
  if (state === 'evergreen') return 'Kept';
  return '';
};

/* One claim, one row.

   A judgment is a wiki page, and the agent drafts pages more than once, so the
   index shipped listing the same belief five times. A list of five identical
   claims is not a list of what you believe — it is a list of what the software
   did — and the copy you land on should be the one that has actually been
   argued, not whichever was written last.

   The same rule as the wiki list: most evidence wins, then most learned from,
   then most recent. Write-time dedupe prevents new copies; this fold keeps
   legacy data from leaking into the index while the migration is pending. */
const claimKey = (page) => normalizeClaimKey(claimSentence(page));

const claimWeight = (page) => {
  const judgment = page?.judgment || {};
  return [
    whyLines(judgment).length + againstLines(judgment).length,
    lessonLines(judgment).length,
    changeMindLines(judgment).length,
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
  const loose = [];
  list(pages).forEach((page, index) => {
    const key = claimKey(page);
    if (!key) {
      loose.push({ page, index });
      return;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { page, index });
      return;
    }
    if (strongerClaim(page, existing.page)) existing.page = page;
  });
  return [...byKey.values(), ...loose].sort((left, right) => left.index - right.index);
};

/** The index is a title column. The claim sits under it when they differ. */
export const buildJudgmentIndex = (pages = [], events = [], now = Date.now()) => foldJudgmentPages(
  list(pages).filter(isJudgmentPage)
)
  .map(({ page }) => {
    const activity = judgmentActivity(page, events, now);
    const decisions = list(page?.judgment?.decisions);
    const sentence = claimSentence(page);
    return {
      id: idOf(page),
      title: namedTitle(page),
      headline: judgmentHeadline(page),
      sentence,
      provenance: provenanceLine(page, now),
      state: activity.state,
      note: activityNote(activity),
      evergreen: Boolean(page?.evergreen),
      /* Nested rather than gathered into a room of their own. A lesson without
         the claim it came out of is a fortune cookie; under the claim, it is a
         record of what believing that cost you. */
      lessons: lessonLines(page?.judgment || {}),
      decisionCount: decisions.length,
      outcomeCount: decisions.filter((decision) => Boolean(decision?.outcome?.observedAt)).length,
      updatedAt: page?.judgment?.lastReviewedAt || page?.updatedAt || null
    };
  })
  .filter(item => item.id && item.sentence)
  .sort((left, right) => (time(right.updatedAt) || 0) - (time(left.updatedAt) || 0));

/* Overnight silence is per case. A global event ignore would hide the same
   filing from every other claim it touched. These ids live on the judgment
   blob so tomorrow’s open can be honestly empty. */
const dismissedOvernightIds = (judgment = {}) => {
  const seen = new Set();
  return list(judgment.dismissedOvernightEventIds)
    .map(value => idOf(value) || clean(value))
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

const filedOvernightOrigins = (judgment = {}) => new Set(
  [...whyLines(judgment), ...againstLines(judgment)]
    .map(line => clean(line.acceptedFrom))
    .filter(Boolean)
);

/* The overnight line: one sentence about what arrived while the human was not
   here, and only if that sentence answers the hold. A filing tagged to the
   page is not an answer. It is a proposal — it sits above the claim until the
   human accepts it into Why or Against, or dismisses it. It never writes
   itself in. */
export const selectOvernightLine = (page, events = []) => {
  const pageId = idOf(page);
  if (!pageId) return null;
  const judgment = page?.judgment || {};
  const claim = clean(judgment.currentJudgment);
  const silenced = new Set(dismissedOvernightIds(judgment));
  const filed = filedOvernightOrigins(judgment);
  const candidates = list(events)
    .filter(event => list(event?.affectedPageIds).map(idOf).includes(pageId))
    .filter(event => clean(event?.status) !== 'ignored')
    .map(event => ({
      id: idOf(event),
      at: event?.sourceUpdatedAt || event?.createdAt || null,
      title: oneSentence(event?.title, 120),
      detail: oneSentence(event?.summary, 140)
    }))
    .filter(event => event.id && event.title)
    .filter(event => !silenced.has(event.id) && !filed.has(event.id))
    .filter(event => answersHeldSentence(`${event.title} ${event.detail}`, claim).ok)
    .sort((left, right) => (time(right.at) || 0) - (time(left.at) || 0));
  const latest = candidates[0];
  if (!latest) return null;
  const title = /[.!?]$/.test(latest.title) ? latest.title : `${latest.title}.`;
  const body = `${title}${latest.detail ? ` ${latest.detail}` : ''}`;
  return {
    id: latest.id,
    origin: 'overnight',
    // What the human reads above the claim — the event continues the clause,
    // so it keeps the case it arrived in…
    sentence: `Overnight: ${body}`,
    // …and what gets written down if they accept it: a line that has to stand
    // on its own under Why or Against. The framing is the page's, not the
    // record's.
    body: body.charAt(0).toUpperCase() + body.slice(1),
    sourceLabel: ''
  };
};

/** Persist that this case has heard the overnight line and let it go. */
export const dismissOvernightLine = (page, eventId) => {
  const judgment = page?.judgment || {};
  const id = idOf(eventId);
  if (!id) return judgment;
  const existing = dismissedOvernightIds(judgment);
  if (existing.includes(id)) return judgment;
  return {
    ...judgment,
    dismissedOvernightEventIds: [...existing, id]
  };
};

const persistReason = (line = {}) => {
  const next = {
    reasonId: line.id || line.reasonId,
    text: line.text,
    sourceRefIds: line.sourceRefIds,
    sourceLabel: line.sourceLabel
  };
  const origin = clean(line.acceptedFrom);
  if (origin) next.acceptedFrom = origin;
  const when = line.createdAt || line.at;
  if (when) next.createdAt = when;
  return next;
};

const stampedReason = (fields = {}) => ({
  ...fields,
  createdAt: fields.createdAt || fields.at || new Date().toISOString()
});

/* Accepting a proposal appends one line to Why or Against. It appends: the
   lines already on the page are carried over untouched, and the proposal's
   origin travels with the new line so the page can always say where the
   sentence came from. */
export const acceptProposalIntoJudgment = (page, proposal, field) => {
  const judgment = page?.judgment || {};
  const target = field === 'why' ? 'why' : 'against';
  const current = target === 'why' ? whyLines(judgment) : againstLines(judgment);
  return {
    ...judgment,
    [target]: [
      ...current.map(persistReason),
      stampedReason({
        text: clean(proposal?.body || proposal?.sentence),
        acceptedFrom: clean(proposal?.acceptedFrom || proposal?.id),
        sourceLabel: clean(proposal?.sourceLabel || proposal?.source)
      })
    ]
  };
};

/* What a belief rests on, and what rests on it.

   A list of claims is a list. A belief that depends on another belief is
   structure, and it is the only thing here that compounds: retiring "compute
   is scarce" has to raise a question about "CoreWeave is undervalued", or the
   second one quietly outlives its own foundation.

   The edge is never drawn for you. An agent may propose one; accepting it is
   the reader's, like everything else on this page. */
export const dependencyLines = (judgment = {}, pagesById = new Map()) => list(judgment.dependsOn)
  .map((item, index) => {
    const pageId = idOf(item?.pageId);
    const page = pagesById.get(String(pageId)) || null;
    return {
      id: clean(item?.dependencyId) || `dependency:${index}`,
      pageId,
      title: page ? namedTitle(page) : '',
      headline: page ? judgmentHeadline(page) : '',
      claim: page ? claimSentence(page) : '',
      note: clean(item?.note),
      proposedBy: clean(item?.proposedBy) || 'user'
    };
  })
  .filter(line => line.pageId);

/** The other direction: everything in the corpus that rests on this page. */
export const restingOn = (pageId, pages = []) => {
  const target = String(idOf(pageId));
  if (!target) return [];
  return list(pages)
    .filter(page => list(page?.judgment?.dependsOn).some(item => String(idOf(item?.pageId)) === target))
    .map(page => ({
      id: idOf(page),
      title: namedTitle(page),
      headline: judgmentHeadline(page),
      claim: claimSentence(page),
      note: clean(
        list(page?.judgment?.dependsOn).find(item => String(idOf(item?.pageId)) === target)?.note
      )
    }))
    .filter(item => item.id && item.claim);
};

export const addDependency = (page, dependsOnPageId, note = '') => {
  const judgment = page?.judgment || {};
  const target = String(idOf(dependsOnPageId));
  if (!target || target === String(idOf(page))) return judgment;
  const existing = list(judgment.dependsOn);
  if (existing.some(item => String(idOf(item?.pageId)) === target)) return judgment;
  return {
    ...judgment,
    dependsOn: [...existing, { pageId: target, note: clean(note), proposedBy: 'user' }]
  };
};

export const removeDependency = (page, dependencyId) => {
  const judgment = page?.judgment || {};
  const id = clean(dependencyId);
  return {
    ...judgment,
    dependsOn: list(judgment.dependsOn).filter(item => clean(item?.dependencyId) !== id)
  };
};

/* Parking, and the lesson it leaves behind.

   Judgment had three moves and one of them was Retire, which means "I no
   longer believe this". A belief you have simply stopped tending is a
   different thing, and forcing it through Retire made it leave the list
   looking abandoned — so instead it stayed, and the list filled with claims
   nobody was watching.

   Park says nothing about whether the claim is true. And the moment of
   parking or closing is where the durable thing gets made: not the claim,
   but what holding it taught you. */
export const isParked = (page) => clean(page?.judgment?.status) === 'parked';

export const parkJudgment = (page, lessonText = '') => {
  const judgment = page?.judgment || {};
  return {
    ...judgment,
    status: 'parked',
    lessons: appendLesson(judgment, lessonText, 'parked')
  };
};

export const resumeJudgment = (page) => {
  const judgment = page?.judgment || {};
  return { ...judgment, status: 'monitoring', parkedAt: null };
};

const appendLesson = (judgment = {}, text = '', closedAs = '') => {
  const lesson = clean(text);
  const existing = list(judgment.lessons);
  if (!lesson) return existing;
  return [...existing, { text: lesson, closedAs, at: new Date().toISOString() }];
};

/* A lesson can also be written without closing anything, because sometimes you
   learn the thing while you are still holding the belief. */
export const writeLessonIntoJudgment = (page, text) => {
  const judgment = page?.judgment || {};
  const lessons = appendLesson(judgment, text, '');
  return lessons === list(judgment.lessons) ? judgment : { ...judgment, lessons };
};

export const lessonLines = (judgment = {}) => list(judgment.lessons)
  .map((item, index) => ({
    id: clean(item?.lessonId) || `lesson:${index}`,
    text: clean(item?.text),
    closedAs: clean(item?.closedAs),
    at: item?.at || null
  }))
  .filter(line => line.text);

/* Every lesson in the product, newest first, each still naming the claim it
   came from. This is the shortest thing in Noeis and the most re-readable. */
export const buildLessonsIndex = (pages = []) => list(pages)
  .flatMap(page => lessonLines(page?.judgment || {}).map(lesson => ({
    ...lesson,
    id: `${idOf(page)}:${lesson.id}`,
    pageId: idOf(page),
    claim: claimSentence(page)
  })))
  .filter(item => item.pageId && item.text)
  .sort((left, right) => (time(right.at) || 0) - (time(left.at) || 0));

/* Filing something the library already held.
   The candidate keeps its provenance on the line: sourceLabel is the source a
   reader can name, acceptedFrom is the passage it came from, so the same
   passage is not offered back once it has been decided about. sourceRefIds is
   left alone — it addresses this page's own source ledger, and a library
   article is not in it. */
export const fileEvidenceIntoJudgment = (page, candidate, field) => {
  const judgment = page?.judgment || {};
  const text = clean(candidate?.text);
  if (!text) return judgment;
  const target = field === 'against' ? 'against' : 'why';
  const current = target === 'why' ? whyLines(judgment) : againstLines(judgment);
  return {
    ...judgment,
    [target]: [
      ...current.map(persistReason),
      stampedReason({
        reasonId: newLineId(target),
        text,
        sourceLabel: clean(candidate?.sourceLabel),
        acceptedFrom: clean(candidate?.id)
      })
    ]
  };
};

/* Writing a line by hand.
   Three of the four fields could only be filled by accepting something an
   agent brought back, so a judgment you started yourself could never carry a
   falsifier or a ledger line — the page had four sections and two usable ones.
   The same append rule holds: what is already written is carried over
   untouched, and the new line goes last. */
export const writeLineIntoJudgment = (page, text, field) => {
  const judgment = page?.judgment || {};
  const line = clean(text);
  if (!line) return judgment;

  if (field === 'why' || field === 'against') {
    const current = field === 'why' ? whyLines(judgment) : againstLines(judgment);
    return {
      ...judgment,
      [field]: [
        ...current.map(persistReason),
        stampedReason({ text: line })
      ]
    };
  }

  if (field === 'changeMindIf') {
    return { ...judgment, falsifiers: [...list(judgment.falsifiers), { text: line }] };
  }

  /* What I did is a ledger, so a line written here is dated the day it was
     written and marked taken. It is a record of an action, not a plan. */
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

/* A line the human is still typing.
   Writing used to mean pressing a button, which meant a line only existed once
   you had told the page you were finished with it — and a sentence you had
   typed but not submitted was not anywhere. These write as you go: the same
   line is updated in place while you are writing it, and only becomes another
   line when you start one. */
let lineCounter = 0;
export const newLineId = (prefix) => {
  lineCounter += 1;
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${lineCounter}`;
  return `${prefix}_${random}`;
};

const upsertById = (items, idKey, lineId, make, update) => {
  const list_ = list(items);
  const index = list_.findIndex(item => clean(item?.[idKey]) === lineId);
  if (index < 0) return [...list_, make()];
  return list_.map((item, at) => (at === index ? update(item) : item));
};

export const upsertLineIntoJudgment = (page, text, field, lineId) => {
  const judgment = page?.judgment || {};
  const line = clean(text);
  if (!line || !lineId) return judgment;

  if (field === 'why' || field === 'against') {
    /* Read the projection first, so a page whose Why came from the older
       dossier shape keeps those lines rather than losing them to this write. */
    const current = (field === 'why' ? whyLines(judgment) : againstLines(judgment))
      .map(persistReason);
    return {
      ...judgment,
      [field]: upsertById(
        current,
        'reasonId',
        lineId,
        () => stampedReason({ reasonId: lineId, text: line }),
        item => ({ ...item, text: line })
      )
    };
  }

  if (field === 'changeMindIf') {
    return {
      ...judgment,
      falsifiers: upsertById(
        judgment.falsifiers,
        'falsifierId',
        lineId,
        () => ({ falsifierId: lineId, text: line }),
        item => ({ ...item, text: line })
      )
    };
  }

  if (field === 'whatIDid') {
    return {
      ...judgment,
      decisions: upsertById(
        judgment.decisions,
        'decisionId',
        lineId,
        () => ({ decisionId: lineId, summary: line, decidedAt: new Date().toISOString(), status: 'taken' }),
        item => ({ ...item, summary: line })
      )
    };
  }

  return judgment;
};

/* Changing what you hold is a mind-change, not a silent rewrite. The claim
   updates, and a dated Did line records that it did. Why and Against keep
   the dates they were written. An empty field is not a new opinion. Pass a
   lineId to rewrite the in-progress revision instead of stacking another. */
export const reviseCurrentJudgment = (page, sentence, lineId = '') => {
  const next = oneSentence(sentence);
  const judgment = page?.judgment || {};
  if (!next) return judgment;
  const previous = oneSentence(judgment.currentJudgment);
  if (next === previous) return judgment;
  const nextPage = { ...page, judgment: { ...judgment, currentJudgment: next } };
  const note = `Changed what I hold: ${next}`;
  return lineId
    ? upsertLineIntoJudgment(nextPage, note, 'whatIDid', lineId)
    : writeLineIntoJudgment(nextPage, note, 'whatIDid');
};

/* Writing a judgment down, wherever you are when you decide to.
   A judgment is a wiki page carrying a judgment contract, which is two calls,
   not one — and the second one is easy to get wrong. Sending `kind` as well
   makes the server ask for a governing question and refuse with a 400 when
   there is none; a claim you wrote is not a question, and inventing one you
   never asked would put words on the page. This is the one place that knows
   that, so every surface that starts a judgment starts the same one. */
export const judgmentIdOf = (held) => (
  typeof held === 'string' || typeof held === 'number'
    ? String(held)
    : String(held?.id || '')
);

export const heldDaysBetween = (startedAt, now = Date.now()) => {
  const start = time(startedAt);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / DAY));
};

export const formatHoldAge = (days) => {
  const count = Math.max(0, Number(days) || 0);
  if (count <= 0) return 'today';
  if (count === 1) return '1 day';
  return `${count} days`;
};

export const PARTNER_ACK = 'Noted. I’ll look for what cuts against it.';

export const createJudgment = async (claim, { createPage, updatePage, now = Date.now() } = {}) => {
  const sentence = oneSentence(claim);
  if (!sentence) throw new Error('A judgment starts with a sentence.');
  const page = await createPage({ title: sentence, pageType: 'topic' });
  const id = idOf(page);
  if (!id) throw new Error('The judgment was not created.');
  const held = normalizeClaimKey(page?.judgment?.currentJudgment);
  const next = normalizeClaimKey(sentence);
  const reused = Boolean(held && (held === next || page?.reusedExisting));
  const startedAt = page?.judgment?.startedAt || page?.createdAt || now;
  const heldDays = heldDaysBetween(startedAt, now);
  if (reused) return { id, reused: true, heldDays, sentence };
  await updatePage(id, {
    judgment: {
      currentJudgment: sentence,
      startedAt: new Date(now).toISOString()
    }
  });
  return { id, reused: false, heldDays: 0, sentence };
};
