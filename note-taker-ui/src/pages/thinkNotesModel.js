import { normalizeSpaces, plainTextFrom, wordBoundaryTrim } from '../utils/editorialText';
import { buildAuthoredContinuationPath } from '../utils/sourceRoutes';
import { serializeBlocksFromDoc } from '../utils/notebookBlocks';
import { stageOf } from '../components/think/notebook/notebookStages';

// How Think reads: which piece is open, which way you are looking, and the
// one list every way of looking is cut from.

const idOf = (entry) => normalizeSpaces(entry?._id || entry?.id);
const list = (value) => (Array.isArray(value) ? value : []);

const time = (value) => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(at) ? 0 : at;
};

/** A preview recognizes unnamed work without changing the saved title. */
export const noteTitle = (entry) => {
  const title = normalizeSpaces(entry?.title);
  if (title && !/^untitled(?: note| notebook page)?$/i.test(title)) return title;
  const preview = Array.isArray(entry?.blocks)
    ? entry.blocks.find(block => block.text?.trim())?.text || plainTextFrom(entry.content)
    : entry?.snippet || plainTextFrom(entry?.content);
  return wordBoundaryTrim(String(preview).split('\n').find(line => line.trim()) || '', { maxLength: 120 }) || 'Untitled';
};

export const authoredWorkHref = (row, query = '') => {
  if (row?.kind === 'notebook' && row.id) {
    const params = new URLSearchParams({ tab: 'notebook', entryId: row.id });
    if (query) params.set('find', query);
    return `/think?${params}`;
  }
  return buildAuthoredContinuationPath(row || {});
};

export const buildWritingResults = (rows = [], query = '') => list(rows)
  .filter(row => ['notebook', 'exploration'].includes(row?.kind) && authoredWorkHref(row))
  .map(row => ({ ...row, title: row.kind === 'notebook' ? noteTitle(row) : row.title, href: authoredWorkHref(row, query) }));

/* "Begun Tuesday 7 October · 640 words". The day a piece of writing started
   is a fact about it worth seeing; the word count lives here and nowhere else. */
export const begunLine = (createdAt, words = 0, now = Date.now()) => {
  const at = time(createdAt);
  if (!at) return words ? `${words} ${words === 1 ? 'word' : 'words'}` : '';
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
    .replace(',', '');
  return words ? `Begun ${day} · ${words} ${words === 1 ? 'word' : 'words'}` : `Begun ${day}`;
};

export const countWords = (text = '') => (String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

/* One list, one editor. Notes, concepts and questions live in different
   records, but they are all writing. A URL names one entry. */

export const readThinkTarget = (params) => {
  const questionId = normalizeSpaces(params.get('questionId'));
  if (questionId) return { kind: 'question', id: questionId };
  const concept = normalizeSpaces(params.get('concept')) || normalizeSpaces(params.get('conceptId'));
  if (concept) return { kind: 'concept', id: concept };
  const entryId = normalizeSpaces(params.get('entryId'));
  if (entryId) return { kind: 'note', id: entryId };
  return null;
};

/* The ways to look at Think, as the left bar lists them. With no piece open
   and no way named, Think is the desk. An old ?tab=concepts link still lands. */
export const THINK_VIEWS = [
  { key: 'working', label: 'Working', mark: 'in_progress', holds: item => item.kind === 'note' && item.stage === 'in_progress' },
  { key: 'ideas', label: 'Ideas', mark: 'idea', holds: item => item.kind === 'note' && item.stage === 'idea' },
  { key: 'closed', label: 'Closed', mark: 'done', holds: item => item.kind === 'note' && item.stage === 'done' },
  { key: 'concepts', label: 'Concepts', mark: 'concept', holds: item => item.kind === 'concept' },
  { key: 'questions', label: 'Questions', mark: 'question', holds: item => item.kind === 'question' },
  { key: 'cuttings', label: 'Cuttings', mark: 'cuttings' }
];

export const thinkView = (key) => THINK_VIEWS.find(view => view.key === key) || null;

export const readThinkView = (params) => {
  if (readThinkTarget(params)) return '';
  const view = normalizeSpaces(params.get('view')).toLowerCase();
  if (thinkView(view)) return view;
  return thinkView(normalizeSpaces(params.get('tab')).toLowerCase())?.key || 'home';
};

export const targetParams = (item) => {
  if (item.kind === 'concept') {
    return { tab: 'concepts', concept: item.id, ...(item.recordId ? { conceptId: item.recordId } : {}) };
  }
  if (item.kind === 'question') return { tab: 'questions', questionId: item.id };
  return { tab: 'notebook', entryId: item.id };
};

export const isTarget = (item, target) => Boolean(item && target && item.kind === target.kind && (
  item.id.toLowerCase() === target.id.toLowerCase() || (item.recordId && item.recordId === target.id)
));

const suppressed = (row) => Boolean(row?.archived || row?.hiddenFromHome || row?.debugOnly);

/**
 * Every entry the list can hold. Eligibility: notes always; questions you
 * wrote unless archived or hidden (a wiki page's open questions stay on it); concepts only once they are concepts (a record exists)
 * when the list is mixed, every unhidden tag when the reader asks for concepts.
 * Nothing qualifies → the list is empty and says so; nothing is invented.
 */
export const buildThinkEntries = ({ notes = [], concepts = [], questions = [], filter = 'all' } = {}) => [
  ...(filter === 'all' || filter === 'note' ? list(notes).map(entry => ({
    kind: 'note',
    id: idOf(entry),
    title: noteTitle(entry),
    nextTimeLine: normalizeSpaces(entry?.workingState?.nextTimeLine?.text),
    stage: stageOf(entry?.board),
    board: entry?.board || null,
    updatedAt: entry?.updatedAt || entry?.createdAt || null
  })) : []),
  ...(filter === 'all' || filter === 'concept' ? list(concepts)
    .filter(concept => !suppressed(concept) && normalizeSpaces(concept?.name) && (filter === 'concept' || concept?._id))
    .map(concept => ({
      kind: 'concept',
      id: normalizeSpaces(concept.name),
      recordId: normalizeSpaces(concept._id),
      title: normalizeSpaces(concept.name),
      stage: 'idea',
      updatedAt: concept.updatedAt || null
    })) : []),
  ...(filter === 'all' || filter === 'question' ? list(questions)
    .filter(question => !suppressed(question) && idOf(question) && question.sourceType !== 'wiki_open_question')
    .map(question => ({
      kind: 'question',
      id: idOf(question),
      title: wordBoundaryTrim(normalizeSpaces(question.text), { maxLength: 120 }) || 'Untitled question',
      settled: question.status === 'answered',
      stage: 'idea',
      updatedAt: question.updatedAt || question.createdAt || null
    })) : [])
].filter(item => item.id).sort((left, right) => time(right.updatedAt) - time(left.updatedAt));

/* Learning paths are not writing; they keep the older page until they leave
   Think altogether. Everything else — a note, a concept, a question, a thread
   with the partner — opens in the one editor. */
export const namesAThinkObject = (search = '') => (
  normalizeSpaces(new URLSearchParams(search).get('tab')).toLowerCase() === 'paths'
);

/** Recent private writing shares the shelf, but keeps its own Wiki identity. */
export const buildAuthoredShelf = (rows = []) => list(rows)
  .filter(row => row?.id && ((row.pageId && row.claimId) || (row.articleId && row.highlightId)) && row.title?.trim())
  .slice(0, 5)
  .map(row => ({
    id: row.id,
    title: row.title,
    returnNote: row.returnNote || '',
    pageTitle: row.pageTitle || '',
    ...(row.originMissing ? { originMissing: true } : {}),
    ...(row.sourceUnavailable ? { sourceUnavailable: true } : {}),
    href: authoredWorkHref(row)
  }));

/* A question keeps two kinds of block: words and passages. The editor's
   richer shapes (headings, lists) are saved as their words; a passage keeps
   its source; a block's earlier challenge survives an edit to its text. */
export const questionBlocksFromDoc = (doc, previous = []) => {
  const before = new Map(list(previous).map(block => [block?.id, block]));
  return serializeBlocksFromDoc(doc)
    .map(block => {
      const challenge = before.get(block.id)?.challenge;
      const kept = challenge ? { challenge } : {};
      if (block.type === 'highlight_embed' || (block.type === 'quote' && block.highlightId)) {
        return {
          id: block.id,
          type: 'highlight-ref',
          text: block.text || '',
          highlightId: block.highlightId || null,
          ...(block.articleId ? { articleId: block.articleId } : {}),
          ...(block.articleTitle ? { articleTitle: block.articleTitle } : {}),
          ...(block.sourcePath ? { sourcePath: block.sourcePath } : {}),
          ...kept
        };
      }
      return { id: block.id, type: 'paragraph', text: String(block.text || ''), ...kept };
    })
    .filter(block => block.type === 'highlight-ref' || block.text.trim());
};
