// What changed, in words.
//
// A revision is two snapshots of a page. The reader does not want a diff; they
// want the sentence a careful colleague would say: "Added a section on renewal
// rates, citing Costco 10-K. Rewrote Overview." Everything here is read off the
// two snapshots — section headings, section text, and the sources cited — so
// the sentence is never more confident than the data. When the snapshots are
// missing (pruned, or a pass that changed nothing) it falls back to what the
// revision itself records: its summary, else its kind.

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const list = (value) => (Array.isArray(value) ? value : []);

const OPENING = '';

const nodeText = (node) => {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.text === 'string') return node.text;
  return list(node.content).map(nodeText).join(' ');
};

/** Section title -> normalized section text, in page order. */
const sectionsOf = (body) => {
  const sections = new Map();
  let current = OPENING;
  sections.set(current, '');
  list(body?.content).forEach((node) => {
    if (node?.type === 'heading') {
      current = clean(nodeText(node));
      if (!sections.has(current)) sections.set(current, '');
      return;
    }
    sections.set(current, clean(`${sections.get(current)} ${nodeText(node)}`));
  });
  if (!sections.get(OPENING)) sections.delete(OPENING);
  return sections;
};

const sourceKey = (ref = {}) => clean(ref.objectId || ref.url || ref.title).toLowerCase();

const joinNames = (names) => {
  if (names.length > 3) return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

const sectionName = (title) => (title === OPENING ? 'the opening' : title);

const sentenceCase = (text) => (text ? `${text[0].toUpperCase()}${text.slice(1)}` : '');

const REASON_SENTENCES = Object.freeze({
  created: 'Started the page.',
  user_edit: 'You edited the page.',
  agent_maintenance: 'Partner reread the sources.',
  agent_candidate: 'Partner proposed a change.',
  source_event: 'A new source reached the page.',
  valuation_refreshed: 'The valuation was refreshed.',
  archived: 'Archived the page.'
});

/* Summaries written by the server are often bookkeeping ("Updated "X".").
   A summary that only names the page says nothing the reason does not. */
const informativeSummary = (summary = '') => {
  const text = clean(summary);
  if (!text) return '';
  if (/^(updated|created) ".*"\.?$/i.test(text)) return '';
  return text;
};

/**
 * One plain sentence for the change from `before` to `after`.
 * Returns '' when the snapshots show no change in sections or sources.
 */
const describeSnapshots = (before, after) => {
  if (!after?.body) return '';
  const nextSections = sectionsOf(after.body);
  const nextSources = list(after.sourceRefs);
  if (!before?.body) {
    const count = nextSources.length;
    return count
      ? `Started the page from ${count} source${count === 1 ? '' : 's'}.`
      : 'Started the page.';
  }
  const priorSections = sectionsOf(before.body);
  const added = [...nextSections.keys()].filter((title) => title !== OPENING && !priorSections.has(title));
  const removed = [...priorSections.keys()].filter((title) => title !== OPENING && !nextSections.has(title));
  const rewritten = [...nextSections.keys()].filter((title) => (
    priorSections.has(title) && priorSections.get(title) !== nextSections.get(title)
  ));
  const priorKeys = new Set(list(before.sourceRefs).map(sourceKey).filter(Boolean));
  const cited = nextSources.filter((ref) => sourceKey(ref) && !priorKeys.has(sourceKey(ref)))
    .map((ref) => clean(ref.title) || 'a new source');

  const clauses = [];
  if (added.length) clauses.push(`added ${added.length === 1 ? 'a section' : 'sections'} on ${joinNames(added)}`);
  if (rewritten.length) clauses.push(`rewrote ${joinNames(rewritten.map(sectionName))}`);
  if (removed.length) clauses.push(`removed ${joinNames(removed)}`);
  if (cited.length) {
    const citing = `citing ${joinNames(cited)}`;
    if (clauses.length) clauses[0] = `${clauses[0]}, ${citing}`;
    else clauses.push(`added ${cited.length === 1 ? 'a source' : 'sources'}, ${citing}`);
  }
  return clauses.map((clause) => `${sentenceCase(clause)}.`).join(' ');
};

/* A missing `before` means the page began here only for a creation; otherwise
   the earlier snapshot was pruned or never kept, and nothing is inferred. */
const describeSince = (revision = {}, after = null) => (
  revision.before?.body || revision.reason === 'created' ? describeSnapshots(revision.before, after) : ''
);

/** The sentence for one revision row, given the page state that followed it. */
const describeRevision = (revision = {}, after = null) => (
  describeSince(revision, after)
  || (revision.snapshotUnchanged ? 'Checked against its sources. Nothing changed.' : '')
  || informativeSummary(revision.summary)
  || REASON_SENTENCES[revision.reason]
  || 'The page changed.'
);

const isPromoted = (revision = {}) => !revision.promotionStatus || ['promoted', 'preserved'].includes(revision.promotionStatus);

/**
 * Sentences for a page's history, newest first. History rows carry only their
 * `before` snapshot; the state that followed a promoted revision is the next
 * newer promoted revision's `before`, or the current page for the newest one.
 */
const describeHistory = (revisions = [], currentPage = null) => {
  let following = currentPage;
  return list(revisions).map((revision) => {
    const sentence = isPromoted(revision)
      ? describeRevision(revision, following)
      : (informativeSummary(revision.summary) || REASON_SENTENCES.agent_candidate);
    if (isPromoted(revision) && revision.before?.body) following = revision.before;
    return sentence;
  });
};

module.exports = {
  describeHistory,
  describeRevision,
  describeSince,
  describeSnapshots,
  isPromoted,
  sectionsOf
};
