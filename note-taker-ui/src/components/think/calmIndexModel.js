import {
  composeCruftSuppressionNotice,
  countSuppressedInCollection,
  filterReturnViewItems,
  isSuppressedFromReturnView
} from '../../utils/cruftSuppression';
import { formatSurfaceDate } from '../../utils/dateDisplay';

export {
  composeCruftSuppressionNotice,
  countSuppressedInCollection,
  isSuppressedFromReturnView
};

export const CALM_INDEX_MOTION_LIMIT = 5;
export const SHELF_RAIL_VISIBLE_LIMIT = 5;

export const formatReviewDate = (value) => {
  return formatSurfaceDate(value);
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

export const isWikiOpenQuestion = (question = {}) => (
  String(question?.sourceType || '').toLowerCase() === 'wiki_open_question'
);

export const getWikiOpenQuestionHref = (question = {}) => (
  isWikiOpenQuestion(question) && question?.href ? String(question.href) : ''
);

export const describeQuestionMotionNote = (question = {}, { forShelf = false } = {}) => {
  const parts = [];
  if (isWikiOpenQuestion(question)) {
    const source = String(question?.sourcePageTitle || question?.linkedTagName || question?.conceptName || '').trim();
    parts.push(source ? `from ${source}` : 'from wiki page');
    return parts.join(' · ');
  }
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

const THREAD_TYPE_LABELS = {
  concept: 'CONCEPT',
  question: 'QUESTION',
  notebook: 'NOTE',
  wiki: 'WIKI'
};

const WIKI_OVERNIGHT_WINDOW_MS = 48 * 60 * 60 * 1000;
const QUESTION_ANSWER_READY_EVIDENCE = 2;

const normalizeReturnQueueItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'wiki_page') return 'wiki';
  if (candidate === 'concept' || candidate === 'question' || candidate === 'notebook') return candidate;
  return '';
};

const isRecentWithin = (value, windowMs) => {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return false;
  return Date.now() - timestamp <= windowMs;
};

export const deriveThreadReturnState = (thread = {}) => {
  if (thread.returnState) return thread.returnState;

  switch (thread.type) {
    case 'concept':
      if (thread.stale || thread.raw?.freshness?.stale) return 'WAITING MATERIAL';
      if (thread.returnQueued) return 'RETURNING';
      return 'ACTIVE';
    case 'question': {
      const status = String(thread.status || thread.raw?.status || '').toLowerCase();
      if (status === 'answered') return 'SETTLED';
      if (thread.returnQueued) return 'RETURNING';
      if (countQuestionEvidenceBlocks(thread.raw || {}) >= QUESTION_ANSWER_READY_EVIDENCE) {
        return 'READY TO ANSWER';
      }
      return 'OPEN';
    }
    case 'notebook':
      if (thread.returnQueued) return 'READY TO REOPEN';
      return 'DRAFTING';
    case 'wiki':
      if (thread.updatedOvernight) return 'UPDATED OVERNIGHT';
      return 'RECENT';
    default:
      return '';
  }
};

export const getThreadMotionStateTag = (thread = {}) => {
  const typeLabel = THREAD_TYPE_LABELS[thread.type] || '';
  const stateLabel = deriveThreadReturnState(thread);
  if (!typeLabel || !stateLabel) return '';
  return `${typeLabel} · ${stateLabel}`;
};

export const getThreadPostureTag = (thread) => getThreadMotionStateTag(thread);

export const filterReturnThreads = (threads = []) => filterReturnViewItems(threads);

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

export const toWikiThread = (activityEvent = {}) => {
  const touchedAt = activityEvent.at || activityEvent.updatedAt || activityEvent.createdAt;
  const updatedOvernight = isRecentWithin(touchedAt, WIKI_OVERNIGHT_WINDOW_MS);
  return {
    key: `wiki:${activityEvent.pageId || activityEvent.id || activityEvent.title}`,
    type: 'wiki',
    id: activityEvent.pageId || activityEvent.id || activityEvent.title,
    title: activityEvent.title || activityEvent.pageTitle || 'Wiki page',
    description: String(activityEvent.summary || activityEvent.detail || '').trim(),
    stale: false,
    touchedAt,
    updatedOvernight,
    returnState: updatedOvernight ? 'UPDATED OVERNIGHT' : 'RECENT',
    status: '',
    raw: activityEvent
  };
};

const buildReturnQueueLookup = (entries = []) => {
  const lookup = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (String(entry?.status || '').toLowerCase() === 'completed') return;
    const itemType = normalizeReturnQueueItemType(entry.itemType);
    const itemId = String(entry.itemId || entry.item?.id || '').trim();
    if (!itemType || !itemId) return;
    lookup.set(`${itemType}:${itemId.toLowerCase()}`, entry);
    const title = String(entry.item?.title || '').trim().toLowerCase();
    if (itemType === 'concept' && title) {
      lookup.set(`concept:${title}`, entry);
    }
  });
  return lookup;
};

export const applyReturnQueueToThreads = (threads = [], returnQueueEntries = []) => {
  const lookup = buildReturnQueueLookup(returnQueueEntries);
  return threads.map((thread) => {
    const lookupKeys = [
      `${thread.type}:${String(thread.id || '').trim().toLowerCase()}`,
      thread.type === 'concept' ? `concept:${String(thread.title || '').trim().toLowerCase()}` : ''
    ].filter(Boolean);
    const matchedEntry = lookupKeys.map((key) => lookup.get(key)).find(Boolean);
    if (!matchedEntry) return thread;

    let returnState = 'RETURNING';
    if (thread.type === 'notebook') returnState = 'READY TO REOPEN';
    if (thread.type === 'concept' && (thread.stale || thread.raw?.freshness?.stale)) {
      returnState = 'WAITING MATERIAL';
    }

    return {
      ...thread,
      returnQueued: true,
      returnState,
      returnQueueEntry: matchedEntry
    };
  });
};

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
  const ranked = filterReturnThreads(threads);
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
  if (Boolean(left.returnQueued) !== Boolean(right.returnQueued)) {
    return left.returnQueued ? -1 : 1;
  }
  if (Boolean(left.updatedOvernight) !== Boolean(right.updatedOvernight)) {
    return left.updatedOvernight ? -1 : 1;
  }
  const leftConceptStale = left?.type === 'concept' && Boolean(left?.stale || left?.raw?.freshness?.stale);
  const rightConceptStale = right?.type === 'concept' && Boolean(right?.stale || right?.raw?.freshness?.stale);
  if (leftConceptStale !== rightConceptStale) return leftConceptStale ? -1 : 1;
  const touchOrder = parseTimestamp(right.touchedAt) - parseTimestamp(left.touchedAt);
  if (touchOrder !== 0) return touchOrder;
  return String(left.title || '').localeCompare(String(right.title || ''));
});

const dedupeThreadsByKey = (threads = []) => {
  const seen = new Set();
  return threads.filter((thread) => {
    if (!thread?.key || seen.has(thread.key)) return false;
    seen.add(thread.key);
    return true;
  });
};

export const buildHomeIndexMotion = ({
  concepts = [],
  questions = [],
  notebookEntries = [],
  returnQueueEntries = [],
  wikiActivity = []
} = {}) => {
  const wikiThreads = (Array.isArray(wikiActivity) ? wikiActivity : [])
    .filter((event) => isRecentWithin(event?.at || event?.updatedAt, WIKI_OVERNIGHT_WINDOW_MS))
    .slice(0, 2)
    .map(toWikiThread);

  const threads = applyReturnQueueToThreads(
    rankHomeThreads([
      ...concepts.map(toConceptThread),
      ...questions
        .filter((item) => String(item?.status || '').toLowerCase() !== 'answered')
        .map(toQuestionThread),
      ...notebookEntries.map(toNotebookThread),
      ...wikiThreads
    ]),
    returnQueueEntries
  );

  return splitMotionAndShelf(dedupeThreadsByKey(threads), CALM_INDEX_MOTION_LIMIT);
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

export const composeHomeIndexOrientation = (motion = {}, { returnQueueEntries = [] } = {}) => {
  const lead = motion.inMotion?.[0];
  if (!lead) return 'A quiet desk. Start a thought and the archive will come in behind it.';

  const inMotion = Array.isArray(motion.inMotion) ? motion.inMotion : [];
  const warmConcept = inMotion.find((thread) => (
    thread.type === 'concept' && (thread.stale || thread.raw?.freshness?.stale)
  ));
  const readyQuestions = inMotion.filter((thread) => (
    thread.type === 'question' && deriveThreadReturnState(thread) === 'READY TO ANSWER'
  ));
  const pendingReturnCount = (Array.isArray(returnQueueEntries) ? returnQueueEntries : [])
    .filter((entry) => String(entry?.status || '').toLowerCase() !== 'completed').length;

  if (warmConcept) {
    const statusLabel = warmConcept.raw?.freshness?.statusLabel || 'newer sources arrived';
    const warmLead = `Your "${warmConcept.title}" thread is warm again: ${statusLabel}`;
    if (readyQuestions.length > 0) {
      const questionPhrase = readyQuestions.length === 1
        ? 'one open question now has enough evidence to answer'
        : `${readyQuestions.length} open questions now have enough evidence to answer`;
      return `${warmLead}, and ${questionPhrase}.`;
    }
    if (pendingReturnCount > 0) {
      const returnPhrase = pendingReturnCount === 1
        ? 'one saved item is waiting to be woven back in'
        : `${pendingReturnCount} saved items are waiting to be woven back in`;
      return `${warmLead}, and ${returnPhrase}.`;
    }
    return `${warmLead}.`;
  }

  if (lead.type === 'wiki' && lead.updatedOvernight) {
    const detail = lead.description ? ` — ${lead.description}` : '';
    return `"${lead.title}" was updated overnight${detail}.`;
  }

  if (lead.returnQueued) {
    if (lead.type === 'question') {
      return `"${lead.title}" is returning to the desk — ready when you want to pick the thread back up.`;
    }
    if (lead.type === 'notebook') {
      return `"${lead.title}" is ready to reopen when you want to continue the draft.`;
    }
  }

  const others = inMotion.length - 1 + (motion.shelf?.length || 0);
  const typeNoun = lead.type === 'concept'
    ? 'concept'
    : lead.type === 'question'
      ? 'question'
      : lead.type === 'wiki'
        ? 'wiki page'
        : 'note';
  if (lead.stale && lead.type === 'concept') {
    const waiting = lead.raw?.freshness?.statusLabel || 'new material waiting';
    return `Your "${lead.title}" ${typeNoun} has the strongest pull — ${waiting}${others > 0 ? `. ${others} other thread${others === 1 ? '' : 's'} on the desk` : ''}.`;
  }
  const touchedLabel = formatReviewDate(lead.touchedAt);
  const movement = touchedLabel ? ` moved ${touchedLabel}` : ' is live on the desk';
  return `"${lead.title}"${movement}${others > 0 ? `; ${others} other thread${others === 1 ? '' : 's'} nearby` : ''}.`;
};

export const buildHomePrimaryMove = (motion = {}) => {
  const lead = Array.isArray(motion?.inMotion) ? motion.inMotion[0] : null;
  if (!lead) {
    return {
      eyebrow: 'Resume this',
      title: 'Ask the question that is still open',
      summary: 'No active return thread is pulling hardest yet. Capture one question and the archive can start working around it.',
      actionLabel: 'New question',
      emptyAction: 'question'
    };
  }

  const state = deriveThreadReturnState(lead);
  const base = {
    eyebrow: 'Resume this',
    title: lead.title || 'Untitled thread',
    summary: lead.description || describeThreadMotionNote(lead) || state,
    actionLabel: 'Open',
    thread: lead
  };

  if (lead.returnQueued) {
    return {
      ...base,
      eyebrow: 'Saved return',
      summary: lead.description || 'This was deliberately queued to come back to your desk.',
      actionLabel: lead.type === 'notebook' ? 'Reopen draft' : 'Resume thread'
    };
  }
  if (lead.type === 'wiki' && lead.updatedOvernight) {
    return {
      ...base,
      eyebrow: 'Updated while away',
      summary: lead.description || 'The wiki changed recently; read the delta before starting new work.',
      actionLabel: 'Review page'
    };
  }
  if (lead.type === 'concept' && (lead.stale || lead.raw?.freshness?.stale)) {
    return {
      ...base,
      eyebrow: 'Fresh material waiting',
      summary: lead.raw?.freshness?.statusLabel || 'Newer source material is waiting to be woven into this concept.',
      actionLabel: 'Reopen concept'
    };
  }
  if (lead.type === 'question' && state === 'READY TO ANSWER') {
    return {
      ...base,
      eyebrow: 'Answerable question',
      summary: describeQuestionMotionNote(lead.raw) || 'Enough evidence is attached to take a first pass.',
      actionLabel: 'Answer it'
    };
  }
  return {
    ...base,
    summary: base.summary || 'This has the strongest current movement in Think.',
    actionLabel: lead.type === 'notebook' ? 'Continue page' : lead.type === 'question' ? 'Open question' : 'Open thread'
  };
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
  const maybeSuppress = (items) => (query ? items : filterReturnViewItems(items));
  return {
    concepts: maybeSuppress(concepts.filter((item) => matches(item.name))),
    questions: maybeSuppress(questions.filter((item) => matches(item.text))),
    notebookEntries: maybeSuppress(notebookEntries.filter((item) => matches(item.title || 'Untitled')))
  };
};

export const sortShelfRailConcepts = (items = []) => sortConceptsForIndex(items);
export const sortShelfRailQuestions = (items = []) => sortQuestionsForIndex(items);
export const sortShelfRailNotebook = (items = []) => sortNotebookForIndex(items);
