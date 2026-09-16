import { searchKeyword } from '../api/retrieval';
import { buildCanonicalArticlePath, buildCanonicalHighlightPath } from './sourceRoutes';
import {
  librarySearchRows,
  librarySearchSilence,
  needleFromQuestion,
  qualifyLibraryRows
} from './libraryPassageRetrieval';

export const INQUIRY_SCOPE = 'library';
export const INQUIRY_SCOPE_LINE = 'Your Library · not the open web, not every source.';
export const INQUIRY_PASSAGE_LIMIT = 8;
export const INQUIRY_STATUSES = Object.freeze(['idle', 'stopped', 'partial', 'miss', 'complete']);

const createInquiryId = () => (
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `inquiry-${Date.now()}`
);

const textOf = (value) => String(value || '').trim();

export const emptyInquiryRun = () => ({
  id: '',
  status: 'idle',
  boundQuestion: '',
  boundBrief: '',
  boundScope: INQUIRY_SCOPE,
  boundEnough: '',
  startedAt: null,
  finishedAt: null,
  passages: [],
  gaps: '',
  silence: ''
});

export const emptyInquiry = () => ({
  brief: '',
  scope: INQUIRY_SCOPE,
  run: emptyInquiryRun()
});

export const normalizeInquiryPassage = (row = {}) => ({
  key: textOf(row.key),
  kind: textOf(row.kind) || 'article',
  articleId: textOf(row.articleId),
  highlightId: textOf(row.highlightId),
  title: textOf(row.title) || 'Untitled source',
  passage: textOf(row.passage),
  href: textOf(row.href)
});

export const normalizeInquiryRun = (run = {}) => {
  const status = INQUIRY_STATUSES.includes(run?.status) ? run.status : 'idle';
  return {
    ...emptyInquiryRun(),
    id: textOf(run.id),
    status,
    boundQuestion: textOf(run.boundQuestion),
    boundBrief: textOf(run.boundBrief),
    boundScope: INQUIRY_SCOPE,
    boundEnough: textOf(run.boundEnough),
    startedAt: run.startedAt || null,
    finishedAt: run.finishedAt || null,
    passages: (Array.isArray(run.passages) ? run.passages : [])
      .map(normalizeInquiryPassage)
      .filter((row) => row.articleId || row.passage)
      .slice(0, INQUIRY_PASSAGE_LIMIT),
    gaps: textOf(run.gaps),
    silence: textOf(run.silence)
  };
};

export const normalizeInquiry = (inquiry = {}) => ({
  brief: textOf(inquiry.brief),
  scope: INQUIRY_SCOPE,
  run: normalizeInquiryRun(inquiry.run)
});

export const needleFromBrief = (brief, question) => (
  needleFromQuestion(brief) || needleFromQuestion(question)
);

export const inquiryAddressesEarlierWording = (run, question) => {
  const bound = textOf(run?.boundQuestion);
  const current = textOf(question);
  return Boolean(bound && current && bound !== current);
};

export const bindInquiryToCurrentQuestion = (run, question) => (
  normalizeInquiryRun({
    ...run,
    boundQuestion: textOf(question)
  })
);

export const passagesFromLibrarySearch = (payload, query) => {
  const hrefFor = (row) => (
    row.highlightId
      ? buildCanonicalHighlightPath({ articleId: row.articleId, highlightId: row.highlightId })
      : buildCanonicalArticlePath(row.articleId)
  );
  return qualifyLibraryRows(librarySearchRows(payload), { query, mode: 'search' })
    .slice(0, INQUIRY_PASSAGE_LIMIT)
    .map((row) => normalizeInquiryPassage({
      ...row,
      href: hrefFor(row)
    }));
};

export const nameInquiryGaps = ({
  passages = [],
  enough = '',
  stopped = false,
  capped = false
} = {}) => {
  const gaps = [];
  if (stopped && passages.length) gaps.push('Stopped with what had already been found.');
  if (!textOf(enough)) gaps.push('Nothing named yet that would be enough.');
  if (capped) gaps.push('This is a bounded look, not every match in your Library.');
  if (passages.length && passages.every((row) => !row.highlightId)) {
    gaps.push('No saved highlight spoke to this; these are article lines.');
  }
  return gaps.join(' ');
};

const finishInquiryRun = ({
  looking,
  passages,
  query,
  stopped = false,
  capped = false,
  now
}) => {
  const finishedAt = now();
  if (stopped && !passages.length) {
    return normalizeInquiryRun({
      ...looking,
      status: 'stopped',
      finishedAt,
      passages: [],
      gaps: '',
      silence: 'Stopped before anything useful was found.'
    });
  }
  if (stopped) {
    return normalizeInquiryRun({
      ...looking,
      status: 'partial',
      finishedAt,
      passages,
      gaps: nameInquiryGaps({
        passages,
        enough: looking.boundEnough,
        stopped: true,
        capped
      }),
      silence: ''
    });
  }
  if (!passages.length) {
    return normalizeInquiryRun({
      ...looking,
      status: 'miss',
      finishedAt,
      passages: [],
      gaps: nameInquiryGaps({ enough: looking.boundEnough }),
      silence: librarySearchSilence({
        query,
        boundQuestion: looking.boundQuestion
      })
    });
  }
  return normalizeInquiryRun({
    ...looking,
    status: 'complete',
    finishedAt,
    passages,
    gaps: nameInquiryGaps({
      passages,
      enough: looking.boundEnough,
      capped
    }),
    silence: ''
  });
};

export const startInquiryRun = ({
  question,
  brief,
  enough,
  now = () => new Date().toISOString(),
  createId = createInquiryId
} = {}) => ({
  id: createId(),
  status: 'idle',
  boundQuestion: textOf(question),
  boundBrief: textOf(brief),
  boundScope: INQUIRY_SCOPE,
  boundEnough: textOf(enough),
  startedAt: now(),
  finishedAt: null,
  passages: [],
  gaps: '',
  silence: ''
});

export const stoppedInquiryRun = ({
  question,
  brief,
  enough,
  now = () => new Date().toISOString(),
  createId = createInquiryId
} = {}) => normalizeInquiryRun({
  ...startInquiryRun({ question, brief, enough, now, createId }),
  status: 'stopped',
  finishedAt: now(),
  silence: 'Stopped before anything useful was found.'
});

export const runLibraryInquiry = async ({
  search = searchKeyword,
  brief,
  question,
  enough,
  cancelled,
  now = () => new Date().toISOString(),
  createId = createInquiryId
} = {}) => {
  const looking = startInquiryRun({ question, brief, enough, now, createId });
  if (!textOf(brief)) {
    return normalizeInquiryRun({
      ...looking,
      status: 'miss',
      finishedAt: now(),
      passages: [],
      gaps: nameInquiryGaps({ enough: looking.boundEnough }),
      silence: 'Say what to look for in ordinary language.'
    });
  }
  const query = needleFromBrief(brief, question);
  if (!query) {
    return finishInquiryRun({
      looking,
      passages: [],
      query: textOf(brief),
      now
    });
  }
  const payload = await search({ q: query, type: ['article', 'highlight'] });
  const qualified = qualifyLibraryRows(librarySearchRows(payload), { query, mode: 'search' });
  const passages = passagesFromLibrarySearch(payload, query);
  if (cancelled?.current) {
    return finishInquiryRun({
      looking,
      passages,
      query,
      stopped: true,
      capped: qualified.length > INQUIRY_PASSAGE_LIMIT,
      now
    });
  }
  return finishInquiryRun({
    looking,
    passages,
    query,
    capped: qualified.length > INQUIRY_PASSAGE_LIMIT,
    now
  });
};
