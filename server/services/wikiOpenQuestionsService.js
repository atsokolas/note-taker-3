const normalizeText = (value = '') => String(value || '')
  .replace(/\s+/g, ' ')
  .trim();

const idString = (value) => {
  if (!value) return '';
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (value._id && value._id !== value) return idString(value._id);
  }
  return String(value);
};

const plainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(plainText).join(' ');
  if (typeof node !== 'object') return '';
  return [node.text || '', plainText(node.content)].filter(Boolean).join(' ');
};

const headingLabel = (node = {}) => normalizeText(plainText(node.content || [])).toLowerCase();

const cleanupQuestionText = (value = '') => normalizeText(value)
  .replace(/^[\s•*\-–—\d.)]+/g, '')
  .replace(/\s+([?.!])/g, '$1')
  .trim();

const DECLARATIVE_OPEN_QUESTION_RE = /^(the\s+)?(next|unresolved|open|remaining|central|sharpest|key)\s+question\s+(is|becomes|remains)\b|^it\s+remains\s+unclear\b|^it\s+is\s+unclear\b|^what\s+remains\s+unclear\b|^the\s+page\s+still\s+needs\b|^the\s+topic\s+still\s+needs\b|^the\s+claim\s+still\s+needs\b|^the\s+evidence\s+still\s+needs\b/i;
const INTERROGATIVE_PROMPT_RE = /^(what|which|how|why|when|where|whether|who|can|could|should|would|do|does|did|is|are|will|might)\b/i;

const isOpenQuestionPrompt = (text = '') => {
  const value = cleanupQuestionText(text);
  if (!value) return false;
  if (/\?$/.test(value)) return true;
  return DECLARATIVE_OPEN_QUESTION_RE.test(value) || INTERROGATIVE_PROMPT_RE.test(value);
};

const extractOpenQuestionsFromBody = (body = {}) => {
  const blocks = Array.isArray(body?.content) ? body.content : [];
  const questions = [];
  let collecting = false;

  blocks.forEach((block) => {
    if (!block || typeof block !== 'object') return;
    if (block.type === 'heading') {
      collecting = headingLabel(block) === 'open questions';
      return;
    }
    if (!collecting) return;
    if (block.type === 'paragraph' || block.type === 'listItem') {
      const text = cleanupQuestionText(plainText(block.content || []));
      if (isOpenQuestionPrompt(text)) questions.push(text);
      return;
    }
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      (Array.isArray(block.content) ? block.content : []).forEach((item) => {
        const text = cleanupQuestionText(plainText(item.content || []));
        if (isOpenQuestionPrompt(text)) questions.push(text);
      });
    }
  });

  return Array.from(new Set(questions)).slice(0, 5);
};

const isQuestionPageEligible = (page = {}) => (
  page
  && page.status !== 'archived'
  && !page.hiddenFromHome
  && !page.debugOnly
  && !page.archived
);

const wikiQuestionId = (pageId = '', index = 0) => `wiki-open-question:${pageId}:${index}`;

const buildWikiOpenQuestionRows = (pages = []) => (
  (Array.isArray(pages) ? pages : [])
    .filter(isQuestionPageEligible)
    .flatMap((page) => {
      const pageId = idString(page._id || page.id || page.pageId);
      const pageTitle = normalizeText(page.title || 'Wiki page');
      if (!pageId || !pageTitle) return [];
      return extractOpenQuestionsFromBody(page.body)
        .map((text, index) => ({
          _id: wikiQuestionId(pageId, index),
          text,
          status: 'open',
          linkedTagName: pageTitle,
          conceptName: pageTitle,
          sourceType: 'wiki_open_question',
          sourcePageId: pageId,
          sourcePageTitle: pageTitle,
          href: `/wiki/workspace?page=${encodeURIComponent(pageId)}#open-questions`,
          blocks: [{
            id: `wiki-open-question-${pageId}-${index}`,
            type: 'paragraph',
            text: `From wiki page: ${pageTitle}`
          }],
          createdAt: page.updatedAt || page.createdAt || null,
          updatedAt: page.updatedAt || page.createdAt || null
        }));
    })
);

const normalizeKey = (value = '') => normalizeText(value).toLowerCase();

const filterWikiOpenQuestions = (questions = [], { tag = '', conceptName = '', status = 'open' } = {}) => {
  if (status && status !== 'open') return [];
  const target = normalizeKey(conceptName || tag);
  return (Array.isArray(questions) ? questions : []).filter((question) => {
    if (!target) return true;
    const concept = normalizeKey(question.conceptName || question.linkedTagName || '');
    return concept === target || concept.includes(target) || target.includes(concept);
  });
};

module.exports = {
  extractOpenQuestionsFromBody,
  buildWikiOpenQuestionRows,
  filterWikiOpenQuestions,
  __testables: {
    plainText,
    cleanupQuestionText,
    isOpenQuestionPrompt,
    wikiQuestionId
  }
};
