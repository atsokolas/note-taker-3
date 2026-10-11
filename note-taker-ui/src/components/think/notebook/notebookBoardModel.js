// Where each piece of writing stands: an idea, in progress, or done, and the
// archive for what has been set down. A note from before the board is an idea.

export const STAGES = [
  { key: 'idea', label: 'Ideas', one: 'idea', many: 'ideas', empty: 'No ideas waiting.' },
  { key: 'in_progress', label: 'In progress', one: 'in progress', many: 'in progress', empty: 'Nothing underway.' },
  { key: 'done', label: 'Done', one: 'done', many: 'done', empty: 'Nothing finished yet.' }
];

/* The archive reads by what the writing became, finished work first. */
export const ARCHIVE_GROUPS = [
  { key: 'done', label: 'Finished' },
  { key: 'in_progress', label: 'Left in progress' },
  { key: 'idea', label: 'Ideas set aside' }
];

export const STALE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const time = (value) => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(at) ? at : 0;
};

export const toCard = (note) => ({
  id: String(note._id),
  title: String(note.title || '').trim() || 'Untitled',
  snippet: String(note.snippet || '').replace(/\s+/g, ' ').trim(),
  nextTimeLine: String(note.workingState?.nextTimeLine?.text || '').trim(),
  stage: STAGES.some(stage => stage.key === note.board?.stage) ? note.board.stage : 'idea',
  movedAt: note.board?.movedAt || null,
  archivedAt: note.board?.archivedAt || null,
  createdAt: note.createdAt || null,
  updatedAt: note.updatedAt || null
});

const suppressed = (note) => Boolean(note?.archived || note?.hiddenFromHome || note?.debugOnly);
const newest = (key) => (a, b) => time(b[key] || b.updatedAt) - time(a[key] || a.updatedAt);

export const isStale = (card, now = Date.now()) => (
  card.stage === 'idea' && !card.archivedAt && now - time(card.updatedAt) >= STALE_DAYS * DAY
);

export const buildBoard = (notes = [], now = Date.now()) => {
  const cards = (Array.isArray(notes) ? notes : []).filter(note => note?._id && !suppressed(note)).map(toCard);
  const open = cards.filter(card => !card.archivedAt);
  const set = cards.filter(card => card.archivedAt);
  const columns = Object.fromEntries(STAGES.map(({ key }) => [
    key,
    open.filter(card => card.stage === key).sort(newest(key === 'done' ? 'movedAt' : 'updatedAt'))
  ]));
  const archive = Object.fromEntries(ARCHIVE_GROUPS.map(({ key }) => [
    key,
    set.filter(card => card.stage === key).sort(newest('archivedAt'))
  ]));
  return { columns, archive, archived: set.length, stale: columns.idea.filter(card => isStale(card, now)) };
};

/* The board moves a card before the server answers; a refusal puts it back. */
export const placeCard = (notes, id, board) => notes.map(note => (
  String(note._id) === String(id) ? { ...note, board: { ...(note.board || {}), ...board } } : note
));

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

export const dayLabel = (value, now = Date.now()) => {
  const at = time(value);
  if (!at) return '';
  if (sameDay(at, now)) return 'today';
  if (sameDay(at, now - DAY)) return 'yesterday';
  const days = Math.floor((now - at) / DAY);
  if (days < 7) return `${days} days ago`;
  const date = new Date(at);
  const year = date.getFullYear() !== new Date(now).getFullYear() ? ` ${date.getFullYear()}` : '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
};

/* One line under each card: the fact that matters for where it stands. */
export const cardLine = (card, now = Date.now()) => {
  if (card.archivedAt) {
    return card.stage === 'done'
      ? `Finished, set aside ${dayLabel(card.archivedAt, now)}`
      : `Last written ${dayLabel(card.updatedAt, now)}`;
  }
  if (card.stage === 'done') return `Done ${dayLabel(card.movedAt || card.updatedAt, now)}`;
  if (isStale(card, now)) return `Untouched since ${dayLabel(card.updatedAt, now)}`;
  return `Last written ${dayLabel(card.updatedAt, now)}`;
};

/* The receipt for finishing: how long the piece was in the making. */
export const doneReceipt = (card, now = Date.now()) => {
  const begun = time(card.createdAt);
  if (!begun) return `“${card.title}” is done.`;
  if (sameDay(begun, now)) return `“${card.title}” is done. Begun and finished today.`;
  const days = Math.max(1, Math.round((now - begun) / DAY));
  return `“${card.title}” is done. Begun ${dayLabel(begun, now)}, ${days === 1 ? 'a day' : `${days} days`} in the making.`;
};

export const countLine = (columns) => STAGES
  .map(({ key, one, many }) => {
    const n = columns[key]?.length || 0;
    return `${n} ${n === 1 ? one : many}`;
  })
  .join(' · ');
