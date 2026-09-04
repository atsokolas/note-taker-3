import { normalizeSpaces } from '../utils/editorialText';

// Which note Think opens, and how it reads.
//
// Think is not three rooms with an index in front of them. It is the note you
// were last in, with the others faint beside it. The only real question this
// module answers is "which note", and it answers it from what the human
// actually did rather than from a default sort.

const THINK_RECENTS_STORAGE_KEY = 'think.recent.targets';

const idOf = (entry) => normalizeSpaces(entry?._id || entry?.id);
const list = (value) => (Array.isArray(value) ? value : []);

const time = (value) => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(at) ? 0 : at;
};

/** The notebook entries the human has opened recently, most recent first. */
export const readRecentNoteIds = (storage = (typeof window !== 'undefined' ? window.localStorage : null)) => {
  try {
    const parsed = JSON.parse(storage?.getItem(THINK_RECENTS_STORAGE_KEY) || '[]');
    return list(parsed)
      .filter(item => normalizeSpaces(item?.type) === 'notebook')
      .sort((left, right) => time(right?.openedAt) - time(left?.openedAt))
      .map(item => normalizeSpaces(item?.id))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
};

/**
 * The note to open. An explicit request wins; then the last note the human was
 * actually in; then the one edited most recently. Landing on nothing is only
 * correct when there are no notes at all.
 */
export const resolveOpenNoteId = ({ requestedId = '', notes = [], recentIds = [] } = {}) => {
  const known = new Set(list(notes).map(idOf).filter(Boolean));
  const wanted = normalizeSpaces(requestedId);
  if (wanted && known.has(wanted)) return wanted;
  const recent = list(recentIds).map(normalizeSpaces).find(id => known.has(id));
  if (recent) return recent;
  const newest = list(notes)
    .filter(idOf)
    .slice()
    .sort((left, right) => time(right?.updatedAt || right?.createdAt) - time(left?.updatedAt || left?.createdAt))[0];
  return idOf(newest);
};

/** The faint list beside the note: every other note, most recent first. */
export const buildNoteShelf = ({ notes = [], openId = '', query = '', expanded = false, limit = 18 } = {}) => {
  const needle = normalizeSpaces(query).toLowerCase();
  const sorted = list(notes)
  .map(entry => ({
    id: idOf(entry),
    title: normalizeSpaces(entry?.title) || 'Untitled',
    updatedAt: entry?.updatedAt || entry?.createdAt || null,
    isOpen: idOf(entry) === normalizeSpaces(openId)
  }))
  .filter(item => item.id)
  .filter(item => !needle || item.title.toLowerCase().includes(needle))
  .sort((left, right) => time(right.updatedAt) - time(left.updatedAt));
  return expanded || needle ? sorted : sorted.slice(0, limit);
};

/** "edited this morning" — from the timestamp, never guessed. */
export const editedLine = (entry, now = Date.now()) => {
  const at = time(entry?.updatedAt || entry?.createdAt);
  if (!at) return '';
  const date = new Date(at);
  const today = new Date(now);
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  if (sameDay) return date.getHours() < 12 ? 'edited this morning' : 'edited today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const wasYesterday = date.getFullYear() === yesterday.getFullYear()
    && date.getMonth() === yesterday.getMonth()
    && date.getDate() === yesterday.getDate();
  if (wasYesterday) return 'edited yesterday';
  return `edited ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
};

/* Think's other postures are still addressable — links from Library, Wiki and
   the palette point straight at a concept, a question, a thread, and those
   requests open what they name in the older workspace.
   Notes are not among them: the note surface *is* Think's face now, so
   ?tab=notebook belongs here whether or not it names an entry. That is also
   the case that used to blank the editor. */
/* Concepts and Questions are rooms, not just addresses. They have index
   pages of their own — a shelf of every concept, a docket of every open
   question — and requiring an object to reach them made the rail's two
   buttons dead and sent the first-run tour's "Open Think Concepts" to the
   notebook. The tab alone is enough to stand in them. */
const INDEXED_TABS = new Set(['concepts', 'questions']);

const OBJECT_PARAMS = {
  concepts: ['concept', 'conceptId'],
  questions: ['questionId'],
  threads: ['threadId'],
  handoffs: ['handoffId'],
  paths: ['pathId'],
  protocol: ['protocolId'],
  insights: ['insightId']
};

const NOTE_TABS = new Set(['', 'home', 'notebook', 'notes']);

export const namesAThinkObject = (search = '') => {
  const params = new URLSearchParams(search);
  const tab = normalizeSpaces(params.get('tab')).toLowerCase();
  if (NOTE_TABS.has(tab)) return false;
  if (INDEXED_TABS.has(tab)) return true;
  const keys = OBJECT_PARAMS[tab];
  // A posture this module does not know about is left to the legacy surface
  // rather than swallowed.
  if (!keys) return true;
  return keys.some(key => normalizeSpaces(params.get(key)));
};
