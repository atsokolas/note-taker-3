const GENERIC_PLACEHOLDER_TITLE_RE = /^(?:thing|stuff|blah|asdf|test|untitled|lorem ipsum)(?:\s+\d+)?$/i;
const DEBUG_FIXTURE_TITLE_RE = /\bdebug fixture\b/i;
const QA_GENERATED_TITLE_RE = /^(?:qa|codex qa)\b/i;
const QA_VERIFICATION_TITLE_RE = /\b(?:build order verification|user test|slash concept|fresh concept|shared adoption|public share|retest|mcp retest|embedding retry)\b/i;
const LONG_TIMESTAMP_RE = /\b\d{10,}\b/;
const KNOWN_QA_JUNK_TITLES = new Set([
  'cia teach investor behavioural investment',
  'complementary machine thing'
]);

const normalizeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const countWords = (value = '') => {
  const text = normalizeText(value);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
};

const extractPlainTextFromDoc = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractPlainTextFromDoc).filter(Boolean).join(' ');
  if (typeof node !== 'object') return '';
  const own = typeof node.text === 'string' ? node.text : '';
  const children = Array.isArray(node.content) ? extractPlainTextFromDoc(node.content) : '';
  return [own, children].filter(Boolean).join(' ');
};

const isFailedDraftStub = ({ page, plainText }) => {
  const aiState = page?.aiState || {};
  const quality = aiState.quality || {};
  if (aiState.draftStatus === 'error') return true;
  if (aiState.lastError || aiState.errorCode) return true;
  if (quality.ok === false || quality.status === 'fail') return true;
  return /\bfailed to build\b|\bmissed quality gates\b/i.test(plainText);
};

const classifyWikiPageQuality = (page = {}) => {
  const title = normalizeText(page.title || 'Untitled Wiki Page');
  const normalizedTitle = title.toLowerCase();
  const plainText = normalizeText(page.plainText || extractPlainTextFromDoc(page.body));
  const wordCount = countWords(plainText);
  const sourceCount = Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0;
  const reasons = [];
  const blockingReasons = [];

  const addReason = (code, message, { blocking = false } = {}) => {
    const reason = { code, message };
    reasons.push(reason);
    if (blocking) blockingReasons.push(reason);
  };

  if (!title || /^untitled wiki page$/i.test(title)) {
    addReason('untitled_page', 'Page has a placeholder title.');
  }

  const qaStrippedTitle = normalizedTitle.replace(/^qa\s+/, '');

  if (KNOWN_QA_JUNK_TITLES.has(normalizedTitle) || KNOWN_QA_JUNK_TITLES.has(qaStrippedTitle)) {
    addReason('known_qa_junk_title', 'Page title matches a known malformed QA fixture.', { blocking: true });
  } else if (
    QA_GENERATED_TITLE_RE.test(title)
    || (QA_GENERATED_TITLE_RE.test(title) && (QA_VERIFICATION_TITLE_RE.test(title) || LONG_TIMESTAMP_RE.test(title)))
    || /^qa\s+(?:build order verification|user test|shared adoption|public share|fresh concept|slash concept)\b/i.test(title)
  ) {
    addReason('generated_qa_title', 'Page title looks like an internal QA/generated verification page.', { blocking: true });
  } else if (GENERIC_PLACEHOLDER_TITLE_RE.test(title) || DEBUG_FIXTURE_TITLE_RE.test(title)) {
    addReason('placeholder_title', 'Page title contains placeholder/debug wording.', { blocking: true });
  }

  if (isFailedDraftStub({ page, plainText })) {
    addReason('failed_draft_stub', 'Page looks like a failed draft stub.', { blocking: true });
  }

  if (wordCount === 0) {
    addReason('empty_body', 'Page has no readable body text.');
  } else if (wordCount < 35 && sourceCount === 0) {
    addReason('sparse_unsourced_draft', 'Page is sparse and has no attached sources.');
  }

  const surfaceEligible = blockingReasons.length === 0;
  return {
    status: reasons.length ? 'needs_review' : 'ok',
    severity: blockingReasons.length ? 'blocked' : (reasons.length ? 'review' : 'ok'),
    surfaceEligible,
    reasons,
    checkedAt: null
  };
};

const isWikiPageSurfaceEligible = (page = {}) => classifyWikiPageQuality(page).surfaceEligible;

module.exports = {
  classifyWikiPageQuality,
  isWikiPageSurfaceEligible,
  __testables: {
    countWords,
    extractPlainTextFromDoc
  }
};
