const INQUIRY_SCOPE = 'library';
const INQUIRY_PASSAGE_LIMIT = 8;
const INQUIRY_STATUSES = new Set(['idle', 'stopped', 'partial', 'miss', 'complete']);

const textOf = (value) => String(value || '').trim();

const normalizeInquiryPassage = (row = {}) => ({
  key: textOf(row.key),
  kind: textOf(row.kind) || 'article',
  articleId: textOf(row.articleId),
  highlightId: textOf(row.highlightId),
  title: textOf(row.title),
  passage: textOf(row.passage),
  href: textOf(row.href)
});

const normalizeInquiryRun = (run = {}) => {
  const requested = textOf(run.status);
  const status = INQUIRY_STATUSES.has(requested)
    ? requested
    : (requested === 'looking' ? 'stopped' : 'idle');
  return {
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

const normalizeInquiry = (inquiry = {}) => ({
  brief: textOf(inquiry.brief),
  scope: INQUIRY_SCOPE,
  run: normalizeInquiryRun(inquiry.run)
});

module.exports = {
  INQUIRY_SCOPE,
  normalizeInquiry
};
