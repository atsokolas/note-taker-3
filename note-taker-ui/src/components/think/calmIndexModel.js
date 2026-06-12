export const CALM_INDEX_MOTION_LIMIT = 5;
export const SHELF_RAIL_VISIBLE_LIMIT = 5;

export const formatReviewDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
};

export const compareReviewDates = (left, right) => {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
  const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
  return safeLeft - safeRight;
};

export const parseTimestamp = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const describeConceptMotionNote = (conceptItem = {}) => {
  const parts = [];
  const reviewedLabel = formatReviewDate(conceptItem?.freshness?.lastReviewedAt);
  parts.push(reviewedLabel ? `reviewed ${reviewedLabel}` : 'not yet reviewed');
  if (Number.isFinite(conceptItem.count) && conceptItem.count > 0) {
    parts.push(`${conceptItem.count} highlight${conceptItem.count === 1 ? '' : 's'}`);
  }
  if (conceptItem?.freshness?.stale) {
    parts.push(`${conceptItem?.freshness?.statusLabel || 'new material'} waiting`);
  }
  return parts.join(' · ');
};

export const countQuestionHighlightRefs = (question = {}) => (
  (Array.isArray(question.blocks) ? question.blocks : [])
    .filter((block) => block?.type === 'highlight-ref')
    .length
);

export const countQuestionEvidenceBlocks = (question = {}) => (
  (Array.isArray(question.blocks) ? question.blocks : [])
    .filter((block) => block?.type === 'highlight-ref' || String(block?.text || '').trim())
    .length
);

export const describeQuestionMotionNote = (question = {}, { forShelf = false } = {}) => {
  const parts = [];
  const isAnswered = String(question?.status || '').toLowerCase() === 'answered';
  if (isAnswered || forShelf) {
    const answeredLabel = formatReviewDate(question?.updatedAt || question?.answeredAt);
    parts.push(answeredLabel ? `answered ${answeredLabel}` : 'answered');
    return parts.join(' · ');
  }
  const sinceLabel = formatReviewDate(question?.createdAt || question?.updatedAt);
  parts.push(sinceLabel ? `open ${sinceLabel}` : 'open');
  const linkedHighlights = countQuestionHighlightRefs(question);
  if (linkedHighlights > 0) {
    parts.push(`${linkedHighlights} linked highlight${linkedHighlights === 1 ? '' : 's'}`);
  }
  const evidenceCount = countQuestionEvidenceBlocks(question);
  if (evidenceCount > 0 && evidenceCount !== linkedHighlights) {
    parts.push(`${evidenceCount} evidence`);
  }
  return parts.join(' · ');
};

export const describeNotebookMotionNote = (entry = {}) => {
  const parts = [];
  const editedLabel = formatReviewDate(entry?.updatedAt || entry?.createdAt);
  parts.push(editedLabel ? `edited ${editedLabel}` : 'not yet edited');
  const blockCount = Array.isArray(entry?.blocks) ? entry.blocks.length : 0;
  if (blockCount > 0) {
    parts.push(`${blockCount} block${blockCount === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
};

const describeMotionNoteForType = (type, item, options) => {
  switch (type) {
    case 'concept':
      return describeConceptMotionNote(item);
    case 'question':
      return describeQuestionMotionNote(item, options);
    case 'notebook':
      return describeNotebookMotionNote(item);
    default:
      return '';
  }
};

export const getThreadPostureTag = (thread) => {
  switch (thread?.type) {
    case 'concept':
      return 'Concept';
    case 'question':
      return thread?.status === 'answered' ? 'Question · answered' : 'Question · open';
    case 'notebook':
      return 'Note';
    default:
      return '';
  }
};

export const toConceptThread = (conceptItem = {}) => ({
  key: `concept:${conceptItem.name}`,
  type: 'concept',
  id: conceptItem.name,
  title: conceptItem.name || 'Untitled concept',
  description: String(conceptItem.description || '').trim(),
  stale: Boolean(conceptItem?.freshness?.stale),
  touchedAt: conceptItem?.freshness?.lastReviewedAt || conceptItem?.updatedAt || conceptItem?.createdAt,
  status: '',
  raw: conceptItem
});

export const toQuestionThread = (question = {}) => ({
  key: `question:${question._id}`,
  type: 'question',
  id: question._id,
  title: question.text || 'Untitled question',
  description: String(question.linkedTagName || '').trim(),
  stale: String(question?.status || '').toLowerCase() !== 'answered'
    && parseTimestamp(question?.updatedAt || question?.createdAt) > 0
    && parseTimestamp(question?.updatedAt || question?.createdAt) <= parseTimestamp(question?.createdAt),
  touchedAt: question?.updatedAt || question?.createdAt,
  status: question?.status || 'open',
  raw: question
});

export const toNotebookThread = (entry = {}) => ({
  key: `notebook:${entry._id}`,
  type: 'notebook',
  id: entry._id,
  title: entry.title || 'Untitled',
  description: String(entry.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180),
  stale: false,
  touchedAt: entry?.updatedAt || entry?.createdAt,
  status: '',
  raw: entry
});

export const sortConceptsForIndex = (items = [], { staleFirst = false } = {}) => [...items].sort((left, right) => {
  if (staleFirst) {
    const reviewOrder = compareReviewDates(left?.freshness?.lastReviewedAt, right?.freshness?.lastReviewedAt);
    if (reviewOrder !== 0) return reviewOrder;
  } else {
    const reviewOrder = compareReviewDates(right?.freshness?.lastReviewedAt, left?.freshness?.lastReviewedAt);
    if (reviewOrder !== 0) return reviewOrder;
  }
  return String(left?.name || '').localeCompare(String(right?.name || ''));
});

export const sortQuestionsForIndex = (items = [], { openFirst = true } = {}) => [...items].sort((left, right) => {
  const leftAnswered = String(left?.status || '').toLowerCase() === 'answered';
  const rightAnswered = String(right?.status || '').toLowerCase() === 'answered';
  if (openFirst && leftAnswered !== rightAnswered) {
    return leftAnswered ? 1 : -1;
  }
  const touchOrder = parseTimestamp(right?.updatedAt || right?.createdAt)
    - parseTimestamp(left?.updatedAt || left?.createdAt);
  if (touchOrder !== 0) return touchOrder;
  return String(left?.text || '').localeCompare(String(right?.text || ''));
});

export const sortNotebookForIndex = (items = []) => [...items].sort((left, right) => {
  const touchOrder = parseTimestamp(right?.updatedAt || right?.createdAt)
    - parseTimestamp(left?.updatedAt || left?.createdAt);
  if (touchOrder !== 0) return touchOrder;
  return String(left?.title || '').localeCompare(String(right?.title || ''));
});

export const splitMotionAndShelf = (threads = [], limit = CALM_INDEX_MOTION_LIMIT) => {
  const ranked = [...threads];
  return {
    inMotion: ranked.slice(0, limit),
    shelf: ranked.slice(limit)
  };
};

export const buildConceptIndexMotion = (concepts = []) => {
  const staleConcepts = sortConceptsForIndex(
    concepts.filter((item) => item?.freshness?.stale),
    { staleFirst: true }
  );
  const currentConcepts = sortConceptsForIndex(
    concepts.filter((item) => !item?.freshness?.stale)
  );
  const ranked = [...staleConcepts, ...currentConcepts].map(toConceptThread);
  return splitMotionAndShelf(ranked, 3);
};

export const buildQuestionIndexMotion = (questions = []) => {
  const openQuestions = sortQuestionsForIndex(
    questions.filter((item) => String(item?.status || '').toLowerCase() !== 'answered')
  );
  const answeredQuestions = sortQuestionsForIndex(
    questions.filter((item) => String(item?.status || '').toLowerCase() === 'answered'),
    { openFirst: false }
  );
  const ranked = [...openQuestions, ...answeredQuestions].map(toQuestionThread);
  return splitMotionAndShelf(ranked, 3);
};

export const buildNotebookIndexMotion = (entries = []) => {
  const ranked = sortNotebookForIndex(entries).map(toNotebookThread);
  return splitMotionAndShelf(ranked, 3);
};

export const rankHomeThreads = (threads = []) => [...threads].sort((left, right) => {
  const leftConceptStale = left?.type === 'concept' && Boolean(left?.raw?.freshness?.stale);
  const rightConceptStale = right?.type === 'concept' && Boolean(right?.raw?.freshness?.stale);
  if (leftConceptStale !== rightConceptStale) return leftConceptStale ? -1 : 1;
  const touchOrder = parseTimestamp(right.touchedAt) - parseTimestamp(left.touchedAt);
  if (touchOrder !== 0) return touchOrder;
  return String(left.title || '').localeCompare(String(right.title || ''));
});

export const buildHomeIndexMotion = ({
  concepts = [],
  questions = [],
  notebookEntries = []
} = {}) => {
  const threads = rankHomeThreads([
    ...concepts.map(toConceptThread),
    ...questions
      .filter((item) => String(item?.status || '').toLowerCase() !== 'answered')
      .map(toQuestionThread),
    ...notebookEntries.map(toNotebookThread)
  ]);
  return splitMotionAndShelf(threads, CALM_INDEX_MOTION_LIMIT);
};

export const composeConceptIndexOrientation = (motion = {}) => {
  const lead = motion.inMotion?.[0]?.raw;
  if (!lead) return 'A quiet desk. Start a thought and the archive will come in behind it.';
  const others = (motion.inMotion?.length || 0) - 1 + (motion.shelf?.length || 0);
  if (lead?.freshness?.stale) {
    const waiting = lead?.freshness?.statusLabel
      ? `${lead.freshness.statusLabel} waiting`
      : 'new material waiting';
    return `"${lead.name}" has the strongest pull right now — ${waiting} in the archive${others > 0 ? `, with ${others} other thread${others === 1 ? '' : 's'} on the desk` : ''}.`;
  }
  const reviewedLabel = formatReviewDate(lead?.freshness?.lastReviewedAt);
  return `"${lead.name}" is your most recent thread${reviewedLabel ? ` — reviewed ${reviewedLabel}` : ''} and current with the archive${others > 0 ? `. ${others} other thread${others === 1 ? '' : 's'} on the desk` : ''}.`;
};

export const composeQuestionIndexOrientation = (motion = {}) => {
  const lead = motion.inMotion?.[0];
  if (!lead) return 'No open loops on the desk. Capture a question when something still needs proof.';
  const others = (motion.inMotion?.length || 0) - 1 + (motion.shelf?.length || 0);
  const linked = lead.raw?.linkedTagName ? ` inside ${lead.raw.linkedTagName}` : '';
  return `"${lead.title}" has the strongest pull${linked}${others > 0 ? `, with ${others} other question${others === 1 ? '' : 's'} nearby` : ''}.`;
};

export const composeNotebookIndexOrientation = (motion = {}) => {
  const lead = motion.inMotion?.[0];
  if (!lead) return 'A blank notebook. Open a page when a loose thread is ready to become writing.';
  const others = (motion.inMotion?.length || 0) - 1 + (motion.shelf?.length || 0);
  const editedLabel = formatReviewDate(lead.touchedAt);
  return `"${lead.title}" is the page with the most recent movement${editedLabel ? ` — edited ${editedLabel}` : ''}${others > 0 ? `. ${others} other page${others === 1 ? '' : 's'} on the desk` : ''}.`;
};

export const composeHomeIndexOrientation = (motion = {}) => {
  const lead = motion.inMotion?.[0];
  if (!lead) return 'A quiet desk. Start a thought and the archive will come in behind it.';
  const others = (motion.inMotion?.length || 0) - 1 + (motion.shelf?.length || 0);
  const typeNoun = lead.type === 'concept'
    ? 'concept'
    : lead.type === 'question'
      ? 'question'
      : 'note';
  if (lead.stale && lead.type === 'concept') {
    const waiting = lead.raw?.freshness?.statusLabel || 'new material waiting';
    return `Your "${lead.title}" ${typeNoun} has the strongest pull — ${waiting}${others > 0 ? `. ${others} other thread${others === 1 ? '' : 's'} on the desk` : ''}.`;
  }
  const touchedLabel = formatReviewDate(lead.touchedAt);
  const movement = touchedLabel ? ` moved ${touchedLabel}` : ' is live on the desk';
  return `"${lead.title}"${movement}${others > 0 ? `; ${others} other thread${others === 1 ? '' : 's'} nearby` : ''}.`;
};

export const describeThreadMotionNote = (thread, options) => (
  describeMotionNoteForType(thread?.type, thread?.raw, options)
);

export const filterShelfRailSections = ({
  concepts = [],
  questions = [],
  notebookEntries = [],
  searchQuery = ''
} = {}) => {
  const query = String(searchQuery || '').trim().toLowerCase();
  const matches = (value) => !query || String(value || '').toLowerCase().includes(query);
  return {
    concepts: concepts.filter((item) => matches(item.name)),
    questions: questions.filter((item) => matches(item.text)),
    notebookEntries: notebookEntries.filter((item) => matches(item.title || 'Untitled'))
  };
};

export const sortShelfRailConcepts = (items = []) => sortConceptsForIndex(items);
export const sortShelfRailQuestions = (items = []) => sortQuestionsForIndex(items);
export const sortShelfRailNotebook = (items = []) => sortNotebookForIndex(items);
