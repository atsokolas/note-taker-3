/**
 * How a paper reads.
 *
 * The sentences an edition says about itself, and none of them is a count for
 * its own sake. What the week left empty is an editorial fact — a named column
 * nobody filled is telling you something real. What you took from it is the
 * only measure of whether the paper did its job.
 *
 * Columns belong to the edition's configuration, not to a fixed evidence /
 * counter-evidence layout. A paper with no columns configured prints silence
 * rather than inventing filler.
 *
 * A stand holds papers, not issues. Editions arrive as a flat list ordered by
 * date, which reads as a pile; grouping them back into the papers they belong
 * to is what makes a run of issues legible as one thing that keeps turning up.
 */
import { agentOf } from '../components/editions/editionAgent';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const day = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Sep 1 – 7", or "Aug 30 – Sep 5" when the week crosses a month. */
export const windowLine = ({ windowStart, windowEnd } = {}) => {
  const start = day(windowStart);
  const end = day(windowEnd);
  if (!start || !end) return '';
  const short = month => MONTHS[month].slice(0, 3);
  const left = `${short(start.getUTCMonth())} ${start.getUTCDate()}`;
  const right = start.getUTCMonth() === end.getUTCMonth()
    ? `${end.getUTCDate()}`
    : `${short(end.getUTCMonth())} ${end.getUTCDate()}`;
  return `${left} – ${right}`;
};

/**
 * The dateline a paper actually prints.
 *
 * Named days and the month spelled out, because this is the line that says
 * what the issue *is*. A single-day issue says one date rather than the same
 * date twice; a month-long one names the month once.
 */
export const datelineLine = ({ windowStart, windowEnd } = {}) => {
  const start = day(windowStart);
  const end = day(windowEnd);
  if (!start || !end) return '';
  const year = end.getUTCFullYear();
  const named = date => `${DAYS[date.getUTCDay()]} ${date.getUTCDate()}`;
  if (start.getTime() === end.getTime()) {
    return `${DAYS[start.getUTCDay()]} ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} ${year}`;
  }
  const wholeMonth = start.getUTCDate() === 1
    && end.getUTCDate() === new Date(Date.UTC(year, end.getUTCMonth() + 1, 0)).getUTCDate()
    && start.getUTCMonth() === end.getUTCMonth();
  if (wholeMonth) return `${MONTHS[start.getUTCMonth()]} ${year}`;
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${named(start)} – ${named(end)} ${MONTHS[end.getUTCMonth()]} ${year}`
    : `${named(start)} ${MONTHS[start.getUTCMonth()]} – ${named(end)} ${MONTHS[end.getUTCMonth()]} ${year}`;
};

export const issueLine = ({ issueLabel = 'Edition', number } = {}) => (
  Number.isFinite(Number(number)) && Number(number) > 0 ? `${issueLabel} ${number}` : ''
);

const timestampOf = (value) => {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
};

const newestFilingAt = (edition = {}) => Math.max(
  0,
  ...(edition?.items || edition?.filings || []).map(item => timestampOf(item?.filedAt))
);

const editionRecency = (edition = {}) => [
  edition.updatedAt,
  edition.createdAt,
  edition.windowEnd,
  edition.windowStart
].map(timestampOf).find(Boolean) || 0;

/* A filing has its own time, separate from the week the paper covers. That
   distinction matters when an agent finishes a retrospective issue today. */
export const latestFilingLine = (edition = {}, now = new Date()) => {
  const filedAt = newestFilingAt(edition);
  if (!filedAt) return '';
  const filed = new Date(filedAt);
  const today = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(today.getTime())) return '';
  const sameDay = (left, right) => (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
  if (sameDay(filed, today)) return 'Filed today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(filed, yesterday)) return 'Filed yesterday';
  return `Filed ${filed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};

/**
 * Which tense an issue is in.
 *
 * The whole stand turns on this. An issue still inside its window is being
 * written and says "nothing *yet*"; one whose window has closed is finished
 * and says "nothing *that week*". Same silence, different claim.
 */
export const stateOf = ({ windowStart, windowEnd } = {}, now = Date.now()) => {
  const start = day(windowStart);
  const end = day(windowEnd);
  if (!start || !end) return 'open';
  /* The window is inclusive of its last day, so it closes when that day does. */
  if (now > end.getTime() + DAY_MS) return 'closed';
  return now < start.getTime() ? 'open' : 'filling';
};

/**
 * The items of one section, in the order the configuration names them.
 *
 * No configured columns is silence: items do not become an invented
 * "Elsewhere" or evidence/counter-evidence set. Orphans only appear when the
 * paper *has* a shape and an item no longer fits it — a profile that changed
 * after filing, not a missing configuration.
 */
export const bySection = ({ sections = [], items = [] } = {}) => {
  const named = (sections || []).filter(section => section?.key || section?.label);
  if (!named.length) return [];
  const known = new Set(named.map(section => section.key));
  const ordered = named.map(section => ({
    ...section,
    items: (items || []).filter(item => item.section === section.key)
  }));
  const orphans = (items || []).filter(item => !known.has(item.section));
  return orphans.length
    ? [...ordered, { key: '', label: 'Elsewhere', items: orphans }]
    : ordered;
};

/**
 * How the stand lays out one issue.
 *
 * `columns` is the configured shape (empty columns included). `looseItems` is
 * what remains when there is no shape — a list without invented roles.
 */
export const standLayout = (edition = null) => {
  if (!edition) return { ready: false, columns: [], looseItems: [] };
  const columns = bySection(edition);
  return {
    ready: true,
    columns,
    looseItems: columns.length ? [] : (Array.isArray(edition.items) ? edition.items : [])
  };
};

/**
 * The stand, arranged as papers rather than as a pile.
 *
 * Editions arrive newest-first across every profile, so two papers interleave
 * by date and neither reads as a thing that keeps turning up. Grouped by
 * profile and ordered oldest-to-newest, each becomes a run: a first issue, the
 * ones since, and the one being written now.
 */
export const byPaper = (editions = []) => {
  const papers = new Map();
  (Array.isArray(editions) ? editions : []).forEach((edition) => {
    if (!edition?.profile) return;
    if (!papers.has(edition.profile)) {
      papers.set(edition.profile, {
        profile: edition.profile,
        title: edition.profileLabel || edition.title,
        issueLabel: edition.issueLabel || 'Edition',
        issues: []
      });
    }
    papers.get(edition.profile).issues.push(edition);
  });

  return [...papers.values()].map((paper) => {
    const issues = paper.issues
      .slice()
      .sort((left, right) => Date.parse(left.windowStart) - Date.parse(right.windowStart));
    const current = issues.reduce((best, issue, index) => (
      editionRecency(issue) > editionRecency(issues[best])
        ? index
        : best
    ), 0);
    return { ...paper, issues, current };
  /* The paper with the most recent filing stands at the front of the stand. */
  }).sort((left, right) => editionRecency(right.issues[right.current]) - editionRecency(left.issues[left.current]));
};

/** An outbound source a stranger may follow. javascript: never becomes an href. */
export const publicSourceHref = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch (_error) {
    return '';
  }
};

/* A passage runs word for word only between its elisions ("…"), so it is
   found, linked and marked by its first unbroken stretch. */
export const passageOpening = (passage = '') => (
  String(passage).split(/…|\.{3}/).map(piece => piece.replace(/\s+/g, ' ').trim()).find(Boolean) || ''
);

/**
 * The original, opened at the passage a finding rests on: a text fragment of
 * its opening words, which the browser scrolls to and marks. Only a passage
 * checked against the source earns it; anything else opens at the top.
 */
export const passageHref = (item = {}) => {
  const href = publicSourceHref(item.url);
  if (!href || item.passageCheck !== 'found' || !passageOpening(item.passage)) return href;
  /* Up to the first elision, so the fragment is words the source really runs together. */
  const opening = passageOpening(item.passage).split(' ').slice(0, 8).join(' ');
  return `${href.split('#')[0]}#:~:text=${encodeURIComponent(opening).replace(/-/g, '%2D')}`;
};

const KINDS = { preprint: 'preprint', peer_reviewed: 'peer-reviewed', company: 'company source', news: 'news', other: '' };

/** Where a finding comes from and how sure its agent is, in one line. */
export const sourceLine = (item = {}) => [
  item.sourceLabel,
  item.sourceDate,
  KINDS[item.sourceKind],
  item.confidence ? `${item.confidence} confidence` : ''
].filter(Boolean).join(' · ');

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const shortDay = (date) => `${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}`;
const READING_WPM = 230;
const KIND_NOUN = { preprint: 'preprint', peer_reviewed: 'peer-reviewed paper', company: 'company source', news: 'news report' };

/**
 * What an issue costs to read, before you start: how many findings, about
 * how long, and what kind of evidence when they all share one. A mixed issue
 * says nothing about kind rather than averaging it.
 */
export const costLine = (items = []) => {
  if (!items.length) return '';
  const words = items.flatMap(item => [item.plain, item.finding, item.boundary, ...(item.readings || []).flatMap(reading => [reading.finding, reading.boundary])])
    .join(' ').split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / READING_WPM));
  const kinds = new Set(items.map(item => item.sourceKind));
  const noun = kinds.size === 1 ? KIND_NOUN[items[0].sourceKind] : '';
  const kind = !noun ? '' : items.length === 1 ? `a ${noun}` : `${items.length === 2 ? 'both' : 'all'} ${noun}s`;
  return [plural(items.length, 'finding'), minutes === 1 ? 'about a minute' : `about ${minutes} minutes`, kind]
    .filter(Boolean).join(' · ');
};

/* Where a finding comes from, as a reader would say it: "arXiv preprint,
   Oct 4. Not yet peer reviewed." */
export const sourceNote = (item = {}) => {
  const date = day(item.sourceDate);
  const where = [item.sourceLabel, KINDS[item.sourceKind]].filter(Boolean).join(' ');
  const line = [where, date ? shortDay(date) : ''].filter(Boolean).join(', ');
  return `${line ? `${line}.` : ''}${item.sourceKind === 'preprint' ? ' Not yet peer reviewed.' : ''}`.trim();
};

const SURE = {
  high: 'Well supported. Rely on it within the limit it states.',
  moderate: 'A real signal, not a settled fact.',
  low: 'Early and thin. Worth knowing, not worth acting on yet.'
};

/** How sure to be, in a sentence rather than a grade. Unsaid stays unsaid. */
export const sureLine = (item = {}) => SURE[item.confidence] || '';

const PERCENT = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/;

/**
 * Figures that measure the same kind of thing are drawn against each other:
 * two or more plain percentages become bars on one scale. Anything else (a
 * range, a count, a mix) stays as numbers, because a bar would invent a
 * comparison the finding did not make.
 */
export const barsOf = (figures = []) => {
  const shares = figures.map(figure => Number(PERCENT.exec(String(figure.value))?.[1]));
  return figures.length > 1 && shares.every(share => Number.isFinite(share) && share <= 100)
    ? figures.map((figure, index) => ({ ...figure, share: shares[index] }))
    : null;
};

/**
 * What comes after this issue. A later issue already out is a link, made by
 * the caller; otherwise an issue not yet open says when it opens, one still
 * filling says until when, and a closed one says which week the next will cover.
 */
export const aheadLine = (issue = {}, issueLabel = 'Edition', now = Date.now()) => {
  const start = day(issue.windowStart);
  const end = day(issue.windowEnd);
  if (!start || !end) return '';
  const state = stateOf(issue, now);
  const on = date => `${DAYS[date.getUTCDay()].slice(0, 3)}, ${shortDay(date)}`;
  if (state === 'open') return `Opens ${on(start)}`;
  if (state === 'filling') return `Still filling, through ${on(end)}`;
  const span = end.getTime() - start.getTime();
  const next = { windowStart: new Date(end.getTime() + DAY_MS), windowEnd: new Date(end.getTime() + DAY_MS + span) };
  const name = (Number(issue.number) > 0 && issueLine({ issueLabel, number: Number(issue.number) + 1 })) || 'The next one';
  return `${name} covers ${windowLine(next)}`;
};

/* The first hand on an item is the one that filed it; readings are second
   opinions on a source already in the paper, not filings into the column. */
const filerOf = item => agentOf({ label: item?.filedBy, runtime: item?.filedByRuntime });

/* An opened issue carries its items; a row on the stand carries only who
   filed into which column. */
const filingsOf = issue => issue?.items || issue?.filings || [];

/* Section colour: a counter-evidence column always takes the danger tone,
   and the rest take the house colours in profile order. Tones are names of
   theme tokens, so every theme carries its own. */
const TONES = ['thread', 'living', 'slate', 'ink'];

export const sectionTones = (sections = []) => {
  const tones = {};
  let next = 0;
  (sections || []).forEach((section) => {
    if (!section?.key) return;
    if (/counter/i.test(section.key)) {
      tones[section.key] = 'danger';
      return;
    }
    tones[section.key] = TONES[next % TONES.length];
    next += 1;
  });
  return tones;
};

/**
 * One paper's run, newest issue first, with what each column holds.
 *
 * A column is filled when something was filed there, checked when an agent
 * looked and nothing met the bar, unreported when nobody did, and unknown
 * when the issue predates receipts. The run says no more than that.
 */
export const runGrid = (paper = null) => {
  const issues = paper?.issues || [];
  if (!issues.length) return { sections: [], rows: [] };
  const sections = (issues[issues.length - 1].sections || []).filter(section => section?.key);
  const rows = issues.slice().reverse().map((issue) => {
    const counts = filingsOf(issue).reduce((tally, item) => (
      { ...tally, [item.section]: (tally[item.section] || 0) + 1 }
    ), {});
    return {
      issue,
      cells: sections.map((section) => {
        const count = counts[section.key] || 0;
        const silence = (issue.silences || []).find(entry => entry.key === section.key)?.state;
        const state = count ? 'filled' : (silence === 'checked' || silence === 'unreported' ? silence : 'unknown');
        return { section: section.key, label: section.label, count, state };
      })
    };
  });
  return { sections, rows };
};

/**
 * What is new on a run, or null when no issue said. Unknown is not zero: a
 * paper whose counts never arrived prints nothing rather than "0 new".
 */
export const newCountOf = (issues = []) => {
  const counted = (issues || []).map(issue => issue?.newCount).filter(Number.isFinite);
  return counted.length ? counted.reduce((sum, n) => sum + n, 0) : null;
};

/* Every hand on an item: the agent that filed it, then any that read the same
   source on their own. */
const handsOnItem = item => [
  filerOf(item),
  ...(item?.readings || []).map(reading => agentOf({ label: reading.filedBy, runtime: reading.filedByRuntime }))
].filter(Boolean);

/**
 * The hands on one issue, most filings first: the choices the "Filed by"
 * filter offers. One hand is no choice, and the filter does not print.
 */
export const handsOf = (edition = null) => {
  const hands = new Map();
  (edition?.items || []).forEach(item => handsOnItem(item).forEach((agent) => {
    const held = hands.get(agent.key) || { agent, count: 0 };
    hands.set(agent.key, { ...held, count: held.count + 1 });
  }));
  return [...hands.values()].sort((left, right) => right.count - left.count);
};

/** Whether an item carries this hand, as its filer or as a second reading. */
export const byHand = (item, key) => !key || handsOnItem(item).some(agent => agent.key === key);

/** What became of a watched line, in a word. */
export const WATCH_STATUS = { open: 'Open', not_yet: 'Not yet', happened: 'Happened', dropped: 'Dropped' };

const settled = status => status === 'happened' || status === 'dropped';

/**
 * What a paper has been watching, across its run.
 *
 * An issue's watch list is answered by the next issue's follow-ups, so a line
 * is a thread that runs from one issue into the next. The newest word on each
 * line wins. A line nobody answered yet is open, never guessed at.
 */
export const watchThreads = (issues = []) => {
  const run = (issues || []).slice().sort((left, right) => Date.parse(left.windowStart) - Date.parse(right.windowStart));
  const threads = new Map();
  run.forEach((issue, index) => (issue.watchNext || []).forEach((line) => {
    const answer = (run[index + 1]?.followUps || []).find(entry => entry.watch.toLowerCase() === line.toLowerCase());
    threads.set(line.toLowerCase(), {
      watch: line,
      since: issue,
      status: answer?.status || 'open',
      note: answer?.note || ''
    });
  }));
  const all = [...threads.values()].reverse();
  return { open: all.filter(thread => !settled(thread.status)), settled: all.filter(thread => settled(thread.status)) };
};

/* The newest issue of a paper: what its cover and its front-page column print. */
export const latestOf = paper => paper.issues[paper.issues.length - 1];

/* How strongly a finding can lead a front page: by what it carries that a
   reader can check, never by who filed it. */
const leadWeight = item => (item.passageCheck === 'found' ? 4 : 0)
  + (item.figures?.length ? 2 : 0)
  + ({ high: 2, moderate: 1 }[item.confidence] || 0)
  + (item.plain ? 1 : 0);

const byLead = (left, right) => leadWeight(right.item) - leadWeight(left.item)
  || timestampOf(right.item.filedAt) - timestampOf(left.item.filedAt);

/**
 * One front page for every paper you keep, set from each paper's newest
 * issue (`opened` holds those issues with their findings).
 *
 * Eligibility: findings filed into the newest issue of a paper. Quality: the
 * lead is the finding with the most a reader can check (a passage found in
 * its source, figures, stated confidence, a plain line), newest on a tie.
 * Silence: a paper whose newest issue holds nothing gets no column, and a
 * stand with nothing filed has no lead; nothing is promoted to fill space.
 */
export const frontPage = (papers = [], opened = {}) => {
  const columns = papers
    .map(paper => ({ paper, issue: opened[latestOf(paper)?._id] }))
    .filter(({ issue }) => issue?.items?.length)
    .map(({ paper, issue }) => ({
      paper,
      issue,
      stories: issue.items.map(item => ({ paper, issue, item })).sort(byLead)
    }));
  const lead = columns.flatMap(column => column.stories).sort(byLead)[0] || null;
  return {
    lead,
    /* The rest of the lead's issue runs under it, so the columns beside it
       belong to the other papers. */
    alsoIn: lead ? columns.find(column => column.paper === lead.paper).stories.filter(story => story !== lead) : [],
    columns: columns.filter(column => column.paper !== lead?.paper),
    quiet: columns.flatMap(({ paper, issue }) => (issue.silences || [])
      .filter(silence => silence.state === 'checked')
      .map(silence => ({ paper, silence }))),
    watching: papers.flatMap(paper => watchThreads(paper.issues).open.map(thread => ({ paper, ...thread })))
  };
};

/**
 * The wire: who filed what into each paper's newest issue, newest first.
 * Read off the stand's rows, so it costs nothing to print.
 */
export const wireOf = (papers = []) => papers
  .flatMap((paper) => {
    const issue = latestOf(paper);
    const hands = new Map();
    filingsOf(issue).forEach((filing) => {
      const agent = filerOf(filing);
      if (!agent) return;
      const held = hands.get(agent.key) || { agent, count: 0, at: 0 };
      hands.set(agent.key, { ...held, count: held.count + 1, at: Math.max(held.at, timestampOf(filing.filedAt)) });
    });
    return [...hands.values()].map(hand => ({ paper, issue, ...hand }));
  })
  .sort((left, right) => right.at - left.at);

/** What a paper's cover leads with: its strongest finding's first figure. */
export const coverFigure = (issue = null) => (issue?.items || [])
  .map(item => ({ item }))
  .sort(byLead)
  .map(({ item }) => item.figures?.[0])
  .find(Boolean) || null;

