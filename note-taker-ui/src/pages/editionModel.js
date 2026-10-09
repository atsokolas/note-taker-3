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
  ...(edition?.items || []).map(item => timestampOf(item?.filedAt))
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
 * When the open issue closes, said the way a person would.
 *
 * Not a countdown. A paper tells you which day it goes to press.
 */
export const closesLine = (edition = {}, now = Date.now()) => {
  const end = day(edition.windowEnd);
  if (!end) return '';
  if (stateOf(edition, now) === 'closed') return 'Closed';
  const days = Math.round((end.getTime() + DAY_MS - now) / DAY_MS);
  if (days <= 1) return 'Closes today';
  if (days <= 7) return `Closes ${DAYS[end.getUTCDay()]}`;
  return `Closes ${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
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

/**
 * New arrivals, nested back under the issue that filed them.
 *
 * The inbox arrives as a date-ordered pile, so two papers — and two issues of
 * the same paper — sit as adjacent rows. Grouping by edition makes each issue
 * a thing you can fold, rather than a label repeated on every finding.
 */
export const byInboxEdition = (items = []) => {
  const groups = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item) return;
    const editionId = item.editionId || '';
    if (!groups.has(editionId)) {
      groups.set(editionId, {
        editionId,
        title: item.profileLabel || item.issueTitle || 'Edition',
        issue: issueLine(item),
        items: []
      });
    }
    groups.get(editionId).items.push(item);
  });
  return [...groups.values()];
};

/** The issue name on an inbox group: the paper, then which number. */
export const inboxEditionLine = ({ title, issue } = {}) => (
  [title, issue].filter(Boolean).join(' · ')
);

/**
 * Whether an agent has kept its promise, for one paper.
 *
 * A periodical is judged on whether it turned up. Consecutive by window rather
 * than by count — three issues filed in one afternoon are not a three-week run
 * — and measured against each paper's own rhythm, so a monthly is not accused
 * of missing fifty weeks. Below the floor it says nothing: two in a row is not
 * yet a habit.
 */
export const RUN_FLOOR = 2;

export const runLine = (issues = []) => {
  const starts = (Array.isArray(issues) ? issues : [])
    .map(issue => Date.parse(issue?.windowStart))
    .filter(Number.isFinite)
    .sort((left, right) => right - left);
  if (starts.length < RUN_FLOOR) return '';

  /* The paper's own cadence, taken from the gap it actually keeps. */
  const stride = starts[0] - starts[1];
  if (!(stride > 0)) return '';

  let run = 1;
  for (let i = 1; i < starts.length; i += 1) {
    const gap = starts[i - 1] - starts[i];
    if (gap > stride * 1.5 || gap < stride * 0.5) break;
    run += 1;
  }
  if (run < RUN_FLOOR) return '';
  const unit = stride > 20 * DAY_MS ? 'months' : (stride > 3 * DAY_MS ? 'weeks' : 'days');
  return `${run} ${unit} running, not one missed`;
};

/** The folio: a paper knows what day it is. */
export const folioLine = (now = new Date()) => {
  const date = now instanceof Date ? now : new Date(now);
  const name = DAYS[date.getDay()];
  return `The ${name} ${date.getDay() === 0 || date.getDay() === 6 ? 'papers' : 'paper'}`;
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

const hostOf = (href) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch (_error) {
    return '';
  }
};

/**
 * The sources an issue actually cites.
 *
 * Eligibility: a filed item with a followable URL. Quality: http(s) only, one
 * entry per href, labelled from what the item already carried. Silence: nothing
 * qualifies — no invented links, no placeholder row.
 */
export const sourceLinks = (edition = null) => {
  const items = Array.isArray(edition?.items) ? edition.items : [];
  const seen = new Set();
  const links = [];
  items.forEach((item) => {
    const href = publicSourceHref(item?.url);
    if (!href || seen.has(href)) return;
    seen.add(href);
    const label = [item.sourceLabel, item.title].filter(Boolean).join(' · ')
      || hostOf(href)
      || href;
    links.push({
      href,
      label,
      sourceDate: String(item.sourceDate || '').trim()
    });
  });
  return links;
};

/** How many dated issues the rail shows before All issues. */
export const SHELF_ISSUE_LIMIT = 12;

/**
 * Newest issues for the rail, bounded, with the open issue kept visible even
 * when it falls outside the recent window.
 */
export const shelfIssuesForPaper = (issues = [], selectedId = '', limit = SHELF_ISSUE_LIMIT) => {
  const list = Array.isArray(issues) ? issues : [];
  const newestFirst = list
    .slice()
    .sort((left, right) => Date.parse(right.windowStart) - Date.parse(left.windowStart));
  const recent = newestFirst.slice(0, limit);
  if (selectedId && !recent.some((row) => row._id === selectedId)) {
    const selected = list.find((row) => row._id === selectedId);
    if (selected) {
      return [...recent, selected].sort(
        (left, right) => Date.parse(right.windowStart) - Date.parse(left.windowStart)
      );
    }
  }
  return recent;
};

/** Last issue the reader opened on this paper, else the current one. */
export const resolvePaperIssueId = (paper, readProfileIssue) => {
  if (!paper?.issues?.length) return '';
  const stored = readProfileIssue?.(paper.profile);
  const remembered = stored?.issueId;
  if (remembered && paper.issues.some((row) => row._id === remembered)) return remembered;
  return paper.issues[paper.current]?._id || paper.issues[paper.issues.length - 1]._id;
};

/* The first hand on an item is the one that filed it; readings are second
   opinions on a source already in the paper, not filings into the column. */
const filerOf = item => agentOf({ label: item?.filedBy, runtime: item?.filedByRuntime });

/* An opened issue carries its items; a row on the stand carries only who
   filed into which column. */
const filingsOf = issue => issue?.items || issue?.filings || [];

/**
 * Who keeps each column across a run.
 *
 * A keeper the reader configured wins. Otherwise the agent that filed most of
 * the column's items is offered, marked `derived` so the paper says "usually
 * filed by", never "keeps". A tie names no one: the paper does not guess.
 */
export const keepersFor = (issues = [], sections = []) => {
  const keepers = {};
  (sections || []).forEach((section) => {
    if (!section?.key) return;
    const configured = section.keeper && agentOf(section.keeper);
    if (configured) {
      keepers[section.key] = { agent: configured, derived: false };
      return;
    }
    const tally = new Map();
    (issues || []).forEach(issue => filingsOf(issue).forEach((item) => {
      if (item.section !== section.key) return;
      const agent = filerOf(item);
      if (!agent) return;
      const held = tally.get(agent.key) || { agent, count: 0 };
      tally.set(agent.key, { ...held, count: held.count + 1 });
    }));
    const [first, second] = [...tally.values()].sort((left, right) => right.count - left.count);
    keepers[section.key] = first && (!second || first.count > second.count)
      ? { agent: first.agent, derived: true }
      : null;
  });
  return keepers;
};

/**
 * Per column of one issue, the hands that filed into it other than its
 * keeper: the small second marks on the shelf. A column with no keeper lists
 * every hand that filed there.
 */
export const foreignFilers = (issue = {}, keepers = {}) => {
  const foreign = {};
  filingsOf(issue).forEach((item) => {
    const agent = filerOf(item);
    if (!agent || agent.key === keepers[item.section]?.agent?.key) return;
    const held = foreign[item.section] || [];
    if (!held.some(hand => hand.key === agent.key)) foreign[item.section] = [...held, agent];
  });
  return foreign;
};

/* Section colour: a counter-evidence column is always red, and the rest
   take the palette in profile order. Tones are names; the colours are theme
   tokens, so Midnight carries its own. */
const TONES = ['blue', 'ochre', 'birch', 'sage', 'slate', 'plum', 'ink', 'red'];

export const sectionTones = (sections = []) => {
  const tones = {};
  let next = 0;
  (sections || []).forEach((section) => {
    if (!section?.key) return;
    if (/counter/i.test(section.key)) {
      tones[section.key] = 'red';
      return;
    }
    tones[section.key] = TONES[next % TONES.length];
    next += 1;
  });
  return tones;
};

const monthDay = (value) => {
  const date = day(value);
  return date ? `${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}` : '';
};

/**
 * One paper's run as a storage unit: a row per issue, a bay per column.
 *
 * A bay is filled when something was filed there, braced when an agent
 * looked and nothing met the bar, open when nobody reported, and plain when
 * the issue predates receipts. Nothing is inferred beyond the keeper the
 * paper already labels "usually filed by".
 */
export const shelfGrid = (paper = null, selectedId = '') => {
  const issues = paper?.issues || [];
  if (!issues.length) return { sections: [], rows: [] };
  const named = (issues[issues.length - 1].sections || []).filter(section => section?.key);
  const keepers = keepersFor(issues, named);
  const current = selectedId || issues[paper.current ?? issues.length - 1]?._id;
  const rows = shelfIssuesForPaper(issues, current).slice().reverse().map((issue) => {
    const foreign = foreignFilers(issue, keepers);
    const counts = filingsOf(issue).reduce((tally, item) => (
      { ...tally, [item.section]: (tally[item.section] || 0) + 1 }
    ), {});
    return {
      issueId: issue._id,
      number: issue.number ?? null,
      label: [issue.number, monthDay(issue.windowStart)].filter(Boolean).join(' · ') || windowLine(issue),
      current: issue._id === current,
      cells: named.map((section) => {
        const count = counts[section.key] || 0;
        const silence = (issue.silences || []).find(entry => entry.key === section.key);
        const state = count
          ? 'filled'
          : (silence?.state === 'checked' || silence?.state === 'unreported' ? silence.state : 'unknown');
        return { section: section.key, count, state, foreign: foreign[section.key] || [], by: silence?.by || [] };
      })
    };
  });
  return {
    sections: named.map(section => ({ key: section.key, label: section.label, keeper: keepers[section.key] })),
    rows
  };
};

/** Days after an issue closes before a missing report reads as "Not reported"; the server's grace. */
export const REPORT_GRACE_DAYS = 3;

/**
 * The desk: who works on this paper, shown only when more than one agent
 * does. Each hand says which columns it keeps, what it did this issue, and how
 * much of what it filed across the run the reader kept. No on-time score.
 */
export const deskFor = (paper = null, issue = null, now = Date.now()) => {
  const issues = paper?.issues || [];
  const hands = new Map();
  issues.forEach(row => filingsOf(row).forEach((item) => {
    const agent = filerOf(item);
    if (!agent) return;
    const held = hands.get(agent.key) || { agent, filed: 0, saved: 0 };
    hands.set(agent.key, { ...held, filed: held.filed + 1, saved: held.saved + (item.saved || item.savedArticleId ? 1 : 0) });
  }));
  if (hands.size < 2) return [];
  const sections = (issues[issues.length - 1]?.sections || []).filter(section => section?.key);
  const keepers = keepersFor(issues, sections);
  const end = day(issue?.windowEnd);
  /* A hand on every column of a paper with several says so in two words. */
  const every = held => (sections.length > 1 && held.length === sections.length
    ? ['every column']
    : held.map(section => section.label));
  const overdue = Boolean(end) && now > end.getTime() + DAY_MS * (1 + REPORT_GRACE_DAYS);
  return [...hands.values()].map(({ agent, filed, saved }) => {
    const kept = sections.filter(section => keepers[section.key]?.agent?.key === agent.key);
    const mine = filingsOf(issue).filter(item => filerOf(item)?.key === agent.key);
    const last = Math.max(0, ...mine.map(item => timestampOf(item.filedAt)));
    const looked = (issue?.silences || []).some(silence => (
      silence.state === 'checked' && (silence.by || []).some(by => agentOf(by)?.key === agent.key)
    ));
    const thisIssue = mine.length
      ? (last ? `Filed ${monthDay(last)}` : 'Filed')
      : looked ? 'Looked, filed nothing' : overdue ? 'Not reported' : 'Not filed yet';
    return {
      agent,
      keeps: every(kept.filter(section => !keepers[section.key].derived)),
      usually: every(kept.filter(section => keepers[section.key].derived)),
      thisIssue,
      kept: `Kept by you: ${saved} of ${filed}`
    };
  });
};
