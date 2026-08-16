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

export const isJudgmentPage = (page) => {
  const judgment = page?.judgment || {};
  return Boolean(
    clean(judgment.currentJudgment)
    || clean(judgment.kind)
    || list(judgment.decisions).length
    || list(judgment.falsifiers).length
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
    review: reviewBlock(judgment, now)
  };
};

/** The index is a list of claim sentences. Nothing else earns a column. */
export const buildJudgmentIndex = (pages = [], now = Date.now()) => list(pages)
  .filter(isJudgmentPage)
  .map(page => ({
    id: idOf(page),
    sentence: claimSentence(page),
    provenance: provenanceLine(page, now),
    updatedAt: page?.judgment?.lastReviewedAt || page?.updatedAt || null
  }))
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
