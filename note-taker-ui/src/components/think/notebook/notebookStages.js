// Where a piece of writing stands: an idea, being worked on, or closed. The
// server keeps the older keys (in_progress, done); a note set aside in the old
// archive reads as closed, and a note from before stages is an idea.

export const STAGES = [
  { key: 'idea', label: 'Idea', section: 'Ideas', sense: 'Started, not yet taken up.' },
  { key: 'in_progress', label: 'Working', section: 'Working', sense: 'What you are writing now.' },
  { key: 'done', label: 'Closed', section: 'Closed', sense: 'Finished, sent, or let go.' }
];

/* The list reads by what needs you: the work underway, then ideas, then what is closed. */
export const SHELF_ORDER = ['in_progress', 'idea', 'done'];

export const stageOf = (board) => {
  if (board?.archivedAt) return 'done';
  return STAGES.some(({ key }) => key === board?.stage) ? board.stage : 'idea';
};

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const time = (value) => (value ? new Date(value).getTime() || 0 : 0);
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

/* The one line under a piece in the list: what matters for where it stands. */
export const stageLine = (item, now = Date.now()) => {
  if (item.stage === 'done') {
    const board = item.board || {};
    return board.became || `${board.stage === 'done' ? 'Closed' : 'Set aside'} ${dayLabel(board.movedAt || board.archivedAt || item.updatedAt, now)}`;
  }
  if (item.stage === 'in_progress') return item.nextTimeLine || `Last written ${dayLabel(item.updatedAt, now)}`;
  return '';
};

/* What the server is sent for a move; leaving Closed also leaves the old archive. */
export const stageChange = (board, stage, became) => ({
  stage,
  ...(stage === 'done' && became !== undefined ? { became } : {}),
  ...(stage !== 'done' && board?.archivedAt ? { archived: false } : {})
});

/* The board as it stands once a move lands, before the server answers. */
export const movedBoard = (board, change, at = new Date().toISOString()) => ({
  ...(board || {}),
  stage: change.stage,
  movedAt: at,
  ...(change.became !== undefined ? { became: change.became } : {}),
  ...(change.archived === false ? { archivedAt: null } : {})
});

export const groupByStage = (entries = []) => Object.fromEntries(
  STAGES.map(({ key }) => [key, entries.filter(item => item.stage === key)])
);
