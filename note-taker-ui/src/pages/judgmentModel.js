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
  if (sentence.length <= maxLength) return sentence;
  const clipped = sentence.slice(0, maxLength).replace(/[\s,:;–—-]+$/, '');
  return `${clipped}…`;
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

/** The claim is the sentence. It is the same sentence everywhere it appears. */
export const claimSentence = (page) => (
  clean(page?.judgment?.currentJudgment)
  || clean(page?.judgment?.governingQuestion)
  || clean(page?.title)
);

const sourceRefHref = (ref) => {
  const url = clean(ref?.url);
  if (/^https?:\/\//i.test(url)) return url;
  const type = clean(ref?.type).toLowerCase();
  const objectId = idOf(ref?.objectId);
  if (!objectId) return '';
  if (type === 'article') return `/library?articleId=${encodeURIComponent(objectId)}`;
  if (type === 'highlight') {
    const parentId = idOf(ref?.parentObjectId);
    return parentId
      ? `/library?articleId=${encodeURIComponent(parentId)}&highlightId=${encodeURIComponent(objectId)}`
      : `/library?highlightId=${encodeURIComponent(objectId)}`;
  }
  if (type === 'concept') return `/think?tab=concepts&concept=${encodeURIComponent(objectId)}`;
  if (type === 'question') return `/think?tab=questions&questionId=${encodeURIComponent(objectId)}`;
  if (type === 'notebook') return `/think?tab=notebook&entryId=${encodeURIComponent(objectId)}`;
  return '';
};

const sourceLabel = (ref) => (
  clean(ref?.citationLabel)
  || clean(ref?.provider)
  || clean(ref?.title)
);

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

/** The sources named under Why — the publications, not a citation apparatus. */
const resolveSources = (page, lines = []) => {
  const byId = new Map(list(page?.sourceRefs).map(ref => [idOf(ref), ref]));
  const seen = new Set();
  const resolved = [];
  lines.forEach((line) => {
    list(line.sourceRefIds).map(idOf).forEach((refId) => {
      const ref = byId.get(refId);
      const label = sourceLabel(ref);
      if (!ref || !label || seen.has(label)) return;
      seen.add(label);
      resolved.push({ id: refId, label, href: sourceRefHref(ref) });
    });
    const literal = clean(line.sourceLabel);
    if (literal && !seen.has(literal)) {
      seen.add(literal);
      resolved.push({ id: `label:${literal}`, label: literal, href: '' });
    }
  });
  return resolved;
};

const reasonLines = (items = [], prefix) => list(items)
  .map((item, index) => ({
    id: clean(item?.reasonId) || `${prefix}:${index}`,
    text: clean(item?.text),
    sourceRefIds: list(item?.sourceRefIds),
    sourceLabel: clean(item?.sourceLabel)
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
      sourceLabel: ''
    }))
    .filter(line => line.text);
};

const againstLines = (judgment = {}) => {
  const own = reasonLines(judgment.against, 'against');
  if (own.length) return own;
  const counter = clean(judgment.strongestCounterargument);
  return counter ? [{ id: 'strongest-counterargument', text: counter, sourceRefIds: [], sourceLabel: '' }] : [];
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
  const startedAt = judgment.startedAt
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
  const why = whyLines(judgment);
  const against = againstLines(judgment);
  return {
    id: idOf(page),
    claim: claimSentence(page),
    pageTitle: clean(page?.title),
    provenance: provenanceLine(page, now),
    why,
    whySources: resolveSources(page, why),
    against,
    againstSources: resolveSources(page, against),
    changeMindIf: changeMindLines(judgment),
    whatIDid: whatIDidLines(judgment),
    lessons: lessonLines(judgment),
    parked: clean(judgment.status) === 'parked',
    evergreen: Boolean(page?.evergreen),
    review: reviewBlock(judgment, now)
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

/* The mark the index carries. Live and quiet say nothing at all, which is the
   point: the index must be able to be silent. */
export const activityNote = ({ state, arrived } = {}) => {
  if (state === 'avoided') {
    return `${arrived} thing${arrived === 1 ? '' : 's'} arrived about this and ${arrived === 1 ? 'is' : 'are'} unread`;
  }
  if (state === 'unfalsifiable') return 'Nothing could change your mind about this yet';
  if (state === 'parked') return 'Parked';
  if (state === 'evergreen') return 'Kept';
  return '';
};

/** The index is a list of claim sentences. Nothing else earns a column. */
export const buildJudgmentIndex = (pages = [], events = [], now = Date.now()) => list(pages)
  .filter(isJudgmentPage)
  .map((page) => {
    const activity = judgmentActivity(page, events, now);
    return {
      id: idOf(page),
      sentence: claimSentence(page),
      provenance: provenanceLine(page, now),
      state: activity.state,
      note: activityNote(activity),
      evergreen: Boolean(page?.evergreen),
      updatedAt: page?.judgment?.lastReviewedAt || page?.updatedAt || null
    };
  })
  .filter(item => item.id && item.sentence)
  .sort((left, right) => (time(right.updatedAt) || 0) - (time(left.updatedAt) || 0));

/* The overnight line: one sentence about what arrived while the human was not
   here. It is a proposal — it sits above the claim until the human accepts it
   into Why or Against, or dismisses it. It never writes itself in. */
export const selectOvernightLine = (page, events = []) => {
  const pageId = idOf(page);
  if (!pageId) return null;
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
      ...current.map(line => ({
        reasonId: line.id,
        text: line.text,
        sourceRefIds: line.sourceRefIds,
        sourceLabel: line.sourceLabel
      })),
      {
        text: clean(proposal?.body || proposal?.sentence),
        acceptedFrom: clean(proposal?.id),
        sourceLabel: clean(proposal?.sourceLabel)
      }
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
      ...current.map(line => ({
        reasonId: line.id,
        text: line.text,
        sourceRefIds: line.sourceRefIds,
        sourceLabel: line.sourceLabel
      })),
      {
        text,
        sourceLabel: clean(candidate?.sourceLabel),
        acceptedFrom: clean(candidate?.id)
      }
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
        ...current.map(existing => ({
          reasonId: existing.id,
          text: existing.text,
          sourceRefIds: existing.sourceRefIds,
          sourceLabel: existing.sourceLabel
        })),
        { text: line }
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
      .map(existing => ({
        reasonId: existing.id,
        text: existing.text,
        sourceRefIds: existing.sourceRefIds,
        sourceLabel: existing.sourceLabel
      }));
    return {
      ...judgment,
      [field]: upsertById(
        current,
        'reasonId',
        lineId,
        () => ({ reasonId: lineId, text: line }),
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

/* Writing a judgment down, wherever you are when you decide to.
   A judgment is a wiki page carrying a judgment contract, which is two calls,
   not one — and the second one is easy to get wrong. Sending `kind` as well
   makes the server ask for a governing question and refuse with a 400 when
   there is none; a claim you wrote is not a question, and inventing one you
   never asked would put words on the page. This is the one place that knows
   that, so every surface that starts a judgment starts the same one. */
export const createJudgment = async (claim, { createPage, updatePage } = {}) => {
  const sentence = oneSentence(claim);
  if (!sentence) throw new Error('A judgment starts with a sentence.');
  const page = await createPage({ title: sentence, pageType: 'topic' });
  const id = idOf(page);
  if (!id) throw new Error('The judgment was not created.');
  await updatePage(id, { judgment: { currentJudgment: sentence } });
  return id;
};
